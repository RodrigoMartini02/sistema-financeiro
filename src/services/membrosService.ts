import { apiRequest, getApiUrl } from './apiClient';

export interface MembroListItem {
  membro_id: number;
  membro_status: 'ativo' | 'inativo';
  vinculado_em?: string;
  usuario_id: number;
  nome: string;
  email: string;
  documento?: string | null;
  usuario_status: string;
}

export interface MembroCreateBody {
  nome: string;
  email: string;
  senha: string;
  documento?: string;
}

export interface PendingExpense {
  id: number;
  description: string;
  installmentGroupId: number | null;
  recurring: boolean;
  finalAmount: string | null;
  dueDate: string;
}

export interface AccountSummary {
  despesas_por_autor: { usuario_id: number; total: string }[];
  receitas_por_autor: { usuario_id: number; total: string }[];
  /** Despesa de cada membro dentro de cada categoria — alimenta as barras divididas. */
  despesas_por_autor_categoria: {
    usuario_id: number;
    categoria_id: number | null;
    categoria_nome: string;
    total: string;
  }[];
  /** Nome de cada autor: os graficos rotulam por nome, nao por id. */
  membros: { usuario_id: number; nome: string }[];
}

export async function fetchMembros(): Promise<MembroListItem[]> {
  return apiRequest<MembroListItem[]>('/account-members');
}

export async function createMembro(body: MembroCreateBody): Promise<{ id: number; nome: string; email: string }> {
  return apiRequest('/account-members', { method: 'POST', body: JSON.stringify(body) });
}

export async function fetchMembroPendencias(usuarioId: number): Promise<PendingExpense[]> {
  return apiRequest<PendingExpense[]>(`/account-members/${usuarioId}/pending`);
}

export interface DeactivateMembroResult {
  pendencias_transferidas: number;
}

export class PendingExpensesError extends Error {
  pending: PendingExpense[];
  constructor(pending: PendingExpense[]) {
    super('This member has pending expenses. Choose a transfer target before deactivating.');
    this.pending = pending;
  }
}

// Implementação própria (não usa apiRequest genérico) porque a resposta de
// erro "PENDING_EXPENSES" carrega a lista de pendências (data), que o
// contrato de erro genérico de apiRequest não propaga — só a mensagem.
export async function deactivateMembro(usuarioId: number, transferirPara?: number): Promise<DeactivateMembroResult> {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  const response = await fetch(`${getApiUrl()}/account-members/${usuarioId}/deactivate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(transferirPara ? { transferir_para: transferirPara } : {}),
  });
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean; message?: string; code?: string; data?: PendingExpense[] | DeactivateMembroResult;
  };

  if (payload.code === 'PENDING_EXPENSES') {
    throw new PendingExpensesError((payload.data as PendingExpense[]) ?? []);
  }
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message ?? 'Não foi possível desativar o membro');
  }

  return payload.data as DeactivateMembroResult;
}

export interface AccountSummaryPeriod {
  deMes?: number;
  deAno?: number;
  ateMes?: number;
  ateAno?: number;
}

/**
 * O painel filtra por intervalo, entao o summary recebe de/ate. Os parametros
 * mes/ano continuam aceitos pelo backend para quem chamava por mes unico.
 */
export async function fetchAccountSummary(period: AccountSummaryPeriod = {}): Promise<AccountSummary> {
  const q = new URLSearchParams();
  if (period.deMes !== undefined) q.set('de_mes', String(period.deMes));
  if (period.deAno !== undefined) q.set('de_ano', String(period.deAno));
  if (period.ateMes !== undefined) q.set('ate_mes', String(period.ateMes));
  if (period.ateAno !== undefined) q.set('ate_ano', String(period.ateAno));
  const suffix = q.toString() ? `?${q}` : '';
  return apiRequest<AccountSummary>(`/account-members/summary${suffix}`);
}
