import { apiRequest, getApiUrl } from './apiClient';

export interface Cliente {
  id: number;
  nome: string;
  codigo?: string | null;
  tipo_empresa?: string | null;
  cnpj?: string | null;
  total_contratos?: number;
  contratos_ativos?: number;
}

export interface Contrato {
  id: number;
  cliente_id: number;
  cliente_nome?: string;
  numero?: string | null;
  data_assinatura?: string | null;
  vencimento: string;
  num_aditivo: number;
  data_aditivo?: string | null;
  ajuste?: string | null;
  status: 'ativo' | 'encerrado';
  data_inicio_faturamento?: string | null;
  observacoes?: string | null;
  representante_id?: number | null;
  representante_nome?: string | null;
  implantacao_parcelas?: number | null;
  implantacao_valor_parcela?: number | null;
  horas_presenciais_valor?: number | null;
  horas_presenciais_saldo_ini?: number | null;
  horas_presenciais_saldo_atual?: number | null;
  horas_remotas_valor?: number | null;
  horas_remotas_saldo_ini?: number | null;
  horas_remotas_saldo_atual?: number | null;
  valor_contrato?: number | null;
  valor_mensal?: number | null;
}


// Clientes
export async function fetchClientes(): Promise<Cliente[]> {
  return apiRequest<Cliente[]>('/clientes');
}

export async function saveCliente(data: Omit<Cliente, 'id' | 'total_contratos' | 'contratos_ativos'>, id?: number): Promise<Cliente> {
  if (id) {
    return apiRequest<Cliente>(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  return apiRequest<Cliente>('/clientes', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteCliente(id: number): Promise<void> {
  return apiRequest<void>(`/clientes/${id}`, { method: 'DELETE' });
}

// Contratos
export async function fetchContratos(clienteId: number): Promise<Contrato[]> {
  return apiRequest<Contrato[]>(`/contratos?cliente_id=${clienteId}`);
}

export async function saveContrato(data: Omit<Contrato, 'id' | 'cliente_nome' | 'num_aditivo' | 'status'>, id?: number): Promise<Contrato> {
  if (id) {
    return apiRequest<Contrato>(`/contratos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  return apiRequest<Contrato>('/contratos', { method: 'POST', body: JSON.stringify(data) });
}

export async function encerrarContrato(id: number): Promise<void> {
  return apiRequest<void>(`/contratos/${id}/encerrar`, { method: 'PUT' });
}

export async function gerarPrevistas(contratoId: number): Promise<{ count: number }> {
  return apiRequest<{ count: number }>(`/contratos/${contratoId}/gerar-previstas`, { method: 'POST' });
}

// Contratos-Serviços
export interface ServicoContrato {
  id: number;
  contrato_id: number;
  servico_id: number;
  servico_nome: string;
  valor_mensal: number;
  implantado: boolean;
  faturando: boolean;
  data_inicio_faturamento?: string | null;
}

export async function fetchContratosServicos(contratoId: number): Promise<ServicoContrato[]> {
  return apiRequest<ServicoContrato[]>(`/contratos-servicos?contrato_id=${contratoId}`);
}

export async function vincularServico(
  contratoId: number,
  servicoId: number,
  valorMensal: number,
): Promise<ServicoContrato> {
  return apiRequest<ServicoContrato>('/contratos-servicos', {
    method: 'POST',
    body: JSON.stringify({ contrato_id: contratoId, servico_id: servicoId, valor_mensal: valorMensal }),
  });
}

export async function atualizarServicoContrato(
  id: number,
  data: Partial<Omit<ServicoContrato, 'id' | 'contrato_id' | 'servico_id' | 'servico_nome'>>,
): Promise<ServicoContrato> {
  return apiRequest<ServicoContrato>(`/contratos-servicos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function desvincularServico(id: number): Promise<void> {
  return apiRequest<void>(`/contratos-servicos/${id}`, { method: 'DELETE' });
}

// Contrato Anexos
export interface ContratoAnexo {
  id: number;
  contrato_id: number;
  nome_original: string;
  mime_type: string | null;
  tamanho: number | null;
  created_at: string;
}

export async function fetchContratoAnexos(contratoId: number): Promise<ContratoAnexo[]> {
  return apiRequest<ContratoAnexo[]>(`/contrato-anexos?contrato_id=${contratoId}`);
}

export async function uploadContratoAnexo(contratoId: number, file: File): Promise<ContratoAnexo> {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  const form = new FormData();
  form.append('arquivo', file);
  form.append('contrato_id', String(contratoId));

  const response = await fetch(`${getApiUrl()}/contrato-anexos`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const payload = await response.json() as { success: boolean; message?: string; data?: ContratoAnexo };
  if (!response.ok || !payload.success) {
    throw new Error(payload.message ?? 'Falha ao enviar arquivo');
  }
  return payload.data!;
}

export async function viewContratoAnexo(id: number): Promise<Blob> {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  const response = await fetch(`${getApiUrl()}/contrato-anexos/${id}/arquivo`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error('Falha ao carregar arquivo');
  }
  return response.blob();
}

export async function deleteContratoAnexo(id: number): Promise<void> {
  return apiRequest<void>(`/contrato-anexos/${id}`, { method: 'DELETE' });
}
