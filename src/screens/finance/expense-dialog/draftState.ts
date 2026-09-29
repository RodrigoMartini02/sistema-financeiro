import { isPaymentMethod, type Attachment, type Expense, type ExpenseBillingType, type PaymentMethod } from '../../../types/finance';
import { isoToBrDate } from '../../../utils/date';

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 360;

/** Parcela marcada como paga na grade de parcelas. */
export interface InstallmentPaymentDraft {
  /** dd/mm/aaaa. */
  paymentDate: string;
  /** Vazio: pago o próprio valor da parcela. */
  amountPaidCents: number | null;
}

/**
 * Uma despesa sendo digitada: a linha de entrada, um item do lote ou a despesa em
 * edição. Valores em centavos e datas como o texto dd/mm/aaaa do campo; a
 * conversão para reais e ISO só acontece ao montar o envio (draftRules).
 */
export interface ExpenseDraft {
  key: number;
  description: string;
  categoryId: number | null;
  /** No parcelado é o total; no recorrente, o valor de cada mês. */
  amountCents: number | null;
  billingType: ExpenseBillingType;
  installmentCount: number;
  /** Valor ajustado à mão, por índice da parcela (a loja arredondou diferente). */
  installmentAdjustments: Record<number, number>;
  /** Parcelas pagas, por índice. */
  installmentPayments: Record<number, InstallmentPaymentDraft>;
  /** "Deixar em aberto" no aviso de parcelas vencidas. */
  overdueDismissed: boolean;
  knowsCashPrice: boolean;
  cashPriceCents: number | null;
  /** Dia do vencimento no recorrente (1 a 31); null enquanto o campo está vazio. */
  recurrenceDay: number | null;
  purchaseDate: string;
  /** Vazio: o vencimento é calculado. */
  dueDate: string;
  paid: boolean;
  paymentDate: string;
  amountPaidCents: number | null;
  paymentMethod: PaymentMethod;
  cardId: number | null;
  /** Enquanto for false, a forma segue a sugestão do histórico. */
  paymentMethodTouched: boolean;
  attachments: Attachment[];
  invoiceNumber: string;
  invoiceDate: string;
}

let lastDraftKey = 0;

/** O que passa de uma despesa para a próxima: a forma, o cartão e a data da compra. */
export interface DraftCarryOver {
  paymentMethod: PaymentMethod;
  cardId: number | null;
  purchaseDate: string;
  paymentMethodTouched: boolean;
}

