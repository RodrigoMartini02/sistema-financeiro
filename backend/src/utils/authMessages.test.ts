import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_RECOVERY_ATTEMPTS, blockedAccessMessage, wrongCodeMessage } from './authMessages';

test('código errado diz quantas tentativas sobram', () => {
  assert.equal(MAX_RECOVERY_ATTEMPTS, 3);
  assert.equal(wrongCodeMessage(1), 'Código incorreto. Restam 2 tentativas.');
  assert.equal(wrongCodeMessage(2), 'Código incorreto. Resta 1 tentativa.');
  assert.equal(wrongCodeMessage(3), 'Código incorreto. Você usou as 3 tentativas: peça um novo código.');
});

test('só bloqueado e inativo barram o acesso', () => {
  assert.equal(blockedAccessMessage('bloqueado'), 'Conta bloqueada. Fale com o suporte.');
  assert.equal(blockedAccessMessage('inativo'), 'Acesso desativado pelo titular da conta.');
  assert.equal(blockedAccessMessage('ativo'), null);
  assert.equal(blockedAccessMessage(null), null);
  assert.equal(blockedAccessMessage(undefined), null);
});
