import { apiRequest, getActiveAccountId } from './apiClient';

export interface CardLimit {
  id: number;
  nome: string;
  limite: number;
  usado: number;
  disponivel: number;
}

export async function fetchCardLimits(): Promise<CardLimit[]> {
  const accountId = getActiveAccountId();
  const q = accountId ? `?conta_id=${accountId}` : '';
  return apiRequest<CardLimit[]>(`/cartoes/limites${q}`);
}
