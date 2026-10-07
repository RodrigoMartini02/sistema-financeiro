// Regras do pagamento da fatura do cartão no app, sem tela: o resumo do modal
// "Pagar fatura" (encargos, restante, parcelas, % dos juros e taxa ao mês), o
// mês da fatura e o que a lista mostra e trava em cada linha. O cálculo que vale
// é o do servidor (backend/src/services/cardInvoiceRules.ts); a prévia segue a
// mesma regra.
import type { Expense, InvoicePaymentMethod } from '../types/finance';
import { splitAmountInCents } from './expenseSchedule';

export const MIN_INVOICE_INSTALLMENTS = 2;
export const MAX_INVOICE_INSTALLMENTS = 360;

/** Só a despesa nesta forma, com cartão, entra na fatura. */
export const INVOICE_EXPENSE_METHOD = 'credito';

export const INVOICE_MESSAGES = {
  lockedRow: 'Esta despesa faz parte de um pagamento de fatura. Para mudar, desfaça o pagamento da fatura.',
  creditPayment: 'Pago pela fatura do cartão',
  totalBelowPurchases: 'O valor pago é menor que a soma das compras: use o pagamento parcial ou confira os lançamentos.',
  partialOutOfRange: 'O pagamento parcial precisa ser maior que zero e menor que a soma das compras.',
  installmentsOutOfRange: `Informe de ${MIN_INVOICE_INSTALLMENTS} a ${MAX_INVOICE_INSTALLMENTS} parcelas.`,
  installmentTooSmall: 'Cada parcela precisa ter pelo menos R$ 0,01.',
} as const;

const MONTH_ABBREVIATIONS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Mês da tela (0-11) e ano → 'AAAA-MM'. */
export function invoiceMonthParam(month: number, year: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** 'AAAA-MM' mais `offset` meses → 'AAAA-MM'. */
export function shiftInvoiceMonth(invoiceMonth: string, offset: number): string {
  const [year, month] = invoiceMonth.split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) + offset;
  return invoiceMonthParam(index % 12, Math.floor(index / 12));
}

/** 'AAAA-MM' → 'out/2026'. */
export function invoiceMonthLabel(invoiceMonth: string): string {
  const [year, month] = invoiceMonth.split('-').map(Number) as [number, number];
  return `${MONTH_ABBREVIATIONS[month - 1]}/${year}`;
}

