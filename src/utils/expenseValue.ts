// Valor efetivo da despesa: o que saiu do bolso quando está paga (com juros ou
// desconto); o previsto quando não está. Em parcelada é o valor da parcela,
// não o total da compra. Mesma regra do servidor (saldo do mês, painel,
// relatórios, orçamento e assistente).
import type { Expense } from '../types/finance';
import { formatCurrency } from '../screens/finance/formatters';
import { isRenegotiated } from './cardInvoice';

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

type EmbeddedInterestFields = Pick<
  Expense,
  'parcelado' | 'interest' | 'status' | 'invoiceOriginPaymentId' | 'invoicePaymentId' | 'invoicePaymentMethod'
>;

/**
 * Juros embutido na parcela de uma compra parcelada (o que o servidor grava ao
 * criar a compra com valor à vista). Null quando não há o que mostrar.
 *
 * `interest` também vem preenchido nas linhas que o pagamento da fatura gera
 * (restante, parcela da fatura e encargos): aquilo é juros da fatura, não da
 * compra. Elas têm `invoiceOriginPaymentId` (a parcela da fatura também vem com
 * `parcelado` true), e por isso ficam de fora. A compra renegociada pela fatura
 * (parcial ou parcelado) também fica de fora: parte do juros dela já foi para a
 * linha gerada, e a célula do valor mostra "de R$ X" no lugar. Cancelada, idem.
 */
export function embeddedInstallmentInterest(expense: EmbeddedInterestFields): number | null {
  if (!expense.parcelado || expense.status === 'cancelada') return null;
  if (expense.invoiceOriginPaymentId != null || isRenegotiated(expense)) return null;
  return expense.interest != null && expense.interest > 0 ? expense.interest : null;
}

/** "inclui R$ 15,00 de juros": não usa "+ R$", que na lista é o que se pagou a mais que o previsto. */
export function embeddedInterestText(interest: number): string {
  return `inclui ${formatCurrency(interest)} de juros`;
}
