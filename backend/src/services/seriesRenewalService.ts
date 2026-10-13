// Renovação das séries mensais para o ano seguinte (plano
// .plans/recorrente-ano-e-contagem.md). De 1º de dezembro a 31 de janeiro, o app
// pergunta, para cada série do usuário que termina em dezembro e ainda não tem
// decisão, se ela renova. Renovar cria janeiro a dezembro do ano seguinte na
// mesma série; a decisão fica em renovacoes_serie e não é perguntada de novo.
//
// Só as séries do próprio usuário (despesas.usuario_id), na conta pedida. A série
// é a 1ª ocorrência (grupo_parcelamento_id), como na edição e na exclusão.
import { and, asc, desc, eq, exists, inArray, isNotNull, max } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { cards, expenses, seriesRenewals, type NewExpense } from '../db/schema';
import { getMonthYearFromIsoDate, getTodayIsoInTimezone } from '../utils/date';
import { INVOICE_EXPENSE_METHOD } from './cardInvoiceRules';
import { ACTIVE_STATUS, accountFilter, toNumber } from './entryQueries';
import { isRenewalPending, renewalDates, renewalYear, type InvoiceCardDays } from './expenseSeries';
import type { SeriesRenewalDecision } from './seriesRenewalInput';

export interface PendingRenewal {
  seriesId: number;
  description: string;
  amount: number;
  paymentMethod: string | null;
  cardName: string | null;
  lastDueDate: string;
  /** Ano que a renovação cria. */
  year: number;
}

export interface RenewalResult {
  renewed: number;
  declined: number;
}

const anchor = alias(expenses, 'ancora');

/** A renovação só é oferecida em dezembro e janeiro (isRenewalPending); fora disso, nem consulta. */
function isRenewalSeason(today: string): boolean {
  const month = today.slice(5, 7);
  return month === '12' || month === '01';
}

/** Séries mensais do usuário na conta, com a 1ª ocorrência existente, e o último vencimento vigente de cada uma. */
async function seriesLastDueDates(userId: number, accountId: number | null) {
  return db
    .select({ seriesId: expenses.installmentGroupId, lastDueDate: max(expenses.dueDate) })
    .from(expenses)
    .where(and(
      eq(expenses.userId, userId),
      eq(expenses.recurring, true),
      eq(expenses.status, ACTIVE_STATUS),
      isNotNull(expenses.installmentGroupId),
      accountFilter(expenses.accountId, expenses.userId, accountId),
      // Sem a 1ª ocorrência, a decisão não tem onde ficar (renovacoes_serie aponta para ela).
      exists(db.select({ id: anchor.id }).from(anchor).where(eq(anchor.id, expenses.installmentGroupId))),
    ))
    .groupBy(expenses.installmentGroupId);
}

/** Séries pendentes de renovação do usuário na conta, com os dados da última ocorrência. */
export async function listPendingRenewals(
  userId: number,
  accountId: number | null,
  today: string = getTodayIsoInTimezone(),
): Promise<PendingRenewal[]> {
  if (!isRenewalSeason(today)) return [];

  const candidates = (await seriesLastDueDates(userId, accountId)).flatMap((row) => (
    row.seriesId !== null && row.lastDueDate !== null && isRenewalPending(row.lastDueDate, today, false)
      ? [{ seriesId: row.seriesId, lastDueDate: row.lastDueDate, year: renewalYear(row.lastDueDate) }]
      : []
  ));
  if (candidates.length === 0) return [];

  const seriesIds = candidates.map((candidate) => candidate.seriesId);
  const decided = await db
    .select({ seriesId: seriesRenewals.seriesId, year: seriesRenewals.year })
    .from(seriesRenewals)
    .where(inArray(seriesRenewals.seriesId, seriesIds));
  const decidedKeys = new Set(decided.map((row) => `${row.seriesId}:${row.year}`));
  const pending = candidates.filter((candidate) => !decidedKeys.has(`${candidate.seriesId}:${candidate.year}`));
  if (pending.length === 0) return [];

  // A última ocorrência vigente de cada série: os dados que a renovação copia.
  const rows = await db
    .select({
      seriesId: expenses.installmentGroupId,
      description: expenses.description,
      amount: expenses.originalAmount,
      paymentMethod: expenses.paymentMethod,
      cardName: cards.name,
      dueDate: expenses.dueDate,
    })
    .from(expenses)
    .leftJoin(cards, eq(cards.id, expenses.cardId))
    .where(and(
      eq(expenses.userId, userId),
      eq(expenses.recurring, true),
      eq(expenses.status, ACTIVE_STATUS),
      inArray(expenses.installmentGroupId, pending.map((candidate) => candidate.seriesId)),
    ))
    .orderBy(asc(expenses.installmentGroupId), desc(expenses.dueDate), desc(expenses.id));
  const lastBySeries = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.seriesId !== null && !lastBySeries.has(row.seriesId)) lastBySeries.set(row.seriesId, row);
  }

  return pending.flatMap((candidate) => {
    const last = lastBySeries.get(candidate.seriesId);
    if (!last) return [];
    return [{
      seriesId: candidate.seriesId,
      description: last.description,
      amount: toNumber(last.amount),
      paymentMethod: last.paymentMethod,
      cardName: last.cardName,
      lastDueDate: candidate.lastDueDate,
      year: candidate.year,
    }];
  }).sort((left, right) => left.description.localeCompare(right.description, 'pt-BR'));
}

