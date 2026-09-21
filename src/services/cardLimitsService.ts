import { apiRequest, getActiveAccountId } from './apiClient';

export interface CardLimit {
  id: number;
  nome: string;
  limite: number;
  usado: number;
  disponivel: number;
}

export async function fetchCardLimits(escopo?: 'familia'): Promise<CardLimit[]> {
  const accountId = getActiveAccountId();
  const params = new URLSearchParams();
  if (accountId) params.set('conta_id', String(accountId));
  if (escopo) params.set('escopo', escopo);
  const q = params.toString();
  return apiRequest<CardLimit[]>(`/cartoes/limites${q ? `?${q}` : ''}`);
}
