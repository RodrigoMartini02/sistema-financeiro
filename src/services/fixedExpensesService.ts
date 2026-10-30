import { apiRequest, getActiveAccountId } from './apiClient';
import type {
  Expense, ExpenseUpdateInput, FixedExpense, FixedExpenseCreateInput,
  FixedExpenseOccurrenceDto, FixedExpenseUpdateInput,
} from '../types/finance';

function accountQuery(accountId: number | null): URLSearchParams {
  const params = new URLSearchParams();
  if (accountId !== null) params.set('accountId', String(accountId));
  return params;
}

export function fetchFixedExpenses(accountId: number | null = getActiveAccountId()): Promise<FixedExpense[]> {
  return apiRequest<FixedExpense[]>(`/expenses/fixed?${accountQuery(accountId)}`);
}

export async function fetchPendingFixedExpenses(
  month: string, accountId: number | null = getActiveAccountId(),
): Promise<Expense[]> {
  const params = accountQuery(accountId);
  params.set('month', month);
  const rows = await apiRequest<FixedExpenseOccurrenceDto[]>(`/expenses/fixed/pending?${params}`);
  return rows.map((row) => ({
    id: row.id, descricao: row.description, valorFinal: Number(row.amount), valorOriginal: Number(row.amount),
    categoria: row.categoryName ?? 'Sem categoria', categoriaId: row.categoryId,
    categoriaPai: row.parentCategoryName, formaPagamento: row.paymentMethod,
    cartaoId: row.cardId, cartaoNome: row.cardName, autorId: row.userId,
    dataCompra: row.purchaseDate, dataVencimento: row.dueDate, dataCriacao: row.createdAt ?? null,
    mes: row.month, ano: row.year, status: 'prevista', pago: false, recorrente: false, parcelado: false,
    fixedExpenseId: row.fixedExpenseId, fixedCompetence: row.fixedCompetence,
    estimatedAmount: row.estimatedAmount == null ? null : Number(row.estimatedAmount),
    anexos: row.attachments ?? null, numeroNf: row.invoiceNumber ?? null, dataEmissaoNf: row.invoiceDate ?? null,
  }));
}

export function createFixedExpense(input: FixedExpenseCreateInput): Promise<FixedExpense> {
  return apiRequest<FixedExpense>('/expenses/fixed', { method: 'POST', body: JSON.stringify(input) });
}

export function updateFixedExpense(id: number, input: FixedExpenseUpdateInput): Promise<FixedExpense> {
  return apiRequest<FixedExpense>(`/expenses/fixed/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function deactivateFixedExpense(id: number): Promise<void> {
  await apiRequest<unknown>(`/expenses/fixed/${id}/deactivate`, { method: 'POST' });
}

export async function renewFixedExpense(id: number, year: number): Promise<void> {
  await apiRequest<unknown>(`/expenses/fixed/${id}/renew`, { method: 'POST', body: JSON.stringify({ year }) });
}

export async function confirmFixedExpense(id: number, input: ExpenseUpdateInput): Promise<void> {
  await apiRequest<unknown>(`/expenses/${id}/confirm`, { method: 'POST', body: JSON.stringify(input) });
}
