import assert from 'node:assert/strict';
import test from 'node:test';
import { getEffectivePlanAccess, PLAN_STATUS } from './plan-access';

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
    userType: 'padrao',
    planStatus: PLAN_STATUS.trial,
    planExpiration: null,
    createdAt: '2026-07-24 12:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.expired);
  assert.equal(result.trialDaysLeft, null);
});

test('keeps a valid trial active and reports its remaining days', () => {
  const result = getEffectivePlanAccess({
    userType: 'padrao',
    planStatus: PLAN_STATUS.trial,
    planExpiration: null,
    createdAt: '2026-07-25 12:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.trial);
  assert.equal(result.trialDaysLeft, 1);
});

test('expires a one-time plan at its Brasilia timestamp', () => {
  const result = getEffectivePlanAccess({
    userType: 'padrao',
    planStatus: PLAN_STATUS.active,
    planExpiration: '2026-08-08 12:00:00',
    createdAt: '2026-01-01 00:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.expired);
});

test('keeps a recurring plan active when it has no expiration date', () => {
  const result = getEffectivePlanAccess({
    userType: 'padrao',
    planStatus: PLAN_STATUS.active,
    planExpiration: null,
    createdAt: '2026-01-01 00:00:00',
  }, now);

  assert.equal(result.status, PLAN_STATUS.active);
});
