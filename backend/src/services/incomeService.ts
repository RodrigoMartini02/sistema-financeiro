import type { PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, max, ne, sql, type SQL } from 'drizzle-orm';
import { db, pool } from '../db/client';
import * as schema from '../db/schema';
import { incomes, type Income, type NewIncome } from '../db/schema';
import { accountCondition } from '../utils/accountFilter';
import { getMonthYearFromIsoDate, monthlyDatesUntil } from '../utils/date';
import { escapeLikePattern, roundCents } from '../utils/requestInput';
import { cancelLinkedCommission, createCommissionExpense } from './commissionService';
import { CANCELLED_STATUS } from './entryQueries';
import { STOCK_REASONS, returnSoldStock, sellProductInIncome, type StockExecutor } from './stock';
import type {
  CreateIncomeInput, HourType, IncomeBillableHours, IncomeDuplicateQuery, IncomeSuggestionsQuery, UpdateIncomeInput,
} from './incomeInput';

const MATCH_LIMIT = 4;

const lowerDescription = sql<string>`lower(${incomes.description})`;

const HOUR_BALANCE_COLUMNS: Record<HourType, string> = {
  presencial: 'horas_presenciais_saldo_atual',
  remoto: 'horas_remotas_saldo_atual',
};

function toDecimal(value: number): string {
  return value.toFixed(2);
}

interface CommissionRule {
  percent: number;
  type: 'mensal' | 'unica';
}

// Comissões, representantes e contratos não estão no schema do Drizzle, e
// declará-los ali mudaria o que o drizzle-kit gera de migration. Por isso as duas
// consultas abaixo seguem em SQL parametrizado, na mesma transação da receita.

/** Comissão ativa do representante (do dono do catálogo da conta) para a categoria da receita. */
async function findCommissionRule(
  client: PoolClient,
  catalogOwnerId: number,
  representativeId: number,
  categoryId: number | null,
): Promise<CommissionRule | null> {
  if (categoryId === null) return null;
  const result = await client.query(
    `SELECT c.percentual, c.tipo
       FROM comissoes c
       JOIN representantes r ON r.id = c.representante_id
      WHERE c.representante_id = $1 AND r.usuario_id = $2 AND c.classificacao_id = $3 AND c.ativo = true
      LIMIT 1`,
    [representativeId, catalogOwnerId, categoryId],
  );
  const row = result.rows[0] as { percentual: string | number; tipo: string | null } | undefined;
  if (!row) return null;
  return { percent: Number(row.percentual), type: row.tipo === 'unica' ? 'unica' : 'mensal' };
}

/** Horas a faturar saem do saldo do contrato (do dono do catálogo da conta), sem ficar negativo. */
async function debitContractHours(client: PoolClient, catalogOwnerId: number, billableHours: IncomeBillableHours): Promise<void> {
  const column = HOUR_BALANCE_COLUMNS[billableHours.hourType];
  await client.query(
    `UPDATE contratos SET ${column} = GREATEST(0, ${column} - $1) WHERE id = $2 AND usuario_id = $3`,
    [billableHours.hours, billableHours.contractId, catalogOwnerId],
  );
}

/**
 * Grava a receita e as réplicas de "Repetir até" numa transação: ou entram
 * todas, ou nenhuma. As réplicas repetem descrição, valor, categoria, cliente,
 * representante e o vínculo com o contrato (que marca o mês como faturado); os
 * anexos, a venda do produto e o desconto das horas ficam só na original. A
 * comissão mensal gera a despesa de comissão em cada lançamento; a única, só na
 * original.
 *
 * A receita e a despesa de comissão ficam com quem lançou (`authorId`). O
 * representante, o produto e o contrato são do catálogo da conta, procurados no
 * dono dela (`catalogOwnerId`): o titular, também quando quem lança é membro ou
 * colaborador.
 */
