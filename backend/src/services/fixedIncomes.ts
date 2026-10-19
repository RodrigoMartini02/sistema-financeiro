// Receita fixa com o ano previsto (plano .plans/receita-fixa-ano-previsto.md).
// Ligar ou salvar a fixa grava as previstas de cada mês até dezembro; mudar a
// fixa atualiza as previstas em aberto, e desligar apaga as em aberto. No dia
// do recebimento, a rotina diária avisa para confirmar; a prevista só vira
// recebida com o "Confirmar recebimento".
//
// Gravar não confere antes se o mês já existe: o índice único
// (classificacao_fixa_id, fixa_competencia) faz o INSERT não fazer nada, então
// a rotina diária e a checagem ao abrir o app podem rodar juntas sem duplicar.
import { and, eq, gte, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { accounts, incomeClassificationFixes, incomeClassifications, incomes } from '../db/schema';
import { getMonthYearFromIsoDate, getTodayIsoInTimezone } from '../utils/date';
import { INCOME_STATUS } from './contractTypes';
import { competenciasAteDezembro, dataDoLancamento } from './fixedIncomeSchedule';
import { sendPushToUser } from './webPush';

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

/** A fixa com o que a prevista precisa: dono, conta, categoria, valor, dia e a descrição. */
export interface FixedIncomeSource {
  id: number;
  userId: number;
  accountId: number;
  classificationId: number;
  amount: string;
  dayOfMonth: number;
  registeredYear: number | null;
  /** "Raiz › Nome", como a receita aparece na lista. */
  description: string;
}

function formatCurrency(value: string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Fixas com a categoria ativa e a conta não arquivada, mais a condição pedida. */
async function loadFixedIncomeSources(executor: Pick<typeof db, 'select'>, condition: SQL | undefined): Promise<FixedIncomeSource[]> {
  const root = alias(incomeClassifications, 'raiz');
  const rows = await executor
    .select({
      id: incomeClassificationFixes.id,
      userId: incomeClassificationFixes.userId,
      accountId: incomeClassificationFixes.accountId,
      classificationId: incomeClassificationFixes.classificationId,
      amount: incomeClassificationFixes.amount,
      dayOfMonth: incomeClassificationFixes.dayOfMonth,
      registeredYear: incomeClassificationFixes.registeredYear,
      name: incomeClassifications.name,
      rootName: root.name,
    })
    .from(incomeClassificationFixes)
    .innerJoin(incomeClassifications, eq(incomeClassifications.id, incomeClassificationFixes.classificationId))
    .leftJoin(root, eq(root.id, incomeClassifications.parentId))
    .innerJoin(accounts, eq(accounts.id, incomeClassificationFixes.accountId))
    .where(and(
      // Classificação desativada ou conta arquivada não gravam previstas.
      eq(incomeClassifications.active, true),
      sql`COALESCE(${accounts.active}, true)`,
      condition,
    ));
  return rows.map(({ name, rootName, ...row }) => ({ ...row, description: rootName ? `${rootName} › ${name}` : name }));
}

/** Uma fixa pelo id, com a condição pedida (o dono, por exemplo); null se não existir ou não gravar previstas. */
export async function findFixedIncomeSource(
  executor: Pick<typeof db, 'select'>,
  fixId: number,
  condition?: SQL,
): Promise<FixedIncomeSource | null> {
  const [source] = await loadFixedIncomeSources(executor, and(eq(incomeClassificationFixes.id, fixId), condition));
  return source ?? null;
}

/** Fixas da pessoa com o ano já gravado, na conta pedida (sem conta, em todas). */
export async function findRegisteredFixedIncomes(userId: number, accountId: number | null): Promise<FixedIncomeSource[]> {
  return loadFixedIncomeSources(db, and(
    eq(incomeClassificationFixes.userId, userId),
    isNotNull(incomeClassificationFixes.registeredYear),
    accountId ? eq(incomeClassificationFixes.accountId, accountId) : undefined,
  ));
}

/**
 * Grava como previstas as competências da fixa — as que já existem ficam, pelo
 * índice único — e o ano registrado.
 */
export async function writeFixedIncomeYear(
  executor: Executor,
  source: FixedIncomeSource,
  competences: string[],
  year: number,
): Promise<void> {
  if (competences.length > 0) {
    await executor
      .insert(incomes)
      .values(competences.map((competence) => {
        const receiptDate = dataDoLancamento(competence, source.dayOfMonth);
        const { mes, ano } = getMonthYearFromIsoDate(receiptDate);
        return {
          userId: source.userId,
          accountId: source.accountId,
          description: source.description,
          netAmount: source.amount,
          grossAmount: source.amount,
          receiptDate,
          month: mes,
          year: ano,
          status: INCOME_STATUS.planned,
          classificationId: source.classificationId,
          fixedClassificationId: source.id,
          fixedCompetence: competence,
        };
      }))
      .onConflictDoNothing();
  }
  await executor
    .update(incomeClassificationFixes)
    .set({ registeredYear: year, updatedAt: new Date() })
    .where(eq(incomeClassificationFixes.id, source.id));
}

/** Ligar a fixa: grava do mês atual (ou do seguinte, se o dia já passou) até dezembro. */
export async function registerFixedIncomeYear(executor: Executor, source: FixedIncomeSource, today: string): Promise<void> {
  const competences = competenciasAteDezembro(today, source.dayOfMonth);
  await writeFixedIncomeYear(executor, source, competences, Number(competences[0]!.slice(0, 4)));
}

/**
 * Mudar a fixa: as previstas em aberto a partir de hoje passam a ter o valor e
 * o dia novos. São no máximo 12 linhas, uma por mês; a data de cada uma sai da
 * mesma regra do lançamento (dataDoLancamento).
 */
export async function updateOpenFixedIncomes(
  executor: Executor,
  fixId: number,
  change: { amount: string; dayOfMonth: number },
  today: string,
): Promise<void> {
  const open = await executor
    .select({ id: incomes.id, competence: incomes.fixedCompetence })
    .from(incomes)
    .where(and(
      eq(incomes.fixedClassificationId, fixId),
      eq(incomes.status, INCOME_STATUS.planned),
      gte(incomes.receiptDate, today),
    ));
  for (const row of open) {
    if (!row.competence) continue;
    await executor
      .update(incomes)
      .set({ netAmount: change.amount, grossAmount: change.amount, receiptDate: dataDoLancamento(row.competence, change.dayOfMonth) })
      .where(eq(incomes.id, row.id));
  }
}

/** Desligar a fixa: apaga as previstas em aberto a partir de hoje; as vencidas em aberto e as recebidas ficam. */
export async function removeOpenFixedIncomes(executor: Executor, fixId: number, today: string): Promise<void> {
  await executor
    .delete(incomes)
    .where(and(
      eq(incomes.fixedClassificationId, fixId),
      eq(incomes.status, INCOME_STATUS.planned),
      gte(incomes.receiptDate, today),
    ));
}

/**
 * Fixas sem o ano gravado — a de antes da migration 0083 — ganham as previstas
 * até dezembro. Roda na rotina diária (todas) e na checagem ao abrir o app
 * (`userId`: só as de quem abriu).
 */
export async function ensureFixedIncomeYears(options: { userId?: number } = {}): Promise<{ registered: number }> {
  const today = getTodayIsoInTimezone();
  const sources = await loadFixedIncomeSources(db, and(
    isNull(incomeClassificationFixes.registeredYear),
    options.userId ? eq(incomeClassificationFixes.userId, options.userId) : undefined,
  ));
  for (const source of sources) {
    await db.transaction((transaction) => registerFixedIncomeYear(transaction, source, today));
  }
  return { registered: sources.length };
}

/** No dia do recebimento, avisa quem é dono de cada prevista da fixa para confirmar. Só a rotina diária manda. */
export async function sendFixedIncomeReminders(today: string = getTodayIsoInTimezone()): Promise<{ pushSent: number }> {
  const due = await db
    .select({ userId: incomes.userId, description: incomes.description, amount: incomes.netAmount })
    .from(incomes)
    .where(and(
      isNotNull(incomes.fixedClassificationId),
      eq(incomes.status, INCOME_STATUS.planned),
      eq(incomes.receiptDate, today),
    ));

  let pushSent = 0;
  for (const row of due) {
    const { sent } = await sendPushToUser(row.userId, {
      title: 'Receita prevista para hoje',
      body: `${row.description} — ${formatCurrency(row.amount)} · confirme o recebimento`,
    });
    if (sent > 0) pushSent += 1;
  }
  return { pushSent };
}
