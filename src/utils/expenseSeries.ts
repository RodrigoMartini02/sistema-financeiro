// Linhas de uma série de despesa que a edição também muda, para o modal avisar
// quantas são. Mesmas regras do servidor (backend/src/services/expenseSeries.ts):
// - mensal: as próximas ocorrências em aberto (a edição sempre vale para elas);
// - parcelado: as outras parcelas do alcance escolhido, pagas incluídas.
// Canceladas e ligadas a pagamento de fatura nunca mudam.
import type { Expense, ExpenseUpdateScope } from '../types/finance';

type SeriesRow = Pick<
  Expense,
  'id' | 'grupoParcelamentoId' | 'recorrente' | 'parcelado' | 'parcelaAtual' | 'status' | 'pago'
  | 'invoicePaymentId' | 'invoiceOriginPaymentId' | 'dataVencimento'
>;

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
