import type { Attachment } from './finance';

export type FinancialDraftKind = 'income' | 'expense';

export type FinancialDraftMissingField = 'description' | 'amount';

export interface FinancialAssistantDraft {
  kind: FinancialDraftKind;
  description: string | null;
  amount: number | null;
  date: string | null;
  dueDate: string | null;
  category: string | null;
  paymentMethod: 'pix' | 'dinheiro' | 'debito' | 'credito' | 'boleto';
  paid: boolean;
  confidence: 'low' | 'medium' | 'high';
}

export interface FinancialAssistantResponse {
  reply: string;
  draft: FinancialAssistantDraft;
  missingFields: FinancialDraftMissingField[];
  usedDefaultDate: boolean;
}

export interface FinancialAssistantRequest {
  message: string;
  attachments?: Attachment[];
  context?: Partial<FinancialAssistantDraft>;
}
