import { apiRequest, getActiveAccountId } from './apiClient';

export interface Socio {
  id: number;
  nome: string;
  percentual: number;
  ativo: boolean;
  data_criacao?: string;
  data_atualizacao?: string;
}

export interface SocioFormValues {
  nome: string;
  percentual: number;
}

function contaQuery() {
  const accountId = getActiveAccountId();
  return accountId ? `?conta_id=${accountId}` : '';
}

export async function fetchSocios(): Promise<Socio[]> {
  const r = await apiRequest<{ success: boolean; data: Socio[] }>(`/socios${contaQuery()}`);
  return Array.isArray(r) ? r : (r as any).data ?? [];
}

export async function saveSocio(values: SocioFormValues, id?: number): Promise<Socio> {
  const accountId = getActiveAccountId();
  const body = { ...values, conta_id: accountId };
  const r = await apiRequest<{ success: boolean; data: Socio }>(
    id ? `/socios/${id}` : '/socios',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }
  );
  return (r as any).data ?? r;
}

export async function deleteSocio(id: number): Promise<void> {
  await apiRequest<void>(`/socios/${id}`, { method: 'DELETE' });
}
