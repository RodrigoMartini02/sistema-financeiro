import { apiRequest, getActiveProfileId } from './apiClient';
import type { BudgetOverview, BudgetTargetMode } from '../types/budget';

function profileQuery(): string {
  const profileId = getActiveProfileId();
  return profileId ? `&perfil_id=${profileId}` : '';
}

export function fetchBudgetOverview(month: number, year: number): Promise<BudgetOverview> {
  return apiRequest<BudgetOverview>(`/orcamento/resumo?mes=${month}&ano=${year}${profileQuery()}`);
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
      perfil_id: getActiveProfileId(),
    }),
  });
}

export async function deleteBudgetTarget(categoryId: number): Promise<void> {
  const profileId = getActiveProfileId();
  const query = profileId ? `?perfil_id=${profileId}` : '';
  await apiRequest<void>(`/orcamento/metas/${categoryId}${query}`, { method: 'DELETE' });
}
