import type { PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, max, ne, sql, type SQL } from 'drizzle-orm';
import { db, pool } from '../db/client';
import * as schema from '../db/schema';
import { incomes, type Income, type NewIncome } from '../db/schema';
import { accountCondition } from '../utils/accountFilter';
import { getMonthYearFromIsoDate, monthlyDatesUntil } from '../utils/date';
import { escapeLikePattern, roundCents } from '../utils/requestInput';
import { clients, contracts } from '../modules/contracts/db/schema';
import { RequestInputError } from '../utils/requestInput';
import { findAccountClient } from './clients';
import { cancelLinkedCommission, createCommissionExpense } from './commissionService';
import { consumeContractHours, findHourTypeContract, type HourTypeContract } from './contractHours';
import { contractRates, incomeAmounts, type IncomeAmounts } from './contractRetentions';
import { INCOME_STATUS, OPEN_INCOME_STATUSES } from './contractTypes';
import { CANCELLED_STATUS } from './entryQueries';
import { STOCK_REASONS, returnSoldStock, sellProductInIncome, type StockExecutor } from './stock';
import type {
  CreateIncomeInput, IncomeDuplicateQuery, IncomeSuggestionsQuery, ReceiveIncomeInput, UpdateIncomeInput,
} from './incomeInput';

const MATCH_LIMIT = 4;

const lowerDescription = sql<string>`lower(${incomes.description})`;

function toDecimal(value: number): string {
  return value.toFixed(2);
}

interface CommissionRule {
  percent: number;
  type: 'mensal' | 'unica';
}

// Comissões não estão no schema do Drizzle, e declará-las ali mudaria o que o
// drizzle-kit gera de migration. Por isso a consulta abaixo segue em SQL
// parametrizado, na mesma transação da receita.

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

const CLIENT_NOT_AVAILABLE = 'Escolha um cliente ativo do cadastro desta conta';

/**
 * Cliente da receita: do cadastro da conta da receita e ativo (o que a
 * receita já tinha continua valendo, mesmo desativado). As horas trazem o
 * cliente do contrato delas.
 */
async function resolveIncomeClient(
  accountId: number | null,
  clientId: number | null,
  hours: HourTypeContract | null,
  currentClientId: number | null = null,
): Promise<number | null> {
  if (hours) {
    if (clientId !== null && clientId !== hours.clientId) {
      throw new RequestInputError('As horas são do contrato de outro cliente: escolha o cliente do contrato');
    }
    return hours.clientId;
  }
  if (clientId === null) {
    return null;
  }
  const client = accountId === null ? null : await findAccountClient(accountId, clientId);
  if (!client || (!client.active && clientId !== currentClientId)) {
    throw new RequestInputError(CLIENT_NOT_AVAILABLE);
  }
  return clientId;
}

/** Colunas de valor: com retenção (contrato com órgão público), `valor` é o líquido e o bruto fica ao lado. */
function amountColumns(amounts: IncomeAmounts) {
  return {
    amount: toDecimal(amounts.net),
    grossAmount: amounts.withholdings ? toDecimal(amounts.gross) : null,
    withholdings: amounts.withholdings,
  };
}

/**
 * Grava a receita e as réplicas de "Repetir até" numa transação: ou entram
 * todas, ou nenhuma. As réplicas repetem descrição, valor, categoria, cliente,
 * representante e o vínculo com o contrato das horas; os anexos, a venda do
 * produto e as horas lançadas ficam só na original. A comissão mensal gera a
 * despesa de comissão em cada lançamento; a única, só na original. Horas de
 * contrato com órgão público: o valor digitado é o bruto e a receita vale o
 * líquido, com as retenções do contrato.
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

    const hours = input.billableHours
      ? await findHourTypeContract(transaction, input.accountId, input.billableHours.hourTypeId)
      : null;
    const clientId = await resolveIncomeClient(input.accountId, input.clientId, hours);
    const amounts = incomeAmounts(input.amount, hours?.rates ?? {});

    const commission = input.representativeId !== null
      ? await findCommissionRule(client, catalogOwnerId, input.representativeId, input.categoryId)
      : null;
    const commissionAmount = commission ? roundCents((amounts.net * commission.percent) / 100) : 0;

    const buildRow = (receiptDate: string, isOriginal: boolean): NewIncome => {
      const { mes, ano } = getMonthYearFromIsoDate(receiptDate);
      const withCommission = commissionAmount > 0 && (isOriginal || commission?.type === 'mensal');
      return {
        userId: authorId,
        accountId: input.accountId,
        description: input.description,
        ...amountColumns(amounts),
        receiptDate,
        month: mes,
        year: ano,
        clientId,
        classificationId: input.categoryId,
        representativeId: input.representativeId,
        commissionAmount: withCommission ? toDecimal(commissionAmount) : null,
        contractId: hours?.contractId ?? null,
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
      await consumeContractHours(transaction, {
        accountId: input.accountId!,
        hourTypeId: input.billableHours.hourTypeId,
        hours: input.billableHours.hours,
        incomeId: original!.id,
      });
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

export interface IncomeForUpdate {
  accountId: number | null;
  clientId: number | null;
  contractId: number | null;
  /** Preenchido na receita com retenção: na edição, o valor digitado é o bruto. */
  grossAmount: string | null;
}

export async function findIncomeForUpdate(ownerId: number, incomeId: number): Promise<IncomeForUpdate | null> {
  const [row] = await db
    .select({
      accountId: incomes.accountId,
      clientId: incomes.clientId,
      contractId: incomes.contractId,
      grossAmount: incomes.grossAmount,
    })
    .from(incomes)
    .where(and(eq(incomes.id, incomeId), eq(incomes.userId, ownerId)));
  return row ?? null;
}

