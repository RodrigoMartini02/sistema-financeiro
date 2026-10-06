import assert from 'node:assert/strict';
import test from 'node:test';
import { PLAN_TIER } from './plan-access';
import { buildPaymentReference, parsePaymentReference, parsePlanChoice, PLAN_OFFERS } from './planPayments';

test('offers Starter and Premium monthly prices', () => {
  assert.deepEqual(PLAN_OFFERS[PLAN_TIER.starter], { amount: 4.99, label: 'Starter' });
  assert.deepEqual(PLAN_OFFERS[PLAN_TIER.premium], { amount: 9.99, label: 'Premium' });
});

test('accepts Starter, Premium and the old monthly choice as Starter', () => {
  assert.equal(parsePlanChoice('starter'), PLAN_TIER.starter);
  assert.equal(parsePlanChoice('premium'), PLAN_TIER.premium);
  assert.equal(parsePlanChoice('mensal'), PLAN_TIER.starter);
});

test('rejects the annual plan and unknown choices', () => {
  assert.equal(parsePlanChoice('anual'), null);
  assert.equal(parsePlanChoice('gold'), null);
  assert.equal(parsePlanChoice(undefined), null);
});

test('builds and reads the payment reference', () => {
  const reference = buildPaymentReference(12, PLAN_TIER.premium);

  assert.equal(reference, 'fin:12:premium');
  assert.deepEqual(parsePaymentReference(reference), { userId: 12, plan: PLAN_TIER.premium });
});

test('reads the old reference, with only the user id, as Starter', () => {
  assert.deepEqual(parsePaymentReference('42'), { userId: 42, plan: PLAN_TIER.starter });
});

test('ignores invalid references', () => {
  assert.equal(parsePaymentReference('fin:abc:premium'), null);
  assert.equal(parsePaymentReference('fin:12:gold'), null);
  assert.equal(parsePaymentReference('lic:12:premium'), null);
  assert.equal(parsePaymentReference('fin:0:starter'), null);
  assert.equal(parsePaymentReference('0'), null);
  assert.equal(parsePaymentReference(''), null);
  assert.equal(parsePaymentReference(null), null);
});
