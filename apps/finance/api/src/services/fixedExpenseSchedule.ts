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
  let dueDate = addMonthsClamped(source.dueDate, offset);
  if (source.paymentMethod === 'credito' && card && offset !== 0) {
    const firstInvoice = invoiceDueDateForPurchase(source.purchaseDate, card);
    const monthShift = countMonthsUntil(firstInvoice, Number(source.dueDate.slice(5, 7)) - 1, Number(source.dueDate.slice(0, 4)));
    dueDate = addMonthsClamped(invoiceDueDateForPurchase(purchaseDate, card), monthShift);
  }
  return { competence: `${competence.slice(0, 7)}-01`, purchaseDate, dueDate };
}

export function fixedExpenseRangeDates(source: FixedScheduleSource, endMonth: string, card: InvoiceCardDays | null): FixedOccurrenceDates[] {
  const start = `${source.firstMonth.slice(0, 7)}-01`;
  const [endYear, endNumber] = endMonth.split('-').map(Number);
  const count = countMonthsUntil(source.dueDate, endNumber! - 1, endYear!) + 2;
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, offset) => fixedExpenseDates(source, addMonthsClamped(start, offset), card))
    .filter(item => item.dueDate.slice(0, 7) <= endMonth);
}

export function fixedConversionRefusal(row: {
  status: string; fixedExpenseId: number | null; installment: boolean | null; recurring: boolean | null;
  installmentGroupId: number | null; sourceIncomeId: number | null; invoiceOriginPaymentId: number | null;
  invoicePaymentId?: number | null;
}): string | null {
  if (row.fixedExpenseId !== null) return 'Esta despesa já pertence a uma fixa';
  if (row.status !== 'ativa') return 'Escolha uma despesa ativa para criar a fixa';
  if (row.installment || row.recurring || row.installmentGroupId !== null || row.sourceIncomeId !== null || row.invoiceOriginPaymentId !== null || row.invoicePaymentId != null) {
    return 'Somente uma despesa única comum pode originar uma fixa';
  }
  return null;
}
