import { apiRequest, getActiveAccountId } from './apiClient';
import type { Income, IncomeOccurrenceDto, IncomeUpdateInput } from '../types/finance';

export async function fetchPendingIncomes(month: string, accountId: number | null = getActiveAccountId()): Promise<Income[]> {
  const params = new URLSearchParams({ month });
  if (accountId !== null) params.set('accountId', String(accountId));
  const rows = await apiRequest<IncomeOccurrenceDto[]>(`/incomes/pending?${params}`);
  return rows.map(row => ({
    id: row.id, descricao: row.description, autorId: row.userId,
    valorBruto: Number(row.grossAmount), valorLiquido: Number(row.netAmount),
    data: row.receiptDate, mes: row.month, ano: row.year, status: row.status,
    classificacaoId: row.categoryId, classificacaoNome: row.categoryName, classificacaoPai: row.parentCategoryName,
    clienteId: row.clientId, clienteNome: row.clientName, representanteId: row.representativeId,
    representanteNome: row.representativeName, valorComissao: row.commissionAmount === null ? null : Number(row.commissionAmount),
    contratoId: row.contractId, anexos: row.attachments,
    fixedIncomeId: row.fixedIncomeId, fixedCompetence: row.fixedCompetence,
    fixedEndMonth: row.endMonth?.slice(0, 7) ?? null, deferred: row.deferred,
  }));
}

export async function deferIncomes(ids: number[], deferred: boolean, accountId: number | null = getActiveAccountId()): Promise<void> {
  await apiRequest<unknown>('/incomes/defer', { method: 'PATCH', body: JSON.stringify({ accountId, ids, deferred }) });
}

/** Edição e confirmação são uma operação: o registro previsto conserva seu ID. */
export async function confirmPredictedIncome(id: number, changes: IncomeUpdateInput): Promise<void> {
  await apiRequest<unknown>(`/incomes/${id}/receber`, { method: 'PUT', body: JSON.stringify({ changes }) });
}