/**
 * Grava as decisões numa transação. Série que não é do usuário, que não está
 * pendente ou que já foi decidida é ignorada. Renovar cria as 12 ocorrências
 * do ano seguinte na mesma série, copiando da última a descrição, a categoria,
 * a forma, o cartão, o valor e a conta; no crédito com cartão, a compra segue
 * mês a mês e o vencimento sai da fatura.
 */
export async function decideRenewals(
  userId: number,
  decisions: SeriesRenewalDecision[],
  today: string = getTodayIsoInTimezone(),
): Promise<RenewalResult> {
  return db.transaction(async (transaction) => {
    const result: RenewalResult = { renewed: 0, declined: 0 };
    for (const decision of decisions) {
      // A 1ª ocorrência travada: duas decisões ao mesmo tempo correm uma depois da outra.
      const [anchorRow] = await transaction
        .select({ id: expenses.id })
        .from(expenses)
        .where(and(eq(expenses.id, decision.seriesId), eq(expenses.userId, userId)))
        .limit(1)
        .for('update');
      if (!anchorRow) continue;

      const [last] = await transaction
        .select()
        .from(expenses)
        .where(and(
          eq(expenses.userId, userId),
          eq(expenses.installmentGroupId, decision.seriesId),
          eq(expenses.recurring, true),
          eq(expenses.status, ACTIVE_STATUS),
        ))
        .orderBy(desc(expenses.dueDate), desc(expenses.id))
        .limit(1);
      if (!last || !isRenewalPending(last.dueDate, today, false)) continue;

      const inserted = await transaction
        .insert(seriesRenewals)
        .values({ seriesId: decision.seriesId, year: renewalYear(last.dueDate), renew: decision.renew, userId })
        .onConflictDoNothing()
        .returning({ id: seriesRenewals.id });
      if (inserted.length === 0) continue;

      if (!decision.renew) {
        result.declined += 1;
        continue;
      }

      let card: InvoiceCardDays | null = null;
      if (last.paymentMethod === INVOICE_EXPENSE_METHOD && last.cardId !== null) {
        const [cardRow] = await transaction
          .select({ closingDay: cards.closingDay, dueDay: cards.dueDay })
          .from(cards)
          .where(eq(cards.id, last.cardId))
          .limit(1);
        card = cardRow ?? null;
      }
      const rows = renewalDates({ purchaseDate: last.purchaseDate, dueDate: last.dueDate }, card)
        .map((dates): NewExpense => {
          const { mes, ano } = getMonthYearFromIsoDate(dates.dueDate);
          return {
            userId: last.userId,
            accountId: last.accountId,
            categoryId: last.categoryId,
            cardId: last.cardId,
            description: last.description,
            paymentMethod: last.paymentMethod,
            dueDate: dates.dueDate,
            month: mes,
            year: ano,
            purchaseDate: dates.purchaseDate,
            originalAmount: last.originalAmount,
            paid: false,
            recurring: true,
            status: ACTIVE_STATUS,
            installmentGroupId: decision.seriesId,
          };
        });
      await transaction.insert(expenses).values(rows);
      result.renewed += 1;
    }
    return result;
  });
}
