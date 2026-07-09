import { apiRequest, getActiveProfileId } from './apiClient';

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

function perfilQuery() {
  const pid = getActiveProfileId();
  return pid ? `?perfil_id=${pid}` : '';
}

export async function fetchSocios(): Promise<Socio[]> {
  const r = await apiRequest<{ success: boolean; data: Socio[] }>(`/socios${perfilQuery()}`);
  return Array.isArray(r) ? r : (r as any).data ?? [];
}

export async function saveSocio(values: SocioFormValues, id?: number): Promise<Socio> {
  const pid = getActiveProfileId();
  const body = { ...values, perfil_id: pid };
  const r = await apiRequest<{ success: boolean; data: Socio }>(
    id ? `/socios/${id}` : '/socios',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }
  );
  return (r as any).data ?? r;
}

export async function deleteSocio(id: number): Promise<void> {
  await apiRequest<void>(`/socios/${id}`, { method: 'DELETE' });
}
