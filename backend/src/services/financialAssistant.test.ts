import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretFinancialAssistantText } from './financialAssistant';

test('interprets a voice transcription of an expense as a paid Pix purchase', () => {
  const interpretation = interpretFinancialAssistantText('Fiz compras no mercado hoje gastei R$ 100 no pics');

  assert.equal(interpretation.kind, 'expense');
  assert.equal(interpretation.description, 'mercado');
  assert.equal(interpretation.amount, 100);
  assert.equal(interpretation.paymentMethod, 'pix');
  assert.equal(interpretation.paid, true);
});

test('interprets common spoken Brazilian currency values', () => {
  const interpretation = interpretFinancialAssistantText('Paguei cem reais e cinquenta centavos no mercado');

  assert.equal(interpretation.amount, 100.5);
  assert.equal(interpretation.kind, 'expense');
  assert.equal(interpretation.paid, true);
});

test('uses a spoken registration command to identify a new income', () => {
  const interpretation = interpretFinancialAssistantText('Quero registrar uma nova receita de R$ 100');

  assert.equal(interpretation.kind, 'income');
  assert.equal(interpretation.amount, 100);
});

test('extracts a trailing amount next to a financial description', () => {
  const salary = interpretFinancialAssistantText('salario 5000');
  const market = interpretFinancialAssistantText('mercado 82,50');
  const rent = interpretFinancialAssistantText('aluguel 1.500');

  assert.equal(salary.description, 'salario');
  assert.equal(salary.amount, 5000);
  assert.equal(market.description, 'mercado');
  assert.equal(market.amount, 82.5);
  assert.equal(rent.description, 'aluguel');
  assert.equal(rent.amount, 1500);
});

test('does not treat a due date as a financial amount', () => {
  const interpretation = interpretFinancialAssistantText('vence dia 15');

  assert.equal(interpretation.amount, null);
  assert.equal(interpretation.description, null);
});
