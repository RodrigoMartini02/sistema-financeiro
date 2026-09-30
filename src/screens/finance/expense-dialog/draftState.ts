import { isPaymentMethod, type Attachment, type Expense, type ExpenseBillingType, type PaymentMethod } from '../../../types/finance';
import { isoToBrDate } from '../../../utils/date';
import {
  batchReducer, findDraft, initialBatchState, nextDraftKey, updateDraft, withoutKey,
  type BatchAction, type BatchState, type DraftPatch as BatchDraftPatch,
} from '../entry-dialog/batchState';
import { toCents } from '../entry-dialog/cents';

export type DraftPatch = BatchDraftPatch<ExpenseDraft>;

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

/** O que passa de uma despesa para a próxima: a forma, o cartão e a data da compra. */
export interface DraftCarryOver {
  paymentMethod: PaymentMethod;
  cardId: number | null;
  purchaseDate: string;
  paymentMethodTouched: boolean;
}

export function createDraft(carryOver: DraftCarryOver, todayIso: string): ExpenseDraft {
  return {
    key: nextDraftKey(),
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

export interface DialogState extends BatchState<ExpenseDraft, DraftErrors> {
  /** Redução do nº de parcelas que apagaria ajustes ou pagamentos, esperando confirmação. */
  pendingInstallmentCount: { key: number; count: number } | null;
}

export function initialDialogState(entry: ExpenseDraft): DialogState {
  return { ...initialBatchState<ExpenseDraft, DraftErrors>(entry), pendingInstallmentCount: null };
}

export type DialogAction =
  | BatchAction<ExpenseDraft, DraftErrors>
  /** Forma e cartão sugeridos pelo histórico: muda a despesa sem apagar os erros apontados. */
  | { type: 'applySuggestion'; key: number; patch: Pick<ExpenseDraft, 'paymentMethod' | 'cardId'> }
  | { type: 'setInstallmentCount'; key: number; count: number; force: boolean }
  | { type: 'cancelInstallmentCount' };

function keepBelow<T>(record: Record<number, T>, count: number): Record<number, T> {
  return Object.fromEntries(Object.entries(record).filter(([index]) => Number(index) < count));
}

export function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'applySuggestion':
      return updateDraft<ExpenseDraft, DialogState>(state, action.key, (draft) => ({ ...draft, ...action.patch }));

    case 'setInstallmentCount': {
      const draft = findDraft(state, action.key);
      if (!draft) return state;
      const count = Math.min(MAX_INSTALLMENTS, Math.max(MIN_INSTALLMENTS, Math.round(action.count) || MIN_INSTALLMENTS));
      const wouldLose = [...Object.keys(draft.installmentAdjustments), ...Object.keys(draft.installmentPayments)]
        .some((index) => Number(index) >= count);
      if (wouldLose && !action.force) {
        return { ...state, pendingInstallmentCount: { key: action.key, count } };
      }
      const updated = updateDraft<ExpenseDraft, DialogState>(state, action.key, (current) => ({
        ...current,
        installmentCount: count,
        installmentAdjustments: keepBelow(current.installmentAdjustments, count),
        installmentPayments: keepBelow(current.installmentPayments, count),
      }));
      return { ...updated, pendingInstallmentCount: null, errors: withoutKey(state.errors, action.key), footerError: '' };
    }

    case 'cancelInstallmentCount':
      return { ...state, pendingInstallmentCount: null };

    default:
      return batchReducer<ExpenseDraft, DraftErrors, DialogState>(state, action);
  }
}