export function createDraft(carryOver: DraftCarryOver, todayIso: string): ExpenseDraft {
  lastDraftKey += 1;
  return {
    key: lastDraftKey,
    description: '',
    categoryId: null,
    amountCents: null,
    billingType: 'single',
    installmentCount: MIN_INSTALLMENTS,
    installmentAdjustments: {},
    installmentPayments: {},
    overdueDismissed: false,
    knowsCashPrice: false,
    cashPriceCents: null,
    recurrenceDay: Number(todayIso.slice(8, 10)),
    dueDate: '',
    paid: false,
    paymentDate: '',
    amountPaidCents: null,
    attachments: [],
    invoiceNumber: '',
    invoiceDate: '',
    ...carryOver,
  };
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

/** A despesa gravada, pronta para editar. A cobrança não muda na edição. */
export function draftFromExpense(expense: Expense, todayIso: string): ExpenseDraft {
  const amountCents = toCents(expense.valorFinal);
  const amountPaidCents = expense.valorPago != null ? toCents(expense.valorPago) : null;
  return {
    ...createDraft({
      paymentMethod: isPaymentMethod(expense.formaPagamento) ? expense.formaPagamento : 'pix',
      cardId: expense.cartaoId ?? null,
      purchaseDate: isoToBrDate(expense.dataCompra ?? expense.dataVencimento),
      paymentMethodTouched: true,
    }, todayIso),
    description: expense.descricao,
    categoryId: expense.categoriaId ?? null,
    amountCents,
    dueDate: isoToBrDate(expense.dataVencimento),
    paid: expense.pago,
    paymentDate: expense.pago ? isoToBrDate(expense.dataPagamento ?? expense.dataVencimento) : '',
    // Pago o valor exato fica vazio: o campo mostra o valor da despesa como sugestão.
    amountPaidCents: expense.pago && amountPaidCents !== amountCents ? amountPaidCents : null,
    attachments: expense.anexos ?? [],
    invoiceNumber: expense.numeroNf ?? '',
    invoiceDate: isoToBrDate(expense.dataEmissaoNf),
  };
}

/** Campos com erro, por despesa. */
export interface DraftErrors {
  description?: true;
  category?: true;
  amount?: true;
  card?: true;
  purchaseDate?: true;
  dueDate?: true;
  paymentDate?: true;
  recurrenceDay?: true;
  installments?: true;
  invoiceDate?: true;
}

export interface SavingProgress {
  current: number;
  total: number;
}

export interface DialogState {
  entry: ExpenseDraft;
  batch: ExpenseDraft[];
  errors: Record<number, DraftErrors>;
  footerError: string;
  /** Item do lote com o resumo aberto (a linha de entrada sempre mostra o dela). */
  activeKey: number | null;
  /** Redução do nº de parcelas que apagaria ajustes ou pagamentos, esperando confirmação. */
  pendingInstallmentCount: { key: number; count: number } | null;
  saving: SavingProgress | null;
  toast: string | null;
}

export function initialDialogState(entry: ExpenseDraft): DialogState {
  return {
    entry,
    batch: [],
    errors: {},
    footerError: '',
    activeKey: null,
    pendingInstallmentCount: null,
    saving: null,
    toast: null,
  };
}

export type DraftPatch = Partial<Omit<ExpenseDraft, 'key'>> | ((draft: ExpenseDraft) => Partial<Omit<ExpenseDraft, 'key'>>);

export type DialogAction =
  | { type: 'reset'; state: DialogState }
  | { type: 'update'; key: number; patch: DraftPatch }
  /** Forma e cartão sugeridos pelo histórico: muda a despesa sem apagar os erros apontados. */
  | { type: 'applySuggestion'; key: number; patch: Pick<ExpenseDraft, 'paymentMethod' | 'cardId'> }
  | { type: 'setInstallmentCount'; key: number; count: number; force: boolean }
  | { type: 'cancelInstallmentCount' }
  | { type: 'showErrors'; errors: Record<number, DraftErrors>; message: string }
  | { type: 'moveEntryToBatch'; nextEntry: ExpenseDraft }
  | { type: 'removeFromBatch'; key: number }
  | { type: 'setActive'; key: number }
  | { type: 'savingStarted'; total: number }
  | { type: 'savingProgress'; current: number }
  | { type: 'draftSaved'; key: number; nextEntry: ExpenseDraft }
  | { type: 'savingFailed'; message: string }
  | { type: 'savingFinished'; toast: string }
  | { type: 'toastExpired' };

function withoutKey<T>(record: Record<number, T>, key: number): Record<number, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function keepBelow<T>(record: Record<number, T>, count: number): Record<number, T> {
  return Object.fromEntries(Object.entries(record).filter(([index]) => Number(index) < count));
}

function updateDraft(state: DialogState, key: number, change: (draft: ExpenseDraft) => ExpenseDraft): DialogState {
  if (state.entry.key === key) return { ...state, entry: change(state.entry) };
  return { ...state, batch: state.batch.map((draft) => (draft.key === key ? change(draft) : draft)) };
}

function findDraft(state: DialogState, key: number): ExpenseDraft | undefined {
  return state.entry.key === key ? state.entry : state.batch.find((draft) => draft.key === key);
}

export function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'reset':
      return action.state;

    case 'update': {
      // Mexer na despesa limpa o erro dela e a mensagem do rodapé.
      const updated = updateDraft(state, action.key, (draft) => ({
        ...draft,
        ...(typeof action.patch === 'function' ? action.patch(draft) : action.patch),
      }));
      return { ...updated, errors: withoutKey(state.errors, action.key), footerError: '' };
    }

    case 'applySuggestion':
      return updateDraft(state, action.key, (draft) => ({ ...draft, ...action.patch }));

    case 'setInstallmentCount': {
      const draft = findDraft(state, action.key);
      if (!draft) return state;
      const count = Math.min(MAX_INSTALLMENTS, Math.max(MIN_INSTALLMENTS, Math.round(action.count) || MIN_INSTALLMENTS));
      const wouldLose = [...Object.keys(draft.installmentAdjustments), ...Object.keys(draft.installmentPayments)]
        .some((index) => Number(index) >= count);
      if (wouldLose && !action.force) {
        return { ...state, pendingInstallmentCount: { key: action.key, count } };
      }
      const updated = updateDraft(state, action.key, (current) => ({
        ...current,
        installmentCount: count,
        installmentAdjustments: keepBelow(current.installmentAdjustments, count),
        installmentPayments: keepBelow(current.installmentPayments, count),
      }));
      return { ...updated, pendingInstallmentCount: null, errors: withoutKey(state.errors, action.key), footerError: '' };
    }

    case 'cancelInstallmentCount':
      return { ...state, pendingInstallmentCount: null };

    case 'showErrors':
      return { ...state, errors: action.errors, footerError: action.message };

    case 'moveEntryToBatch':
      return {
        ...state,
        batch: [...state.batch, state.entry],
        entry: action.nextEntry,
        footerError: '',
        activeKey: null,
      };

    case 'removeFromBatch':
      return {
        ...state,
        batch: state.batch.filter((draft) => draft.key !== action.key),
        errors: withoutKey(state.errors, action.key),
        footerError: '',
        activeKey: state.activeKey === action.key ? null : state.activeKey,
      };

    case 'setActive':
      return state.activeKey === action.key ? state : { ...state, activeKey: action.key };

    case 'savingStarted':
      return { ...state, saving: { current: 1, total: action.total }, footerError: '', toast: null };

    case 'savingProgress':
      return state.saving ? { ...state, saving: { ...state.saving, current: action.current } } : state;

    // Cada despesa gravada sai da tela na hora: se uma falhar depois, só as que
    // não foram gravadas continuam, e salvar de novo não duplica nada.
    case 'draftSaved':
      if (state.entry.key === action.key) {
        return { ...state, entry: action.nextEntry, errors: withoutKey(state.errors, action.key) };
      }
      return {
        ...state,
        batch: state.batch.filter((draft) => draft.key !== action.key),
        errors: withoutKey(state.errors, action.key),
        activeKey: state.activeKey === action.key ? null : state.activeKey,
      };

    case 'savingFailed':
      return { ...state, saving: null, footerError: action.message };

    case 'savingFinished':
      return { ...state, saving: null, errors: {}, footerError: '', activeKey: null, toast: action.toast };

    case 'toastExpired':
      return { ...state, toast: null };
  }
}
