// Temporário durante a reescrita de clientes e contratos: sai no passo 8 do
// plano, quando receita, assistente e checklist passam para o serviço novo.
import { apiRequest, getActiveAccountId } from './apiClient';

function appendProfile(q: URLSearchParams) {
  const id = getActiveAccountId();
  if (id) q.set('conta_id', String(id));
}

export interface Cliente {
  id: number;
  nome: string;
  cnpj?: string | null;
  conta_id?: number | null;
  total_contratos?: number;
  contratos_ativos?: number;
}

export async function fetchClientes(): Promise<Cliente[]> {
  const q = new URLSearchParams();
  appendProfile(q);
  const suffix = q.toString() ? `?${q}` : '';
  return apiRequest<Cliente[]>(`/clientes${suffix}`);
}

export async function saveCliente(data: Omit<Cliente, 'id' | 'total_contratos' | 'contratos_ativos' | 'conta_id'>, id?: number): Promise<Cliente> {
  const body = { ...data, conta_id: getActiveAccountId() };
  if (id) {
    return apiRequest<Cliente>(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  }
  return apiRequest<Cliente>('/clientes', { method: 'POST', body: JSON.stringify(body) });
}

export interface ContratoResumo {
  id: number;
  cliente_nome: string;
  numero?: string | null;
  representante_id?: number | null;
  representante_nome?: string | null;
  horas_presenciais_valor?: number | null;
  horas_presenciais_saldo_atual?: number | null;
  horas_remotas_valor?: number | null;
  horas_remotas_saldo_atual?: number | null;
}

export async function fetchContratosAtivos(): Promise<ContratoResumo[]> {
  const q = new URLSearchParams({ status: 'ativo' });
  appendProfile(q);
  return apiRequest<ContratoResumo[]>(`/contratos?${q}`);
}
