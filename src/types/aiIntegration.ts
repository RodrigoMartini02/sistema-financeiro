export type AiProviderName = 'openai' | 'anthropic' | 'gemini';

export interface AiIntegrationSetting {
  provider: AiProviderName;
  model: string;
  enabled: boolean;
  primary: boolean;
  hasToken: boolean;
  updatedAt: string | null;
}

export interface AiIntegrationInput {
  provider: AiProviderName;
  model: string;
  token?: string;
  enabled: boolean;
  primary: boolean;
}
