import assert from 'node:assert/strict';
import test from 'node:test';
import type { TenderSubscription } from '../types';
import { formatCents, priceNote, situationLabel, usersLabel } from './billing';

const price = { baseCents: 499, includedUsers: 2, extraUserCents: 299 };

const subscription = (overrides: Partial<TenderSubscription>): TenderSubscription => ({
  accessType: 'assinatura',
  situation: 'teste',
  trialUntil: null,
  paidUntil: null,
  recurring: false,
  usersCount: 1,
  monthlyAmountCents: 499,
  ...overrides,
});

// O Intl separa "R$" do valor com espaço não separável.
const NBSP = ' ';

test('valor em reais e a nota do limite de usuários', () => {
  assert.equal(formatCents(499), `R$${NBSP}4,99`);
  assert.equal(formatCents(798), `R$${NBSP}7,98`);
  assert.equal(priceNote(price), `Incluídos: você e mais 1. Cada usuário a mais: R$${NBSP}2,99/mês, a partir da próxima cobrança.`);
  assert.equal(usersLabel(1), '1 usuário');
  assert.equal(usersLabel(3), '3 usuários');
});

test('situação da assinatura na tela', () => {
  assert.equal(situationLabel(subscription({ situation: 'cortesia', accessType: 'cortesia' })), 'Cortesia: sem cobrança e sem limite de usuários');
  assert.equal(situationLabel(subscription({ situation: 'teste', trialUntil: '2026-10-21T10:00:00-03:00' })), 'Teste grátis até 21/10/2026');
  assert.equal(situationLabel(subscription({ situation: 'paga', paidUntil: '2026-11-20T10:00:00-03:00' })), 'Pago até 20/11/2026');
  assert.equal(situationLabel(subscription({ situation: 'recorrente', recurring: true })), 'Assinatura recorrente ativa (renova sozinha)');
  assert.equal(situationLabel(subscription({ situation: 'vencida' })), 'Assinatura vencida');
});
