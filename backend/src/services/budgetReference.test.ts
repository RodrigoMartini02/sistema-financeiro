import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyBudgetReference, resolveBudgetCategoryReference } from './budgetReference';

test('maps common personal categories to POF reference groups', () => {
  const food = resolveBudgetCategoryReference('Supermercado do mes');
  const health = resolveBudgetCategoryReference('Plano de saúde');

  assert.deepEqual(food, {
    key: 'food',
    label: 'Alimentacao',
    referencePercentage: 17.5,
  });
  assert.deepEqual(health, {
    key: 'health',
    label: 'Saude',
    referencePercentage: 8,
  });
});

test('keeps unknown categories outside the economic reference', () => {
  assert.equal(resolveBudgetCategoryReference('Projeto especial'), null);
});

test('classifies the comparison range without relying on income', () => {
  assert.equal(classifyBudgetReference(null, 17.5), 'without_classified_expenses');
  assert.equal(classifyBudgetReference(10, 17.5), 'below_reference');
  assert.equal(classifyBudgetReference(18, 17.5), 'within_reference');
  assert.equal(classifyBudgetReference(23, 17.5), 'attention');
  assert.equal(classifyBudgetReference(28, 17.5), 'risk');
});
