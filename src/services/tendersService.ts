import { apiRequest } from './apiClient';

// Módulo de Licitações visto do app de finanças: só o que o atalho do menu
// precisa. O app do módulo tem o próprio cliente (src/tenders/services).

export interface TendersAccessSummary {
  account: { id: number; name: string; type: 'pessoal' | 'empresa' };
}

/**
 * Acesso de quem está logado ao módulo. Sem acesso, o servidor responde 404
 * (conta sem o módulo), 403 (colaborador não liberado) ou 402 (assinatura
 * vencida) e a promessa falha.
 */
export function fetchTendersAccess(): Promise<TendersAccessSummary> {
  return apiRequest<TendersAccessSummary>('/tenders/access');
}
