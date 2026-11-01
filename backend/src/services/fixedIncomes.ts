import { and, asc, eq, gte, inArray, isNotNull, lt, lte, ne, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { expenses, incomeClassificationFixes as sources, incomeClassifications, incomes, representatives, type Income, type IncomeClassificationFix, type NewIncome } from '../db/schema';
import { clients } from '../modules/contracts/db/schema';
import { addMonthsClamped, getMonthYearFromIsoDate, getTodayIsoInTimezone } from '../utils/date';
import { RequestInputError } from '../utils/requestInput';
import { cancelLinkedCommissions } from './commissionService';
import { INCOME_STATUS, OPEN_INCOME_STATUSES } from './contractTypes';
import { CANCELLED_STATUS } from './entryQueries';
import { resolveIncomeClassificationCatalog } from './incomeClassificationCatalog';
import { fixedIncomeRangeDates, planFixedIncomeEndChange, type FixedIncomeDate } from './fixedIncomeSchedule';
import { sendPushToUser } from './webPush';
import type { CreateIncomeInput, UpdateIncomeInput } from './incomeInput';

/** Mesma API no Drizzle transacional e no wrapper do PoolClient já em BEGIN. */
export type IncomeTransaction = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export function fixedIncomeEndMonth(source: Pick<IncomeClassificationFix, 'endMonth' | 'registeredYear' | 'referenceDate' | 'createdAt'>): string {
  return source.endMonth?.slice(0, 7) ?? [`${source.registeredYear ?? source.createdAt.getUTCFullYear()}-12`, source.referenceDate?.slice(0, 7) ?? ''].sort().at(-1)!;
}

function referenceDate(source: IncomeClassificationFix): string {
  if (source.referenceDate) return source.referenceDate;
  const month = source.firstMonth?.slice(0, 7) ?? source.createdAt.toISOString().slice(0, 7);
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return `${month}-${String(Math.min(source.dayOfMonth, lastDay)).padStart(2, '0')}`;
}

function fixedIncomeRow(source: IncomeClassificationFix, item: FixedIncomeDate): NewIncome {
  const { mes, ano } = getMonthYearFromIsoDate(item.receiptDate);
  return { userId: source.userId, accountId: source.accountId, classificationId: source.classificationId,
    description: source.description ?? 'Receita fixa', grossAmount: source.grossAmount ?? source.amount, netAmount: source.amount,
    receiptDate: item.receiptDate, month: mes, year: ano, clientId: source.clientId, representativeId: source.representativeId,
    status: INCOME_STATUS.planned, deferred: false, fixedClassificationId: source.id, fixedCompetence: item.competence };
}

export function fixedIncomeRows(source: IncomeClassificationFix, endMonth: string): NewIncome[] {
  return fixedIncomeRangeDates(referenceDate(source), endMonth).map(item => fixedIncomeRow(source, item));
}

export async function createFixedIncomeSource(transaction: IncomeTransaction, userId: number, input: CreateIncomeInput) {
  if (input.accountId === null || !input.endMonth) throw new RequestInputError('Escolha a conta e o último mês da receita fixa');
  if (input.billableHours) throw new RequestInputError('As horas já seguem o contrato e não podem gerar outra repetição fixa');
  const [source] = await transaction.insert(sources).values({
    userId, accountId: input.accountId, classificationId: input.categoryId, description: input.description,
    amount: input.netAmount.toFixed(2), grossAmount: input.grossAmount.toFixed(2),
    dayOfMonth: Number(input.receiptDate.slice(8, 10)), referenceDate: input.receiptDate,
    firstMonth: `${input.receiptDate.slice(0, 7)}-01`, endMonth: `${input.endMonth}-01`,
    registeredYear: Number(input.endMonth.slice(0, 4)), clientId: input.clientId, representativeId: input.representativeId, active: true,
  }).returning();
  if (!source) throw new Error('Fixed income insert returned no source');
  return source;
}

/** Fonte antes da ocorrência: mesma ordem usada no adiamento em grupo. */
export async function lockIncomeForWrite(transaction: IncomeTransaction, userId: number, incomeId: number) {
  const [identity] = await transaction.select({ sourceId: incomes.fixedClassificationId, accountId: incomes.accountId })
    .from(incomes).where(and(eq(incomes.id, incomeId), eq(incomes.userId, userId)));
  if (!identity) return null;
  let source: IncomeClassificationFix | undefined;
  if (identity.sourceId !== null) {
    [source] = await transaction.select().from(sources).where(and(eq(sources.id, identity.sourceId),
      eq(sources.userId, userId), identity.accountId === null ? undefined : eq(sources.accountId, identity.accountId))).for('update');
    if (!source || source.accountId !== identity.accountId) throw new RequestInputError('Receita fixa não encontrada', 404);
  }
  const [income] = await transaction.select().from(incomes).where(and(eq(incomes.id, incomeId), eq(incomes.userId, userId))).for('update');
  if (!income) return null;
  if (income.fixedClassificationId !== identity.sourceId || income.accountId !== identity.accountId) {
    throw new RequestInputError('A receita mudou. Atualize a tela antes de salvar.', 409);
  }
  return { income, source };
}

/**
 * As previstas futuras além do novo limite saem de vez (nunca receberam dinheiro) e a comissão ligada a elas é
 * cancelada. Uma comissão já paga impede a redução: o dinheiro saiu e ficaria sem a receita de origem.
 */
async function removeFutureForecasts(transaction: IncomeTransaction, scope: SQL | undefined, fromCompetence: string, today: string): Promise<void> {
  const leaving = await transaction.select({ id: incomes.id }).from(incomes)
    .where(and(scope, eq(incomes.status, INCOME_STATUS.planned), gte(incomes.receiptDate, today), gte(incomes.fixedCompetence, fromCompetence)))
    .orderBy(asc(incomes.id));
  if (leaving.length === 0) return;
  const ids = leaving.map(row => row.id);
  const [paidCommission] = await transaction.select({ id: expenses.id }).from(expenses)
    .where(and(inArray(expenses.sourceIncomeId, ids), eq(expenses.paid, true), ne(expenses.status, CANCELLED_STATUS))).limit(1);
  if (paidCommission) {
    throw new RequestInputError('Há comissão já paga em uma receita que sairia da série. Ajuste a comissão antes de reduzir o limite.', 409);
  }
  await cancelLinkedCommissions(transaction, ids);
  await transaction.delete(incomes).where(and(scope, inArray(incomes.id, ids)));
}

/**
 * Somente o limite altera o intervalo; os dados editados da ocorrência não se espalham. Ampliar cria só os meses
 * ausentes (a competência cancelada à mão continua ocupada); reduzir apaga as previstas futuras além do limite.
 */
export async function changeFixedIncomeEndMonth(transaction: IncomeTransaction, source: IncomeClassificationFix | undefined,
  edited: Pick<Income, 'status' | 'receiptDate' | 'fixedCompetence'>, input: UpdateIncomeInput, today: string): Promise<Income[]> {
  if (input.endMonth === undefined) return [];
  if (!source) throw new RequestInputError('O mês final é só para uma receita fixa');
  const oldEnd = fixedIncomeEndMonth(source);
  const change = planFixedIncomeEndChange({ referenceDate: referenceDate(source), oldEnd, newEnd: input.endMonth, today });
  if ('refusal' in change) throw new RequestInputError(change.refusal);
  const { plan } = change;
  if (input.endMonth === oldEnd) return [];
  const leavesWithLimit = plan.removeFromCompetence !== null && edited.status === INCOME_STATUS.planned && edited.receiptDate >= today
    && edited.fixedCompetence !== null && edited.fixedCompetence >= plan.removeFromCompetence;
  if (leavesWithLimit) throw new RequestInputError('Esta receita fica depois do novo limite. Escolha um limite a partir do mês dela.');
  const scope = and(eq(incomes.fixedClassificationId, source.id), eq(incomes.userId, source.userId), eq(incomes.accountId, source.accountId));
  await transaction.select({ id: incomes.id }).from(incomes).where(scope).orderBy(asc(incomes.id)).for('update');
  if (plan.removeFromCompetence !== null) await removeFutureForecasts(transaction, scope, plan.removeFromCompetence, today);
  const created = plan.create.length > 0
    ? await transaction.insert(incomes).values(plan.create.map(item => fixedIncomeRow(source, item))).onConflictDoNothing().returning() : [];
  await transaction.update(sources).set({ endMonth: `${input.endMonth}-01`, registeredYear: Number(input.endMonth.slice(0, 4)), updatedAt: new Date() })
    .where(and(eq(sources.id, source.id), eq(sources.userId, source.userId), eq(sources.accountId, source.accountId)));
  return created;
}

async function authorizedAccount(requesterId: number, requestedAccountId: number | null): Promise<number> {
  const account = await resolveIncomeClassificationCatalog(requesterId, requestedAccountId);
  if (!account) throw new RequestInputError('Conta não encontrada', 404);
  return account.accountId;
}

export async function listPendingIncomes(requesterId: number, requestedAccountId: number | null, month: string, today = getTodayIsoInTimezone()) {
  const accountId = await authorizedAccount(requesterId, requestedAccountId);
  const parent = alias(incomeClassifications, 'pending_income_parent');
  const rows = await db.select({
    id: incomes.id, userId: incomes.userId, accountId: incomes.accountId, description: incomes.description,
    grossAmount: incomes.grossAmount, netAmount: incomes.netAmount, receiptDate: incomes.receiptDate, month: incomes.month, year: incomes.year,
    status: incomes.status, categoryId: incomes.classificationId, categoryName: incomeClassifications.name, parentCategoryName: parent.name,
    clientId: incomes.clientId, clientName: clients.name, representativeId: incomes.representativeId, representativeName: representatives.name,
    commissionAmount: incomes.commissionAmount, contractId: incomes.contractId, withholdings: incomes.withholdings,
    attachments: incomes.attachments, createdAt: incomes.createdAt, fixedIncomeId: incomes.fixedClassificationId,
    fixedCompetence: incomes.fixedCompetence, deferred: incomes.deferred,
    sourceEndMonth: sources.endMonth, sourceRegisteredYear: sources.registeredYear, sourceReferenceDate: sources.referenceDate, sourceCreatedAt: sources.createdAt,
  }).from(incomes)
    .leftJoin(incomeClassifications, eq(incomeClassifications.id, incomes.classificationId))
    .leftJoin(parent, eq(parent.id, incomeClassifications.parentId))
    .leftJoin(clients, and(eq(clients.id, incomes.clientId), eq(clients.accountId, incomes.accountId)))
    .leftJoin(representatives, eq(representatives.id, incomes.representativeId))
    .leftJoin(sources, and(eq(sources.id, incomes.fixedClassificationId), eq(sources.userId, incomes.userId), eq(sources.accountId, incomes.accountId)))
    .where(and(eq(incomes.userId, requesterId), eq(incomes.accountId, accountId), inArray(incomes.status, [...OPEN_INCOME_STATUSES]),
      gte(incomes.receiptDate, `${month}-01`), lt(incomes.receiptDate, addMonthsClamped(`${month}-01`, 1)), lte(incomes.receiptDate, today)))
    .orderBy(asc(incomes.receiptDate), asc(incomes.id));
  return rows.map(({ sourceEndMonth, sourceRegisteredYear, sourceReferenceDate, sourceCreatedAt, ...row }) => ({ ...row,
    grossAmount: Number(row.grossAmount), netAmount: Number(row.netAmount), commissionAmount: row.commissionAmount === null ? null : Number(row.commissionAmount),
    endMonth: row.fixedIncomeId === null ? null : sourceEndMonth?.slice(0, 7)
      ?? (sourceCreatedAt ? fixedIncomeEndMonth({ endMonth: sourceEndMonth, registeredYear: sourceRegisteredYear, referenceDate: sourceReferenceDate, createdAt: sourceCreatedAt }) : null),
  }));
}

export async function deferIncomes(requesterId: number, requestedAccountId: number | null, ids: number[], deferred: boolean) {
  const accountId = await authorizedAccount(requesterId, requestedAccountId);
  return db.transaction(async transaction => {
    const identities = await transaction.select({ id: incomes.id, sourceId: incomes.fixedClassificationId }).from(incomes)
      .where(and(inArray(incomes.id, ids), eq(incomes.userId, requesterId), eq(incomes.accountId, accountId))).orderBy(asc(incomes.id));
    if (identities.length !== ids.length) throw new RequestInputError('Receita prevista não encontrada', 404);
    const sourceIds = [...new Set(identities.map(row => row.sourceId).filter((id): id is number => id !== null))];
    if (sourceIds.length) await transaction.select({ id: sources.id }).from(sources).where(and(inArray(sources.id, sourceIds),
      eq(sources.userId, requesterId), eq(sources.accountId, accountId))).orderBy(asc(sources.id)).for('update');
    const rows = await transaction.select({ id: incomes.id, status: incomes.status, sourceId: incomes.fixedClassificationId }).from(incomes)
      .where(and(inArray(incomes.id, ids), eq(incomes.userId, requesterId), eq(incomes.accountId, accountId))).orderBy(asc(incomes.id)).for('update');
    const sourceById = new Map(identities.map(row => [row.id, row.sourceId]));
    if (rows.length !== ids.length || rows.some(row => !OPEN_INCOME_STATUSES.includes(row.status) || row.sourceId !== sourceById.get(row.id))) {
      throw new RequestInputError('Uma receita já foi recebida ou mudou. Atualize a lista.', 409);
    }
    await transaction.update(incomes).set({ deferred }).where(and(inArray(incomes.id, ids), eq(incomes.userId, requesterId), eq(incomes.accountId, accountId), inArray(incomes.status, [...OPEN_INCOME_STATUSES])));
    return { ids, deferred };
  });
}

/** As previstas fixas de hoje que ainda pedem confirmação: a que a pessoa adiou (Adiar) não gera lembrete. */
export async function listDueFixedIncomeReminders(today: string) {
  return db.select({ userId: incomes.userId, description: incomes.description, amount: incomes.netAmount }).from(incomes)
    .where(and(isNotNull(incomes.fixedClassificationId), eq(incomes.status, INCOME_STATUS.planned), eq(incomes.deferred, false),
      eq(incomes.receiptDate, today)));
}

/** Mantém os lembretes existentes, sem gerar outro ano ou confirmar recebimento. */
export async function sendFixedIncomeReminders(today = getTodayIsoInTimezone()): Promise<{ pushSent: number }> {
  const rows = await listDueFixedIncomeReminders(today);
  let pushSent = 0;
  for (const row of rows) {
    const { sent } = await sendPushToUser(row.userId, { title: 'Receita prevista para hoje',
      body: `${row.description} — ${Number(row.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · confirme o recebimento` });
    if (sent > 0) pushSent += 1;
  }
  return { pushSent };
}
