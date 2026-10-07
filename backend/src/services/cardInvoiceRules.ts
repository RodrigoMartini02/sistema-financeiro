// Regras do pagamento da fatura do cartão, sem acesso ao banco: o cálculo das
// três formas (total, parcial e parcelado), a parte de cada compra, os juros
// que passam de uma renegociação para a seguinte, os vencimentos das linhas
// geradas, as recusas e as travas. O serviço (cardInvoiceService) e as rotas
// de despesa usam estas regras.
import { addMonthsClamped } from '../utils/date';
import { MAX_AMOUNT } from '../utils/requestInput';
import { moveDueDateToDay } from './cardDueDate';
import type { InvoicePaymentInput } from './cardInvoiceInput';
import { splitInstallments } from './contractSchedule';
import type { PaymentMethod } from './expenseInput';

/** Só a despesa nesta forma, com cartão, entra na fatura. */
export const INVOICE_EXPENSE_METHOD: PaymentMethod = 'credito';

export const INVOICE_MESSAGES = {
  empty: 'Esta fatura não tem valor em aberto.',
  totalBelowPurchases: 'O valor pago é menor que a soma das compras: use o pagamento parcial ou confira os lançamentos.',
  partialOutOfRange: 'O pagamento parcial precisa ser maior que zero e menor que a soma das compras.',
  installmentTooSmall: 'Cada parcela precisa ter pelo menos R$ 0,01.',
  aboveLimit: 'Valor acima do limite permitido',
  undoBlocked: 'Uma parte desta renegociação já foi paga numa fatura seguinte. Desfaça aquele pagamento antes.',
  lockedRow: 'Esta despesa faz parte de um pagamento de fatura. Para mudar, desfaça o pagamento da fatura.',
  creditPayment: 'Despesa no crédito é paga pela fatura do cartão.',
} as const;

const MONTH_ABBREVIATIONS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;
const MAX_DESCRIPTION_LENGTH = 255;

function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

/** 'AAAA-MM-01' → 'out/2026'. */
export function invoiceMonthLabel(invoiceMonthStart: string): string {
  const [year, month] = invoiceMonthStart.split('-').map(Number) as [number, number];
  return `${MONTH_ABBREVIATIONS[month - 1]}/${year}`;
}

/** Vencimento no dia do cartão, `offset` meses depois do mês da fatura; 31 cai no último dia do mês. */
export function invoiceDueDate(invoiceMonthStart: string, dueDay: number, offset: number): string {
  return moveDueDateToDay(addMonthsClamped(invoiceMonthStart, offset), dueDay);
}

/** Último dia do mês da fatura ('AAAA-MM-01' → 'AAAA-MM-31'), para o intervalo das compras. */
export function invoiceMonthEnd(invoiceMonthStart: string): string {
  return moveDueDateToDay(invoiceMonthStart, 31);
}

export type GeneratedRowKind = 'charges' | 'remainder' | 'installment';

/** Descrição das linhas que o pagamento gera, até o limite da coluna. */
export function generatedDescription(kind: GeneratedRowKind, invoiceMonthStart: string, cardName: string): string {
  const label = invoiceMonthLabel(invoiceMonthStart);
  const prefix = {
    charges: `Encargos da fatura de ${label}`,
    remainder: `Restante da fatura de ${label}`,
    installment: `Parcelamento da fatura de ${label}`,
  }[kind];
  return `${prefix} — ${cardName}`.slice(0, MAX_DESCRIPTION_LENGTH);
}

/** Compra em aberto da fatura. */
export interface InvoiceItem {
  expenseId: number;
  amount: number;
  /** Juros contidos no valor (restante ou parcela de uma renegociação anterior); nulo nas compras. */
  invoiceInterest: number | null;
}

export interface InvoiceCard {
  name: string;
  dueDay: number;
}

export type InvoicePaymentTerms = Pick<InvoicePaymentInput, 'method' | 'amountPaid' | 'interestAmount' | 'installmentCount'>;

export interface PlannedPurchase {
  expenseId: number;
  /** O que a compra passa a contar como pago: o valor todo, a parte proporcional ou 0. */
  paidAmount: number;
}

export interface PlannedGeneratedRow {
  kind: GeneratedRowKind;
  description: string;
  dueDate: string;
  amount: number;
  interestAmount: number;
  /** Só os encargos do pagamento total já nascem pagos. */
  paid: boolean;
  installmentNumber: number | null;
  installmentCount: number | null;
}

