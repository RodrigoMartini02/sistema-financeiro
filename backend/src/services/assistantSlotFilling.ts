// Rascunho que o assistente lê de uma frase ("gastei 50 no mercado no
// crédito") e o catálogo da conta usado na leitura. O card completa o resto.

export type SlotDraftKind = 'income' | 'expense';
export type SlotPaymentMethod = 'pix' | 'dinheiro' | 'debito' | 'credito';
export type SlotBillingType = 'nao' | 'parcelas' | 'mensal';

export interface SlotDraft {
  kind: SlotDraftKind;
  description: string | null;
  category: string | null;
  paymentMethod: SlotPaymentMethod | null;
  cardId: number | null;
  billingType: SlotBillingType | null;
  installments: number | null;
  amount: number | null;
  paid: boolean | null;
  amountPaid: number | null;
  date: string | null;
  dueDate: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
}

export interface SlotCatalog {
  categories: Array<{ id: number; name: string }>;
  cards: Array<{ id: number; name: string; type: string | null }>;
  isCompanyAccount: boolean;
}

export function createEmptySlotDraft(kind: SlotDraftKind): SlotDraft {
  return {
    kind,
    description: null,
    category: null,
    paymentMethod: null,
    cardId: null,
    billingType: null,
    installments: null,
    amount: null,
    paid: null,
    amountPaid: null,
    date: null,
    dueDate: null,
    invoiceNumber: null,
    invoiceDate: null,
  };
}

/** Cartoes de credito nao aparecem quando a compra foi no debito, e vice-versa. */
export function cardsForPaymentMethod(catalog: SlotCatalog, paymentMethod: SlotPaymentMethod | null): SlotCatalog['cards'] {
  if (paymentMethod !== 'credito' && paymentMethod !== 'debito') return [];
  return catalog.cards.filter((card) => !card.type || card.type === 'ambos' || card.type === paymentMethod);
}

