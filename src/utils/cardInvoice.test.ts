import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense } from '../types/finance';
import {
  INVOICE_MESSAGES,
  expensePayButton,
  formatPercent,
  installmentsLabel,
  invoiceDueDate,
  invoiceEditLock,
  invoiceMonthLabel,
  invoiceMonthParam,
  isCreditWithCard,
  isInvoiceProtected,
  isRenegotiated,
  monthlyInterestRate,
  payInvoiceShortcut,
  renegotiationNote,
  shiftInvoiceMonth,
  summarizeInvoicePayment,
} from './cardInvoice';

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1, descricao: 'Mercado', valorFinal: 500, categoria: 'Alimentação', formaPagamento: 'credito', cartaoId: 7,
    dataVencimento: '2026-10-10', mes: 9, ano: 2026, pago: false, recorrente: false, parcelado: false, status: 'ativa',
    ...overrides,
  };
}

const round2 = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100);

test('mês da fatura: parâmetro, rótulo e meses seguintes', () => {
  assert.equal(invoiceMonthParam(9, 2026), '2026-10');
  assert.equal(invoiceMonthLabel('2026-10'), 'out/2026');
  assert.equal(shiftInvoiceMonth('2026-12', 1), '2027-01');
  assert.equal(shiftInvoiceMonth('2026-10', 3), '2027-01');
});

test('vencimento no dia do cartão: dia 31 em mês curto', () => {
  assert.equal(invoiceDueDate('2027-01', 31, 1), '2027-02-28');
  assert.equal(invoiceDueDate('2026-10', 10, 0), '2026-10-10');
});

test('total: pela soma sem encargos; acima, encargos; abaixo, recusado', () => {
  const draft = { purchasesAmount: 1000, method: 'total' as const, amountPaid: 1000, interestAmount: 0, installmentCount: 2 };
  assert.deepEqual(summarizeInvoicePayment(draft).chargesAmount, 0);
  assert.equal(summarizeInvoicePayment({ ...draft, amountPaid: 1045.5 }).chargesAmount, 45.5);
  assert.equal(summarizeInvoicePayment({ ...draft, amountPaid: 999.99 }).error, INVOICE_MESSAGES.totalBelowPurchases);
});

test('parcial do exemplo: 600 sobre 1.000 com 30 de juros deixa 430 para a frente', () => {
  const summary = summarizeInvoicePayment({ purchasesAmount: 1000, method: 'partial', amountPaid: 600, interestAmount: 30, installmentCount: 2 });
  assert.equal(summary.error, null);
  assert.equal(summary.purchasesCountAs, 600);
  assert.equal(summary.carriedForward, 430);
  assert.equal(round2(summary.interestPercent), 7.5);
  for (const amountPaid of [0, 1000, 1200]) {
    assert.equal(
      summarizeInvoicePayment({ purchasesAmount: 1000, method: 'partial', amountPaid, interestAmount: 0, installmentCount: 2 }).error,
      INVOICE_MESSAGES.partialOutOfRange,
    );
  }
});

test('parcelado do exemplo: 3x de 360 com a taxa ao mês', () => {
  const summary = summarizeInvoicePayment({ purchasesAmount: 1000, method: 'installments', amountPaid: 0, interestAmount: 80, installmentCount: 3 });
  assert.equal(summary.purchasesCountAs, 0);
  assert.equal(summary.carriedForward, 1080);
  assert.deepEqual(summary.installmentAmounts, [360, 360, 360]);
  assert.equal(round2(summary.interestPercent), 8);
  assert.equal(round2(summary.monthlyRatePercent), 3.95);
  const noInterest = summarizeInvoicePayment({ purchasesAmount: 1000, method: 'installments', amountPaid: 0, interestAmount: 0, installmentCount: 3 });
  assert.deepEqual(noInterest.installmentAmounts, [333.33, 333.33, 333.34]);
  assert.equal(noInterest.monthlyRatePercent, null);
  assert.equal(
    summarizeInvoicePayment({ purchasesAmount: 1000, method: 'installments', amountPaid: 0, interestAmount: 0, installmentCount: 1 }).error,
    INVOICE_MESSAGES.installmentsOutOfRange,
  );
  assert.equal(
    summarizeInvoicePayment({ purchasesAmount: 0.02, method: 'installments', amountPaid: 0, interestAmount: 0, installmentCount: 3 }).error,
    INVOICE_MESSAGES.installmentTooSmall,
  );
});

test('taxa ao mês e textos', () => {
  assert.equal(monthlyInterestRate(1000, 500, 2), 0);
  assert.equal(monthlyInterestRate(0, 100, 2), null);
  assert.equal(round2((monthlyInterestRate(1050, 360, 3) ?? 0) * 100), 1.42);
  const money = (value: number) => value.toFixed(2);
  assert.equal(installmentsLabel([360, 360, 360], money), '3x de 360.00');
  assert.equal(installmentsLabel([333.33, 333.33, 333.34], money), '2x de 333.33 + 1x de 333.34');
  assert.equal(formatPercent(2.857142), '2,86%');
});

