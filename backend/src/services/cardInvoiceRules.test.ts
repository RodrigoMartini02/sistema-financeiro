import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INVOICE_MESSAGES,
  carriedInterestCents,
  computeInvoicePayment,
  generatedDescription,
  invoiceDueDate,
  invoiceEditLockOf,
  invoiceEditRefusal,
  invoiceMonthEnd,
  invoiceMonthLabel,
  invoicePaymentRefusal,
  isCreditWithCard,
  isInvoiceProtected,
  proportionalShares,
  undoRefusal,
  type InvoiceItem,
  type InvoicePaymentTerms,
  type LockableExpenseFields,
} from './cardInvoiceRules';

const MONTH = '2026-10-01';
const CARD = { name: 'Nubank', dueDay: 10 };

/** Fatura de outubro do exemplo: Mercado 500, Combustível 300, Farmácia 200. */
const ITEMS: InvoiceItem[] = [
  { expenseId: 1, amount: 500, invoiceInterest: null },
  { expenseId: 2, amount: 300, invoiceInterest: null },
  { expenseId: 3, amount: 200, invoiceInterest: null },
];

function terms(overrides: Partial<InvoicePaymentTerms> = {}): InvoicePaymentTerms {
  return { method: 'total', amountPaid: 1000, interestAmount: 0, installmentCount: null, ...overrides };
}

const sumCents = (values: number[]) => values.reduce((total, value) => total + Math.round(value * 100), 0);

test('total pela soma: compras pagas pelo próprio valor, sem encargos', () => {
  const plan = computeInvoicePayment(ITEMS, terms(), MONTH, CARD);
  assert.deepEqual(plan.purchases, [
    { expenseId: 1, paidAmount: 500 }, { expenseId: 2, paidAmount: 300 }, { expenseId: 3, paidAmount: 200 },
  ]);
  assert.equal(plan.chargesAmount, 0);
  assert.deepEqual(plan.generated, []);
  assert.equal(plan.carriedForward, 0);
});

test('total acima da soma: a diferença vira encargos, já paga, toda ela juros', () => {
  const plan = computeInvoicePayment(ITEMS, terms({ amountPaid: 1045.5 }), MONTH, CARD);
  assert.equal(plan.chargesAmount, 45.5);
  assert.deepEqual(plan.generated, [{
    kind: 'charges',
    description: 'Encargos da fatura de out/2026 — Nubank',
    dueDate: '2026-10-10',
    amount: 45.5,
    interestAmount: 45.5,
    paid: true,
    installmentNumber: null,
    installmentCount: null,
  }]);
});

test('parcial do exemplo: 600 sobre 1.000 dá 300/180/120 e restante de 430 em novembro', () => {
  const plan = computeInvoicePayment(ITEMS, terms({ method: 'partial', amountPaid: 600, interestAmount: 30 }), MONTH, CARD);
  assert.deepEqual(plan.purchases, [
    { expenseId: 1, paidAmount: 300 }, { expenseId: 2, paidAmount: 180 }, { expenseId: 3, paidAmount: 120 },
  ]);
  assert.equal(plan.carriedForward, 430);
  assert.deepEqual(plan.generated, [{
    kind: 'remainder',
    description: 'Restante da fatura de out/2026 — Nubank',
    dueDate: '2026-11-10',
    amount: 430,
    interestAmount: 30,
    paid: false,
    installmentNumber: null,
    installmentCount: null,
  }]);
});

test('parcelado do exemplo: compras com 0 e 3x de 360 de novembro a janeiro', () => {
  const plan = computeInvoicePayment(ITEMS, terms({ method: 'installments', amountPaid: null, interestAmount: 80, installmentCount: 3 }), MONTH, CARD);
  assert.deepEqual(plan.purchases.map((item) => item.paidAmount), [0, 0, 0]);
  assert.equal(plan.installmentAmount, 360);
  assert.deepEqual(plan.generated.map((row) => [row.dueDate, row.amount, row.interestAmount, row.installmentNumber]), [
    ['2026-11-10', 360, 26.66, 1], ['2026-12-10', 360, 26.66, 2], ['2027-01-10', 360, 26.68, 3],
  ]);
  assert.equal(plan.generated[0]!.description, 'Parcelamento da fatura de out/2026 — Nubank');
  assert.equal(sumCents(plan.generated.map((row) => row.amount)), 108000);
  assert.equal(sumCents(plan.generated.map((row) => row.interestAmount)), 8000);
});

test('parcelado com centavos que sobram na última parcela', () => {
  const plan = computeInvoicePayment(ITEMS, terms({ method: 'installments', amountPaid: null, interestAmount: 0, installmentCount: 3 }), MONTH, CARD);
  assert.deepEqual(plan.generated.map((row) => row.amount), [333.33, 333.33, 333.34]);
});

