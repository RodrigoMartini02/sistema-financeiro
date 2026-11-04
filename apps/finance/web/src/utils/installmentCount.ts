// Nº de parcelas na edição da compra parcelada e a despesa única que vira parcelada (plano
// .plans/financas-pendencias.md, E4): a conta que o modal mostra antes de salvar. Mesmas regras do servidor
// (backend/src/services/installmentCount.ts): quem decide é o servidor, a tela só avisa e impede o que ele recusaria.
// - Só entra ou sai parcela aberta; a paga e a da fatura ficam (só o rótulo "x/N" muda).
// - Aumentar cria as parcelas de N + 1 até o novo total, com o valor da parcela editada e sem juros.
// - Reduzir apaga a cauda de parcelas abertas; o mínimo é a parcela mais alta que está paga, na fatura ou em edição.
// - A despesa única vira a parcela 1: em aberto, o valor se repete em cada parcela; paga, o valor é o total da compra e
//   o pagamento se divide entre as parcelas (todas pagas na data original, sem mexer no caixa).
import { formatCurrency } from '../screens/finance/formatters';
import type { Expense } from '../types/finance';
import { isCreditWithCard } from './cardInvoice';
import { addMonthsClamped, splitAmountInCents } from './expenseSchedule';
import { installmentScopeRows, rowCents } from './expenseSeries';

export const MIN_INSTALLMENT_COUNT = 2;
export const MAX_INSTALLMENT_COUNT = 360;

type PurchaseRow = Pick<
  Expense,
  'id' | 'grupoParcelamentoId' | 'recorrente' | 'parcelado' | 'parcelaAtual' | 'totalParcelas' | 'status' | 'pago' | 'invoicePaymentId'
  | 'invoiceOriginPaymentId' | 'dataVencimento' | 'valorFinal' | 'valorOriginal' | 'interest'
>;

function toCents(value: number): number {
  return Math.round(value * 100);
}

const isCancelled = (row: Pick<Expense, 'status'>) => row.status === 'cancelada';
const isOpen = (row: Pick<Expense, 'pago' | 'invoicePaymentId'>) => !row.pago && row.invoicePaymentId == null;

/** As parcelas da compra, a editada incluída. As geradas por pagamento de fatura são outra compra. */
function purchaseRows<T extends PurchaseRow>(series: readonly T[], expense: T): T[] {
  return [expense, ...series.filter((row) => row.id !== expense.id
    && expense.grupoParcelamentoId != null
    && row.grupoParcelamentoId === expense.grupoParcelamentoId
    && row.parcelado
    && row.invoiceOriginPaymentId == null)];
}

/** O total gravado: o maior entre o "N" de "x/N" e o número mais alto que existe. */
function currentTotal(rows: readonly PurchaseRow[], expense: PurchaseRow): number {
  return Math.max(expense.totalParcelas ?? 0, ...rows.map((row) => row.parcelaAtual ?? 0));
}

/** O nº de parcelas da compra hoje ("5" de "3/5"), com a numeração das linhas que existem. */
export function purchaseInstallmentCount<T extends PurchaseRow>(series: readonly T[], expense: T): number {
  return currentTotal(purchaseRows(series, expense), expense);
}

/** O que impede reduzir mais: a parcela mais alta que está paga, na fatura ou em edição. */
export interface ReductionBlock {
  minimum: number;
  reason: string;
}

export function reductionBlock<T extends PurchaseRow>(series: readonly T[], expense: T): ReductionBlock | null {
  const blocked = purchaseRows(series, expense)
    .filter((row) => row.parcelaAtual != null && (row.pago || row.invoicePaymentId != null || row.id === expense.id));
  if (blocked.length === 0) return null;
  const highest = blocked.reduce((best, row) => (row.parcelaAtual! > best.parcelaAtual! ? row : best));
  const reason = highest.id === expense.id
    ? 'é a que você está editando'
    : highest.invoicePaymentId != null ? 'está numa fatura do cartão' : 'já foi paga';
  return { minimum: highest.parcelaAtual!, reason };
}

/** O menor nº de parcelas que o servidor aceita agora. */
export function minimumInstallmentCount<T extends PurchaseRow>(series: readonly T[], expense: T): number {
  return Math.max(MIN_INSTALLMENT_COUNT, reductionBlock(series, expense)?.minimum ?? MIN_INSTALLMENT_COUNT);
}

/** O que o novo nº de parcelas faz na compra, em centavos e números de parcela. */
export interface InstallmentCountPreview {
  kind: 'create' | 'delete';
  currentCount: number;
  nextCount: number;
  /** Números das parcelas criadas ou apagadas. */
  numbers: number[];
  /** Total da compra com o novo nº de parcelas e o valor novo da parcela (as não canceladas). */
  newTotalCents: number;
  /** O que o limite usado do cartão sente: as parcelas abertas depois menos as de antes (valor novo incluído). */
  openDeltaCents: number;
  /** Juros guardado nas parcelas que saem. */
  deletedInterestCents: number;
  /** A compra tem juros guardado em alguma parcela. */
  hasInterest: boolean;
}

