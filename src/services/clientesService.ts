import { apiRequest } from './apiClient';

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
}

export interface ModuloContrato {
  id: number;
  contrato_id: number;
  nome: string;
  valor_mensal: number;
  implantado: boolean;
  faturando: boolean;
  data_inicio_faturamento?: string | null;
}

export interface ServicoTecnico {
  id: number;
  contrato_id: number;
  tipo: string;
  valor_hora: number;
  qtde_contratada: number;
  qtde_consumida: number;
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

export async function processarAditivo(
  contratoId: number,
  data: {
    novo_vencimento: string;
    novo_num_aditivo?: number;
    nova_data_aditivo?: string;
    novo_ajuste?: string;
    nova_data_inicio_faturamento?: string;
    observacoes?: string;
  },
): Promise<Contrato> {
  return apiRequest<Contrato>(`/contratos/${contratoId}/aditivo`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Módulos
export async function fetchModulos(contratoId: number): Promise<ModuloContrato[]> {
  return apiRequest<ModuloContrato[]>(`/modulos-contrato?contrato_id=${contratoId}`);
}

export async function saveModulo(
  data: Omit<ModuloContrato, 'id'>,
  id?: number,
): Promise<ModuloContrato> {
  if (id) {
    return apiRequest<ModuloContrato>(`/modulos-contrato/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  return apiRequest<ModuloContrato>('/modulos-contrato', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteModulo(id: number): Promise<void> {
  return apiRequest<void>(`/modulos-contrato/${id}`, { method: 'DELETE' });
}

// Serviços técnicos
export async function fetchServicosTecnicos(contratoId: number): Promise<ServicoTecnico[]> {
  return apiRequest<ServicoTecnico[]>(`/servicos-tecnicos?contrato_id=${contratoId}`);
}

export async function saveServicoTecnico(
  data: Omit<ServicoTecnico, 'id'>,
  id?: number,
): Promise<ServicoTecnico> {
  if (id) {
    return apiRequest<ServicoTecnico>(`/servicos-tecnicos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  return apiRequest<ServicoTecnico>('/servicos-tecnicos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function lancarHoras(
  servicoId: number,
  data: { data: string; qtde: number; descricao?: string },
): Promise<ServicoTecnico> {
  return apiRequest<ServicoTecnico>(`/servicos-tecnicos/${servicoId}/lancar`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
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