test('proporção exata em centavos: a soma das partes é o valor pago', () => {
  const items: InvoiceItem[] = [
    { expenseId: 10, amount: 33.33, invoiceInterest: null },
    { expenseId: 11, amount: 33.33, invoiceInterest: null },
    { expenseId: 12, amount: 33.34, invoiceInterest: null },
  ];
  const shares = proportionalShares(items, 1000);
  assert.equal([...shares.values()].reduce((sum, cents) => sum + cents, 0), 1000);
  // Os centavos que sobram vão para as maiores sobras e, no empate, para o menor id.
  assert.deepEqual([...shares.entries()], [[10, 333], [11, 333], [12, 334]]);
});

test('proporção determinística no empate: o centavo vai para o menor id', () => {
  const items: InvoiceItem[] = [
    { expenseId: 21, amount: 1, invoiceInterest: null },
    { expenseId: 20, amount: 1, invoiceInterest: null },
  ];
  assert.deepEqual([...proportionalShares(items, 101).entries()], [[21, 50], [20, 51]]);
});

test('juros carregados: a parte dos juros que não foi paga segue para o restante', () => {
  // Novembro: o restante de outubro (430, com 30 de juros) e uma compra de 570.
  const items: InvoiceItem[] = [
    { expenseId: 30, amount: 430, invoiceInterest: 30 },
    { expenseId: 31, amount: 570, invoiceInterest: null },
  ];
  // Pagando metade, metade dos juros do restante (15) passa para o restante novo.
  const plan = computeInvoicePayment(items, terms({ method: 'partial', amountPaid: 500, interestAmount: 20 }), '2026-11-01', CARD);
  assert.equal(plan.carriedInterest, 15);
  assert.equal(plan.generated[0]!.amount, 520);
  assert.equal(plan.generated[0]!.interestAmount, 35);
  assert.equal(plan.generated[0]!.dueDate, '2026-12-10');
  // Parcelando, todos os juros do restante seguem para as parcelas.
  const installments = computeInvoicePayment(items, terms({ method: 'installments', amountPaid: null, interestAmount: 0, installmentCount: 2 }), '2026-11-01', CARD);
  assert.equal(installments.carriedInterest, 30);
  assert.equal(sumCents(installments.generated.map((row) => row.interestAmount)), 3000);
  assert.equal(carriedInterestCents(items, new Map([[30, 43000]])), 0);
});

test('juros por parcela nunca passam do valor da parcela', () => {
  const items: InvoiceItem[] = [{ expenseId: 40, amount: 0.01, invoiceInterest: null }];
  const plan = computeInvoicePayment(items, terms({ method: 'installments', amountPaid: null, interestAmount: 2.99, installmentCount: 3 }), MONTH, CARD);
  for (const row of plan.generated) {
    assert.ok(row.interestAmount <= row.amount, `parcela ${row.installmentNumber}`);
  }
  assert.equal(sumCents(plan.generated.map((row) => row.interestAmount)), 299);
});

test('recusas', () => {
  assert.deepEqual(invoicePaymentRefusal([], terms()), { message: INVOICE_MESSAGES.empty, status: 409 });
  assert.equal(invoicePaymentRefusal(ITEMS, terms()), null);
  assert.deepEqual(invoicePaymentRefusal(ITEMS, terms({ amountPaid: 999.99 })), { message: INVOICE_MESSAGES.totalBelowPurchases, status: 400 });
  assert.equal(invoicePaymentRefusal(ITEMS, terms({ method: 'partial', amountPaid: 999.99 })), null);
  assert.deepEqual(invoicePaymentRefusal(ITEMS, terms({ method: 'partial', amountPaid: 1000 })), { message: INVOICE_MESSAGES.partialOutOfRange, status: 400 });
  const tiny: InvoiceItem[] = [{ expenseId: 1, amount: 0.02, invoiceInterest: null }];
  assert.deepEqual(
    invoicePaymentRefusal(tiny, terms({ method: 'installments', amountPaid: null, installmentCount: 3 })),
    { message: INVOICE_MESSAGES.installmentTooSmall, status: 400 },
  );
  assert.deepEqual(
    invoicePaymentRefusal(ITEMS, terms({ method: 'installments', amountPaid: null, interestAmount: 99_999_999, installmentCount: 3 })),
    { message: INVOICE_MESSAGES.aboveLimit, status: 400 },
  );
});

test('vencimentos no dia do cartão: dia 31 em mês curto e virada do ano', () => {
  assert.equal(invoiceDueDate('2027-01-01', 31, 1), '2027-02-28');
  assert.equal(invoiceDueDate('2026-12-01', 10, 1), '2027-01-10');
  assert.equal(invoiceDueDate('2026-10-01', 31, 0), '2026-10-31');
  assert.equal(invoiceMonthEnd('2026-02-01'), '2026-02-28');
  assert.equal(invoiceMonthLabel('2026-01-01'), 'jan/2026');
});

test('descrição limitada a 255 caracteres', () => {
  const description = generatedDescription('remainder', MONTH, 'x'.repeat(300));
  assert.equal(description.length, 255);
  assert.ok(description.startsWith('Restante da fatura de out/2026 — x'));
});

