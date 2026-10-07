import assert from 'node:assert/strict';
import test from 'node:test';
import { getEffectivePlanAccess, hasPremiumFeatures, PLAN_STATUS, PLAN_TIER, planTier } from './plan-access';

const now = new Date('2026-08-08T12:00:00-03:00');

test('keeps admin access active regardless of stored plan data', () => {
  const result = getEffectivePlanAccess({
    userType: 'admin',
    planStatus: PLAN_STATUS.expired,
    planExpiration: '2026-01-01 00:00:00',
    createdAt: '2026-01-01 00:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.active);
});
test('expires a trial after fifteen full days', () => {
  const result = getEffectivePlanAccess({
    userType: 'membro',
    planStatus: PLAN_STATUS.trial,
    planExpiration: null,
    createdAt: '2026-07-24 12:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.expired);
  assert.equal(result.trialDaysLeft, null);
});

test('keeps a valid trial active and reports its remaining days', () => {
  const result = getEffectivePlanAccess({
    userType: 'membro',
    planStatus: PLAN_STATUS.trial,
    planExpiration: null,
    createdAt: '2026-07-25 12:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.trial);
  assert.equal(result.trialDaysLeft, 1);
});

test('a trial started later (sem_teste → start-trial) ends at plano_expiracao, not 15 days after sign-up', () => {
  const active = getEffectivePlanAccess({
    userType: 'titular',
    planStatus: PLAN_STATUS.trial,
    planExpiration: '2026-08-10 12:00:00',
    createdAt: '2026-01-01 00:00:00',
  }, now);
  assert.equal(active.status, PLAN_STATUS.trial);
  assert.equal(active.trialDaysLeft, 2);

  const ended = getEffectivePlanAccess({
    userType: 'titular',
    planStatus: PLAN_STATUS.trial,
    planExpiration: '2026-08-08 12:00:00',
    createdAt: '2026-08-01 00:00:00',
  }, now);
  assert.equal(ended.status, PLAN_STATUS.expired);
});

test('sem_teste has no access and no trial days, whatever the dates', () => {
  const result = getEffectivePlanAccess({
    userType: 'titular',
    planStatus: PLAN_STATUS.notStarted,
    planExpiration: null,
    createdAt: '2026-08-08 00:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.notStarted);
  assert.equal(result.trialDaysLeft, null);
  assert.equal(hasPremiumFeatures({ userType: 'titular', status: PLAN_STATUS.notStarted, planType: null }), false);
});

test('expires a one-time plan at its Brasilia timestamp', () => {
  const result = getEffectivePlanAccess({
    userType: 'membro',
    planStatus: PLAN_STATUS.active,
    planExpiration: '2026-08-08 12:00:00',
    createdAt: '2026-01-01 00:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.expired);
});

test('keeps a recurring plan active when it has no expiration date', () => {
  const result = getEffectivePlanAccess({
    userType: 'membro',
    planStatus: PLAN_STATUS.active,
    planExpiration: null,
    createdAt: '2026-01-01 00:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.active);
});

test('reads the plan tier, including the legacy plan types', () => {
  assert.equal(planTier('starter'), PLAN_TIER.starter);
  assert.equal(planTier('premium'), PLAN_TIER.premium);
  assert.equal(planTier('mensal'), PLAN_TIER.starter, 'the old Plus is Starter');
  assert.equal(planTier('anual'), PLAN_TIER.premium, 'the old annual plan was sold as Premium');
  assert.equal(planTier(null), PLAN_TIER.starter);
});

test('releases Premium features to the admin, the trial and an active Premium plan', () => {
  assert.equal(hasPremiumFeatures({ userType: 'admin', status: PLAN_STATUS.expired, planType: null }), true);
  assert.equal(hasPremiumFeatures({ userType: 'titular', status: PLAN_STATUS.trial, planType: null }), true);
  assert.equal(hasPremiumFeatures({ userType: 'titular', status: PLAN_STATUS.active, planType: 'premium' }), true);
  assert.equal(hasPremiumFeatures({ userType: 'titular', status: PLAN_STATUS.active, planType: 'anual' }), true);
});

test('keeps Premium features locked for Starter and expired plans', () => {
  assert.equal(hasPremiumFeatures({ userType: 'titular', status: PLAN_STATUS.active, planType: 'starter' }), false);
  assert.equal(hasPremiumFeatures({ userType: 'titular', status: PLAN_STATUS.active, planType: 'mensal' }), false);
  assert.equal(hasPremiumFeatures({ userType: 'titular', status: PLAN_STATUS.expired, planType: 'premium' }), false);
});