export interface InvoicePaymentPlan {
  purchasesAmount: number;
  paidAmount: number;
  chargesAmount: number;
  interestAmount: number;
  carriedInterest: number;
  carriedForward: number;
  installmentCount: number | null;
  installmentAmount: number | null;
  purchases: PlannedPurchase[];
  generated: PlannedGeneratedRow[];
}

export interface InvoiceRefusal {
  message: string;
  status: 400 | 409;
}

/** Motivo para recusar o pagamento, ou null quando ele pode seguir. */
export function invoicePaymentRefusal(items: InvoiceItem[], terms: InvoicePaymentTerms): InvoiceRefusal | null {
  if (items.length === 0) {
    return { message: INVOICE_MESSAGES.empty, status: 409 };
  }
  const purchasesCents = items.reduce((sum, item) => sum + toCents(item.amount), 0);
  const interestCents = toCents(terms.interestAmount);
  if (terms.method === 'total') {
    if (toCents(terms.amountPaid ?? 0) < purchasesCents) {
      return { message: INVOICE_MESSAGES.totalBelowPurchases, status: 400 };
    }
    return null;
  }
  if (terms.method === 'partial') {
    const paidCents = toCents(terms.amountPaid ?? 0);
    if (paidCents <= 0 || paidCents >= purchasesCents) {
      return { message: INVOICE_MESSAGES.partialOutOfRange, status: 400 };
    }
    if (purchasesCents - paidCents + interestCents > toCents(MAX_AMOUNT)) {
      return { message: INVOICE_MESSAGES.aboveLimit, status: 400 };
    }
    return null;
  }
  const forwardCents = purchasesCents + interestCents;
  if (forwardCents > toCents(MAX_AMOUNT)) {
    return { message: INVOICE_MESSAGES.aboveLimit, status: 400 };
  }
  if (forwardCents < (terms.installmentCount ?? 0)) {
    return { message: INVOICE_MESSAGES.installmentTooSmall, status: 400 };
  }
  return null;
}

/**
 * Parte de cada compra num pagamento parcial: proporcional ao valor dela, em
 * centavos exatos (a soma das partes é o valor pago). Os centavos que sobram do
 * arredondamento vão, um a um, para as maiores sobras; no empate, para o menor id.
 */
export function proportionalShares(items: InvoiceItem[], paidCents: number): Map<number, number> {
  // BigInt no produto: pago × valor em centavos passa do limite seguro do Number com valores grandes.
  const purchasesCents = BigInt(items.reduce((sum, item) => sum + toCents(item.amount), 0));
  const parts = items.map((item) => {
    const exact = BigInt(paidCents) * BigInt(toCents(item.amount));
    return { expenseId: item.expenseId, cents: Number(exact / purchasesCents), remainder: exact % purchasesCents };
  });
  let leftover = paidCents - parts.reduce((sum, part) => sum + part.cents, 0);
  const byRemainder = [...parts].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.expenseId - right.expenseId;
  });
  for (const part of byRemainder) {
    if (leftover <= 0) break;
    part.cents += 1;
    leftover -= 1;
  }
  return new Map(parts.map((part) => [part.expenseId, part.cents]));
}

/**
 * Juros que não foram pagos e seguem para as linhas novas: de cada linha com
 * juros (restante ou parcela de uma renegociação anterior), a parte que ficou
 * sem pagar, na mesma proporção do valor. Assim nenhum juro se perde nem conta
 * duas vezes.
 */
export function carriedInterestCents(items: InvoiceItem[], paidCentsById: Map<number, number>): number {
  let carried = 0;
  for (const item of items) {
    const interestCents = toCents(item.invoiceInterest ?? 0);
    const amountCents = toCents(item.amount);
    if (interestCents <= 0 || amountCents <= 0) continue;
    const paidCents = paidCentsById.get(item.expenseId) ?? 0;
    const paidInterest = Math.round((interestCents * paidCents) / amountCents);
    carried += interestCents - paidInterest;
  }
  return carried;
}

/** Juros por parcela: partes iguais, com o resto na última, sem passar do valor de cada parcela. */
function splitInterestWithinInstallments(interestCents: number, amountsInCents: number[]): number[] {
  const interests = splitInstallments(fromCents(interestCents), amountsInCents.length).map(toCents);
  let excess = 0;
  for (let index = interests.length - 1; index >= 0; index -= 1) {
    const wanted = interests[index]! + excess;
    const fitted = Math.min(wanted, amountsInCents[index]!);
    interests[index] = fitted;
    excess = wanted - fitted;
  }
  return interests;
}

