import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, max, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { cards, expenses, type Expense, type NewExpense } from '../db/schema';
import { accountCondition } from '../utils/accountFilter';
import { getMonthYearFromIsoDate } from '../utils/date';
import { RequestInputError, escapeLikePattern } from '../utils/requestInput';
import { INVOICE_EXPENSE_METHOD, invoiceEditLockOf, type InvoiceEditLock, type LockableExpenseFields } from './cardInvoiceRules';
import { ACTIVE_STATUS } from './entryQueries';
import {
  changedSeriesFields,
  isInstallmentInScope,
  isOpenFollowingOccurrence,
  monthlySeriesDates,
  planInstallmentUpdates,
  planRecurringUpdates,
  type InvoiceCardDays,
  type SeriesFields,
  type SeriesOccurrence,
  type SeriesRowUpdate,
} from './expenseSeries';
import {
  PAYMENT_METHODS,
  type CreateExpenseInput,
  type DuplicateQuery,
  type PaymentMethod,
  type SuggestionsQuery,
  type UpdateExpenseInput,
} from './expenseInput';
import { resolveEditedPayment, resolvePayment } from './expensePayment';
import { embeddedInstallmentInterests, recalculatedInstallmentInterests } from './installmentSplit';

const MATCH_LIMIT = 4;

const lowerDescription = sql<string>`lower(${expenses.description})`;

