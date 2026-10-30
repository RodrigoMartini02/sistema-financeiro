// Quando a despesa conta nas somas — mesma regra do servidor
// (backend/src/services/expenseCounting.ts). A ocorrência mensal em aberto só
// conta a partir do dia seguinte à data dela: no crédito com cartão, a data de
// compra (a cobrança; sem ela, o vencimento); nas outras formas, o vencimento.
// Até lá ela aparece na lista como "Agendada", fora das somas. A paga conta
// sempre, e a despesa que não é mensal também.
import type { Expense } from '../types/finance';
import { INVOICE_EXPENSE_METHOD } from './cardInvoice';

type CountableExpense = Pick<Expense, 'recorrente' | 'pago' | 'formaPagamento' | 'cartaoId' | 'dataCompra' | 'dataVencimento' | 'status'>;

/** A data que decide quando a ocorrência mensal passa a contar ('AAAA-MM-DD'). */
export function countingDate(expense: Omit<CountableExpense, 'recorrente' | 'pago'>): string {
  if (expense.formaPagamento === INVOICE_EXPENSE_METHOD && expense.cartaoId != null && expense.dataCompra) {
    return expense.dataCompra.slice(0, 10);
  }
  return expense.dataVencimento.slice(0, 10);
}

/** O dia em que a ocorrência mensal passa a contar: o seguinte à data dela ('AAAA-MM-DD'). */
export function countsFromDate(expense: Omit<CountableExpense, 'recorrente' | 'pago'>): string {
  const date = new Date(`${countingDate(expense)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Conta nas somas: não é mensal, está paga, ou a data dela já passou (conta a partir do dia seguinte). */
export function isCountedExpense(expense: CountableExpense, today: string): boolean {
  if (expense.status === 'prevista' || expense.status === 'cancelada') return false;
  if (!expense.recorrente || expense.pago) return true;
  return countingDate(expense) < today;
}