/** Vencimento no dia do cartão, `offset` meses depois do mês da fatura; 31 cai no último dia do mês. */
export function invoiceDueDate(invoiceMonth: string, dueDay: number, offset: number): string {
  const target = shiftInvoiceMonth(invoiceMonth, offset);
  const [year, month] = target.split('-').map(Number) as [number, number];
  const lastDay = new Date(year, month, 0).getDate();
  return `${target}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
}

/** Valor de cada parcela: o total em partes iguais, com os centavos que sobram na última. */
export function installmentAmountsOf(total: number, count: number): number[] {
  const totalCents = toCents(total);
  if (!isValidInvoiceInstallmentCount(count) || totalCents < count) {
    return [];
  }
  return splitAmountInCents(totalCents, count).map((cents) => cents / 100);
}

export function isValidInvoiceInstallmentCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_INVOICE_INSTALLMENTS && count <= MAX_INVOICE_INSTALLMENTS;
}

/**
 * Taxa ao mês da Tabela Price que transforma `principal` em `count` parcelas de
 * `installmentAmount`, em fração (0,0142 = 1,42%). 0 quando as parcelas não
 * passam do principal; null com entrada inválida ou taxa absurda.
 */
export function monthlyInterestRate(principal: number, installmentAmount: number, count: number): number | null {
  if (!(principal > 0) || !(installmentAmount > 0) || !Number.isInteger(count) || count < 1) {
    return null;
  }
  if (installmentAmount * count <= principal) {
    return 0;
  }
  const presentValue = (rate: number) => (installmentAmount * (1 - (1 + rate) ** -count)) / rate;
  let low = 0;
  let high = 1;
  while (presentValue(high) > principal) {
    high *= 2;
    if (high > 1000) return null;
  }
  for (let step = 0; step < 200; step += 1) {
    const middle = (low + high) / 2;
    if (presentValue(middle) > principal) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}

/** "3x de R$ 360,00" ou, quando sobra centavo, "2x de R$ 333,33 + 1x de R$ 333,34". */
export function installmentsLabel(amounts: number[], formatAmount: (value: number) => string): string {
  if (amounts.length === 0) return '';
  const first = amounts[0]!;
  const last = amounts[amounts.length - 1]!;
  if (toCents(first) === toCents(last)) {
    return `${amounts.length}x de ${formatAmount(first)}`;
  }
  return `${amounts.length - 1}x de ${formatAmount(first)} + 1x de ${formatAmount(last)}`;
}

/** 2.857 → "2,86%". */
export function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export interface InvoicePaymentDraft {
  purchasesAmount: number;
  method: InvoicePaymentMethod;
  /** Total e parcial. */
  amountPaid: number;
  /** Parcial e parcelado. */
  interestAmount: number;
  /** Só no parcelado. */
  installmentCount: number;
}

export interface InvoicePaymentSummary {
  /** Motivo para não deixar confirmar; null quando dá. */
  error: string | null;
  /** O que as compras passam a contar no mês: a soma (total), o valor pago (parcial) ou 0 (parcelado). */
  purchasesCountAs: number;
  /** Total: o que passou da soma, que vira "Encargos da fatura". */
  chargesAmount: number;
  /** Parcial e parcelado: o que vai para as próximas faturas (restante ou soma das parcelas). */
  carriedForward: number;
  installmentAmounts: number[];
  /** Juros em % do que foi para a frente (parcial) ou da soma das compras (parcelado). */
  interestPercent: number | null;
  /** Taxa ao mês equivalente (Tabela Price), em %; só no parcelado com juros. */
  monthlyRatePercent: number | null;
}

/** O resumo que o modal mostra enquanto a pessoa digita. */
export function summarizeInvoicePayment(draft: InvoicePaymentDraft): InvoicePaymentSummary {
  const purchasesCents = toCents(draft.purchasesAmount);
  const paidCents = toCents(draft.amountPaid);
  const interestCents = toCents(draft.interestAmount);
  const empty: InvoicePaymentSummary = {
    error: null, purchasesCountAs: 0, chargesAmount: 0, carriedForward: 0, installmentAmounts: [], interestPercent: null, monthlyRatePercent: null,
  };

  if (draft.method === 'total') {
    if (paidCents < purchasesCents) {
      return { ...empty, error: INVOICE_MESSAGES.totalBelowPurchases, purchasesCountAs: draft.purchasesAmount };
    }
    return { ...empty, purchasesCountAs: draft.purchasesAmount, chargesAmount: (paidCents - purchasesCents) / 100 };
  }

  if (draft.method === 'partial') {
    if (paidCents <= 0 || paidCents >= purchasesCents) {
      return { ...empty, error: INVOICE_MESSAGES.partialOutOfRange };
    }
    const remainderCents = purchasesCents - paidCents;
    return {
      ...empty,
      purchasesCountAs: paidCents / 100,
      carriedForward: (remainderCents + interestCents) / 100,
      interestPercent: interestCents > 0 ? (interestCents / remainderCents) * 100 : null,
    };
  }

  if (!isValidInvoiceInstallmentCount(draft.installmentCount)) {
    return { ...empty, error: INVOICE_MESSAGES.installmentsOutOfRange };
  }
  const forwardCents = purchasesCents + interestCents;
  const installmentAmounts = installmentAmountsOf(forwardCents / 100, draft.installmentCount);
  if (installmentAmounts.length === 0) {
    return { ...empty, error: INVOICE_MESSAGES.installmentTooSmall };
  }
  const rate = interestCents > 0
    ? monthlyInterestRate(purchasesCents / 100, forwardCents / 100 / draft.installmentCount, draft.installmentCount)
    : null;
  return {
    ...empty,
    carriedForward: forwardCents / 100,
    installmentAmounts,
    interestPercent: interestCents > 0 && purchasesCents > 0 ? (interestCents / purchasesCents) * 100 : null,
    monthlyRatePercent: rate === null ? null : rate * 100,
  };
}

type InvoiceFields = Pick<
  Expense,
  'formaPagamento' | 'cartaoId' | 'invoicePaymentId' | 'invoicePaymentMethod' | 'invoicePaymentInstallments' | 'invoiceMonth' | 'invoiceOriginPaymentId'
>;

/** Despesa no crédito com cartão: é paga pela fatura, nunca sozinha. */
export function isCreditWithCard(expense: Pick<Expense, 'formaPagamento' | 'cartaoId'>): boolean {
  return expense.formaPagamento === INVOICE_EXPENSE_METHOD && expense.cartaoId != null;
}

/** Compra renegociada: paga em parte (parcial) ou parcelada pela fatura. */
export function isRenegotiated(expense: Pick<InvoiceFields, 'invoicePaymentId' | 'invoicePaymentMethod'>): boolean {
  return expense.invoicePaymentId != null
    && (expense.invoicePaymentMethod === 'partial' || expense.invoicePaymentMethod === 'installments');
}

/** Nota da compra renegociada: "Fatura de out/2026 parcelada em 3x" ou "Fatura de out/2026 com pagamento parcial". */
export function renegotiationNote(expense: InvoiceFields): string | null {
  if (!isRenegotiated(expense)) return null;
  const month = expense.invoiceMonth ? ` de ${invoiceMonthLabel(expense.invoiceMonth)}` : '';
  if (expense.invoicePaymentMethod === 'installments') {
    const count = expense.invoicePaymentInstallments ? ` em ${expense.invoicePaymentInstallments}x` : '';
    return `Fatura${month} parcelada${count}`;
  }
  return `Fatura${month} com pagamento parcial`;
}

/** Paga ou renegociada pela fatura, ou gerada por ela: não é cancelada nem excluída. */
export function isInvoiceProtected(expense: Pick<InvoiceFields, 'invoicePaymentId' | 'invoiceOriginPaymentId'>): boolean {
  return expense.invoicePaymentId != null || expense.invoiceOriginPaymentId != null;
}

/**
 * Trava da edição, a mesma do servidor:
 * - `invoice-item`: paga ou renegociada pela fatura — valor, forma, cartão, vencimento e pagamento;
 * - `generated`: restante, parcela ou encargos — valor, forma, cartão e pagamento;
 * - `credit-payment`: no crédito com cartão — só o pagamento (é pela fatura).
 */
export type InvoiceEditLock = 'invoice-item' | 'generated' | 'credit-payment';

export function invoiceEditLock(expense: InvoiceFields): InvoiceEditLock | null {
  if (expense.invoicePaymentId != null) return 'invoice-item';
  if (expense.invoiceOriginPaymentId != null) return 'generated';
  if (isCreditWithCard(expense)) return 'credit-payment';
  return null;
}

/** O botão de pagar de cada linha: no crédito com cartão fica desligado, porque o pagamento é pela fatura. */
export function expensePayButton(expense: Pick<Expense, 'formaPagamento' | 'cartaoId' | 'pago' | 'status'>): { label: string; disabled: boolean } {
  if (expense.status === 'cancelada') return { label: 'Cancelada', disabled: true };
  if (expense.pago) return { label: 'Já pago', disabled: true };
  if (isCreditWithCard(expense)) return { label: INVOICE_MESSAGES.creditPayment, disabled: true };
  return { label: 'Marcar como pago', disabled: false };
}