function toDecimal(value: number): string {
  return value.toFixed(2);
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function scheduleColumns(dueDate: string): Pick<NewExpense, 'dueDate' | 'month' | 'year'> {
  const { mes, ano } = getMonthYearFromIsoDate(dueDate);
  return { dueDate, month: mes, year: ano };
}

/**
 * Linhas a gravar. Anexos e nota fiscal ficam só na primeira, como sempre foi.
 * Parcelas levam a data da compra em todas e, com o valor à vista informado, a sua
 * parte do juros embutido (o que a soma das parcelas passa do à vista, dividido
 * por igual entre elas). A despesa mensal é sempre do
 * crédito com cartão (`card`) e vai da primeira ocorrência até dezembro do ano
 * dela (monthlySeriesDates), cada uma com a data de compra e o vencimento da
 * fatura dela.
 */
function buildRows(userId: number, input: CreateExpenseInput, today: string, card: InvoiceCardDays | null): NewExpense[] {
  const base: Pick<NewExpense, 'userId' | 'accountId' | 'categoryId' | 'cardId' | 'description' | 'paymentMethod'> = {
    userId,
    accountId: input.accountId,
    categoryId: input.categoryId,
    cardId: input.cardId,
    description: input.description,
    paymentMethod: input.paymentMethod,
  };
  const firstRowExtras: Pick<NewExpense, 'attachments' | 'numeroNf' | 'dataEmissaoNf'> = {
    attachments: input.attachments,
    numeroNf: input.invoiceNumber,
    dataEmissaoNf: input.invoiceDate,
  };

  if (input.billingType === 'installments') {
    const installmentCount = input.installments.length;
    const interests = embeddedInstallmentInterests(
      input.installments.map((installment) => toCents(installment.amount)),
      input.cashPrice === null ? null : toCents(input.cashPrice),
    );
    return input.installments.map((installment, index): NewExpense => ({
      ...base,
      ...scheduleColumns(installment.dueDate),
      ...resolvePayment(installment, installment.amount, installment.dueDate, input.paymentMethod, today, false),
      ...(index === 0 ? firstRowExtras : {}),
      purchaseDate: input.purchaseDate,
      originalAmount: toDecimal(installment.amount),
      interest: interests[index]! > 0 ? toDecimal(interests[index]! / 100) : null,
      installment: true,
      numberOfInstallments: installmentCount,
      currentInstallment: index + 1,
    }));
  }

  const first: NewExpense = {
    ...base,
    ...scheduleColumns(input.dueDate),
    ...resolvePayment(input, input.amount, input.dueDate, input.paymentMethod, today, true),
    ...firstRowExtras,
    purchaseDate: input.purchaseDate,
    originalAmount: toDecimal(input.amount),
    recurring: input.billingType === 'monthly',
  };
  if (input.billingType === 'single') {
    return [first];
  }

  // A leitura do pedido já exige o crédito com cartão; sem os dias do cartão, não há fatura para seguir.
  if (!card) throw new RequestInputError('Cartão não encontrado');
  const [, ...followingDates] = monthlySeriesDates({ purchaseDate: input.purchaseDate, dueDate: input.dueDate }, card);
  const occurrences = followingDates.map((dates): NewExpense => ({
    ...base,
    ...scheduleColumns(dates.dueDate),
    purchaseDate: dates.purchaseDate,
    originalAmount: toDecimal(input.amount),
    recurring: true,
  }));
  return [first, ...occurrences];
}

/**
 * Grava a despesa numa transação: ou entram todas as linhas (parcelas ou
 * ocorrências), ou nenhuma. As demais linhas apontam para a primeira como grupo, e
 * a primeira aponta para si mesma — o mesmo agrupamento que a exclusão usa.
 */
export async function createExpense(userId: number, input: CreateExpenseInput, today: string): Promise<Expense> {
  const card = input.billingType === 'monthly' ? await invoiceCardDays(db, input) : null;
  const [firstRow, ...otherRows] = buildRows(userId, input, today, card);
  return db.transaction(async (transaction) => {
    const [first] = await transaction.insert(expenses).values(firstRow!).returning();
    if (otherRows.length === 0) {
      return first!;
    }
    await transaction.insert(expenses).values(otherRows.map((row) => ({ ...row, installmentGroupId: first!.id })));
    const [grouped] = await transaction
      .update(expenses)
      .set({ installmentGroupId: first!.id })
      .where(eq(expenses.id, first!.id))
      .returning();
    return grouped!;
  });
}

export interface ExpenseForUpdate {
  accountId: number | null;
  cardId: number | null;
  categoryId: number | null;
  isInstallment: boolean;
  /** Trava do pagamento da fatura: a edição recusa mudar os campos travados e não os regrava. */
  invoiceEditLock: InvoiceEditLock | null;
  /** Valores gravados que as travas comparam com os da edição. */
  lockableFields: LockableExpenseFields;
  /** Série da despesa (mensal ou parcelado), para a edição alcançar as outras linhas. */
  series: { recurring: boolean; installmentGroupId: number | null; installmentNumber: number | null };
  /** Valores gravados que a edição compara para saber o que passar para a série. */
  seriesFields: SeriesFields;
}

export async function findExpenseForUpdate(ownerId: number, expenseId: number): Promise<ExpenseForUpdate | null> {
  const [row] = await db
    .select({
      accountId: expenses.accountId,
      cardId: expenses.cardId,
      categoryId: expenses.categoryId,
      installment: expenses.installment,
      invoicePaymentId: expenses.invoicePaymentId,
      invoiceOriginPaymentId: expenses.invoiceOriginPaymentId,
      originalAmount: expenses.originalAmount,
      dueDate: expenses.dueDate,
      paymentMethod: expenses.paymentMethod,
      paid: expenses.paid,
      paymentDate: expenses.paymentDate,
      amountPaid: expenses.amountPaid,
      description: expenses.description,
      purchaseDate: expenses.purchaseDate,
      recurring: expenses.recurring,
      installmentGroupId: expenses.installmentGroupId,
      currentInstallment: expenses.currentInstallment,
    })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, ownerId)));
  if (!row) return null;
  const amount = Number(row.originalAmount ?? 0);
  return {
    accountId: row.accountId,
    cardId: row.cardId,
    categoryId: row.categoryId,
    isInstallment: row.installment === true,
    invoiceEditLock: invoiceEditLockOf(row),
    lockableFields: {
      amount,
      dueDate: row.dueDate,
      paymentMethod: row.paymentMethod,
      cardId: row.cardId,
      paid: row.paid === true,
      paymentDate: row.paymentDate,
      amountPaid: row.amountPaid === null ? null : Number(row.amountPaid),
    },
    series: {
      recurring: row.recurring === true,
      installmentGroupId: row.installmentGroupId,
      installmentNumber: row.currentInstallment,
    },
    seriesFields: {
      description: row.description,
      categoryId: row.categoryId,
      paymentMethod: row.paymentMethod,
      cardId: row.cardId,
      amount,
      purchaseDate: row.purchaseDate,
      dueDate: row.dueDate,
    },
  };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ExpenseUpdateResult {
  updated: Expense;
  /** Outras linhas da série que também mudaram. */
  seriesUpdated: number;
  /** Parcelas abertas cujo juros foi refeito com o valor à vista informado na edição. */
  interestUpdated: number;
}

