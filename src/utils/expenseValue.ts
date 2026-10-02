// Valor efetivo da despesa: o que saiu do bolso quando está paga (com juros ou
// desconto); o previsto quando não está. Em parcelada é o valor da parcela,
// não o total da compra. Mesma regra do servidor (saldo do mês, painel,
// relatórios, orçamento e assistente).
import type { Expense } from '../types/finance';

type ExpenseValueFields = Pick<Expense, 'pago' | 'valorPago' | 'valorFinal'>;

export function effectiveExpenseValue(expense: ExpenseValueFields): number {
  return expense.pago && expense.valorPago != null ? expense.valorPago : expense.valorFinal;
}

/**
 * Juros (positivo) ou desconto (negativo) do pagamento. Null quando a despesa
 * não foi paga ou foi paga pelo valor previsto: não há nada a mostrar.
 */
export function paymentDifference(expense: ExpenseValueFields): number | null {
  if (!expense.pago || expense.valorPago == null) return null;
  const difference = expense.valorPago - expense.valorFinal;
  return difference === 0 ? null : difference;
}