/**
 * O pagamento calculado. Supõe que invoicePaymentRefusal já passou.
 * - total: as compras ficam pagas pelo próprio valor; o que passar da soma vira
 *   "Encargos da fatura", já paga, toda ela juros;
 * - parcial: as compras ficam pagas pela parte proporcional do valor pago; o
 *   restante + juros vira "Restante da fatura" no mês seguinte;
 * - parcelado: as compras ficam com 0; a soma + juros vira N parcelas, a partir
 *   do mês seguinte, com os centavos que sobram na última.
 */
export function computeInvoicePayment(
  items: InvoiceItem[],
  terms: InvoicePaymentTerms,
  invoiceMonthStart: string,
  card: InvoiceCard,
): InvoicePaymentPlan {
  const purchasesCents = items.reduce((sum, item) => sum + toCents(item.amount), 0);
  const interestCents = toCents(terms.interestAmount);

  if (terms.method === 'total') {
    const paidCents = toCents(terms.amountPaid ?? 0);
    const chargesCents = paidCents - purchasesCents;
    const generated: PlannedGeneratedRow[] = chargesCents > 0
      ? [{
          kind: 'charges',
          description: generatedDescription('charges', invoiceMonthStart, card.name),
          dueDate: invoiceDueDate(invoiceMonthStart, card.dueDay, 0),
          amount: fromCents(chargesCents),
          interestAmount: fromCents(chargesCents),
          paid: true,
          installmentNumber: null,
          installmentCount: null,
        }]
      : [];
    return {
      purchasesAmount: fromCents(purchasesCents),
      paidAmount: fromCents(paidCents),
      chargesAmount: fromCents(chargesCents),
      interestAmount: 0,
      carriedInterest: 0,
      carriedForward: 0,
      installmentCount: null,
      installmentAmount: null,
      purchases: items.map((item) => ({ expenseId: item.expenseId, paidAmount: item.amount })),
      generated,
    };
  }

  if (terms.method === 'partial') {
    const paidCents = toCents(terms.amountPaid ?? 0);
    const shares = proportionalShares(items, paidCents);
    const carriedCents = carriedInterestCents(items, shares);
    const forwardCents = purchasesCents - paidCents + interestCents;
    return {
      purchasesAmount: fromCents(purchasesCents),
      paidAmount: fromCents(paidCents),
      chargesAmount: 0,
      interestAmount: fromCents(interestCents),
      carriedInterest: fromCents(carriedCents),
      carriedForward: fromCents(forwardCents),
      installmentCount: null,
      installmentAmount: null,
      purchases: items.map((item) => ({ expenseId: item.expenseId, paidAmount: fromCents(shares.get(item.expenseId) ?? 0) })),
      generated: [{
        kind: 'remainder',
        description: generatedDescription('remainder', invoiceMonthStart, card.name),
        dueDate: invoiceDueDate(invoiceMonthStart, card.dueDay, 1),
        amount: fromCents(forwardCents),
        interestAmount: fromCents(Math.min(interestCents + carriedCents, forwardCents)),
        paid: false,
        installmentNumber: null,
        installmentCount: null,
      }],
    };
  }

  const count = terms.installmentCount ?? 0;
  const carriedCents = carriedInterestCents(items, new Map());
  const forwardCents = purchasesCents + interestCents;
  const amounts = splitInstallments(fromCents(forwardCents), count).map(toCents);
  const interests = splitInterestWithinInstallments(interestCents + carriedCents, amounts);
  return {
    purchasesAmount: fromCents(purchasesCents),
    paidAmount: 0,
    chargesAmount: 0,
    interestAmount: fromCents(interestCents),
    carriedInterest: fromCents(carriedCents),
    carriedForward: fromCents(forwardCents),
    installmentCount: count,
    installmentAmount: fromCents(amounts[0] ?? 0),
    purchases: items.map((item) => ({ expenseId: item.expenseId, paidAmount: 0 })),
    generated: amounts.map((amountCents, index) => ({
      kind: 'installment',
      description: generatedDescription('installment', invoiceMonthStart, card.name),
      dueDate: invoiceDueDate(invoiceMonthStart, card.dueDay, index + 1),
      amount: fromCents(amountCents),
      interestAmount: fromCents(interests[index] ?? 0),
      paid: false,
      installmentNumber: index + 1,
      installmentCount: count,
    })),
  };
}

