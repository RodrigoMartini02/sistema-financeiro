import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { cards, categories, expenses, incomeClassifications, incomes, representatives } from '../db/schema';
import { addDaysToIsoDate } from '../utils/date';
import {
  ACTIVE_STATUS,
  RECEIVABLE_STATUSES,
  expenseBaseConditions,
  expensePayer,
  findPeopleNames,
  incomeBaseConditions,
  toNumber,
} from './entryQueries';
import { valorEfetivo } from './painelCalculos';

// Relatório de lançamentos de um período: uma fonte só para a tela e o PDF.

export const REPORT_ENTRY_TYPES = ['income', 'expense'] as const;
export type ReportEntryType = (typeof REPORT_ENTRY_TYPES)[number];

export const EXPENSE_STATUSES = ['paid', 'on_time', 'overdue'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/** Janela da data de pagamento, contada a partir de hoje (mesma regra de Movimentações). */
export const PAYMENT_DATE_WINDOWS = ['today', 'week', 'month'] as const;
export type PaymentDateWindow = (typeof PAYMENT_DATE_WINDOWS)[number];

export type IncomeStatus = 'received' | 'expected' | 'overdue';

export interface ReportPeriod {
  start: string;
  end: string;
}

/** Filtros do botão de filtros; lista vazia = sem filtro naquele grupo. */
export interface ReportFilters {
  types: ReportEntryType[];
  expenseStatuses: ExpenseStatus[];
  categoryIds: number[];
  paymentMethods: string[];
  cardIds: number[];
  paymentDates: PaymentDateWindow[];
}

export interface ReportInput {
  /** Pessoas do relatório, já validadas por resolveDashboardScope. */
  scope: number[];
  accountId: number | null;
  period: ReportPeriod;
  today: string;
  filters: ReportFilters;
}

export interface ReportExpense {
  id: number;
  description: string;
  categoryId: number | null;
  categoryName: string | null;
  /** Categoria principal, quando a categoria é subcategoria. */
  categoryGroup: string | null;
  paymentMethod: string;
  cardId: number | null;
  cardName: string | null;
  /** Quem paga: dono do cartão, ou quem cadastrou quando não há cartão. */
  payerId: number;
  payerName: string | null;
  authorId: number;
  authorName: string | null;
  dueDate: string;
  paymentDate: string | null;
  status: ExpenseStatus;
  /** "3/10" quando parcelada. */
  installment: string | null;
  recurring: boolean;
  /** Valor pago quando paga; senão, o valor original. */
  amount: number;
}

export interface ReportIncome {
  id: number;
  description: string;
  categoryName: string | null;
  categoryGroup: string | null;
  receiptDate: string;
  status: IncomeStatus;
  authorId: number;
  authorName: string | null;
  client: string | null;
  representative: string | null;
  commission: number | null;
  amount: number;
}

export interface ReportTotals {
  /** Só receitas recebidas; previstas aparecem na lista, fora do total. */
  income: number;
  incomeCount: number;
  expense: number;
  expenseCount: number;
}

export interface Report {
  period: ReportPeriod;
  expenses: ReportExpense[];
  incomes: ReportIncome[];
  totals: ReportTotals;
  /** Opções dos grupos Forma e Cartão: o que existe no período, antes dos filtros. */
  filterOptions: {
    paymentMethods: string[];
    cards: Array<{ id: number; name: string }>;
  };
}

const DEFAULT_PAYMENT_METHOD = 'dinheiro';

export function expenseStatus(paid: boolean, dueDate: string, today: string): ExpenseStatus {
  if (paid) return 'paid';
  return dueDate < today ? 'overdue' : 'on_time';
}

export function incomeStatus(status: string, receiptDate: string, today: string): IncomeStatus {
  if (status === ACTIVE_STATUS) return 'received';
  return receiptDate < today ? 'overdue' : 'expected';
}

export function installmentLabel(current: number | null, total: number | null): string | null {
  return total ? `${current ?? 1}/${total}` : null;
}

export function matchesPaymentDate(paymentDate: string | null, windows: PaymentDateWindow[], today: string): boolean {
  if (windows.length === 0) return true;
  if (!paymentDate) return false;
  return windows.some((window) => {
    if (window === 'today') return paymentDate === today;
    if (window === 'week') return paymentDate >= addDaysToIsoDate(today, -7) && paymentDate <= today;
    return paymentDate.startsWith(today.slice(0, 7));
  });
}

export function filterExpenses(rows: ReportExpense[], filters: ReportFilters, today: string): ReportExpense[] {
  if (filters.types.length > 0 && !filters.types.includes('expense')) return [];
  return rows.filter((row) => (
    (filters.expenseStatuses.length === 0 || filters.expenseStatuses.includes(row.status))
    && (filters.categoryIds.length === 0 || (row.categoryId !== null && filters.categoryIds.includes(row.categoryId)))
    && (filters.paymentMethods.length === 0 || filters.paymentMethods.includes(row.paymentMethod))
    && (filters.cardIds.length === 0 || (row.cardId !== null && filters.cardIds.includes(row.cardId)))
    && matchesPaymentDate(row.paymentDate, filters.paymentDates, today)
  ));
}

export function filterIncomes(rows: ReportIncome[], filters: ReportFilters): ReportIncome[] {
  return filters.types.length > 0 && !filters.types.includes('income') ? [] : rows;
}

export function summarize(expenseRows: ReportExpense[], incomeRows: ReportIncome[]): ReportTotals {
  const received = incomeRows.filter((row) => row.status === 'received');
  return {
    income: received.reduce((sum, row) => sum + row.amount, 0),
    incomeCount: received.length,
    expense: expenseRows.reduce((sum, row) => sum + row.amount, 0),
    expenseCount: expenseRows.length,
  };
}

const expenseCategoryGroup = alias(categories, 'expense_category_group');
const incomeCategoryGroup = alias(incomeClassifications, 'income_category_group');

async function loadExpenses(input: ReportInput) {
  return db.select({
    id: expenses.id,
    description: expenses.description,
    categoryId: expenses.categoryId,
    categoryName: categories.name,
    categoryGroup: expenseCategoryGroup.name,
    paymentMethod: expenses.paymentMethod,
    cardId: expenses.cardId,
    cardName: cards.name,
    payerId: expensePayer,
    authorId: expenses.userId,
    dueDate: expenses.dueDate,
    paymentDate: expenses.paymentDate,
    paid: expenses.paid,
    originalAmount: expenses.originalAmount,
    amountPaid: expenses.amountPaid,
    currentInstallment: expenses.currentInstallment,
    numberOfInstallments: expenses.numberOfInstallments,
    recurring: expenses.recurring,
  })
    .from(expenses)
    .leftJoin(categories, eq(categories.id, expenses.categoryId))
    .leftJoin(expenseCategoryGroup, eq(expenseCategoryGroup.id, categories.parentId))
    .leftJoin(cards, eq(cards.id, expenses.cardId))
    .where(and(
      ...expenseBaseConditions(input.scope, input.accountId),
      gte(expenses.dueDate, input.period.start),
      lte(expenses.dueDate, input.period.end),
    ))
    .orderBy(asc(expenses.dueDate), asc(expenses.id));
}

async function loadIncomes(input: ReportInput) {
  return db.select({
    id: incomes.id,
    description: incomes.description,
    categoryName: incomeClassifications.name,
    categoryGroup: incomeCategoryGroup.name,
    receiptDate: incomes.receiptDate,
    status: incomes.status,
    authorId: incomes.userId,
    client: incomes.client,
    representative: representatives.name,
    commission: incomes.commissionAmount,
    amount: incomes.amount,
  })
    .from(incomes)
    .leftJoin(incomeClassifications, eq(incomeClassifications.id, incomes.classificationId))
    .leftJoin(incomeCategoryGroup, eq(incomeCategoryGroup.id, incomeClassifications.parentId))
    .leftJoin(representatives, eq(representatives.id, incomes.representativeId))
    .where(and(
      ...incomeBaseConditions(input.scope, input.accountId, [ACTIVE_STATUS, ...RECEIVABLE_STATUSES]),
      gte(incomes.receiptDate, input.period.start),
      lte(incomes.receiptDate, input.period.end),
    ))
    .orderBy(asc(incomes.receiptDate), asc(incomes.id));
}

export async function buildReport(input: ReportInput): Promise<Report> {
  const [expenseRows, incomeRows] = await Promise.all([loadExpenses(input), loadIncomes(input)]);

  const peopleIds = new Set<number>();
  for (const row of expenseRows) {
    peopleIds.add(Number(row.payerId));
    peopleIds.add(row.authorId);
  }
  for (const row of incomeRows) peopleIds.add(row.authorId);
  const names = await findPeopleNames([...peopleIds]);

  const allExpenses: ReportExpense[] = expenseRows.map((row) => {
    const paid = row.paid === true;
    const payerId = Number(row.payerId);
    return {
      id: row.id,
      description: row.description,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryGroup: row.categoryGroup,
      paymentMethod: row.paymentMethod ?? DEFAULT_PAYMENT_METHOD,
      cardId: row.cardId,
      cardName: row.cardName,
      payerId,
      payerName: names.get(payerId) ?? null,
      authorId: row.authorId,
      authorName: names.get(row.authorId) ?? null,
      dueDate: row.dueDate,
      paymentDate: row.paymentDate,
      status: expenseStatus(paid, row.dueDate, input.today),
      installment: installmentLabel(row.currentInstallment, row.numberOfInstallments),
      recurring: row.recurring === true,
      amount: valorEfetivo({
        pago: paid,
        valorOriginal: toNumber(row.originalAmount),
        valorPago: row.amountPaid === null ? null : toNumber(row.amountPaid),
      }),
    };
  });

  const allIncomes: ReportIncome[] = incomeRows.map((row) => ({
    id: row.id,
    description: row.description,
    categoryName: row.categoryName,
    categoryGroup: row.categoryGroup,
    receiptDate: row.receiptDate,
    status: incomeStatus(row.status, row.receiptDate, input.today),
    authorId: row.authorId,
    authorName: names.get(row.authorId) ?? null,
    client: row.client,
    representative: row.representative,
    commission: row.commission === null ? null : toNumber(row.commission),
    amount: toNumber(row.amount),
  }));

  const filteredExpenses = filterExpenses(allExpenses, input.filters, input.today);
  const filteredIncomes = filterIncomes(allIncomes, input.filters);

  const cardOptions = new Map<number, string>();
  for (const row of allExpenses) {
    if (row.cardId !== null) cardOptions.set(row.cardId, row.cardName ?? `Cartão #${row.cardId}`);
  }

  return {
    period: input.period,
    expenses: filteredExpenses,
    incomes: filteredIncomes,
    totals: summarize(filteredExpenses, filteredIncomes),
    filterOptions: {
      paymentMethods: [...new Set(allExpenses.map((row) => row.paymentMethod))].sort(),
      cards: [...cardOptions].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    },
  };
}
