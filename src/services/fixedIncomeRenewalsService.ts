import { apiRequest, getActiveAccountId } from './apiClient';
import type { FixedIncomeRenewal, FixedIncomeRenewalDecision, SeriesRenewalResult } from '../types/finance';

/** Receitas fixas da pessoa, na conta ativa, que aguardam a decisão de continuar. */
export async function fetchFixedIncomeRenewals(): Promise<FixedIncomeRenewal[]> {
  const params = new URLSearchParams();
  const accountId = getActiveAccountId();
  if (accountId) params.set('conta_id', String(accountId));
  const query = params.toString();
  return apiRequest<FixedIncomeRenewal[]>(`/incomes/fixed-renewals${query ? `?${query}` : ''}`);
}

/** Grava as decisões; continuar grava as previstas do ano seguinte, e não continuar encerra a fixa em dezembro. */
export async function decideFixedIncomeRenewals(decisions: FixedIncomeRenewalDecision[]): Promise<SeriesRenewalResult> {
  return apiRequest<SeriesRenewalResult>('/incomes/fixed-renewals', {
    method: 'POST',
    body: JSON.stringify({ decisions }),
  });
}
