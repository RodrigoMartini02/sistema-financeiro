import assert from 'node:assert/strict';
import test from 'node:test';
import { BILLING_HISTORY_LIMIT, describePayment, toBillingEventView } from './billingHistory';

// Histórico de cobrança: o que se tira de um pagamento do Mercado Pago e a forma da resposta. A gravação e a leitura no
// banco ficam em subscription.db.test.ts.

const base = { amount: 4.99, paymentTypeId: undefined, paymentMethodId: undefined, recurringId: undefined };

test('pagamento: valor em centavos, arredondado, e sem valor quando o Mercado Pago não informa', () => {
  assert.equal(describePayment({ ...base, amount: 4.99 }).amountCents, 499);
  assert.equal(describePayment({ ...base, amount: 7.98 }).amountCents, 798);
  assert.equal(describePayment({ ...base, amount: 0.1 + 0.2 }).amountCents, 30, 'ponto flutuante não vaza para os centavos');
  assert.equal(describePayment({ ...base, amount: undefined }).amountCents, null);
  assert.equal(describePayment({ ...base, amount: Number.NaN }).amountCents, null);
});

test('pagamento: meio Pix, cartão (crédito e débito) e recorrente; outro tipo fica sem meio', () => {
  assert.equal(describePayment({ ...base, paymentMethodId: 'pix', paymentTypeId: 'bank_transfer' }).method, 'PIX');
  assert.equal(describePayment({ ...base, paymentMethodId: 'visa', paymentTypeId: 'credit_card' }).method, 'CARTAO');
  assert.equal(describePayment({ ...base, paymentMethodId: 'debvisa', paymentTypeId: 'debit_card' }).method, 'CARTAO');
  assert.equal(describePayment({ ...base, paymentMethodId: 'visa', paymentTypeId: 'credit_card', recurringId: 'pre-1' }).method, 'RECORRENTE');
  assert.equal(describePayment({ ...base, paymentMethodId: 'bolbradesco', paymentTypeId: 'ticket' }).method, null);
  assert.equal(describePayment({ ...base }).method, null);
});

test('evento na resposta: data de Brasília e só o que a tela usa (sem identificadores do Mercado Pago)', () => {
  const view = toBillingEventView({
    id: 7,
    type: 'PAGAMENTO',
    status: 'APROVADO',
    method: 'PIX',
    origin: null,
    amountCents: 499,
    users: 2,
    occurredAt: '2026-11-10 15:00:00+00',
  });
  assert.deepEqual(view, {
    id: 7, type: 'PAGAMENTO', status: 'APROVADO', method: 'PIX', origin: null, amountCents: 499, users: 2,
    occurredAt: '2026-11-10T12:00:00-03:00',
  });
  assert.equal(BILLING_HISTORY_LIMIT, 200);
});
