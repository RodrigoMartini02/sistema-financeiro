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
  // Campos do modal de despesa preenchidos pelo fluxo guiado. Opcionais porque
  // a leitura de anexos (OCR/Pix) continua produzindo rascunhos sem eles.
  cardId?: number | null;
  billingType?: 'nao' | 'parcelas' | 'mensal' | null;
  installments?: number | null;
  paidInstallments?: number | null;
  amountPaid?: number | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
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