test('linha no crédito com cartão: pagar desligado e trava do pagamento', () => {
  assert.equal(isCreditWithCard(expense()), true);
  assert.equal(isCreditWithCard(expense({ cartaoId: null })), false);
  assert.equal(isCreditWithCard(expense({ formaPagamento: 'debito' })), false);
  assert.deepEqual(expensePayButton(expense()), { label: 'Pago pela fatura do cartão', disabled: true });
  assert.deepEqual(expensePayButton(expense({ cartaoId: null })), { label: 'Marcar como pago', disabled: false });
  assert.deepEqual(expensePayButton(expense({ formaPagamento: 'pix', cartaoId: null })), { label: 'Marcar como pago', disabled: false });
  assert.deepEqual(expensePayButton(expense({ pago: true })), { label: 'Já pago', disabled: true });
  assert.deepEqual(expensePayButton(expense({ status: 'cancelada' })), { label: 'Cancelada', disabled: true });
  assert.equal(invoiceEditLock(expense()), 'credit-payment');
  assert.equal(invoiceEditLock(expense({ formaPagamento: 'pix', cartaoId: null })), null);
});

test('compra renegociada: nota, proteção e trava', () => {
  const parcelada = expense({ pago: true, invoicePaymentId: 9, invoicePaymentMethod: 'installments', invoicePaymentInstallments: 3, invoiceMonth: '2026-10' });
  assert.equal(isRenegotiated(parcelada), true);
  assert.equal(renegotiationNote(parcelada), 'Fatura de out/2026 parcelada em 3x');
  const parcial = expense({ pago: true, invoicePaymentId: 9, invoicePaymentMethod: 'partial', invoiceMonth: '2026-10' });
  assert.equal(renegotiationNote(parcial), 'Fatura de out/2026 com pagamento parcial');
  const total = expense({ pago: true, invoicePaymentId: 9, invoicePaymentMethod: 'total', invoiceMonth: '2026-10' });
  assert.equal(isRenegotiated(total), false);
  assert.equal(renegotiationNote(total), null);
  assert.equal(isInvoiceProtected(total), true);
  assert.equal(invoiceEditLock(total), 'invoice-item');
  const restante = expense({ invoiceOriginPaymentId: 9, interest: 30 });
  assert.equal(isInvoiceProtected(restante), true);
  assert.equal(invoiceEditLock(restante), 'generated');
  assert.equal(isInvoiceProtected(expense()), false);
});

test('atalho "Pagar fatura" da edição: só a despesa em aberto no crédito com cartão, no mês do vencimento', () => {
  assert.deepEqual(payInvoiceShortcut(expense()), { invoiceMonth: '2026-10', cardId: 7, label: 'Pagar fatura de out/2026' });
  // O mês é o do vencimento (o que o servidor usa para as compras em aberto da fatura), não o da tela.
  assert.deepEqual(
    payInvoiceShortcut(expense({ dataVencimento: '2027-01-05', parcelado: true, parcela: '4/6' })),
    { invoiceMonth: '2027-01', cardId: 7, label: 'Pagar fatura de jan/2027' },
  );

  // Fora do crédito com cartão não há fatura para pagar.
  assert.equal(payInvoiceShortcut(expense({ formaPagamento: 'pix', cartaoId: null })), null);
  assert.equal(payInvoiceShortcut(expense({ formaPagamento: 'debito' })), null);
  assert.equal(payInvoiceShortcut(expense({ cartaoId: null })), null);
  // Paga ou cancelada: a fatura não traria a linha.
  assert.equal(payInvoiceShortcut(expense({ pago: true })), null);
  assert.equal(payInvoiceShortcut(expense({ status: 'cancelada' })), null);
});

test('atalho "Pagar fatura": linha de pagamento de fatura (paga, renegociada ou gerada) fica sem atalho', () => {
  const paga = expense({ pago: true, invoicePaymentId: 9, invoicePaymentMethod: 'total', invoiceMonth: '2026-10' });
  const renegociada = expense({ pago: true, invoicePaymentId: 9, invoicePaymentMethod: 'installments', invoiceMonth: '2026-10' });
  // Mesmo que o pagamento tenha deixado a linha em aberto (pago falso), pertencer a um pagamento de fatura tira o atalho.
  const emAbertoNoPagamento = expense({ invoicePaymentId: 9, invoicePaymentMethod: 'partial', invoiceMonth: '2026-10' });
  const restante = expense({ invoiceOriginPaymentId: 9, interest: 30 });
  for (const row of [paga, renegociada, emAbertoNoPagamento, restante]) {
    assert.equal(payInvoiceShortcut(row), null);
    assert.notEqual(invoiceEditLock(row), 'credit-payment');
  }
  // O atalho existe exatamente onde a trava é a do "Pago pela fatura do cartão".
  assert.equal(invoiceEditLock(expense()), 'credit-payment');
});

test('previsão não oferece pagamento nem atalho de fatura até confirmar', () => {
  for (const row of [expense({ status: 'prevista' }), expense({ status: 'prevista', formaPagamento: 'pix', cartaoId: null })]) {
    assert.deepEqual(expensePayButton(row), { label: 'Confirme o valor da previsão antes de pagar', disabled: true });
    assert.equal(payInvoiceShortcut(row), null);
  }
});
