import { apiRequest } from './apiClient';
import type { FinancialAssistantRequest, FinancialAssistantResponse } from '../types/financialAssistant';

export async function createFinancialDraft(
  payload: FinancialAssistantRequest,
): Promise<FinancialAssistantResponse> {
  return apiRequest<FinancialAssistantResponse>('/assistant/financial-draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
