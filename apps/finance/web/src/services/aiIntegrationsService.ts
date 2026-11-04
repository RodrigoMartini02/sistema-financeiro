import { apiRequest } from './apiClient';
import type { AiIntegrationInput, AiIntegrationSetting, AiProviderName } from '../types/aiIntegration';

export function fetchAiIntegrationSettings(): Promise<AiIntegrationSetting[]> {
  return apiRequest<AiIntegrationSetting[]>('/ai-integracoes');
}

export function saveAiIntegration(input: AiIntegrationInput): Promise<AiIntegrationSetting> {
  return apiRequest<AiIntegrationSetting>(`/ai-integracoes/${input.provider}`, {
    method: 'PUT',
    body: JSON.stringify({
      modelo: input.model,
      token: input.token,
      ativo: input.enabled,
      principal: input.primary,
    }),
  });
}

export async function testAiIntegration(input: Pick<AiIntegrationInput, 'provider' | 'model' | 'token'>): Promise<void> {
  await apiRequest<void>('/ai-integracoes/test', {
    method: 'POST',
    body: JSON.stringify({ provedor: input.provider, modelo: input.model, token: input.token }),
  });
}

export const AI_PROVIDER_LABELS: Record<AiProviderName, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
};
