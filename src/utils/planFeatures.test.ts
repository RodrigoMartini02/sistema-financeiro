import assert from 'node:assert/strict';
import test from 'node:test';
import { activePlanLabel, hasPremiumFeatures, PLAN_TIER, planGateReason, planTierOf } from './planFeatures';

test('libera o Premium quando o servidor libera (teste grátis, Premium ou admin)', () => {
  assert.equal(hasPremiumFeatures({ recursos_premium: true }), true);
});

test('trava o Premium só quando o servidor diz que não', () => {
  assert.equal(hasPremiumFeatures({ recursos_premium: false }), false);
});

test('resposta antiga, sem o campo, e a demonstração seguem liberadas', () => {
  assert.equal(hasPremiumFeatures({ plano_tipo: 'mensal' }), true);
  assert.equal(hasPremiumFeatures(undefined), true);
  assert.equal(hasPremiumFeatures(null), true);
});

test('o nível vem de plano_nivel ou, na resposta antiga, de plano_tipo', () => {
  assert.equal(planTierOf({ plano_nivel: PLAN_TIER.premium, plano_tipo: 'premium' }), PLAN_TIER.premium);
  assert.equal(planTierOf({ plano_tipo: 'mensal' }), PLAN_TIER.starter);
  assert.equal(planTierOf({ plano_tipo: 'anual' }), PLAN_TIER.premium);
});

test('bloqueia o app com o plano vencido e o membro de titular sem Premium', () => {
  assert.equal(planGateReason({ status: 'expirado' }), 'expired');
  assert.equal(planGateReason({ status: 'ativo', isAccountMember: true, recursos_premium: false }), 'teamNotInPlan');
});

test('não bloqueia o titular no Starter nem o membro de titular com Premium', () => {
  assert.equal(planGateReason({ status: 'ativo', isAccountMember: false, recursos_premium: false }), null);
  assert.equal(planGateReason({ status: 'ativo', isAccountMember: true, recursos_premium: true }), null);
  assert.equal(planGateReason({ status: 'trial', isAccountMember: true, recursos_premium: true }), null);
});

test('nome do plano ativo na tela de assinatura', () => {
  assert.equal(activePlanLabel({ plano_tipo: 'starter', plano_nivel: PLAN_TIER.starter }), 'Starter');
  assert.equal(activePlanLabel({ plano_tipo: 'premium', plano_nivel: PLAN_TIER.premium }), 'Premium');
  assert.equal(activePlanLabel({ plano_tipo: 'admin', plano_nivel: null }), 'Admin');
});
