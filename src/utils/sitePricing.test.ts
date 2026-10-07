import assert from 'node:assert/strict';
import test from 'node:test';
import { FINANCE_PLAN_PRICES_CENTS, formatPriceCents, tendersMonthlyCents } from './sitePricing';

// O Intl separa "R$" do valor com espaço não separável.
const NBSP = ' ';

test('Licitações: 2 usuários na base (o titular conta) e R$ 2,99 por usuário a mais', () => {
  assert.equal(tendersMonthlyCents(1), 499);
  assert.equal(tendersMonthlyCents(2), 499);
  assert.equal(tendersMonthlyCents(3), 798);
  assert.equal(tendersMonthlyCents(4), 1097);
  assert.equal(formatPriceCents(tendersMonthlyCents(4)), `R$${NBSP}10,97`);
});

test('Finanças: Starter e Premium', () => {
  assert.equal(formatPriceCents(FINANCE_PLAN_PRICES_CENTS.starter), `R$${NBSP}4,99`);
  assert.equal(formatPriceCents(FINANCE_PLAN_PRICES_CENTS.premium), `R$${NBSP}9,99`);
});
