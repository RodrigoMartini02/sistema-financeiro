import { apiRequest, getActiveAccountId } from './apiClient';
import type { BudgetOverview, BudgetTargetMode } from '../types/budget';

function contaQuery(): string {
  const accountId = getActiveAccountId();
  return accountId ? `&conta_id=${accountId}` : '';
}

export interface BudgetOverviewRangeQuery {
  deMes?: number;
  deAno?: number;
  ateMes?: number;
  ateAno?: number;
}

export function fetchBudgetOverview(month: number, year: number): Promise<BudgetOverview> {
  return apiRequest<BudgetOverview>(`/orcamento/resumo?mes=${month}&ano=${year}${contaQuery()}`);
}

export function fetchBudgetOverviewRange(query: BudgetOverviewRangeQuery): Promise<BudgetOverview> {
  const params = new URLSearchParams();
  if (query.deMes !== undefined) params.set('de_mes', String(query.deMes));
  if (query.deAno !== undefined) params.set('de_ano', String(query.deAno));
  if (query.ateMes !== undefined) params.set('ate_mes', String(query.ateMes));
  if (query.ateAno !== undefined) params.set('ate_ano', String(query.ateAno));
  return apiRequest<BudgetOverview>(`/orcamento/resumo?${params}${contaQuery()}`);
}

export async function saveBudgetTarget(input: {
  categoryId: number;
  mode: BudgetTargetMode;
  targetValue: number;
}): Promise<void> {
  await apiRequest<void>('/orcamento/metas', {
    method: 'PUT',
    body: JSON.stringify({
      categoria_id: input.categoryId,
      modo: input.mode,
      valor_meta: input.targetValue,
      conta_id: getActiveAccountId(),
    }),
  });
}

export async function deleteBudgetTarget(categoryId: number): Promise<void> {
  const accountId = getActiveAccountId();
  const query = accountId ? `?conta_id=${accountId}` : '';
  await apiRequest<void>(`/orcamento/metas/${categoryId}${query}`, { method: 'DELETE' });
}
