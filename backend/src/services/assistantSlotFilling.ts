import { getTodayIsoInTimezone } from '../utils/date';

// Tipos e utilitarios do preenchimento guiado de lancamentos.
//
// A ORDEM das perguntas, o TEXTO de cada uma e as CONDICOES de quando cada
// campo aparece nao vivem mais aqui: sao dados, editaveis pela tela de fluxo
// (Configuracoes > Fluxo do assistente). O padrao esta em
// assistantFlowDefault.ts e quem o executa e assistantFlowEngine.ts.
//
// O que sobrou neste arquivo e o que o fluxo nao descreve: a forma do
// rascunho, quais cartoes servem para cada forma de pagamento, a limpeza em
// cascata e os defaults de fim de fluxo.

export type SlotDraftKind = 'income' | 'expense';
export type SlotPaymentMethod = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'boleto';
export type SlotBillingType = 'nao' | 'parcelas' | 'mensal';

export type SlotId =
  | 'description'
  | 'category'
  | 'paymentMethod'
  | 'cardId'
  | 'billingType'
  | 'installments'
  | 'paidInstallments'
  | 'amount'
  | 'paid'
  | 'amountPaid'
  | 'purchaseDate'
  | 'dueDate'
  | 'invoiceNumber'
  | 'invoiceDate';

export interface SlotDraft {
  kind: SlotDraftKind;
  description: string | null;
  category: string | null;
  paymentMethod: SlotPaymentMethod | null;
  cardId: number | null;
  billingType: SlotBillingType | null;
  installments: number | null;
  paidInstallments: number | null;
  amount: number | null;
  paid: boolean | null;
  amountPaid: number | null;
  date: string | null;
  dueDate: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
}

export interface SlotOption {
  label: string;
  value: string;
}

export interface SlotCatalog {
  categories: Array<{ id: number; name: string }>;
  cards: Array<{ id: number; name: string; type: string | null }>;
  isCompanyAccount: boolean;
}

export interface SlotQuestion {
  slot: SlotId;
  question: string;
  options: SlotOption[];
  /** Confirmacoes trazem o palpite ja no botao; o usuario so aprova ou corrige. */
  isConfirmation: boolean;
  skippable: boolean;
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
    paidInstallments: null,
    amount: null,
    paid: null,
    amountPaid: null,
    date: null,
    dueDate: null,
    invoiceNumber: null,
    invoiceDate: null,
  };
}

function isCreditCard(draft: SlotDraft): boolean {
  return draft.paymentMethod === 'credito';
}

/**
 * Campos cuja resposta invalida outros. Trocar a forma de pagamento derruba o
 * cartao escolhido; trocar o tipo de cobranca derruba as parcelas. Sem isso,
 * "nao, era no debito" deixaria para tras um cartao de credito ja respondido.
 *
 * O fluxo tambem declara isso (`limpaAoResponder`), e o motor o expoe em
 * `dependentsOf`. Aplicar a cascata a partir do fluxo, e nao desta tabela,
 * faz parte da fase dos nos especiais.
 */
const SLOT_DEPENDENTS: Partial<Record<SlotId, SlotId[]>> = {
  paymentMethod: ['cardId', 'paid', 'amountPaid', 'dueDate'],
  billingType: ['installments', 'paidInstallments'],
  paid: ['amountPaid', 'dueDate'],
  amount: ['amountPaid'],
};

export function clearDependentSlots(draft: SlotDraft, slot: SlotId): SlotDraft {
  const dependents = SLOT_DEPENDENTS[slot];
  if (!dependents) return draft;

  const next = { ...draft };
  for (const dependent of dependents) {
    switch (dependent) {
      case 'cardId': next.cardId = null; break;
      case 'installments': next.installments = null; break;
      case 'paidInstallments': next.paidInstallments = null; break;
      case 'paid': next.paid = null; break;
      case 'amountPaid': next.amountPaid = null; break;
      case 'dueDate': next.dueDate = null; break;
      default: break;
    }
  }
  return next;
}

/** Cartoes de credito nao aparecem quando a compra foi no debito, e vice-versa. */
export function cardsForPaymentMethod(catalog: SlotCatalog, paymentMethod: SlotPaymentMethod | null): SlotCatalog['cards'] {
  if (paymentMethod !== 'credito' && paymentMethod !== 'debito') return [];
  return catalog.cards.filter((card) => !card.type || card.type === 'ambos' || card.type === paymentMethod);
}


/**
 * Completa o que o modal preencheria sozinho: data da compra hoje, cobranca
 * unica e, no credito, a despesa entra na fatura em vez de ser marcada paga.
 */
export function applyDraftDefaults(draft: SlotDraft): SlotDraft {
  const next = { ...draft };
  if (!next.date) next.date = getTodayIsoInTimezone();
  if (next.kind === 'expense') {
    if (!next.billingType) next.billingType = 'nao';
    if (isCreditCard(next)) {
      next.paid = false;
      next.amountPaid = null;
    }
    if (next.paid === true && next.amountPaid === null) next.amountPaid = next.amount;
    if (!next.dueDate) next.dueDate = next.date;
  }
  return next;
}
