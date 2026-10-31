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
  /** No parcelado é o valor de cada parcela (o total, com `amountIsTotal`); no recorrente, o valor de cada mês. */
  amountCents: number | null;
  /** Parcelado, chave "Total": o valor digitado é o total, dividido nas parcelas (sem ela, é o de cada parcela). */
  amountIsTotal: boolean;
  billingType: ExpenseBillingType;
  endMonth?: string;
  initialEndMonth?: string;
  /** ID existente: esta linha confirma uma previsão em vez de criar despesa. */
  forecastId?: number;
  fixedExpenseId?: number;
  forecastDueDate?: string;
  deferred?: boolean;
  dirty?: boolean;
  deferError?: string;
  installmentCount: number;
  /** Valor ajustado à mão, por índice da parcela (a loja arredondou diferente). */
  installmentAdjustments: Record<number, number>;
  /** Parcelas pagas, por índice. */
  installmentPayments: Record<number, InstallmentPaymentDraft>;
  /** "Deixar em aberto" no aviso de parcelas vencidas. */
  overdueDismissed: boolean;
  /** Parcelado: valor à vista (sem juros), opcional. O que a soma das parcelas passa dele é o juros embutido. */
  cashPriceCents: number | null;
  purchaseDate: string;
  /** Distingue a data escolhida pelo usuário do valor inicial automático. */
  purchaseDateTouched?: boolean;
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
  purchaseDateTouched?: boolean;
  paymentMethodTouched: boolean;
}

export function createDraft(carryOver: DraftCarryOver): ExpenseDraft {
  return {
    key: nextDraftKey(),
    description: '',
    categoryId: null,
    amountCents: null,
    amountIsTotal: false,
    billingType: 'single',
    installmentCount: MIN_INSTALLMENTS,
    installmentAdjustments: {},
    installmentPayments: {},
    overdueDismissed: false,
    cashPriceCents: null,
    dueDate: '',
    paid: false,
    paymentDate: '',
    amountPaidCents: null,
    attachments: [],
    invoiceNumber: '',
    invoiceDate: '',
    purchaseDateTouched: false,
    ...carryOver,
  };
}

/** A despesa gravada, pronta para editar. A cobrança não muda na edição. */
export function draftFromExpense(expense: Expense): ExpenseDraft {
  const amountCents = toCents(expense.valorFinal);
  return {
    ...createDraft({
      paymentMethod: isPaymentMethod(expense.formaPagamento) ? expense.formaPagamento : 'pix',
      cardId: expense.cartaoId ?? null,
      purchaseDate: isoToBrDate(expense.dataCompra ?? expense.dataVencimento),
      purchaseDateTouched: true,
      paymentMethodTouched: true,
    }),
    description: expense.descricao,
    categoryId: expense.categoriaId ?? null,
    amountCents,
    dueDate: isoToBrDate(expense.dataVencimento),
    billingType: expense.fixedExpenseId ? 'fixed' : 'single',
    endMonth: expense.fixedEndMonth ?? '',
    initialEndMonth: expense.fixedEndMonth ?? '',
    forecastId: expense.status === 'prevista' ? expense.id : undefined,
    fixedExpenseId: expense.fixedExpenseId ?? undefined,
    forecastDueDate: expense.status === 'prevista' ? expense.dataVencimento : undefined,
    deferred: expense.deferred === true,
    paid: expense.pago,
    paymentDate: expense.pago ? isoToBrDate(expense.dataPagamento ?? expense.dataVencimento) : '',
    // Paga: o valor pago gravado (a paga antiga sem valor pago vale o valor da despesa) volta no campo e é
    // reenviado. Se ficasse vazio, o servidor o completaria com o valor novo, e corrigir o valor reescreveria
    // em silêncio o que foi pago (e o realizado do mês). O campo "Valor pago" continua editável para corrigir.
    amountPaidCents: expense.pago ? (expense.valorPago != null ? toCents(expense.valorPago) : amountCents) : null,
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
  /** Recorrente fora do crédito com cartão. */
  recurring?: true;
  installments?: true;
  invoiceDate?: true;
  endMonth?: true;
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
  | { type: 'mergeForecasts'; expenses: Expense[]; excludedIds: readonly number[] }
  | { type: 'setDeferred'; ids: number[]; deferred: boolean; error?: string }
  /** Forma e cartão sugeridos pelo histórico: muda a despesa sem apagar os erros apontados. */
  | { type: 'applySuggestion'; key: number; patch: Pick<ExpenseDraft, 'paymentMethod' | 'cardId'> }
  | { type: 'setInstallmentCount'; key: number; count: number; force: boolean }
  | { type: 'cancelInstallmentCount' };

/**
 * A recorrente é do cartão de crédito (plano .plans/recorrente-so-credito.md):
 * se a forma sai do Crédito (à mão, na barra "Lançando em" ou pela sugestão do
 * histórico), a cobrança volta para "Não repete".
 */
export function withRecurringOnCredit(draft: ExpenseDraft): ExpenseDraft {
  return draft.billingType === 'monthly' && draft.paymentMethod !== 'credito' ? { ...draft, billingType: 'single' } : draft;
}

function keepBelow<T>(record: Record<number, T>, count: number): Record<number, T> {
  return Object.fromEntries(Object.entries(record).filter(([index]) => Number(index) < count));
}

export function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'mergeForecasts': {
      const incoming = new Map(action.expenses.filter((expense) => expense.status === 'prevista' && !action.excludedIds.includes(expense.id)).map((expense) => [expense.id, expense]));
      const present = new Set<number>();
      const batch = state.batch.flatMap((draft) => {
        if (draft.forecastId === undefined) return [draft];
        const expense = incoming.get(draft.forecastId);
        if (!expense) return [];
        present.add(draft.forecastId);
        return [draft.dirty || draft.deferError ? draft : { ...draftFromExpense(expense), key: draft.key }];
      });
      for (const expense of incoming.values()) if (!present.has(expense.id)) batch.push(draftFromExpense(expense));
      return { ...state, batch };
    }

    case 'setDeferred':
      return { ...state, batch: state.batch.map((draft) => draft.forecastId !== undefined && action.ids.includes(draft.forecastId)
        ? { ...draft, deferred: action.deferred, dirty: true, deferError: action.error } : draft) };
    case 'applySuggestion':
      return updateDraft<ExpenseDraft, DialogState>(state, action.key, (draft) => withRecurringOnCredit({ ...draft, ...action.patch }));

    case 'update':
      return updateDraft<ExpenseDraft, DialogState>(
        batchReducer<ExpenseDraft, DraftErrors, DialogState>(state, action),
        action.key,
        (draft) => withRecurringOnCredit({ ...draft, dirty: true }),
      );

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
