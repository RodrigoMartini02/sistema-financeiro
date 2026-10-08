// Regras das séries de despesa (mensal e parcelado), sem acesso ao banco: o
// vencimento da fatura pela data de compra, quais linhas da série entram na
// edição e o que muda nelas. Só os campos alterados passam adiante; pagamento,
// anexos e nota fiscal ficam na linha editada, porque são daquele mês (plano
// .plans/recorrente-editar-proximas.md).
// - mensal: a edição sempre vale para as próximas ocorrências em aberto;
// - parcelado: vale para o escopo escolhido (esta e as próximas, ou todas), com
//   as pagas incluídas.
import { addMonthsClamped } from '../utils/date';
import { INVOICE_EXPENSE_METHOD } from './cardInvoiceRules';
import type { ExpenseUpdateScope } from './expenseInput';

export interface InvoiceCardDays {
  closingDay: number;
  dueDay: number;
}

/**
 * Vencimento da fatura em que a compra entra: até o dia de fechamento, a da
 * fatura do mês; depois dele, a seguinte. Vencimento menor ou igual ao
 * fechamento vence no mês seguinte ao fechamento. Mesma regra de
 * invoiceDueDate (src/utils/expenseSchedule.ts), com os mesmos casos de teste.
 */
export function invoiceDueDateForPurchase(purchaseDate: string, card: InvoiceCardDays): string {
  const [year, month, day] = purchaseDate.split('-').map(Number) as [number, number, number];
  const closingOffset = day > card.closingDay ? 1 : 0;
  const dueOffset = card.dueDay <= card.closingDay ? 1 : 0;
  const target = new Date(Date.UTC(year, month - 1 + closingOffset + dueOffset, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(card.dueDay, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Linha da série como está gravada, com o que as regras de escopo usam. */
export interface SeriesOccurrence {
  id: number;
  installmentGroupId: number | null;
  recurring: boolean;
  installment: boolean;
  /** Número da parcela; nulo fora do parcelado. */
  installmentNumber: number | null;
  /** Status vigente (não cancelada). */
  active: boolean;
  paid: boolean;
  invoicePaymentId: number | null;
  invoiceOriginPaymentId: number | null;
  dueDate: string;
  purchaseDate: string | null;
}

/** A linha editada, com o vencimento gravado antes da edição. */
export interface EditedOccurrence {
  id: number;
  installmentGroupId: number | null;
  installmentNumber: number | null;
  dueDate: string;
}

function isOutsideInvoicePayment(row: SeriesOccurrence): boolean {
  return row.invoicePaymentId === null && row.invoiceOriginPaymentId === null;
}

function isSameSeries(row: SeriesOccurrence, edited: EditedOccurrence): boolean {
  return row.id !== edited.id
    && edited.installmentGroupId !== null
    && row.installmentGroupId === edited.installmentGroupId;
}

/**
 * Mensal: próxima em aberto da série — mensal, vigente, não paga, fora de
 * pagamento de fatura e vencendo depois da editada. Paga, cancelada e ligada à
 * fatura ficam como estão.
 */
export function isOpenFollowingOccurrence(row: SeriesOccurrence, edited: EditedOccurrence): boolean {
  return isSameSeries(row, edited)
    && row.recurring
    && row.active
    && !row.paid
    && isOutsideInvoicePayment(row)
    && row.dueDate > edited.dueDate;
}

/** Escopo da edição que alcança outras linhas da série. */
export type SeriesScope = Exclude<ExpenseUpdateScope, 'this'>;

/**
 * Parcelado: parcela da mesma compra no escopo — vigente e fora de pagamento de
 * fatura, paga ou não. `following` são as de número maior que o da editada;
 * `all`, todas as outras.
 */
export function isInstallmentInScope(row: SeriesOccurrence, edited: EditedOccurrence, scope: SeriesScope): boolean {
  if (!isSameSeries(row, edited) || !row.installment || !row.active || !isOutsideInvoicePayment(row)) {
    return false;
  }
  if (scope === 'all') return true;
  return row.installmentNumber !== null
    && edited.installmentNumber !== null
    && row.installmentNumber > edited.installmentNumber;
}

/** Campos da despesa que passam para as outras linhas da série quando mudam. */
export interface SeriesFields {
  description: string;
  categoryId: number | null;
  paymentMethod: string | null;
  cardId: number | null;
  amount: number;
  purchaseDate: string | null;
  dueDate: string;
}

export type SeriesField = keyof SeriesFields;

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Sem data de compra gravada, o modal mostra o vencimento no campo da compra
 * (draftFromExpense): devolver esse mesmo valor não é mudar a data de compra.
 */
function purchaseDateChanged(current: SeriesFields, next: SeriesFields): boolean {
  if (current.purchaseDate === null) return next.purchaseDate !== null && next.purchaseDate !== current.dueDate;
  return current.purchaseDate !== next.purchaseDate;
}

/** O que a edição mudou: só esses campos passam adiante. */
export function changedSeriesFields(current: SeriesFields, next: SeriesFields): Set<SeriesField> {
  const changed = new Set<SeriesField>();
  if (current.description !== next.description) changed.add('description');
  if (current.categoryId !== next.categoryId) changed.add('categoryId');
  if (current.paymentMethod !== next.paymentMethod) changed.add('paymentMethod');
  if (current.cardId !== next.cardId) changed.add('cardId');
  if (toCents(current.amount) !== toCents(next.amount)) changed.add('amount');
  if (purchaseDateChanged(current, next)) changed.add('purchaseDate');
  if (current.dueDate !== next.dueDate) changed.add('dueDate');
  return changed;
}

/** Mudanças de uma linha da série; campo ausente fica como está. */
export interface SeriesRowUpdate {
  id: number;
  description?: string;
  categoryId?: number | null;
  paymentMethod?: string | null;
  cardId?: number | null;
  amount?: number;
  purchaseDate?: string | null;
  dueDate?: string;
}

/** A edição: os campos novos e o vencimento gravado antes dela. */
export interface SeriesEdit {
  originalDueDate: string;
  next: SeriesFields;
}

/** Meses entre o mês de uma data e o de outra ('AAAA-MM-DD'); negativo quando é antes. */
function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number) as [number, number];
  const [toYear, toMonth] = to.split('-').map(Number) as [number, number];
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function scheduleChanged(changed: ReadonlySet<SeriesField>): boolean {
  return changed.has('purchaseDate') || changed.has('dueDate') || changed.has('paymentMethod') || changed.has('cardId');
}

/** Descrição, categoria, forma, cartão e valor: o valor novo, quando mudou. */
function withChangedFields(id: number, changed: ReadonlySet<SeriesField>, next: SeriesFields): SeriesRowUpdate {
  const update: SeriesRowUpdate = { id };
  if (changed.has('description')) update.description = next.description;
  if (changed.has('categoryId')) update.categoryId = next.categoryId;
  if (changed.has('paymentMethod')) update.paymentMethod = next.paymentMethod;
  if (changed.has('cardId')) update.cardId = next.cardId;
  if (changed.has('amount')) update.amount = next.amount;
  return update;
}

/**
 * Mensal: o que muda em cada próxima. A distância de cada uma é contada em
 * meses a partir do vencimento gravado da editada, então um mês pago no meio
 * da série não desloca as outras.
 * - data de compra: a nova, no mês da próxima (o dia 31 cai no último dia);
 * - vencimento, quando mudou data de compra, vencimento, forma ou cartão: no
 *   crédito com cartão e com data de compra, o da fatura do cartão; senão, o
 *   vencimento novo da editada, no mês da próxima.
 * `card` é o cartão do resultado da edição, quando ele é crédito com cartão.
 */
export function planRecurringUpdates(
  edit: SeriesEdit,
  changed: ReadonlySet<SeriesField>,
  following: ReadonlyArray<Pick<SeriesOccurrence, 'id' | 'dueDate' | 'purchaseDate'>>,
  card: InvoiceCardDays | null,
): SeriesRowUpdate[] {
  const { next } = edit;
  const invoiceCard = next.paymentMethod === INVOICE_EXPENSE_METHOD && next.cardId !== null ? card : null;

  return following.map((row) => {
    const offset = monthsBetween(edit.originalDueDate, row.dueDate);
    const update = withChangedFields(row.id, changed, next);
    let purchaseDate = row.purchaseDate;
    if (changed.has('purchaseDate')) {
      purchaseDate = next.purchaseDate === null ? null : addMonthsClamped(next.purchaseDate, offset);
      update.purchaseDate = purchaseDate;
    }
    if (scheduleChanged(changed)) {
      update.dueDate = invoiceCard && purchaseDate !== null
        ? invoiceDueDateForPurchase(purchaseDate, invoiceCard)
        : addMonthsClamped(next.dueDate, offset);
    }
    return update;
  });
}

/**
 * Parcelado: o que muda em cada parcela do escopo.
 * - data de compra: a nova, igual para todas (as parcelas dividem a compra);
 * - vencimento, quando mudou data de compra, vencimento, forma ou cartão: o
 *   vencimento novo da editada, deslocado pela distância em meses (negativa
 *   nas parcelas anteriores, em "Todas").
 */
export function planInstallmentUpdates(
  edit: SeriesEdit,
  changed: ReadonlySet<SeriesField>,
  rows: ReadonlyArray<Pick<SeriesOccurrence, 'id' | 'dueDate'>>,
): SeriesRowUpdate[] {
  const { next } = edit;
  return rows.map((row) => {
    const update = withChangedFields(row.id, changed, next);
    if (changed.has('purchaseDate')) update.purchaseDate = next.purchaseDate;
    if (scheduleChanged(changed)) {
      update.dueDate = addMonthsClamped(next.dueDate, monthsBetween(edit.originalDueDate, row.dueDate));
    }
    return update;
  });
}
