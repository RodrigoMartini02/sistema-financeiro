// A data em que um lançamento conta nos meses (regime de caixa) — o espelho de
// backend/src/services/cashDate.ts, com os mesmos casos de teste: a despesa paga conta no dia do
// pagamento; a em aberto (e a cancelada), no vencimento; a receita, no dia do recebimento.
import type { Expense } from '../types/finance';

type CashDateFields = Pick<Expense, 'pago' | 'status' | 'dataPagamento' | 'dataVencimento'>;

/** O dia em que a despesa conta ('AAAA-MM-DD'): o do pagamento, se paga; senão o vencimento. */
export function expenseCashDate(expense: CashDateFields): string {
  const dueDate = expense.dataVencimento.slice(0, 10);
  if (!expense.pago || expense.status === 'cancelada' || !expense.dataPagamento) return dueDate;
  return expense.dataPagamento.slice(0, 10);
}

/**
 * A data do recebimento quando a confirmação não escolhe outra: a prevista, se é do mês atual;
 * senão, hoje. A confirmação não cai sozinha num mês que já fechou.
 */
export function defaultReceiptDate(plannedDate: string, today: string): string {
  return plannedDate.slice(0, 7) === today.slice(0, 7) ? plannedDate.slice(0, 10) : today;
}
