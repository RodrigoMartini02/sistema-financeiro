import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveExpenseValue, paymentDifference } from './expenseValue';

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
