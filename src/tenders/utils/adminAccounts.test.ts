import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminTenderAccount } from '../types';
import { filterAdminAccounts } from './adminAccounts';

function account(accountId: number, accountName: string, ownerName: string, ownerEmail: string): AdminTenderAccount {
  return { accountId, accountName, accountType: 'empresa', ownerName, ownerEmail, enabled: false, changedAt: null };
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