/**
 * Edita uma linha e, numa série, as outras do alcance (expenseSeries). Número e
 * posição da parcela, grupo, recorrência, conta e observação ficam como estão: o
 * modal não os mostra, e sobrescrevê-los apagava o "3/10" da parcela editada.
 * O pagamento é o que a tela mandou: a edição não religa "paga" sozinha (o
 * pagamento automático é só da criação). Com a trava do pagamento da fatura, os
 * campos travados também ficam como estão (a rota já recusou qualquer mudança
 * neles). Tudo numa transação: ou a série inteira muda, ou nada.
 */
export async function updateExpense(
  ownerId: number,
  expenseId: number,
  input: UpdateExpenseInput,
  current: ExpenseForUpdate,
  today: string,
): Promise<ExpenseUpdateResult | null> {
  const keepsValueAndMethod = current.invoiceEditLock !== null;
  const keepsScheduleAndPayment = current.invoiceEditLock === 'invoice-item';
  return db.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(expenses)
      .set({
        ...(keepsScheduleAndPayment ? {} : scheduleColumns(input.dueDate)),
        ...(keepsScheduleAndPayment ? {} : resolveEditedPayment(input, today)),
        description: input.description,
        purchaseDate: input.purchaseDate,
        categoryId: input.categoryId,
        ...(keepsValueAndMethod
          ? {}
          : { cardId: input.cardId, paymentMethod: input.paymentMethod, originalAmount: toDecimal(input.amount) }),
        attachments: input.attachments,
        numeroNf: input.invoiceNumber,
        dataEmissaoNf: input.invoiceDate,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.userId, ownerId)))
      .returning();
    if (!updated) return null;
    const seriesUpdated = await updateSeriesRows(transaction, ownerId, expenseId, input, current);
    const interestUpdated = input.cashPrice === null
      ? 0
      : await refreshEmbeddedInterest(transaction, ownerId, current, toCents(input.cashPrice));
    return { updated, seriesUpdated, interestUpdated };
  });
}

/**
 * Fechamento e vencimento do cartão, quando a despesa é crédito com cartão (regra
 * da fatura); nulo nas outras formas. O cartão já foi autorizado pela rota
 * (resolveCardForWrite).
 */
async function invoiceCardDays(
  executor: Pick<typeof db, 'select'>,
  expense: Pick<SeriesFields, 'paymentMethod' | 'cardId'>,
): Promise<InvoiceCardDays | null> {
  if (expense.paymentMethod !== INVOICE_EXPENSE_METHOD || expense.cardId === null) return null;
  const [card] = await executor
    .select({ closingDay: cards.closingDay, dueDay: cards.dueDay })
    .from(cards)
    .where(eq(cards.id, expense.cardId))
    .limit(1);
  return card ?? null;
}

/** Colunas de uma linha da série: só os campos que mudaram (vencimento regrava mês e ano). */
function seriesRowColumns(update: SeriesRowUpdate): Partial<NewExpense> {
  return {
    ...(update.description !== undefined ? { description: update.description } : {}),
    ...(update.categoryId !== undefined ? { categoryId: update.categoryId } : {}),
    ...(update.paymentMethod !== undefined ? { paymentMethod: update.paymentMethod } : {}),
    ...(update.cardId !== undefined ? { cardId: update.cardId } : {}),
    ...(update.amount !== undefined ? { originalAmount: toDecimal(update.amount) } : {}),
    ...(update.purchaseDate !== undefined ? { purchaseDate: update.purchaseDate } : {}),
    ...(update.dueDate !== undefined ? scheduleColumns(update.dueDate) : {}),
  };
}

/**
 * As outras linhas da série que a edição alcança — no mensal, as próximas em
 * aberto; no parcelado, o alcance pedido (`applyTo`) — com só os campos
 * alterados. Lidas com FOR UPDATE, sempre do dono e da série da despesa já
 * autorizada. Devolve quantas mudaram.
 */