export async function createIncome(authorId: number, catalogOwnerId: number, input: CreateIncomeInput): Promise<Income> {
  const replicaDates = input.repeatUntil
    ? monthlyDatesUntil(input.receiptDate, input.repeatUntil.month, input.repeatUntil.year)
    : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const transaction = drizzle(client, { schema });

    const commission = input.representativeId !== null
      ? await findCommissionRule(client, catalogOwnerId, input.representativeId, input.categoryId)
      : null;
    const commissionAmount = commission ? roundCents((input.amount * commission.percent) / 100) : 0;

    const buildRow = (receiptDate: string, isOriginal: boolean): NewIncome => {
      const { mes, ano } = getMonthYearFromIsoDate(receiptDate);
      const withCommission = commissionAmount > 0 && (isOriginal || commission?.type === 'mensal');
      return {
        userId: authorId,
        accountId: input.accountId,
        description: input.description,
        amount: toDecimal(input.amount),
        receiptDate,
        month: mes,
        year: ano,
        client: input.client,
        classificationId: input.categoryId,
        representativeId: input.representativeId,
        commissionAmount: withCommission ? toDecimal(commissionAmount) : null,
        contractId: input.billableHours?.contractId ?? null,
        productId: isOriginal ? input.productSale?.productId ?? null : null,
        soldQuantity: isOriginal && input.productSale ? String(input.productSale.quantity) : null,
        attachments: isOriginal ? input.attachments : null,
      };
    };

    const [original] = await transaction.insert(incomes).values(buildRow(input.receiptDate, true)).returning();
    const replicas = replicaDates.length > 0
      ? await transaction.insert(incomes).values(replicaDates.map((date) => buildRow(date, false))).returning()
      : [];

    for (const row of [original!, ...replicas]) {
      if (row.commissionAmount === null) continue;
      await createCommissionExpense({
        client,
        authorId,
        catalogOwnerId,
        representanteId: input.representativeId!,
        valorComissao: Number(row.commissionAmount),
        dataRecebimento: row.receiptDate,
        mes: row.month,
        ano: row.year,
        contaId: input.accountId,
        incomeId: row.id,
      });
    }
    if (input.productSale) {
      await sellProductInIncome(transaction, {
        productId: input.productSale.productId,
        ownerId: catalogOwnerId,
        accountId: input.accountId,
        quantity: input.productSale.quantity,
        incomeId: original!.id,
      });
    }
    if (input.billableHours) {
      await debitContractHours(client, catalogOwnerId, input.billableHours);
    }

    await client.query('COMMIT');
    return original!;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Receita do dono travada até o fim da transação: cancelar e excluir não correm em paralelo. */
async function lockIncome(
  executor: StockExecutor,
  ownerId: number,
  incomeId: number,
): Promise<{ id: number; status: string } | null> {
  const [income] = await executor
    .select({ id: incomes.id, status: incomes.status })
    .from(incomes)
    .where(and(eq(incomes.id, incomeId), eq(incomes.userId, ownerId)))
    .limit(1)
    .for('update');
  return income ?? null;
}

/**
 * Desfaz o que a receita gerou: devolve ao estoque a quantidade vendida e
 * cancela a comissão dela que ainda não foi paga. Receita já cancelada não tem
 * mais nada a desfazer — o cancelamento fez isso.
 */
async function undoIncomeEffects(executor: StockExecutor, incomeId: number, stockReason: string): Promise<void> {
  await returnSoldStock(executor, { incomeId, reason: stockReason });
  await cancelLinkedCommission(executor, incomeId);
}

/** Cancela a receita (continua no banco, fora dos totais). Falso quando não é do dono. Cancelar de novo não faz nada. */
export async function cancelIncome(ownerId: number, incomeId: number): Promise<boolean> {
  return db.transaction((transaction) => cancelIncomeInTransaction(transaction, ownerId, incomeId));
}

/**
 * O cancelamento dentro de uma transação já aberta: o estorno de um pedido da
 * vitrine cancela as receitas dele todas juntas.
 */
export async function cancelIncomeInTransaction(executor: StockExecutor, ownerId: number, incomeId: number): Promise<boolean> {
  const income = await lockIncome(executor, ownerId, incomeId);
  if (!income) {
    return false;
  }
  if (income.status === CANCELLED_STATUS) {
    return true;
  }
  await executor.update(incomes).set({ status: CANCELLED_STATUS }).where(eq(incomes.id, income.id));
  await undoIncomeEffects(executor, income.id, STOCK_REASONS.incomeCancelled);
  return true;
}

/** Apaga a receita de vez. Falso quando não é do dono. */
export async function deleteIncome(ownerId: number, incomeId: number): Promise<boolean> {
  return db.transaction(async (transaction) => {
    const income = await lockIncome(transaction, ownerId, incomeId);
    if (!income) {
      return false;
    }
    if (income.status !== CANCELLED_STATUS) {
      await undoIncomeEffects(transaction, income.id, STOCK_REASONS.incomeDeleted);
    }
    await transaction.delete(incomes).where(eq(incomes.id, income.id));
    return true;
  });
}

/**
 * Excluir o ano apaga as receitas dele: antes, devolve ao estoque o que as não
 * canceladas venderam. Operação rara, então a devolução é receita por receita,
 * com a mesma função do cancelamento. As comissões do ano vão embora com as
 * despesas dele.
 */
export async function returnStockOfYear(executor: StockExecutor, ownerId: number, year: number): Promise<void> {
  const yearIncomes = await executor
    .select({ id: incomes.id })
    .from(incomes)
    .where(and(
      eq(incomes.userId, ownerId),
      eq(incomes.year, year),
      ne(incomes.status, CANCELLED_STATUS),
      isNotNull(incomes.productId),
    ));
  for (const income of yearIncomes) {
    await returnSoldStock(executor, { incomeId: income.id, reason: STOCK_REASONS.yearDeleted });
  }
}

export async function findIncomeForUpdate(ownerId: number, incomeId: number): Promise<{ accountId: number | null } | null> {
  const [row] = await db
    .select({ accountId: incomes.accountId })
    .from(incomes)
    .where(and(eq(incomes.id, incomeId), eq(incomes.userId, ownerId)));
  return row ?? null;
}

/** Edita a receita. Conta, observação, status e o que veio de contrato ou produto ficam como estão. */
export async function updateIncome(ownerId: number, incomeId: number, input: UpdateIncomeInput): Promise<Income | null> {
  const { mes, ano } = getMonthYearFromIsoDate(input.receiptDate);
  const [updated] = await db
    .update(incomes)
    .set({
      description: input.description,
      amount: toDecimal(input.amount),
      receiptDate: input.receiptDate,
      month: mes,
      year: ano,
      client: input.client,
      classificationId: input.categoryId,
      representativeId: input.representativeId,
      attachments: input.attachments,
    })
    .where(and(eq(incomes.id, incomeId), eq(incomes.userId, ownerId)))
    .returning();
  return updated ?? null;
}

/** O histórico de quem lança: só as próprias receitas não canceladas, na conta pedida. */
function historyConditions(userId: number, accountId: number | null): SQL[] {
  const conditions: SQL[] = [eq(incomes.userId, userId), ne(incomes.status, 'cancelada')];
  if (accountId !== null) {
    conditions.push(accountCondition(incomes.accountId, incomes.userId, accountId));
  }
  return conditions;
}

export interface IncomeSuggestionMatch {
  description: string;
  amount: number;
  client: string | null;
  categoryId: number | null;
}

export interface IncomeSuggestions {
  matches: IncomeSuggestionMatch[];
  /** Valor da última receita com exatamente a mesma descrição. */
  lastAmount: number | null;
}

/** Descrições distintas, as mais frequentes primeiro, cada uma com os dados da receita mais recente. */
async function findMatches(userId: number, query: IncomeSuggestionsQuery): Promise<IncomeSuggestionMatch[]> {
  if (!query.description) return [];
  const conditions = [
    ...historyConditions(userId, query.accountId),
    ilike(incomes.description, `%${escapeLikePattern(query.description)}%`),
  ];

  const ranked = await db
    .select({ key: lowerDescription })
    .from(incomes)
    .where(and(...conditions))
    .groupBy(lowerDescription)
    .orderBy(desc(count()), desc(max(incomes.createdAt)))
    .limit(MATCH_LIMIT);
  if (ranked.length === 0) return [];

  const keys = ranked.map((row) => row.key);
  const latest = await db
    .selectDistinctOn([lowerDescription], {
      key: lowerDescription,
      description: incomes.description,
      amount: incomes.amount,
      client: incomes.client,
      categoryId: incomes.classificationId,
    })
    .from(incomes)
    .where(and(...conditions, inArray(lowerDescription, keys)))
    .orderBy(lowerDescription, desc(incomes.createdAt), desc(incomes.id));

  const latestByKey = new Map(latest.map((row) => [row.key, row]));
  return keys.flatMap((key) => {
    const row = latestByKey.get(key);
    if (!row) return [];
    return [{ description: row.description, amount: Number(row.amount), client: row.client, categoryId: row.categoryId }];
  });
}

async function findLastAmount(userId: number, query: IncomeSuggestionsQuery): Promise<number | null> {
  if (!query.description) return null;
  const [row] = await db
    .select({ amount: incomes.amount })
    .from(incomes)
    .where(and(...historyConditions(userId, query.accountId), eq(lowerDescription, sql`lower(${query.description})`)))
    .orderBy(desc(incomes.createdAt), desc(incomes.id))
    .limit(1);
  return row ? Number(row.amount) : null;
}

export async function getIncomeSuggestions(userId: number, query: IncomeSuggestionsQuery): Promise<IncomeSuggestions> {
  const [matches, lastAmount] = await Promise.all([findMatches(userId, query), findLastAmount(userId, query)]);
  return { matches, lastAmount };
}

/**
 * Receita parecida cadastrada nos últimos 7 dias: mesma descrição (sem diferenciar
 * maiúsculas), valor e cliente, na mesma conta e não cancelada.
 */
export async function findRecentIncomeDuplicate(userId: number, query: IncomeDuplicateQuery): Promise<{ createdAt: string } | null> {
  const conditions: SQL[] = [
    ...historyConditions(userId, query.accountId),
    eq(lowerDescription, sql`lower(${query.description})`),
    eq(incomes.amount, toDecimal(query.amount)),
    query.client === null ? isNull(incomes.client) : eq(incomes.client, query.client),
    gte(incomes.createdAt, sql`now() - interval '7 days'`),
  ];
  if (query.excludeId !== null) {
    conditions.push(ne(incomes.id, query.excludeId));
  }

  const [row] = await db
    .select({ createdAt: sql<string>`to_char(${incomes.createdAt}, 'YYYY-MM-DD')` })
    .from(incomes)
    .where(and(...conditions))
    .orderBy(desc(incomes.createdAt))
    .limit(1);
  return row ? { createdAt: row.createdAt } : null;
}