/**
 * Prévia da compra parcelada com "Todas": as parcelas que entram ou saem. Nulo quando o nº não muda ou quando a
 * redução não é aceita (abaixo do mínimo). `amount` é o valor da parcela na edição: vale para a editada, para as do
 * alcance "Todas" e para as novas.
 */
export function previewInstallmentCount<T extends PurchaseRow>(
  series: readonly T[],
  expense: T,
  nextCount: number,
  amount: number,
): InstallmentCountPreview | null {
  const rows = purchaseRows(series, expense);
  const total = currentTotal(rows, expense);
  if (!Number.isInteger(nextCount) || nextCount < MIN_INSTALLMENT_COUNT || nextCount > MAX_INSTALLMENT_COUNT || nextCount === total) return null;

  const newAmountCents = toCents(amount);
  const inScope = new Set<number>(installmentScopeRows(series, expense, 'all').map((row) => row.id));
  const valueAfterEdit = (row: T) => (row.id === expense.id || inScope.has(row.id) ? newAmountCents : rowCents(row));
  const counts = (row: T) => !isCancelled(row);
  const sum = (list: readonly T[], value: (row: T) => number) => list.filter(counts).reduce((acc, row) => acc + value(row), 0);
  const openBefore = sum(rows.filter(isOpen), rowCents);
  const hasInterest = rows.some((row) => (row.interest ?? 0) > 0);

  if (nextCount > total) {
    const created = nextCount - total;
    return {
      kind: 'create',
      currentCount: total,
      nextCount,
      numbers: Array.from({ length: created }, (_, index) => total + index + 1),
      newTotalCents: sum(rows, valueAfterEdit) + created * newAmountCents,
      openDeltaCents: sum(rows.filter(isOpen), valueAfterEdit) + created * newAmountCents - openBefore,
      deletedInterestCents: 0,
      hasInterest,
    };
  }

  const tail = rows.filter((row) => row.parcelaAtual != null && row.parcelaAtual > nextCount);
  if (tail.some((row) => row.pago || row.invoicePaymentId != null || row.id === expense.id)) return null;
  const kept = rows.filter((row) => !tail.includes(row));
  return {
    kind: 'delete',
    currentCount: total,
    nextCount,
    numbers: tail.map((row) => row.parcelaAtual!).sort((a, b) => a - b),
    newTotalCents: sum(kept, valueAfterEdit),
    openDeltaCents: sum(kept.filter(isOpen), valueAfterEdit) - openBefore,
    deletedInterestCents: tail.reduce((acc, row) => acc + toCents(row.interest ?? 0), 0),
    hasInterest,
  };
}

/**
 * Como o valor da despesa única passa às parcelas: `perInstallment` repete o valor em cada parcela (a compra cresce);
 * `total` divide o valor entre elas, com o resto na última (a compra e o pagamento continuam os mesmos).
 */
export type SingleInstallmentsMode = 'total' | 'perInstallment';

/** Despesa única que vira a parcela 1: as parcelas 2 a N vencem mês a mês a partir do vencimento. */
export interface SingleInstallmentsPreview {
  count: number;
  mode: SingleInstallmentsMode;
  /** Vencimento da última parcela, 'AAAA-MM-DD'. */
  lastDueDate: string;
  /** O valor de cada parcela, em centavos. */
  amountsCents: number[];
  newTotalCents: number;
}

export function previewSingleInstallments(
  dueDate: string,
  count: number,
  amount: number,
  mode: SingleInstallmentsMode = 'perInstallment',
): SingleInstallmentsPreview | null {
  if (!Number.isInteger(count) || count < MIN_INSTALLMENT_COUNT || count > MAX_INSTALLMENT_COUNT) return null;
  const amountCents = toCents(amount);
  // Dividir R$ 0,02 em 3 deixaria parcela sem valor: o servidor recusa.
  if (mode === 'total' && amountCents < count) return null;
  const amountsCents = mode === 'total' ? splitAmountInCents(amountCents, count) : Array.from({ length: count }, () => amountCents);
  return {
    count,
    mode,
    lastDueDate: addMonthsClamped(dueDate, count - 1),
    amountsCents,
    newTotalCents: amountsCents.reduce((sum, cents) => sum + cents, 0),
  };
}

/**
 * A despesa única que o modal oferece parcelar: fora de fatura, sem grupo, que não é recorrente nem cancelada.
 * A paga também (o valor vira o total da compra e o pagamento se divide); fica de fora a paga no crédito com cartão,
 * porque o pagamento dela é feito pela fatura.
 */
export function canBecomeInstallments(
  expense: Pick<
    Expense,
    'parcelado' | 'recorrente' | 'pago' | 'status' | 'invoicePaymentId' | 'invoiceOriginPaymentId' | 'grupoParcelamentoId' | 'formaPagamento' | 'cartaoId'
  >,
): boolean {
  return !expense.parcelado
    && !expense.recorrente
    && !(expense.pago && isCreditWithCard(expense))
    && expense.status !== 'cancelada'
    && expense.invoicePaymentId == null
    && expense.invoiceOriginPaymentId == null
    && expense.grupoParcelamentoId == null;
}

