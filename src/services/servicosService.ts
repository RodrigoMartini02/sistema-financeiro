import { apiRequest } from './apiClient';

export interface Servico {
  id: number;
  nome: string;
  valor_mensal_padrao: number;
  ativo: boolean;
  criado_em?: string;
}

export async function fetchServicos(apenasAtivos = false): Promise<Servico[]> {
  const qs = apenasAtivos ? '?ativo=true' : '';
  return apiRequest<Servico[]>(`/servicos${qs}`);
}

export async function saveServico(
  data: { nome: string; valor_mensal_padrao: number },
  id?: number,
): Promise<Servico> {
  if (id) {
    return apiRequest<Servico>(`/servicos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  return apiRequest<Servico>('/servicos', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteServico(id: number): Promise<void> {
  return apiRequest<void>(`/servicos/${id}`, { method: 'DELETE' });
}
