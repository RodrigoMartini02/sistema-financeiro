import { apiRequest } from './apiClient';
import type { FinancialAssistantRequest, FinancialAssistantResponse } from '../types/financialAssistant';
import type {
  FinancialCopilotConversation,
  FinancialCopilotRequest,
  FinancialCopilotResponse,
  FinancialCopilotStoredMessage,
} from '../types/financialCopilot';
import { getActiveAccountId } from './apiClient';

export async function createFinancialDraft(
  payload: FinancialAssistantRequest,
): Promise<FinancialAssistantResponse> {
  return apiRequest<FinancialAssistantResponse>('/assistant/financial-draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function profileQuery(): string {
  const accountId = getActiveAccountId();
  return accountId ? `?conta_id=${accountId}` : '';
}

export async function sendFinancialCopilotMessage(
  payload: FinancialCopilotRequest,
): Promise<FinancialCopilotResponse> {
  return apiRequest<FinancialCopilotResponse>('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: payload.message,
      mes: payload.month,
      ano: payload.year,
      conta_id: getActiveAccountId(),
      attachments: payload.attachments ?? [],
      context: payload.context,
      conversa_id: payload.conversationId ?? null,
      intent_hint: payload.intentHint ?? null,
    }),
  });
}

export function fetchFinancialCopilotConversations(): Promise<FinancialCopilotConversation[]> {
  return apiRequest<FinancialCopilotConversation[]>(`/assistant/conversations${profileQuery()}`);
}

export function fetchFinancialCopilotConversation(id: number): Promise<FinancialCopilotStoredMessage[]> {
  return apiRequest<FinancialCopilotStoredMessage[]>(`/assistant/conversations/${id}${profileQuery()}`);
}

export async function deleteFinancialCopilotConversation(id: number): Promise<void> {
  await apiRequest<void>(`/assistant/conversations/${id}${profileQuery()}`, { method: 'DELETE' });
}