/**
 * Edita a receita. Conta, observação, status e o que veio de contrato ou
 * produto ficam como estão: na receita de contrato, o cliente é o do contrato.
 * Com retenção, o valor editado é o bruto e as retenções saem dos percentuais
 * atuais do contrato.
 */
export async function updateIncome(
  ownerId: number,
  incomeId: number,
  current: IncomeForUpdate,
  input: UpdateIncomeInput,
): Promise<Income | null> {
  const clientId = current.contractId !== null
    ? current.clientId
    : await resolveIncomeClient(current.accountId, input.clientId, null, current.clientId);

  let amounts: IncomeAmounts = { gross: input.amount, withholdings: null, net: input.amount };
  if (current.grossAmount !== null && current.contractId !== null) {
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, current.contractId)).limit(1);
    amounts = incomeAmounts(input.amount, contract ? contractRates(contract) : {});
  }

  const { mes, ano } = getMonthYearFromIsoDate(input.receiptDate);
  const [updated] = await db
    .update(incomes)
    .set({
      description: input.description,
      ...amountColumns(amounts),
      receiptDate: input.receiptDate,
      month: mes,
      year: ano,
      clientId,
      classificationId: input.categoryId,
      representativeId: input.representativeId,
      attachments: input.attachments,
    })
    .where(and(eq(incomes.id, incomeId), eq(incomes.userId, ownerId)))
    .returning();
  return updated ?? null;
}

/** Já houve comissão de receita deste contrato nesta categoria (regra de comissão única). */
async function contractHadCommission(
  executor: Pick<typeof db, 'select'>,
  contractId: number,
  classificationId: number | null,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: incomes.id })
    .from(incomes)
    .where(and(
      eq(incomes.contractId, contractId),
      classificationId === null ? isNull(incomes.classificationId) : eq(incomes.classificationId, classificationId),
      isNotNull(incomes.commissionAmount),
      ne(incomes.status, CANCELLED_STATUS),
    ))
    .limit(1);
  return row !== undefined;
}

/**
 * Marca a receita prevista ou faturada como recebida, com a data e o valor
 * informados. A receita de contrato com representante gera aqui a comissão,
 * pelo valor recebido, se ainda não tem; a manual já teve a dela no
 * lançamento. Nulo quando a receita não é do dono ou já não está a receber.
 */
export async function receiveIncome(ownerId: number, incomeId: number, input: ReceiveIncomeInput): Promise<Income | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const transaction = drizzle(client, { schema });
    const [income] = await transaction
      .select()
      .from(incomes)
      .where(and(eq(incomes.id, incomeId), eq(incomes.userId, ownerId)))
      .limit(1)
      .for('update');
    if (!income || !OPEN_INCOME_STATUSES.includes(income.status)) {
      await client.query('ROLLBACK');
      return null;
    }

    const receiptDate = input.receivedDate ?? income.receiptDate;
    const amount = input.receivedAmount ?? Number(income.amount);
    let commissionAmount = income.commissionAmount;
    const fromContract = income.chargeId !== null || income.contractId !== null;
    if (fromContract && income.representativeId !== null && income.commissionAmount === null && income.accountId !== null) {
      const [account] = await transaction
        .select({ ownerId: schema.accounts.userId })
        .from(schema.accounts)
        .where(eq(schema.accounts.id, income.accountId))
        .limit(1);
      const rule = account
        ? await findCommissionRule(client, account.ownerId, income.representativeId, income.classificationId)
        : null;
      const alreadyPaidOnce = rule?.type === 'unica' && income.contractId !== null
        && await contractHadCommission(transaction, income.contractId, income.classificationId);
      const commission = rule && !alreadyPaidOnce ? roundCents((amount * rule.percent) / 100) : 0;
      if (account && commission > 0) {
        const { mes, ano } = getMonthYearFromIsoDate(receiptDate);
        await createCommissionExpense({
          client,
          authorId: income.userId,
          catalogOwnerId: account.ownerId,
          representanteId: income.representativeId,
          valorComissao: commission,
          dataRecebimento: receiptDate,
          mes,
          ano,
          contaId: income.accountId,
          incomeId: income.id,
        });
        commissionAmount = toDecimal(commission);
      }
    }

    const [updated] = await transaction
      .update(incomes)
      .set({ status: INCOME_STATUS.received, receiptDate, amount: toDecimal(amount), commissionAmount })
      .where(eq(incomes.id, income.id))
      .returning();
    await client.query('COMMIT');
    return updated ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  clientId: number | null;
  /** Nome atual do cliente do cadastro. */
  clientName: string | null;
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
      clientId: incomes.clientId,
      clientName: clients.name,
      categoryId: incomes.classificationId,
    })
    .from(incomes)
    .leftJoin(clients, and(eq(clients.id, incomes.clientId), eq(clients.accountId, incomes.accountId)))
    .where(and(...conditions, inArray(lowerDescription, keys)))
    .orderBy(lowerDescription, desc(incomes.createdAt), desc(incomes.id));

  const latestByKey = new Map(latest.map((row) => [row.key, row]));
  return keys.flatMap((key) => {
    const row = latestByKey.get(key);
    if (!row) return [];
    return [{
      description: row.description,
      amount: Number(row.amount),
      clientId: row.clientId,
      clientName: row.clientName,
      categoryId: row.categoryId,
    }];
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
    query.clientId === null ? isNull(incomes.clientId) : eq(incomes.clientId, query.clientId),
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