async function updateSeriesRows(
  transaction: Transaction,
  ownerId: number,
  expenseId: number,
  input: UpdateExpenseInput,
  current: ExpenseForUpdate,
): Promise<number> {
  const { series } = current;
  if (series.installmentGroupId === null) return 0;
  const installmentScope = current.isInstallment && input.applyTo !== 'this' ? input.applyTo : null;
  if (!series.recurring && installmentScope === null) return 0;

  const next: SeriesFields = {
    description: input.description,
    categoryId: input.categoryId,
    paymentMethod: input.paymentMethod,
    cardId: input.cardId,
    amount: input.amount,
    purchaseDate: input.purchaseDate,
    dueDate: input.dueDate,
  };
  const changed = changedSeriesFields(current.seriesFields, next);
  if (changed.size === 0) return 0;

  const rows = await transaction
    .select({
      id: expenses.id,
      installmentGroupId: expenses.installmentGroupId,
      recurring: expenses.recurring,
      installment: expenses.installment,
      installmentNumber: expenses.currentInstallment,
      status: expenses.status,
      paid: expenses.paid,
      invoicePaymentId: expenses.invoicePaymentId,
      invoiceOriginPaymentId: expenses.invoiceOriginPaymentId,
      dueDate: expenses.dueDate,
      purchaseDate: expenses.purchaseDate,
    })
    .from(expenses)
    .where(and(
      eq(expenses.userId, ownerId),
      eq(expenses.installmentGroupId, series.installmentGroupId),
      ne(expenses.id, expenseId),
    ))
    .orderBy(asc(expenses.dueDate), asc(expenses.id))
    .for('update');
  const occurrences: SeriesOccurrence[] = rows.map((row) => ({
    id: row.id,
    installmentGroupId: row.installmentGroupId,
    recurring: row.recurring === true,
    installment: row.installment === true,
    installmentNumber: row.installmentNumber,
    active: row.status === ACTIVE_STATUS,
    paid: row.paid === true,
    invoicePaymentId: row.invoicePaymentId,
    invoiceOriginPaymentId: row.invoiceOriginPaymentId,
    dueDate: row.dueDate,
    purchaseDate: row.purchaseDate,
  }));
  const edited = {
    id: expenseId,
    installmentGroupId: series.installmentGroupId,
    installmentNumber: series.installmentNumber,
    dueDate: current.seriesFields.dueDate,
  };
  const edit = { originalDueDate: current.seriesFields.dueDate, next };

  let updates: SeriesRowUpdate[];
  if (series.recurring) {
    const following = occurrences.filter((row) => isOpenFollowingOccurrence(row, edited));
    if (following.length === 0) return 0;
    updates = planRecurringUpdates(edit, changed, following, await invoiceCardDays(transaction, next));
  } else {
    const scope = installmentScope!;
    updates = planInstallmentUpdates(edit, changed, occurrences.filter((row) => isInstallmentInScope(row, edited, scope)));
  }

  let updatedRows = 0;
  for (const update of updates) {
    const columns = seriesRowColumns(update);
    if (Object.keys(columns).length === 0) continue;
    await transaction.update(expenses).set(columns).where(and(eq(expenses.id, update.id), eq(expenses.userId, ownerId)));
    updatedRows += 1;
  }
  return updatedRows;
}

/**
 * Valor à vista informado na edição da compra parcelada: refaz o juros embutido das
 * parcelas abertas (recalculatedInstallmentInterests). Lê a compra depois das mudanças
 * da mesma edição (o valor novo já vale) e só grava o juros das parcelas abertas e fora
 * de pagamento de fatura: a paga e a da fatura já foram para o caixa e não mudam. O valor
 * à vista não é guardado. Devolve quantas parcelas tiveram o juros trocado.
 */
