import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { verifyFinanceToken } from './financeTokens';

const SECRET = 'finance-token-unit-test-secret-with-32-characters';

test('sessão de Finanças: preserva os tokens atuais sem audience', () => {
  const token = jwt.sign({ id: 42, documento: '11222333000181', tipo: 'titular' }, SECRET, { expiresIn: '7d' });
  assert.equal(verifyFinanceToken(token, SECRET).id, 42);
});

test('sessão de Finanças: recusa outro produto mesmo com o mesmo segredo', () => {
  for (const audience of ['licitacoes', ['licitacoes'], 'outro-produto']) {
    const token = jwt.sign({ id: 42, tipo: 'admin' }, SECRET, { audience });
    assert.throws(() => verifyFinanceToken(token, SECRET), /invalid token audience/);
  }
});

test('sessão de Finanças: recusa assinatura errada, token vencido e identidade inválida', () => {
  assert.throws(() => verifyFinanceToken(jwt.sign({ id: 42 }, 'other-secret'), SECRET), jwt.JsonWebTokenError);
  assert.throws(() => verifyFinanceToken(jwt.sign({ id: 42 }, SECRET, { expiresIn: -1 }), SECRET), jwt.TokenExpiredError);
  for (const id of [undefined, '42', 0, -1, 1.5]) {
    assert.throws(() => verifyFinanceToken(jwt.sign({ id }, SECRET), SECRET), /invalid token payload/);
  }
});
