import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense } from '../types/finance';
import { formatCurrency } from '../screens/finance/formatters';
import {
  effectiveExpenseValue, embeddedInstallmentInterest, embeddedInterestText, paymentDifference,
} from './expenseValue';

test('paga com juros: vale o pago, e a diferença é positiva', () => {
  const expense = { pago: true, valorPago: 121.29, valorFinal: 99 };
  assert.equal(effectiveExpenseValue(expense), 121.29);
  assert.ok(Math.abs(paymentDifference(expense)! - 22.29) < 0.001);
});

test('paga com desconto: vale o pago, e a diferença é negativa', () => {
  const expense = { pago: true, valorPago: 90, valorFinal: 100 };
  assert.equal(effectiveExpenseValue(expense), 90);
  assert.equal(paymentDifference(expense), -10);
});

test('paga pelo previsto ou sem valor pago registrado: vale o previsto, sem diferença', () => {
  assert.equal(effectiveExpenseValue({ pago: true, valorPago: 100, valorFinal: 100 }), 100);
  assert.equal(paymentDifference({ pago: true, valorPago: 100, valorFinal: 100 }), null);
  assert.equal(effectiveExpenseValue({ pago: true, valorPago: null, valorFinal: 80 }), 80);
  assert.equal(paymentDifference({ pago: true, valorPago: null, valorFinal: 80 }), null);
});

test('não paga: vale o previsto, mesmo com valor pago preenchido', () => {
  const expense = { pago: false, valorPago: 150, valorFinal: 100 };
  assert.equal(effectiveExpenseValue(expense), 100);
  assert.equal(paymentDifference(expense), null);
});

function installment(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1, descricao: 'Notebook', valorFinal: 35, categoria: 'Eletrônicos', formaPagamento: 'credito', cartaoId: 7,
    dataVencimento: '2026-10-10', mes: 9, ano: 2026, pago: false, recorrente: false, parcelado: true, parcela: '1/3',
    status: 'ativa', interest: 5,
    ...overrides,
  };
}

test('juros embutido: a parcela da compra parcelada mostra o juros gravado', () => {
  assert.equal(embeddedInstallmentInterest(installment()), 5);
  assert.equal(embeddedInstallmentInterest(installment({ interest: 0.01 })), 0.01);
  // Fora do crédito, e paga, a parcela continua com o juros que já trazia.
  assert.equal(embeddedInstallmentInterest(installment({ formaPagamento: 'pix', cartaoId: null, pago: true, valorPago: 35 })), 5);
  // Compra parcelada paga pela fatura no total: a compra segue com o juros dela.
  assert.equal(
    embeddedInstallmentInterest(installment({ pago: true, invoicePaymentId: 9, invoicePaymentMethod: 'total', invoiceMonth: '2026-10' })),
    5,
  );
});

test('juros embutido: sem juros gravado (nulo ou zero) não há o que mostrar', () => {
  assert.equal(embeddedInstallmentInterest(installment({ interest: null })), null);
  assert.equal(embeddedInstallmentInterest(installment({ interest: undefined })), null);
  assert.equal(embeddedInstallmentInterest(installment({ interest: 0 })), null);
});

test('juros embutido: não é compra parcelada, não mostra (à vista, mensal)', () => {
  assert.equal(embeddedInstallmentInterest(installment({ parcelado: false, parcela: null })), null);
  assert.equal(embeddedInstallmentInterest(installment({ parcelado: false, recorrente: true, parcela: null })), null);
});

test('juros embutido: linhas geradas pela fatura têm interest, mas é juros da fatura, não da compra', () => {
  // Restante da fatura (pagamento parcial) e encargos: não são parcelados.
  assert.equal(embeddedInstallmentInterest(installment({ parcelado: false, parcela: null, invoiceOriginPaymentId: 9, interest: 30 })), null);
  assert.equal(embeddedInstallmentInterest(installment({ parcelado: false, parcela: null, pago: true, invoicePaymentId: 9, invoiceOriginPaymentId: 9, interest: 45.5 })), null);
  // Parcela da fatura (pagamento parcelado): o servidor grava parcelado true, e o que a distingue da compra é a origem.
  assert.equal(embeddedInstallmentInterest(installment({ parcela: '1/3', invoiceOriginPaymentId: 9, interest: 12.34 })), null);
});

test('juros embutido: compra renegociada pela fatura (parcial ou parcelada) e cancelada ficam sem a linha', () => {
  assert.equal(embeddedInstallmentInterest(installment({ pago: true, invoicePaymentId: 9, invoicePaymentMethod: 'partial', invoiceMonth: '2026-10' })), null);
  assert.equal(embeddedInstallmentInterest(installment({ pago: true, invoicePaymentId: 9, invoicePaymentMethod: 'installments', invoiceMonth: '2026-10' })), null);
  assert.equal(embeddedInstallmentInterest(installment({ status: 'cancelada' })), null);
});

test('texto do juros embutido: "inclui R$ X de juros", sem o "+ R$" do pago a mais', () => {
  assert.equal(embeddedInterestText(15), `inclui ${formatCurrency(15)} de juros`);
  assert.equal(embeddedInterestText(1234.5), `inclui ${formatCurrency(1234.5)} de juros`);
  assert.ok(!embeddedInterestText(15).includes('+'));
});

test('juros embutido e pago a mais são coisas separadas na mesma parcela', () => {
  const paidMore = installment({ pago: true, valorPago: 37, valorFinal: 35, interest: 5 });
  assert.equal(paymentDifference(paidMore), 2);
  assert.equal(embeddedInstallmentInterest(paidMore), 5);
});
