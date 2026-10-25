// Linhas de uma série de despesa que a edição também muda, para o modal avisar
// quantas são. Mesmas regras do servidor (backend/src/services/expenseSeries.ts):
// - mensal: as próximas ocorrências em aberto (a edição sempre vale para elas);
// - parcelado: as outras parcelas do alcance escolhido, pagas incluídas. As pagas
//   recebem o valor, a descrição, a categoria e a data da compra, mas o servidor
//   não muda o vencimento, a forma nem o cartão delas (paidInstallmentsNote).
// Canceladas e ligadas a pagamento de fatura nunca mudam.
import type { Expense, ExpenseUpdateScope } from '../types/finance';
import { formatCurrency } from '../screens/finance/formatters';

type SeriesRow = Pick<
  Expense,
  'id' | 'grupoParcelamentoId' | 'recorrente' | 'parcelado' | 'parcelaAtual' | 'status' | 'pago'
  | 'invoicePaymentId' | 'invoiceOriginPaymentId' | 'dataVencimento'
>;

/** O que as contas de valor e de juros da série leem de cada parcela. */
type SeriesAmountRow = SeriesRow & Pick<Expense, 'valorFinal' | 'valorOriginal' | 'interest'>;

function isSameSeries(row: SeriesRow, expense: SeriesRow): boolean {
  return row.id !== expense.id && expense.grupoParcelamentoId != null && row.grupoParcelamentoId === expense.grupoParcelamentoId;
}

function isOpenForChange(row: SeriesRow): boolean {
  return row.status !== 'cancelada' && row.invoicePaymentId == null && row.invoiceOriginPaymentId == null;
}

/** Mensal: as próximas ocorrências em aberto da série, que a edição sempre muda. */
export function openFollowingOccurrences<T extends SeriesRow>(series: readonly T[], expense: SeriesRow): T[] {
  if (!expense.recorrente) return [];
  return series.filter((row) => isSameSeries(row, expense)
    && row.recorrente
    && !row.pago
    && isOpenForChange(row)
    && row.dataVencimento > expense.dataVencimento);
}

/** Parcelado: as outras parcelas do alcance — as de número maior ("following") ou todas ("all"), pagas incluídas. */
export function installmentScopeRows<T extends SeriesRow>(
  series: readonly T[],
  expense: SeriesRow,
  scope: Exclude<ExpenseUpdateScope, 'this'>,
): T[] {
  if (!expense.parcelado) return [];
  return series.filter((row) => {
    if (!isSameSeries(row, expense) || !row.parcelado || !isOpenForChange(row)) return false;
    if (scope === 'all') return true;
    return row.parcelaAtual != null && expense.parcelaAtual != null && row.parcelaAtual > expense.parcelaAtual;
  });
}

/**
 * Parcelado: o aviso das parcelas já pagas do alcance, que ficam como estão no
 * vencimento, na forma de pagamento e no cartão (regra do servidor, a tela só
 * avisa). Null quando o alcance não tem parcela paga.
 */
