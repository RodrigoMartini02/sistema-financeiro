import { and, count, desc, eq, exists, gte, ilike, inArray, isNull, max, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { accounts, cards, expenses, type Expense, type NewExpense } from '../db/schema';
import { addMonthsClamped, getMonthYearFromIsoDate } from '../utils/date';
import {
  PAYMENT_METHODS,
  type CreateExpenseInput,
  type DuplicateQuery,
  type PaymentInput,
  type PaymentMethod,
  type SuggestionsQuery,
  type UpdateExpenseInput,
} from './expenseInput';

/** Ocorrências geradas para uma despesa mensal (a primeira mais 11). */
const MONTHLY_OCCURRENCES = 12;
const MATCH_LIMIT = 4;

const lowerDescription = sql<string>`lower(${expenses.description})`;

function toDecimal(value: number): string {
  return value.toFixed(2);
}

function scheduleColumns(dueDate: string): Pick<NewExpense, 'dueDate' | 'month' | 'year'> {
  const { mes, ano } = getMonthYearFromIsoDate(dueDate);
  return { dueDate, month: mes, year: ano };
}

type PaymentColumns = Pick<NewExpense, 'paid' | 'paymentDate' | 'amountPaid'>;

/**
 * Pagamento gravado. Com `autoPay`, fora do crédito uma despesa com vencimento (ou
 * pagamento) até hoje já nasce paga — a regra de sempre. Parcelas não usam isso: a
 * grade diz quais estão pagas, e uma parcela vencida pode continuar em aberto.
 */
function resolvePayment(
  payment: PaymentInput,
  amount: number,
  dueDate: string,
  paymentMethod: PaymentMethod,
  today: string,
  autoPay: boolean,
): PaymentColumns {
  const referenceDate = payment.paymentDate ?? dueDate;
  const paid = payment.paid || (autoPay && paymentMethod !== 'credito' && referenceDate <= today);
  if (!paid) {
    return { paid: false, paymentDate: null, amountPaid: null };
  }
  return { paid: true, paymentDate: referenceDate, amountPaid: toDecimal(payment.amountPaid ?? amount) };
}

/**
 * Linhas a gravar. Anexos e nota fiscal ficam só na primeira, como sempre foi.
 * Parcelas levam a data da compra em todas; ocorrências mensais, só a primeira.
 */
function buildRows(userId: number, input: CreateExpenseInput, today: string): NewExpense[] {
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
    return input.installments.map((installment, index): NewExpense => ({
      ...base,
      ...scheduleColumns(installment.dueDate),
      ...resolvePayment(installment, installment.amount, installment.dueDate, input.paymentMethod, today, false),
      ...(index === 0 ? firstRowExtras : {}),
      purchaseDate: input.purchaseDate,
      originalAmount: toDecimal(installment.amount),
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

  const occurrences = Array.from({ length: MONTHLY_OCCURRENCES - 1 }, (_, index): NewExpense => ({
    ...base,
    ...scheduleColumns(addMonthsClamped(input.dueDate, index + 1)),
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
  const [firstRow, ...otherRows] = buildRows(userId, input, today);
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
  isInstallment: boolean;
}

export async function findExpenseForUpdate(ownerId: number, expenseId: number): Promise<ExpenseForUpdate | null> {
  const [row] = await db
    .select({ accountId: expenses.accountId, cardId: expenses.cardId, installment: expenses.installment })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, ownerId)));
  if (!row) return null;
  return { accountId: row.accountId, cardId: row.cardId, isInstallment: row.installment === true };
}

/**
 * Edita uma linha. Número e posição da parcela, grupo, recorrência, conta e
 * observação ficam como estão: o modal não os mostra, e sobrescrevê-los apagava o
 * "3/10" da parcela editada.
 */
export async function updateExpense(
  ownerId: number,
  expenseId: number,
  input: UpdateExpenseInput,
  isInstallment: boolean,
  today: string,
): Promise<Expense | null> {
  const [updated] = await db
    .update(expenses)
    .set({
      ...scheduleColumns(input.dueDate),
      ...resolvePayment(input, input.amount, input.dueDate, input.paymentMethod, today, !isInstallment),
      description: input.description,
      purchaseDate: input.purchaseDate,
      categoryId: input.categoryId,
      cardId: input.cardId,
      paymentMethod: input.paymentMethod,
      originalAmount: toDecimal(input.amount),
      attachments: input.attachments,
      numeroNf: input.invoiceNumber,
      dataEmissaoNf: input.invoiceDate,
    })
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, ownerId)))
    .returning();
  return updated ?? null;
}

/** Despesa sem conta gravada conta como da conta pessoal do dono (mesmo critério de utils/accountFilter.ts). */
function belongsToAccount(accountId: number): SQL {
  const personalAccountOfOwner = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.type, 'pessoal'), eq(accounts.userId, expenses.userId)));
  return or(eq(expenses.accountId, accountId), and(isNull(expenses.accountId), exists(personalAccountOfOwner))) as SQL;
}

/** O histórico de quem lança: só as próprias despesas ativas, na conta pedida. */
function historyConditions(userId: number, accountId: number | null): SQL[] {
  const conditions: SQL[] = [eq(expenses.userId, userId), eq(expenses.status, 'ativa')];
  if (accountId !== null) {
    conditions.push(belongsToAccount(accountId));
  }
  return conditions;
}

function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
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
