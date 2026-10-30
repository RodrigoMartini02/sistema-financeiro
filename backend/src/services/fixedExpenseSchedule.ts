import { addMonthsClamped, countMonthsUntil } from '../utils/date';
import { invoiceDueDateForPurchase, type InvoiceCardDays } from './expenseSeries';

export interface FixedScheduleSource {
  firstMonth: string;
  purchaseDate: string;
  dueDate: string;
  paymentMethod: string;
}

export interface FixedOccurrenceDates {
  competence: string;
  purchaseDate: string;
  dueDate: string;
}

/** Identidade mensal é estável; vencimento e data de caixa podem mudar depois. */
export function fixedExpenseDates(source: FixedScheduleSource, competence: string, card: InvoiceCardDays | null): FixedOccurrenceDates {
  const [year, month] = competence.split('-').map(Number);
  // O ciclo escolhido pode vencer na fatura do mês seguinte. A primeira
  // ocorrência preserva ambas as datas informadas, sem retroceder a compra.
  const offset = countMonthsUntil(`${source.firstMonth.slice(0, 7)}-01`, month! - 1, year!);
  const purchaseDate = addMonthsClamped(source.purchaseDate, offset);
  const dueDate = source.paymentMethod === 'credito' && card && offset !== 0
    ? invoiceDueDateForPurchase(purchaseDate, card)
    : addMonthsClamped(source.dueDate, offset);
  return { competence: `${competence.slice(0, 7)}-01`, purchaseDate, dueDate };
}

export function fixedExpenseYearDates(source: FixedScheduleSource, year: number, card: InvoiceCardDays | null): FixedOccurrenceDates[] {
  const firstYear = Number(source.firstMonth.slice(0, 4));
  if (year < firstYear) return [];
  const start = year === firstYear ? Number(source.firstMonth.slice(5, 7)) : 1;
  return Array.from({ length: 13 - start }, (_, index) => {
    const competence = `${year}-${String(start + index).padStart(2, '0')}-01`;
    return fixedExpenseDates(source, competence, card);
  });
}

export function fixedConversionRefusal(row: {
  status: string; fixedExpenseId: number | null; installment: boolean | null; recurring: boolean | null;
  installmentGroupId: number | null; sourceIncomeId: number | null; invoiceOriginPaymentId: number | null;
}): string | null {
  if (row.fixedExpenseId !== null) return 'Esta despesa já pertence a uma fixa';
  if (row.status !== 'ativa') return 'Escolha uma despesa ativa para criar a fixa';
  if (row.installment || row.recurring || row.installmentGroupId !== null || row.sourceIncomeId !== null || row.invoiceOriginPaymentId !== null) {
    return 'Somente uma despesa única comum pode originar uma fixa';
  }
  return null;
}