export function paidInstallmentsNote(scopeRows: ReadonlyArray<Pick<SeriesRow, 'pago'>>): string | null {
  const paidCount = scopeRows.filter((row) => row.pago).length;
  if (paidCount === 0) return null;
  return paidCount === 1
    ? '1 parcela já paga mantém vencimento, forma e cartão (valor e demais campos mudam).'
    : `${paidCount} parcelas já pagas mantêm vencimento, forma e cartão (valor e demais campos mudam).`;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Valor da parcela como o servidor guarda (valor_original); a linha antiga sem ele vale o valor da linha. */
function rowCents(row: Pick<Expense, 'valorFinal' | 'valorOriginal'>): number {
  return toCents(row.valorOriginal ?? row.valorFinal);
}

/** As parcelas da compra que contam no total: vigentes e não geradas por pagamento de fatura. A editada entra. */
function purchaseInstallments<T extends SeriesAmountRow>(series: readonly T[], expense: T): T[] {
  return [expense, ...series.filter((row) => isSameSeries(row, expense) && row.parcelado && row.status !== 'cancelada' && row.invoiceOriginPaymentId == null)];
}

/** O que a mudança do valor faz na série parcelada, em centavos (o servidor copia o valor novo para todas do alcance). */
export interface SeriesValueImpact {
  newAmountCents: number;
  /** Quantas parcelas passam a valer o valor novo, a editada incluída. */
  changedCount: number;
  oldTotalCents: number;
  newTotalCents: number;
  /** Outras parcelas já pagas que recebem o valor novo (o valor pago delas não muda). */
  paidChanged: number;
  /** Variação das parcelas ainda não pagas: é o que o limite usado do cartão sente. */
  openDeltaCents: number;
}

/**
 * Parcelado: o que a edição do valor muda na série, para o modal avisar. Nada (null) quando o valor não
 * mudou. Mesma regra do servidor: o valor novo vale para a editada e para todas do alcance, pagas incluídas.
 */
export function seriesValueImpact<T extends SeriesAmountRow>(
  series: readonly T[],
  expense: T,
  scope: Exclude<ExpenseUpdateScope, 'this'>,
  newAmount: number,
): SeriesValueImpact | null {
  const newAmountCents = toCents(newAmount);
  if (!expense.parcelado || newAmountCents === rowCents(expense)) return null;
  const inScope = installmentScopeRows(series, expense, scope);
  const changed = new Set<number>([expense.id, ...inScope.map((row) => row.id)]);
  const group = purchaseInstallments(series, expense);
  const changedRows = group.filter((row) => changed.has(row.id));
  return {
    newAmountCents,
    changedCount: changedRows.length,
    oldTotalCents: group.reduce((sum, row) => sum + rowCents(row), 0),
    newTotalCents: group.reduce((sum, row) => sum + (changed.has(row.id) ? newAmountCents : rowCents(row)), 0),
    paidChanged: inScope.filter((row) => row.pago).length,
    openDeltaCents: changedRows.filter((row) => !row.pago).reduce((sum, row) => sum + newAmountCents - rowCents(row), 0),
  };
}

/** Os avisos curtos da edição do valor em série; o limite do cartão só entra no crédito com cartão. */
export function seriesValueNotes(impact: SeriesValueImpact, card: { name: string } | null): string[] {
  const money = (cents: number) => formatCurrency(cents / 100);
  const notes = [
    `${impact.changedCount} ${impact.changedCount === 1 ? 'parcela passa' : 'parcelas passam'} a valer ${money(impact.newAmountCents)} cada: o total da compra vai de ${money(impact.oldTotalCents)} para ${money(impact.newTotalCents)}.`,
  ];
  if (impact.paidChanged > 0) {
    notes.push(
      impact.paidChanged === 1
        ? '1 parcela já paga também muda de valor, mas o valor pago dela continua.'
        : `${impact.paidChanged} parcelas já pagas também mudam de valor, mas o valor pago delas continua.`,
    );
  }
  if (card && impact.openDeltaCents !== 0) {
    const direction = impact.openDeltaCents > 0 ? 'sobe' : 'desce';
    notes.push(`O limite usado do cartão ${card.name} ${direction} ${money(Math.abs(impact.openDeltaCents))}.`);
  }
  return notes;
}

/** O juros que o "À vista" informado na edição deixa nas parcelas, em centavos (a conta do servidor, sem a divisão). */
export interface CashPriceInterestPreview {
  totalCents: number;
  /** Juros da compra inteira: soma das parcelas menos o à vista, nunca negativo. */
  interestCents: number;
  openCount: number;
  /** O que as parcelas abertas passam a guardar: o total menos o das pagas e da fatura, sem passar do valor delas. */
  openInterestCents: number;
}

/**
 * Parcelado, "Todas" com o "À vista" informado: a prévia do juros. Mesma conta do servidor
 * (recalculatedInstallmentInterests): o valor novo da edição vale para as do alcance, a paga e a da fatura
 * mantêm o juros que têm, e só as abertas recebem o resto.
 */
export function cashPriceInterestPreview<T extends SeriesAmountRow>(
  series: readonly T[],
  expense: T,
  newAmount: number,
  cashPriceCents: number,
): CashPriceInterestPreview {
  const amountChanged = toCents(newAmount) !== rowCents(expense);
  const inScope = new Set<number>(installmentScopeRows(series, expense, 'all').map((row) => row.id));
  const rows = purchaseInstallments(series, expense).map((row) => ({
    amountCents: row.id === expense.id || (amountChanged && inScope.has(row.id)) ? toCents(newAmount) : rowCents(row),
    interestCents: toCents(row.interest ?? 0),
    fixed: row.pago || row.invoicePaymentId != null,
  }));
  const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const interestCents = Math.max(0, totalCents - cashPriceInCentsOrZero(cashPriceCents));
  const open = rows.filter((row) => !row.fixed);
  const fixedInterest = rows.filter((row) => row.fixed).reduce((sum, row) => sum + row.interestCents, 0);
  const openSum = open.reduce((sum, row) => sum + row.amountCents, 0);
  return {
    totalCents,
    interestCents,
    openCount: open.length,
    openInterestCents: open.length === 0 ? 0 : Math.min(Math.max(0, interestCents - fixedInterest), openSum),
  };
}

function cashPriceInCentsOrZero(cents: number): number {
  return Number.isFinite(cents) && cents > 0 ? cents : 0;
}

/** O texto da prévia do "À vista" na edição. */
export function cashPriceInterestNote(preview: CashPriceInterestPreview): string {
  const money = (cents: number) => formatCurrency(cents / 100);
  if (preview.openCount === 0) {
    return 'Todas as parcelas estão pagas ou na fatura: o juros delas não muda.';
  }
  if (preview.interestCents === 0) {
    return `Sem juros: o à vista é igual ou maior que o total (${money(preview.totalCents)}). As ${preview.openCount} parcelas abertas ficam sem juros.`;
  }
  const cashCents = preview.totalCents - preview.interestCents;
  const percent = cashCents > 0 ? ` (${((preview.interestCents / cashCents) * 100).toFixed(1).replace('.', ',')}%)` : '';
  const openText = preview.openCount === 1 ? 'A parcela aberta fica' : `As ${preview.openCount} parcelas abertas ficam`;
  return `Juros da compra: ${money(preview.interestCents)}${percent}. ${openText} com ${money(preview.openInterestCents)}; as pagas e as da fatura não mudam.`;
}