async function refreshEmbeddedInterest(
  transaction: Transaction,
  ownerId: number,
  current: ExpenseForUpdate,
  cashPriceInCents: number,
): Promise<number> {
  const groupId = current.series.installmentGroupId;
  if (!current.isInstallment || groupId === null) {
    throw new RequestInputError('O valor à vista é só da compra parcelada');
  }
  const rows = await transaction
    .select({
      id: expenses.id,
      amount: expenses.originalAmount,
      interest: expenses.interest,
      paid: expenses.paid,
      invoicePaymentId: expenses.invoicePaymentId,
    })
    .from(expenses)
    .where(and(
      eq(expenses.userId, ownerId),
      eq(expenses.installmentGroupId, groupId),
      eq(expenses.installment, true),
      eq(expenses.status, ACTIVE_STATUS),
      isNull(expenses.invoiceOriginPaymentId),
    ))
    .orderBy(asc(expenses.currentInstallment), asc(expenses.id))
    .for('update');
  const stored = new Map(rows.map((row) => [row.id, toCents(Number(row.interest ?? 0))]));
  const interests = recalculatedInstallmentInterests(
    rows.map((row) => ({
      id: row.id,
      amountCents: toCents(Number(row.amount)),
      interestCents: stored.get(row.id)!,
      fixed: row.paid === true || row.invoicePaymentId !== null,
    })),
    cashPriceInCents,
  );
  let updatedRows = 0;
  for (const [id, interestCents] of interests) {
    if (interestCents === stored.get(id)) continue;
    await transaction
      .update(expenses)
      .set({ interest: interestCents > 0 ? toDecimal(interestCents / 100) : null })
      .where(and(eq(expenses.id, id), eq(expenses.userId, ownerId)));
    updatedRows += 1;
  }
  return updatedRows;
}

/** O histórico de quem lança: só as próprias despesas ativas, na conta pedida. */
function historyConditions(userId: number, accountId: number | null): SQL[] {
  const conditions: SQL[] = [eq(expenses.userId, userId), eq(expenses.status, 'ativa')];
  if (accountId !== null) {
    conditions.push(accountCondition(expenses.accountId, expenses.userId, accountId));
  }
  return conditions;
}

export interface ExpenseSuggestionMatch {
  description: string;
  amount: number;
  categoryId: number | null;
  paymentMethod: string;
  cardId: number | null;
}

export interface ExpenseSuggestions {
  matches: ExpenseSuggestionMatch[];
  /** Valor do lançamento mais recente com exatamente a mesma descrição. */
  lastAmount: number | null;
  /** Forma mais usada na categoria pedida; sem categoria (ou sem uso nela), a mais usada na conta. */
  suggestedPaymentMethod: PaymentMethod | null;
  /** Cartão mais usado com cada forma, para já marcar um quando ela é escolhida. */
  preferredCardIds: { debito: number | null; credito: number | null };
}

/** Descrições distintas, as mais frequentes primeiro, cada uma com os dados do lançamento mais recente. */
async function findMatches(userId: number, query: SuggestionsQuery): Promise<ExpenseSuggestionMatch[]> {
  if (!query.description) return [];
  const conditions = [
    ...historyConditions(userId, query.accountId),
    ilike(expenses.description, `%${escapeLikePattern(query.description)}%`),
  ];

  const ranked = await db
    .select({ key: lowerDescription })
    .from(expenses)
    .where(and(...conditions))
    .groupBy(lowerDescription)
    .orderBy(desc(count()), desc(max(expenses.createdAt)))
    .limit(MATCH_LIMIT);
  if (ranked.length === 0) return [];

  const keys = ranked.map((row) => row.key);
  const latest = await db
    .selectDistinctOn([lowerDescription], {
      key: lowerDescription,
      description: expenses.description,
      amount: expenses.originalAmount,
      categoryId: expenses.categoryId,
      paymentMethod: expenses.paymentMethod,
      cardId: expenses.cardId,
    })
    .from(expenses)
    .where(and(...conditions, inArray(lowerDescription, keys)))
    .orderBy(lowerDescription, desc(expenses.createdAt), desc(expenses.id));

  const latestByKey = new Map(latest.map((row) => [row.key, row]));
  return keys.flatMap((key) => {
    const row = latestByKey.get(key);
    if (!row) return [];
    return [{
      description: row.description,
      amount: Number(row.amount ?? 0),
      categoryId: row.categoryId,
      paymentMethod: row.paymentMethod ?? 'dinheiro',
      cardId: row.cardId,
    }];
  });
}

