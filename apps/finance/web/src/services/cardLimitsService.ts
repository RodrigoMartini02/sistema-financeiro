import { apiRequest, getActiveAccountId } from './apiClient';

export interface CardLimit {
  id: number;
  nome: string;
  limite: number;
  usado: number;
  disponivel: number;
  /** Parte do usado que está em fatura já vencida e não paga no sistema. Ausente na resposta antiga. */
  vencido?: number;
}

export type CardUsageType = 'unicas' | 'parcelas' | 'recorrentes' | 'renegociacao';
export type CardUsageByType = Record<CardUsageType, number>;

export interface CardUsageInvoice {
  /** Mês do vencimento das compras, 'AAAA-MM'. */
  mes: string;
  vencimento: string;
  total: number;
  vencida: boolean;
  porTipo: CardUsageByType;
}

/** De que é feito o "Usado" do cartão: por fatura e por tipo (GET /cartoes/:id/usado). */
export interface CardUsage extends CardLimit {
  hoje: string;
  vencido: number;
  /** Parte do vencido que "Pagar fatura" consegue quitar; o resto são lançamentos antigos sem forma de pagamento. */
  vencidoQuitavel: number;
  porTipo: CardUsageByType;
  faturas: CardUsageInvoice[];
}

export async function fetchCardLimits(escopo?: 'familia'): Promise<CardLimit[]> {
  const accountId = getActiveAccountId();
  const params = new URLSearchParams();
  if (accountId) params.set('conta_id', String(accountId));
  if (escopo) params.set('escopo', escopo);
  const q = params.toString();
  return apiRequest<CardLimit[]>(`/cartoes/limites${q ? `?${q}` : ''}`);
}

export async function fetchCardUsage(cardId: number, escopo?: 'familia'): Promise<CardUsage> {
  const accountId = getActiveAccountId();
  const params = new URLSearchParams();
  if (accountId) params.set('conta_id', String(accountId));
  if (escopo) params.set('escopo', escopo);
  const q = params.toString();
  return apiRequest<CardUsage>(`/cartoes/${cardId}/usado${q ? `?${q}` : ''}`);
}