const money = (cents: number) => formatCurrency(cents / 100);

/** "6/8", "6/8 e 7/8" ou "6/8 a 9/8": os números das parcelas como o "x/N" da lista. */
function labelsText(numbers: readonly number[], count: number): string {
  const label = (number: number) => `${number}/${count}`;
  if (numbers.length === 1) return label(numbers[0]!);
  if (numbers.length === 2) return `${label(numbers[0]!)} e ${label(numbers[1]!)}`;
  return `${label(numbers[0]!)} a ${label(numbers[numbers.length - 1]!)}`;
}

/** Os avisos do novo nº de parcelas da compra parcelada. O limite do cartão só entra no crédito com cartão. */
export function installmentCountNotes(
  preview: InstallmentCountPreview,
  amount: number,
  card: { name: string } | null,
): string[] {
  const notes: string[] = [];
  const amountText = money(toCents(amount));
  if (preview.kind === 'create') {
    const single = preview.numbers.length === 1;
    notes.push(
      `Cria ${single ? 'a parcela' : 'as parcelas'} ${labelsText(preview.numbers, preview.nextCount)}, de ${amountText} cada, em aberto e sem juros.`,
    );
    if (preview.hasInterest) notes.push('As parcelas novas não têm juros: informe o "À vista" abaixo para refazer o juros da compra.');
  } else {
    const single = preview.numbers.length === 1;
    const interest = preview.deletedInterestCents > 0 ? ` O juros delas (${money(preview.deletedInterestCents)}) sai junto.` : '';
    notes.push(
      `Apaga ${single ? 'a parcela' : 'as parcelas'} ${labelsText(preview.numbers, preview.currentCount)}, em aberto.${interest} Para voltar atrás, aumente o nº de parcelas: elas voltam sem anexos e sem juros.`,
    );
  }
  notes.push(`Com o novo nº de parcelas, o total da compra fica em ${money(preview.newTotalCents)}.`);
  if (card && preview.openDeltaCents !== 0) {
    notes.push(`O limite usado do cartão ${card.name} ${preview.openDeltaCents > 0 ? 'sobe' : 'desce'} ${money(Math.abs(preview.openDeltaCents))}.`);
  }
  return notes;
}

/**
 * Por que a despesa única não vira parcelada neste salvamento, ou nulo. O servidor parcela com o pagamento que já
 * está gravado: quem marcou ou desmarcou "paga" na mesma edição precisa salvar isso antes.
 */
export function singleSplitBlock(saved: Pick<Expense, 'pago'>, edited: { paid: boolean }): string | null {
  return saved.pago !== edited.paid ? 'Salve a mudança do pagamento antes de parcelar a despesa.' : null;
}

/** O pagamento da despesa paga que vira parcelada, como a edição o deixou. */
export interface SinglePaymentInfo {
  /** Valor pago, em centavos. */
  paidCents: number;
  /** Data real do pagamento, 'AAAA-MM-DD'. */
  paymentDate: string;
}

/** O aviso da despesa única que vira parcelada; com `payment`, o da paga, que reparte o pagamento entre as parcelas. */
export function singleInstallmentsNotes(
  preview: SingleInstallmentsPreview,
  card: { name: string } | null,
  payment: SinglePaymentInfo | null = null,
): string[] {
  const { count, amountsCents } = preview;
  const first = amountsCents[0]!;
  const last = amountsCents[count - 1]!;
  const others = count - 1 === 1 ? 'a parcela 2 é criada' : `as parcelas 2 a ${count} são criadas`;
  const until = `uma por mês, até ${lastDateText(preview.lastDueDate)}`;
  const notes: string[] = [];
  if (preview.mode === 'total') {
    const each = first === last ? `${money(first)} cada` : `${money(first)} cada, a última de ${money(last)}`;
    notes.push(
      `A despesa de ${money(preview.newTotalCents)} é dividida em ${count} parcelas de ${each}, ${until}: ela vira a parcela 1/${count} e ${others}. O total da compra continua ${money(preview.newTotalCents)}.`,
    );
  } else {
    notes.push(
      `A despesa vira a parcela 1/${count} e ${others}, de ${money(first)} cada, ${until}. O total da compra passa a ser ${money(preview.newTotalCents)}.`,
    );
  }
  if (payment) {
    notes.push(
      `O pagamento de ${money(payment.paidCents)} é dividido entre as parcelas, todas pagas em ${lastDateText(payment.paymentDate)}: o caixa não passa para os meses seguintes.`,
    );
  }
  const added = preview.mode === 'total' ? 0 : preview.newTotalCents - first;
  if (card && added > 0) notes.push(`O limite usado do cartão ${card.name} sobe ${money(added)}.`);
  return notes;
}

function lastDateText(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
