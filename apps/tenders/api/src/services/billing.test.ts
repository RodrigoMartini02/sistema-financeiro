import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTendersPaymentReference,
  monthlyAmountCents,
  nextPaidUntil,
  parseTendersPaymentReference,
  situationHasAccess,
  subscriptionSituation,
  type SubscriptionSnapshot,
} from './billing';

const now = new Date('2026-10-06T12:00:00-03:00');
const daysFromNow = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

test('o valor do mês cobre o titular e mais 1; cada usuário a mais soma R$ 2,99', () => {
  assert.equal(monthlyAmountCents(1), 499);
  assert.equal(monthlyAmountCents(2), 499);
  assert.equal(monthlyAmountCents(3), 798);
  assert.equal(monthlyAmountCents(5), 1396, '3 usuários a mais: 499 + 3 × 299');
});

test('o pagamento avulso soma 30 dias a partir de agora quando nada está valendo', () => {
  const paidUntil = nextPaidUntil({ now, trialUntil: daysFromNow(-1), paidUntil: daysFromNow(-10) });
  assert.equal(paidUntil.getTime(), daysFromNow(30).getTime());
});

test('pagar durante o teste não perde os dias do teste', () => {
  const paidUntil = nextPaidUntil({ now, trialUntil: daysFromNow(10), paidUntil: null });
  assert.equal(paidUntil.getTime(), daysFromNow(40).getTime());
});

test('pagar antes de vencer soma ao período já pago', () => {
  const paidUntil = nextPaidUntil({ now, trialUntil: daysFromNow(-20), paidUntil: daysFromNow(5) });
  assert.equal(paidUntil.getTime(), daysFromNow(35).getTime());
});

const subscription = (overrides: Partial<SubscriptionSnapshot>): SubscriptionSnapshot => ({
  active: true,
  accessType: 'assinatura',
  trialUntil: null,
  paidUntil: null,
  recurringId: null,
  ...overrides,
});

test('situação da assinatura: cortesia, recorrente, paga e teste têm acesso', () => {
  assert.equal(subscriptionSituation(subscription({ accessType: 'cortesia' }), now), 'cortesia');
  assert.equal(subscriptionSituation(subscription({ recurringId: 'pre-1' }), now), 'recorrente');
  assert.equal(subscriptionSituation(subscription({ paidUntil: daysFromNow(3), trialUntil: daysFromNow(1) }), now), 'paga');
  assert.equal(subscriptionSituation(subscription({ trialUntil: daysFromNow(1) }), now), 'teste');
  assert.equal(situationHasAccess('teste'), true);
});

test('situação da assinatura: vencida e desligada ficam sem acesso', () => {
  assert.equal(subscriptionSituation(subscription({ trialUntil: daysFromNow(-1), paidUntil: daysFromNow(-1) }), now), 'vencida');
  assert.equal(subscriptionSituation(subscription({ active: false, accessType: 'cortesia' }), now), 'desligada');
  assert.equal(situationHasAccess('vencida'), false);
  assert.equal(situationHasAccess('desligada'), false);
});

test('referência do pagamento: lic:<conta>, e o resto é ignorado', () => {
  assert.equal(buildTendersPaymentReference(7), 'lic:7');
  assert.equal(parseTendersPaymentReference('lic:7'), 7);
  assert.equal(parseTendersPaymentReference('fin:7:premium'), null);
  assert.equal(parseTendersPaymentReference('lic:0'), null);
  assert.equal(parseTendersPaymentReference('7'), null);
  assert.equal(parseTendersPaymentReference(undefined), null);
});
