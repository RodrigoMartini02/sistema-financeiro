import type { Attachment } from './finance';
import type { FinancialAssistantDraft } from './financialAssistant';

export type FinancialCopilotCardType = 'summary' | 'categories' | 'transactions' | 'upcoming' | 'budget';
export type FinancialCopilotIntentHint = 'register_expense' | 'register_income' | 'ask';

export interface FinancialCopilotCardItem {
  label: string;
  value: number | string;
  detail?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}

export interface FinancialCopilotCard {
  type: FinancialCopilotCardType;
  title: string;
  items: FinancialCopilotCardItem[];
}

export interface FinancialCopilotQuickReply {
  label: string;
  value: string;
}

/** Estado opaco do preenchimento guiado: o client apenas devolve o que recebeu. */
export type FinancialCopilotSlotState = Record<string, unknown>;

export interface FinancialCopilotResponse {
  conversationId: number | null;
  mode: 'answer' | 'draft' | 'help' | 'slot';
  reply: string;
  cards: FinancialCopilotCard[];
  draft: FinancialAssistantDraft | null;
  missingFields: Array<'description' | 'amount'>;
  quickReplies?: FinancialCopilotQuickReply[];
  slotState?: FinancialCopilotSlotState | null;
  /** Texto preparado para a sintese de fala; ausente fora do modo voz ou com cota estourada. */
  spokenReply?: string;
}

export interface FinancialCopilotRequest {
  message: string;
  month: number;
  year: number;
  attachments?: Attachment[];
  context?: Partial<FinancialAssistantDraft>;
  conversationId?: number | null;
  intentHint?: FinancialCopilotIntentHint | null;
  slotState?: FinancialCopilotSlotState | null;
  voiceMode?: boolean;
}

export interface FinancialCopilotConversation {
  id: number;
  title: string;
  updatedAt: string;
}

export interface FinancialCopilotStoredMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  payload: {
    mode?: FinancialCopilotResponse['mode'];
    cards?: FinancialCopilotCard[];
    draft?: FinancialAssistantDraft;
    slotState?: FinancialCopilotSlotState;
  } | null;
  createdAt: string;
}
