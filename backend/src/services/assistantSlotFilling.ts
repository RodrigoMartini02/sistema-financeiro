import { getTodayIsoInTimezone } from '../utils/date';

// Preenchimento guiado de lancamentos: o assistente extrai da frase tudo o que
// conseguir e pergunta apenas os campos que sobraram vazios, um por vez.
//
// As condicoes de cada slot espelham as do modal de despesa
// (`src/screens/finance/ExpenseForm.tsx`): credito esconde "ja foi paga" e
// "valor pago" porque quem paga e a fatura do cartao; parcelas so aparecem em
// cobranca parcelada; NF so em conta empresa. Mudou a regra la, mude aqui.

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

/**
 * Campos que o usuario confirma em vez de responder do zero. A descricao entra
 * aqui sempre — mesmo extraida com clareza, nunca se grava um chute — e a
 * categoria so quando veio sugerida pelo historico.
 */
const CONFIRMED_SLOTS = new Set<SlotId>(['description', 'category']);

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
 * Um slot so entra no fluxo quando faz sentido para o que ja foi respondido.
 * Receita tem apenas descricao, valor e data: `receitas` nao guarda categoria,
 * forma de pagamento nem parcelamento.
 */
function isSlotApplicable(slot: SlotId, draft: SlotDraft, catalog: SlotCatalog): boolean {
  if (draft.kind === 'income') {
    return slot === 'description' || slot === 'amount' || slot === 'purchaseDate';
  }

  switch (slot) {
    case 'cardId':
      return draft.paymentMethod === 'credito' || draft.paymentMethod === 'debito';
    case 'installments':
    case 'paidInstallments':
      return draft.billingType === 'parcelas';
    case 'paid':
      return !isCreditCard(draft);
    case 'amountPaid':
      return !isCreditCard(draft) && draft.paid === true;
    case 'dueDate':
      return draft.paid !== true;
    case 'invoiceNumber':
    case 'invoiceDate':
      return catalog.isCompanyAccount;
    default:
      return true;
  }
}

function isSlotFilled(slot: SlotId, draft: SlotDraft): boolean {
  switch (slot) {
    case 'description': return draft.description !== null;
    case 'category': return draft.category !== null;
    case 'paymentMethod': return draft.paymentMethod !== null;
    case 'cardId': return draft.cardId !== null;
    case 'billingType': return draft.billingType !== null;
    case 'installments': return draft.installments !== null;
    case 'paidInstallments': return draft.paidInstallments !== null;
    case 'amount': return draft.amount !== null;
    case 'paid': return draft.paid !== null;
    case 'amountPaid': return draft.amountPaid !== null;
    case 'purchaseDate': return draft.date !== null;
    case 'dueDate': return draft.dueDate !== null;
    case 'invoiceNumber': return draft.invoiceNumber !== null;
    case 'invoiceDate': return draft.invoiceDate !== null;
  }
}

/**
 * Ordem das perguntas, espelhando a leitura de cima para baixo do modal.
 * `purchaseDate` fica fora: a data da compra assume hoje quando nao foi dita,
 * como o modal faz, e nunca vira pergunta.
 */
const SLOT_ORDER: SlotId[] = [
  'description',
  'category',
  'paymentMethod',
  'cardId',
  'billingType',
  'installments',
  'paidInstallments',
  'amount',
  'paid',
  'amountPaid',
  'dueDate',
  'invoiceNumber',
  'invoiceDate',
];

/**
 * Campos cuja resposta invalida outros. Trocar a forma de pagamento derruba o
 * cartao escolhido; trocar o tipo de cobranca derruba as parcelas. Sem isso,
 * "nao, era no debito" deixaria para tras um cartao de credito ja respondido.
 */
const SLOT_DEPENDENTS: Partial<Record<SlotId, SlotId[]>> = {
  paymentMethod: ['cardId', 'paid', 'amountPaid', 'dueDate'],
  billingType: ['installments', 'paidInstallments'],
  paid: ['amountPaid', 'dueDate'],
  amount: ['amountPaid'],
};

/** Slots que o usuario pode deixar em branco com [Pular]. */
const SKIPPABLE_SLOTS = new Set<SlotId>([
  'paidInstallments',
  'invoiceNumber',
  'invoiceDate',
]);