/** Linha ligada ao pagamento da fatura (paga ou renegociada por ele) ou gerada por ele. */
export interface InvoiceLinkFields {
  invoicePaymentId: number | null;
  invoiceOriginPaymentId: number | null;
}

/** Compra paga ou renegociada pela fatura e linha gerada: não são canceladas nem excluídas. */
export function isInvoiceProtected(row: InvoiceLinkFields): boolean {
  return row.invoicePaymentId !== null || row.invoiceOriginPaymentId !== null;
}

/** Despesa no crédito com cartão: é paga pela fatura, nunca sozinha. */
export function isCreditWithCard(row: { paymentMethod: string | null; cardId: number | null }): boolean {
  return row.paymentMethod === INVOICE_EXPENSE_METHOD && row.cardId !== null;
}

/**
 * Trava da edição:
 * - `invoice-item`: paga ou renegociada pela fatura (inclusive os encargos) —
 *   valor, forma, cartão, vencimento e pagamento travados;
 * - `generated`: restante ou parcela gerada — valor, forma e cartão travados.
 */
export type InvoiceEditLock = 'invoice-item' | 'generated';

export function invoiceEditLockOf(row: InvoiceLinkFields): InvoiceEditLock | null {
  if (row.invoicePaymentId !== null) return 'invoice-item';
  if (row.invoiceOriginPaymentId !== null) return 'generated';
  return null;
}

/** Valores da despesa que as travas comparam: os gravados e os que a edição mandaria gravar. */
export interface LockableExpenseFields {
  amount: number;
  dueDate: string;
  paymentMethod: string | null;
  cardId: number | null;
  paid: boolean;
  paymentDate: string | null;
  amountPaid: number | null;
}

/** O que a edição grava no pagamento: a mesma regra de resolvePayment (expenseService) fora do pagamento automático. */
function resolvedPayment(fields: LockableExpenseFields): Pick<LockableExpenseFields, 'paid' | 'paymentDate' | 'amountPaid'> {
  if (!fields.paid) {
    return { paid: false, paymentDate: null, amountPaid: null };
  }
  return { paid: true, paymentDate: fields.paymentDate ?? fields.dueDate, amountPaid: fields.amountPaid ?? fields.amount };
}

function sameCents(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return toCents(left) === toCents(right);
}

/**
 * Compara o pagamento gravado com o que a edição gravaria, os dois completados
 * pela mesma regra: no pagamento antigo, gravado com o valor pago em branco,
 * vale o valor da despesa.
 */
function paymentChanged(current: LockableExpenseFields, next: LockableExpenseFields): boolean {
  const currentPayment = resolvedPayment(current);
  const nextPayment = resolvedPayment(next);
  return currentPayment.paid !== nextPayment.paid
    || currentPayment.paymentDate !== nextPayment.paymentDate
    || !sameCents(currentPayment.amountPaid, nextPayment.amountPaid);
}

/**
 * Motivo para recusar a edição, ou null. Além das travas da fatura, no crédito
 * com cartão o pagamento não muda pela edição (nem marcar, nem desmarcar).
 */
export function invoiceEditRefusal(
  lock: InvoiceEditLock | null,
  current: LockableExpenseFields,
  next: LockableExpenseFields,
): string | null {
  if (lock !== null) {
    const valueOrMethodChanged = !sameCents(current.amount, next.amount)
      || current.paymentMethod !== next.paymentMethod
      || current.cardId !== next.cardId;
    if (valueOrMethodChanged) return INVOICE_MESSAGES.lockedRow;
    if (lock === 'invoice-item' && (current.dueDate !== next.dueDate || paymentChanged(current, next))) {
      return INVOICE_MESSAGES.lockedRow;
    }
  }
  if ((isCreditWithCard(current) || isCreditWithCard(next)) && paymentChanged(current, next)) {
    return INVOICE_MESSAGES.creditPayment;
  }
  return null;
}

/** Linha gerada por um pagamento, para conferir se ele ainda pode ser desfeito. */
export interface GeneratedRowState {
  paid: boolean;
  invoicePaymentId: number | null;
}

/** Desfazer é recusado se alguma linha gerada já foi paga por outro pagamento (a fatura seguinte). */
export function undoRefusal(paymentId: number, generatedRows: GeneratedRowState[]): string | null {
  const paidElsewhere = generatedRows.some((row) => row.paid && row.invoicePaymentId !== paymentId);
  return paidElsewhere ? INVOICE_MESSAGES.undoBlocked : null;
}
