import assert from 'node:assert/strict';
import test from 'node:test';
import { FINANCE_PLAN_PRICES_CENTS, formatPriceCents } from './sitePricing';

// O Intl separa "R$" do valor com espaço não separável.
const NBSP = ' ';

test('Finanças: Starter e Premium', () => {
  assert.equal(formatPriceCents(FINANCE_PLAN_PRICES_CENTS.starter), `R$${NBSP}4,99`);
  assert.equal(formatPriceCents(FINANCE_PLAN_PRICES_CENTS.premium), `R$${NBSP}9,99`);
});
