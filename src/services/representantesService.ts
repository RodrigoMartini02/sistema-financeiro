import { apiRequest, getActiveProfileId } from './apiClient';

export type CommissionTipo = 'mensal' | 'unica';

export interface Comissao {
  tipo_receita: string;
  percentual: number;
  tipo?: CommissionTipo;
}

export interface Representante {
  id: number;
  nome: string;
  email?: string;
  telefone?: string;
  ativo: boolean;
  comissoes: Comissao[];
  data_criacao?: string;
  data_atualizacao?: string;
}

export interface RepresentanteFormValues {
  nome: string;
  email?: string;
  telefone?: string;
  comissoes: Comissao[];
}

function perfilQuery() {
  const pid = getActiveProfileId();
  return pid ? `?perfil_id=${pid}` : '';
}

export async function fetchRepresentantes(): Promise<Representante[]> {
  const r = await apiRequest<{ success: boolean; data: Representante[] }>(`/representantes${perfilQuery()}`);
  return Array.isArray(r) ? r : (r as any).data ?? [];
}

export async function saveRepresentante(values: RepresentanteFormValues, id?: number): Promise<Representante> {
  const pid = getActiveProfileId();
  const body = { ...values, perfil_id: pid };
  const r = await apiRequest<{ success: boolean; data: Representante }>(
    id ? `/representantes/${id}` : '/representantes',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }
  );
  return (r as any).data ?? r;
}

export async function deleteRepresentante(id: number): Promise<void> {
  await apiRequest<void>(`/representantes/${id}`, { method: 'DELETE' });
}
