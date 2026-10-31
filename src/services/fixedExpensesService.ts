import { apiRequest, getActiveAccountId } from './apiClient';
import type { Expense, ExpenseUpdateInput, FixedExpense, FixedExpenseCreateInput, FixedExpenseOccurrenceDto } from '../types/finance';

export async function fetchPendingFixedExpenses(month: string, accountId: number | null = getActiveAccountId()): Promise<Expense[]> {
  const params = new URLSearchParams({ month });
  if (accountId !== null) params.set('accountId', String(accountId));
  const rows = await apiRequest<FixedExpenseOccurrenceDto[]>(`/expenses/fixed/pending?${params}`);
  return rows.map((row) => ({
    id: row.id, descricao: row.description, valorFinal: Number(row.amount), valorOriginal: Number(row.amount),
    categoria: row.categoryName ?? 'Sem categoria', categoriaId: row.categoryId, categoriaPai: row.parentCategoryName,
    formaPagamento: row.paymentMethod, cartaoId: row.cardId, cartaoNome: row.cardName, autorId: row.userId,
    dataCompra: row.purchaseDate, dataVencimento: row.dueDate, dataCriacao: row.createdAt ?? null,
    mes: row.month, ano: row.year, status: 'prevista', pago: false, recorrente: false, parcelado: false,
    fixedExpenseId: row.fixedExpenseId, fixedCompetence: row.fixedCompetence,
    fixedEndMonth: row.endMonth, deferred: row.deferred,
    estimatedAmount: row.estimatedAmount == null ? null : Number(row.estimatedAmount),
    anexos: row.attachments ?? null, numeroNf: row.invoiceNumber ?? null, dataEmissaoNf: row.invoiceDate ?? null,
  }));
}

export function createFixedExpense(input: FixedExpenseCreateInput): Promise<FixedExpense> {
  return apiRequest<FixedExpense>('/expenses/fixed', { method: 'POST', body: JSON.stringify(input) });
}

export async function deferFixedExpenses(ids: number[], deferred: boolean, accountId: number | null): Promise<void> {
  await apiRequest<unknown>('/expenses/fixed/defer', { method: 'PATCH', body: JSON.stringify({ accountId, ids, deferred }) });
}

export async function confirmFixedExpense(id: number, input: ExpenseUpdateInput): Promise<void> {
  await apiRequest<unknown>(`/expenses/${id}/confirm`, { method: 'POST', body: JSON.stringify(input) });
}
