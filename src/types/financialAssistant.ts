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
  /**
   * Campos de receita exclusivos de conta PJ. So aparecem no card quando a
   * conta do lancamento e empresa — em conta PF permanecem null/undefined,
   * igual ao IncomeForm.tsx do desktop.
   */
  cliente?: string | null;
  tipoReceita?: string | null;
  representanteId?: number | null;
  produtoId?: string | null;
  quantidadeVendida?: number | null;
  contratoId?: number | null;
  tipoHora?: 'presencial' | 'remoto' | null;
  quantidadeHoras?: number | null;
  /** Receita, PF e PJ: gera lancamentos replicados em meses futuros. */
  replicarAte?: { mes: number; ano: number } | null;
}
