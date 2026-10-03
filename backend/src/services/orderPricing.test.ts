import assert from 'node:assert/strict';
import test from 'node:test';
import {
  availableQuantity,
  calculateOrderTotals,
  canChangeOrderStatus,
  lineSubtotal,
  orderStatusFromPayment,
  paymentMatchesTotal,
} from './orderPricing';

test('subtotal, economia, entrega e total do pedido', () => {
  const lines = [
    { originalPrice: 55, unitPrice: 49.5, quantity: 2 },
    { originalPrice: 25, unitPrice: 25, quantity: 1 },
  ];
  assert.equal(lineSubtotal(lines[0]!), 99);
  assert.deepEqual(calculateOrderTotals(lines, 12.5), { subtotal: 124, discount: 11, deliveryFee: 12.5, total: 136.5 });
  assert.deepEqual(calculateOrderTotals(lines, 0), { subtotal: 124, discount: 11, deliveryFee: 0, total: 124 });
});

test('totais arredondados em centavos', () => {
  assert.deepEqual(calculateOrderTotals([{ originalPrice: 19.9, unitPrice: 16.92, quantity: 3 }], 0), {
    subtotal: 50.76, discount: 8.94, deliveryFee: 0, total: 50.76,
  });
});

test('disponível desconta o que está separado; sem controle não há limite', () => {
  assert.equal(availableQuantity(10, 3, true), 7);
  assert.equal(availableQuantity(2, 5, true), 0);
  assert.equal(availableQuantity(0, 0, false), null);
});

test('situação do pedido a partir do pagamento no Mercado Pago', () => {
  assert.equal(orderStatusFromPayment('approved'), 'pago');
  assert.equal(orderStatusFromPayment('rejected'), 'recusado');
  assert.equal(orderStatusFromPayment('cancelled', 'expired'), 'expirado');
  assert.equal(orderStatusFromPayment('cancelled', 'by_collector'), 'recusado');
  assert.equal(orderStatusFromPayment('refunded'), 'estornado');
  assert.equal(orderStatusFromPayment('charged_back'), 'estornado');
  assert.equal(orderStatusFromPayment('pending'), null);
  assert.equal(orderStatusFromPayment('in_process'), null);
});

test('a loja avança só a entrega: enviado na entrega, pronto para retirada na retirada', () => {
  assert.equal(canChangeOrderStatus('pago', 'enviado', 'entrega'), true);
  assert.equal(canChangeOrderStatus('pago', 'pronto_retirada', 'entrega'), false);
  assert.equal(canChangeOrderStatus('pago', 'pronto_retirada', 'retirada'), true);
  assert.equal(canChangeOrderStatus('enviado', 'entregue', 'entrega'), true);
  assert.equal(canChangeOrderStatus('pago', 'entregue', 'retirada'), true);
  assert.equal(canChangeOrderStatus('aguardando_pagamento', 'pago', 'entrega'), false);
  assert.equal(canChangeOrderStatus('entregue', 'enviado', 'entrega'), false);
  assert.equal(canChangeOrderStatus('pago', 'estornado', 'entrega'), false);
});

test('o valor pago confere com o total em centavos', () => {
  assert.equal(paymentMatchesTotal(136.5, 136.5), true);
  assert.equal(paymentMatchesTotal(136.499999, 136.5), true);
  assert.equal(paymentMatchesTotal(136.4, 136.5), false);
});