/** Sem esses campos o lancamento nao pode ser gravado. */
const REQUIRED_SLOTS: Record<SlotDraftKind, SlotId[]> = {
  income: ['description', 'amount'],
  expense: ['description', 'amount', 'paymentMethod'],
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

const PAYMENT_METHOD_OPTIONS: SlotOption[] = [
  { label: 'PIX', value: 'pix' },
  { label: 'Dinheiro', value: 'dinheiro' },
  { label: 'Débito', value: 'debito' },
  { label: 'Crédito', value: 'credito' },
];

const BILLING_TYPE_OPTIONS: SlotOption[] = [
  { label: 'Não repete', value: 'nao' },
  { label: 'Parcelado', value: 'parcelas' },
  { label: 'Recorrente', value: 'mensal' },
];

const YES_NO_OPTIONS: SlotOption[] = [
  { label: 'Sim', value: 'sim' },
  { label: 'Não', value: 'nao' },
];

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Cartoes de credito nao aparecem quando a compra foi no debito, e vice-versa. */
export function cardsForPaymentMethod(catalog: SlotCatalog, paymentMethod: SlotPaymentMethod | null): SlotCatalog['cards'] {
  if (paymentMethod !== 'credito' && paymentMethod !== 'debito') return [];
  return catalog.cards.filter((card) => !card.type || card.type === 'ambos' || card.type === paymentMethod);
}

function buildQuestion(slot: SlotId, draft: SlotDraft, catalog: SlotCatalog): SlotQuestion {
  const skippable = SKIPPABLE_SLOTS.has(slot);

  switch (slot) {
    case 'description':
      return {
        slot,
        question: draft.description
          ? `Entendi que é "${draft.description}", certo?`
          : 'Como você quer descrever esse lançamento?',
        options: draft.description ? [{ label: 'Sim', value: 'sim' }, { label: 'Corrigir', value: 'corrigir' }] : [],
        isConfirmation: Boolean(draft.description),
        skippable: false,
      };

    case 'category':
      return {
        slot,
        question: draft.category
          ? `Categoria ${draft.category}, certo? Foi assim nas outras vezes.`
          : 'E a categoria?',
        options: draft.category
          ? [{ label: 'Sim', value: 'sim' }, { label: 'Trocar', value: 'corrigir' }]
          : catalog.categories.map((category) => ({ label: category.name, value: category.name })),
        isConfirmation: Boolean(draft.category),
        skippable: false,
      };

    case 'paymentMethod':
      return { slot, question: 'Como você pagou?', options: PAYMENT_METHOD_OPTIONS, isConfirmation: false, skippable: false };

    case 'cardId': {
      const cards = cardsForPaymentMethod(catalog, draft.paymentMethod);
      // Com um cartao so, listar seria pedir uma escolha que nao existe.
      if (cards.length === 1) {
        return {
          slot,
          question: `No cartão ${cards[0]!.name}, certo?`,
          options: [{ label: 'Sim', value: String(cards[0]!.id) }, { label: 'Outro', value: 'corrigir' }],
          isConfirmation: true,
          skippable: false,
        };
      }
      return {
        slot,
        question: 'Qual cartão?',
        options: cards.map((card) => ({ label: card.name, value: String(card.id) })),
        isConfirmation: false,
        skippable: false,
      };
    }

    case 'billingType':
      return { slot, question: 'É uma cobrança única, parcelada ou recorrente?', options: BILLING_TYPE_OPTIONS, isConfirmation: false, skippable: false };

    case 'installments':
      return { slot, question: 'Em quantas vezes?', options: [], isConfirmation: false, skippable: false };

    case 'paidInstallments':
      return { slot, question: 'Quantas parcelas você já pagou?', options: [], isConfirmation: false, skippable };

    case 'amount': {
      const label = draft.billingType === 'parcelas'
        ? 'Qual o valor da parcela?'
        : draft.billingType === 'mensal'
          ? 'Qual o valor mensal?'
          : 'Quanto foi?';
      return { slot, question: label, options: [], isConfirmation: false, skippable: false };
    }

    case 'paid':
      return { slot, question: 'Já foi paga?', options: YES_NO_OPTIONS, isConfirmation: false, skippable: false };

    case 'amountPaid':
      return {
        slot,
        question: draft.amount ? `Valor pago foram os mesmos ${formatCurrency(draft.amount)}?` : 'Quanto você pagou?',
        options: draft.amount
          ? [{ label: 'Sim', value: String(draft.amount) }, { label: 'Outro valor', value: 'corrigir' }]
          : [],
        isConfirmation: Boolean(draft.amount),
        skippable: false,
      };

    case 'purchaseDate':
      return { slot, question: 'Qual a data da compra?', options: [], isConfirmation: false, skippable: false };

    case 'dueDate':
      return { slot, question: 'Para quando é o vencimento?', options: [], isConfirmation: false, skippable: false };

    case 'invoiceNumber':
      return { slot, question: 'Tem número de nota fiscal?', options: [], isConfirmation: false, skippable };

    case 'invoiceDate':
      return { slot, question: 'Qual a data de emissão da nota?', options: [], isConfirmation: false, skippable };
  }
}

/**
 * Pergunta de um slot especifico, independentemente de estar preenchido. Usada
 * nas confirmacoes, onde o valor ja extraido precisa aparecer no texto
 * ("Entendi que e X, certo?").
 */
export function slotQuestionFor(slot: SlotId, draft: SlotDraft, catalog: SlotCatalog): SlotQuestion {
  return buildQuestion(slot, draft, catalog);
}

/**
 * Proxima pergunta do fluxo, ou `null` quando nao falta nada. Percorre a ordem
 * do modal e devolve o primeiro slot aplicavel que ainda esta vazio — slot
 * preenchido pela frase do usuario e pulado em silencio.
 */
export function nextSlotQuestion(
  draft: SlotDraft,
  catalog: SlotCatalog,
  skipped: SlotId[] = [],
): SlotQuestion | null {
  const skippedSet = new Set(skipped);

  for (const slot of SLOT_ORDER) {
    if (skippedSet.has(slot)) continue;
    if (!isSlotApplicable(slot, draft, catalog)) continue;
    if (isSlotFilled(slot, draft)) continue;
    return buildQuestion(slot, draft, catalog);
  }

  return null;
}

/**
 * Slots ja preenchidos que ainda precisam do "certo?" do usuario. Sem isso, uma
 * frase que resolve tudo gravaria a descricao sem nunca a ter confirmado.
 */
export function pendingConfirmations(draft: SlotDraft, confirmed: SlotId[]): SlotId[] {
  const confirmedSet = new Set(confirmed);
  return [...CONFIRMED_SLOTS].filter((slot) => {
    if (confirmedSet.has(slot)) return false;
    return isSlotFilled(slot, draft);
  });
}

export function missingRequiredSlots(draft: SlotDraft): SlotId[] {
  return REQUIRED_SLOTS[draft.kind].filter((slot) => !isSlotFilled(slot, draft));
}

export function isDraftComplete(draft: SlotDraft, catalog: SlotCatalog, skipped: SlotId[] = []): boolean {
  return missingRequiredSlots(draft).length === 0 && nextSlotQuestion(draft, catalog, skipped) === null;
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
