import type { OpenExpense } from './finance';
import type { FinancialAssistantDraft } from './financialAssistant';

/**
 * Arquivo anexado à conversa do assistente. O conteúdo em base64 (`dados`) vai para a leitura do assistente (texto e
 * Pix); o arquivo original (`file`) vira comprovante do lançamento se o card for salvo.
 */
export interface AssistantFile {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  dados: string;
  file: File;
}

export type FinancialCopilotCardType = 'summary' | 'categories' | 'transactions' | 'upcoming' | 'budget';
export type FinancialCopilotIntentHint = 'register_expense' | 'register_income' | 'ask' | 'pay_expense';

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

/** Chip "Pagar despesa": as despesas oferecidas e o que a frase trouxe do pagamento. */
export interface FinancialCopilotPayment {
  candidates: OpenExpense[];
  amountPaid: number | null;
  paymentDate: string | null;
}

export interface FinancialCopilotResponse {
  conversationId: number | null;
  mode: 'answer' | 'draft' | 'help' | 'slot' | 'payment';
  reply: string;
  cards: FinancialCopilotCard[];
  draft: FinancialAssistantDraft | null;
  missingFields: Array<'description' | 'amount'>;
  quickReplies?: FinancialCopilotQuickReply[];
  /** Texto preparado para a sintese de fala; ausente fora do modo voz ou com cota estourada. */
  spokenReply?: string;
  /** So no modo `payment`. */
  payment?: FinancialCopilotPayment;
}

export interface FinancialCopilotRequest {
  message: string;
  month: number;
  year: number;
  attachments?: AssistantFile[];
  context?: Partial<FinancialAssistantDraft>;
  conversationId?: number | null;
  intentHint?: FinancialCopilotIntentHint | null;
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
  } | null;
  createdAt: string;
}
