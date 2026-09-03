import { apiRequest, getActiveAccountId } from './apiClient';

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

function contaQuery() {
  const accountId = getActiveAccountId();
  return accountId ? `?conta_id=${accountId}` : '';
}

export async function fetchRepresentantes(): Promise<Representante[]> {
  const r = await apiRequest<{ success: boolean; data: Representante[] }>(`/representantes${contaQuery()}`);
  return Array.isArray(r) ? r : (r as any).data ?? [];
}

export async function saveRepresentante(values: RepresentanteFormValues, id?: number): Promise<Representante> {
  const accountId = getActiveAccountId();
  const body = { ...values, conta_id: accountId };
  const r = await apiRequest<{ success: boolean; data: Representante }>(
    id ? `/representantes/${id}` : '/representantes',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }
  );
  return (r as any).data ?? r;
}

export async function deleteRepresentante(id: number): Promise<void> {
  await apiRequest<void>(`/representantes/${id}`, { method: 'DELETE' });
}
