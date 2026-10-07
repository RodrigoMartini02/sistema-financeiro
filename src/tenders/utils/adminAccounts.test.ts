import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminTenderAccount } from '../types';
import { adminSituationLabel, filterAdminAccounts } from './adminAccounts';

function account(accountId: number, accountName: string, ownerName: string, ownerEmail: string): AdminTenderAccount {
  return {
    accountId,
    accountName,
    accountType: 'empresa',
    ownerName,
    ownerEmail,
    courtesy: false,
    situation: null,
    trialUntil: null,
    paidUntil: null,
    changedAt: null,
  };
}

const ACCOUNTS = [
  account(1, 'Construções Ávila', 'Rodrigo Martini', 'rodrigo@exemplo.com'),
  account(2, 'Pessoal', 'Joana Souza', 'joana@exemplo.com'),
];

test('contas: busca vazia mostra todas', () => {
  assert.deepEqual(filterAdminAccounts(ACCOUNTS, '  '), ACCOUNTS);
});

test('contas: busca por conta, dono ou e-mail, sem diferenciar maiúsculas nem acentos', () => {
  assert.deepEqual(filterAdminAccounts(ACCOUNTS, 'construcoes avila').map((item) => item.accountId), [1]);
  assert.deepEqual(filterAdminAccounts(ACCOUNTS, 'JOANA').map((item) => item.accountId), [2]);
  assert.deepEqual(filterAdminAccounts(ACCOUNTS, 'rodrigo@').map((item) => item.accountId), [1]);
  assert.deepEqual(filterAdminAccounts(ACCOUNTS, 'inexistente'), []);
});

test('contas: situação no módulo, com "Sem o módulo" para quem nunca teve', () => {
  const base = ACCOUNTS[0]!;
  assert.equal(adminSituationLabel(base), 'Sem o módulo');
  assert.equal(adminSituationLabel({ ...base, courtesy: true, situation: 'cortesia' }), 'Cortesia: sem cobrança e sem limite de usuários');
  assert.equal(adminSituationLabel({ ...base, situation: 'teste', trialUntil: '2026-10-21T10:00:00-03:00' }), 'Teste grátis até 21/10/2026');
  assert.equal(adminSituationLabel({ ...base, situation: 'vencida' }), 'Assinatura vencida');
});
