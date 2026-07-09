import { apiRequest } from './apiClient';

export interface IncomeType {
  id: number;
  nome: string;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export async function fetchIncomeTypes(): Promise<IncomeType[]> {
  const r = await apiRequest<{ success: boolean; data: IncomeType[] }>('/income-types');
  return Array.isArray(r) ? r : (r as { data: IncomeType[] }).data ?? [];
}

export async function saveIncomeType(nome: string, id?: number): Promise<IncomeType> {
  const r = await apiRequest<{ success: boolean; data: IncomeType }>(
    id ? `/income-types/${id}` : '/income-types',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify({ nome }) },
  );
  return (r as { data: IncomeType }).data ?? r;
}

export async function toggleIncomeType(id: number): Promise<void> {
  await apiRequest<void>(`/income-types/${id}/toggle`, { method: 'PATCH' });
}

export async function deleteIncomeType(id: number): Promise<void> {
  await apiRequest<void>(`/income-types/${id}`, { method: 'DELETE' });
}
