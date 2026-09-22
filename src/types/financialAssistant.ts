export type FinancialDraftKind = 'income' | 'expense';

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
  /**
   * Conta (PF/CNPJ) escolhida no card. So o frontend usa: o backend le o
   * lancamento da conta ativa, e a troca acontece na hora de gravar.
   */
  contaId?: number | null;
}