async function findLastAmount(userId: number, query: SuggestionsQuery): Promise<number | null> {
  if (!query.description) return null;
  const [row] = await db
    .select({ amount: expenses.originalAmount })
    .from(expenses)
    .where(and(...historyConditions(userId, query.accountId), eq(lowerDescription, sql`lower(${query.description})`)))
    .orderBy(desc(expenses.createdAt), desc(expenses.id))
    .limit(1);
  return row?.amount != null ? Number(row.amount) : null;
}

async function findMostUsedPaymentMethod(conditions: SQL[]): Promise<PaymentMethod | null> {
  const [row] = await db
    .select({ paymentMethod: expenses.paymentMethod })
    .from(expenses)
    .where(and(...conditions, inArray(expenses.paymentMethod, [...PAYMENT_METHODS])))
    .groupBy(expenses.paymentMethod)
    .orderBy(desc(count()))
    .limit(1);
  return (row?.paymentMethod as PaymentMethod | undefined) ?? null;
}

async function findSuggestedPaymentMethod(userId: number, query: SuggestionsQuery): Promise<PaymentMethod | null> {
  const conditions = historyConditions(userId, query.accountId);
  if (query.categoryId !== null) {
    const byCategory = await findMostUsedPaymentMethod([...conditions, eq(expenses.categoryId, query.categoryId)]);
    if (byCategory) return byCategory;
  }
  return findMostUsedPaymentMethod(conditions);
}

async function findPreferredCard(
  userId: number,
  accountId: number | null,
  paymentMethod: 'debito' | 'credito',
): Promise<number | null> {
  const [row] = await db
    .select({ cardId: cards.id })
    .from(expenses)
    .innerJoin(cards, eq(cards.id, expenses.cardId))
    .where(and(
      ...historyConditions(userId, accountId),
      eq(expenses.paymentMethod, paymentMethod),
      eq(cards.active, true),
      or(isNull(cards.type), eq(cards.type, 'ambos'), eq(cards.type, paymentMethod)),
    ))
    .groupBy(cards.id)
    .orderBy(desc(count()))
    .limit(1);
  return row?.cardId ?? null;
}

export async function getExpenseSuggestions(userId: number, query: SuggestionsQuery): Promise<ExpenseSuggestions> {
  const [matches, lastAmount, suggestedPaymentMethod, debitCardId, creditCardId] = await Promise.all([
    findMatches(userId, query),
    findLastAmount(userId, query),
    findSuggestedPaymentMethod(userId, query),
    findPreferredCard(userId, query.accountId, 'debito'),
    findPreferredCard(userId, query.accountId, 'credito'),
  ]);
  return {
    matches,
    lastAmount,
    suggestedPaymentMethod,
    preferredCardIds: { debito: debitCardId, credito: creditCardId },
  };
}

/**
 * Lançamento parecido cadastrado nos últimos 7 dias: mesma descrição, forma e
 * valor, na mesma conta. No parcelado compara o valor da 1ª parcela e o número de
 * parcelas; fora dele, só despesas que não são parceladas.
 */
export async function findRecentDuplicate(userId: number, query: DuplicateQuery): Promise<{ createdAt: string } | null> {
  const conditions: SQL[] = [
    ...historyConditions(userId, query.accountId),
    eq(lowerDescription, sql`lower(${query.description})`),
    eq(expenses.paymentMethod, query.paymentMethod),
    eq(expenses.originalAmount, toDecimal(query.amount)),
    gte(expenses.createdAt, sql`now() - interval '7 days'`),
  ];
  if (query.installmentCount !== null) {
    conditions.push(
      eq(expenses.installment, true),
      eq(expenses.numberOfInstallments, query.installmentCount),
      eq(expenses.currentInstallment, 1),
    );
  } else {
    conditions.push(or(isNull(expenses.installment), eq(expenses.installment, false)) as SQL);
  }
  if (query.excludeId !== null) {
    conditions.push(ne(expenses.id, query.excludeId));
  }

  const [row] = await db
    .select({ createdAt: sql<string>`to_char(${expenses.createdAt}, 'YYYY-MM-DD')` })
    .from(expenses)
    .where(and(...conditions))
    .orderBy(desc(expenses.createdAt))
    .limit(1);
  return row ? { createdAt: row.createdAt } : null;
}