test('linhas protegidas, crédito com cartão e travas', () => {
  assert.equal(isInvoiceProtected({ invoicePaymentId: 1, invoiceOriginPaymentId: null }), true);
  assert.equal(isInvoiceProtected({ invoicePaymentId: null, invoiceOriginPaymentId: 1 }), true);
  assert.equal(isInvoiceProtected({ invoicePaymentId: null, invoiceOriginPaymentId: null }), false);
  assert.equal(isCreditWithCard({ paymentMethod: 'credito', cardId: 7 }), true);
  assert.equal(isCreditWithCard({ paymentMethod: 'credito', cardId: null }), false);
  assert.equal(isCreditWithCard({ paymentMethod: 'debito', cardId: 7 }), false);
  assert.equal(invoiceEditLockOf({ invoicePaymentId: 1, invoiceOriginPaymentId: 1 }), 'invoice-item');
  assert.equal(invoiceEditLockOf({ invoicePaymentId: null, invoiceOriginPaymentId: 1 }), 'generated');
  assert.equal(invoiceEditLockOf({ invoicePaymentId: null, invoiceOriginPaymentId: null }), null);
});

function fields(overrides: Partial<LockableExpenseFields> = {}): LockableExpenseFields {
  return {
    amount: 500, dueDate: '2026-10-10', paymentMethod: 'credito', cardId: 7,
    paid: true, paymentDate: '2026-10-08', amountPaid: 300, ...overrides,
  };
}

test('compra paga pela fatura: valor, forma, cartão, vencimento e pagamento travados', () => {
  assert.equal(invoiceEditRefusal('invoice-item', fields(), fields()), null);
  for (const change of [
    { amount: 400 }, { paymentMethod: 'pix' }, { cardId: 8 }, { dueDate: '2026-11-10' },
    { paid: false, paymentDate: null, amountPaid: null }, { amountPaid: 500 },
  ]) {
    assert.equal(invoiceEditRefusal('invoice-item', fields(), fields(change)), INVOICE_MESSAGES.lockedRow, JSON.stringify(change));
  }
});

test('linha gerada: valor, forma e cartão travados; vencimento livre', () => {
  const open = fields({ paid: false, paymentDate: null, amountPaid: null });
  assert.equal(invoiceEditRefusal('generated', open, { ...open, dueDate: '2026-12-10' }), null);
  assert.equal(invoiceEditRefusal('generated', open, { ...open, amount: 1 }), INVOICE_MESSAGES.lockedRow);
});

test('crédito com cartão: o pagamento não muda pela edição', () => {
  const open = fields({ paid: false, paymentDate: null, amountPaid: null });
  assert.equal(invoiceEditRefusal(null, open, { ...open, paid: true, paymentDate: '2026-10-10' }), INVOICE_MESSAGES.creditPayment);
  assert.equal(invoiceEditRefusal(null, fields({ amountPaid: 500 }), fields({ amountPaid: 500, paid: false, paymentDate: null })), INVOICE_MESSAGES.creditPayment);
  // Pago pelo valor da despesa e sem mudança: passa (valor pago vazio vale o valor).
  assert.equal(invoiceEditRefusal(null, fields({ amountPaid: 500 }), fields({ amountPaid: null })), null);
  // Fora do crédito com cartão, a edição do pagamento segue livre.
  const pix = fields({ paymentMethod: 'pix', cardId: null, paid: false, paymentDate: null, amountPaid: null });
  assert.equal(invoiceEditRefusal(null, pix, { ...pix, paid: true, paymentDate: '2026-10-10' }), null);
});

test('crédito com cartão: pagamento antigo com o valor pago em branco continua editável', () => {
  // Gravado em branco vale o valor da despesa: a edição que mantém o pagamento passa.
  const legacy = fields({ amountPaid: null });
  assert.equal(invoiceEditRefusal(null, legacy, fields({ amountPaid: null })), null);
  assert.equal(invoiceEditRefusal(null, legacy, fields({ amountPaid: 500 })), null);
  // Mudar o pagamento continua recusado.
  assert.equal(invoiceEditRefusal(null, legacy, fields({ amountPaid: 450 })), INVOICE_MESSAGES.creditPayment);
  assert.equal(invoiceEditRefusal(null, legacy, fields({ paid: false, paymentDate: null, amountPaid: null })), INVOICE_MESSAGES.creditPayment);
});

test('desfazer: recusado se uma linha gerada foi paga por outro pagamento', () => {
  assert.equal(undoRefusal(5, []), null);
  assert.equal(undoRefusal(5, [{ paid: false, invoicePaymentId: null }]), null);
  // Os encargos nascem pagos pelo próprio pagamento: não bloqueiam.
  assert.equal(undoRefusal(5, [{ paid: true, invoicePaymentId: 5 }]), null);
  assert.equal(undoRefusal(5, [{ paid: true, invoicePaymentId: 9 }]), INVOICE_MESSAGES.undoBlocked);
});
