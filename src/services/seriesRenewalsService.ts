import { apiRequest, getActiveAccountId } from './apiClient';
import type { SeriesRenewal, SeriesRenewalDecision, SeriesRenewalResult } from '../types/finance';

/** Séries mensais do usuário, na conta ativa, que aguardam a decisão de renovar. */
export async function fetchSeriesRenewals(): Promise<SeriesRenewal[]> {
  const params = new URLSearchParams();
  const accountId = getActiveAccountId();
  if (accountId) params.set('conta_id', String(accountId));
  const query = params.toString();
  return apiRequest<SeriesRenewal[]>(`/expenses/series-renewals${query ? `?${query}` : ''}`);
}

/** Grava as decisões; renovar cria janeiro a dezembro do ano seguinte na mesma série. */
export async function decideSeriesRenewals(decisions: SeriesRenewalDecision[]): Promise<SeriesRenewalResult> {
  return apiRequest<SeriesRenewalResult>('/expenses/series-renewals', {
    method: 'POST',
    body: JSON.stringify({ decisions }),
  });
}
