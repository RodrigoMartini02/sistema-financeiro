import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { ConnectStateError, readConnectState, signConnectState } from './mercadoPagoState';

const SECRET = 'segredo-de-teste';

test('o state volta com a conta e o usuário que iniciaram a conexão', () => {
  const token = signConnectState({ accountId: 19, userId: 7 }, SECRET);
  assert.deepEqual(readConnectState(token, SECRET), { accountId: 19, userId: 7 });
});

test('state com outra assinatura, de outro propósito ou vencido é recusado', () => {
  const token = signConnectState({ accountId: 19, userId: 7 }, SECRET);
  assert.throws(() => readConnectState(token, 'outro-segredo'), ConnectStateError);
  const loginToken = jwt.sign({ id: 7, accountId: 19, userId: 7 }, SECRET);
  assert.throws(() => readConnectState(loginToken, SECRET), ConnectStateError);
  const expired = jwt.sign({ purpose: 'mp-connect', accountId: 19, userId: 7 }, SECRET, { expiresIn: -10 });
  assert.throws(() => readConnectState(expired, SECRET), ConnectStateError);
  assert.throws(() => readConnectState('lixo', SECRET), ConnectStateError);
});
