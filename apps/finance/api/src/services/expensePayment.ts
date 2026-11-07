// Pagamento que a despesa grava ("paga", data e valor pago), sem acesso ao banco: a
// criação e a edição usam a mesma conta, e só a criação tem o pagamento automático
// (plano .plans/edicao-despesas-parceladas.md, fatia 3). A tela tem a regra
// espelhada em src/screens/finance/expense-dialog/draftRules.ts.
import type { NewExpense } from '../db/schema';
import type { PaymentInput, PaymentMethod } from './expenseInput';

export type PaymentColumns = Pick<NewExpense, 'paid' | 'paymentDate' | 'amountPaid'>;

/**
 * Pagamento gravado. Com `autoPay`, fora do crédito uma despesa com vencimento (ou
 * pagamento) até hoje já nasce paga — a regra de sempre. Parcelas não usam isso: a
 * grade diz quais estão pagas, e uma parcela vencida pode continuar em aberto.
 */
export function resolvePayment(
  payment: PaymentInput,
  amount: number,
  dueDate: string,
  paymentMethod: PaymentMethod,
  today: string,
  autoPay: boolean,
): PaymentColumns {
  const referenceDate = payment.paymentDate ?? dueDate;
  const paid = payment.paid || (autoPay && paymentMethod !== 'credito' && referenceDate <= today);
  if (!paid) {
    return { paid: false, paymentDate: null, amountPaid: null };
  }
  return { paid: true, paymentDate: referenceDate, amountPaid: (payment.amountPaid ?? amount).toFixed(2) };
}

/**
 * Pagamento gravado na edição: o que a tela mandou, sem pagamento automático. A
 * despesa vencida e não paga continua em aberto depois de salvar, e quem desmarca
 * "paga" não a vê voltar paga. O valor pago que a tela reenviou é mantido; só a
 * paga sem valor pago ganha o valor da despesa.
 */
export function resolveEditedPayment(
  input: PaymentInput & { amount: number; dueDate: string; paymentMethod: PaymentMethod },
  today: string,
): PaymentColumns {
  return resolvePayment(input, input.amount, input.dueDate, input.paymentMethod, today, false);
}
