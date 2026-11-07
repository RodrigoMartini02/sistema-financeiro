import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { TENDERS_TOKEN_AUDIENCE, readTendersAuthConfig, signTendersToken, verifyTendersToken, type TendersAuthConfig } from './authTokens';

const SECRET = 'segredo-de-licitacoes-com-mais-de-32-caracteres';
const CONFIG: TendersAuthConfig = { jwtSecret: SECRET, jwtExpiresIn: '7d' };
const USER = { id: 42, document: '11222333000181', type: 'titular' as const };

test('configuração: sem o segredo, ou com um curto, o servidor não sobe', () => {
  assert.throws(() => readTendersAuthConfig({}), /TENDERS_JWT_SECRET is not set/);
  assert.throws(() => readTendersAuthConfig({ TENDERS_JWT_SECRET: 'curto' }), /at least 32 characters/);
  // Só o segredo de Finanças não basta: o de Licitações é outro.
  assert.throws(() => readTendersAuthConfig({ JWT_SECRET: SECRET }), /TENDERS_JWT_SECRET is not set/);
});

test('configuração: validade padrão de 7 dias, ou a do ambiente', () => {
  assert.deepEqual(readTendersAuthConfig({ TENDERS_JWT_SECRET: SECRET }), { jwtSecret: SECRET, jwtExpiresIn: '7d' });
  assert.equal(readTendersAuthConfig({ TENDERS_JWT_SECRET: SECRET, JWT_EXPIRES_IN: '12h' }).jwtExpiresIn, '12h');
});

test('token: leva só quem é (id, documento, tipo) e volta igual na conferência', () => {
  const decoded = verifyTendersToken(signTendersToken(USER, CONFIG), CONFIG);
  assert.deepEqual({ id: decoded.id, documento: decoded.documento, tipo: decoded.tipo }, { id: 42, documento: '11222333000181', tipo: 'titular' });
});

test('token de outro segredo não vale', () => {
  const foreign = signTendersToken(USER, { ...CONFIG, jwtSecret: 'outro-segredo-qualquer-com-mais-de-32-caracteres' });
  assert.throws(() => verifyTendersToken(foreign, CONFIG), jwt.JsonWebTokenError);
});

test('token de Finanças não vale, nem com o mesmo segredo: falta o público de Licitações', () => {
  const financeToken = jwt.sign({ id: 42, documento: USER.document, tipo: 'titular', role: 'titular' }, SECRET, { expiresIn: '7d' });
  assert.throws(() => verifyTendersToken(financeToken, CONFIG), /audience invalid/);
  const otherAudience = jwt.sign({ id: 42 }, SECRET, { audience: 'financas' });
  assert.throws(() => verifyTendersToken(otherAudience, CONFIG), /audience invalid/);
  assert.equal(TENDERS_TOKEN_AUDIENCE, 'licitacoes');
});

test('token vencido e identidade ausente ou inválida são recusados', () => {
  const expired = jwt.sign({ id: 42 }, SECRET, { audience: TENDERS_TOKEN_AUDIENCE, expiresIn: -10 });
  assert.throws(() => verifyTendersToken(expired, CONFIG), jwt.TokenExpiredError);
  const withoutId = jwt.sign({ documento: USER.document }, SECRET, { audience: TENDERS_TOKEN_AUDIENCE });
  assert.throws(() => verifyTendersToken(withoutId, CONFIG), /invalid token payload/);
  for (const id of ['42', 0, -1, 1.5]) {
    const invalidId = jwt.sign({ id }, SECRET, { audience: TENDERS_TOKEN_AUDIENCE });
    assert.throws(() => verifyTendersToken(invalidId, CONFIG), /invalid token payload/);
  }
  assert.throws(() => verifyTendersToken('isto-nao-e-um-token', CONFIG), jwt.JsonWebTokenError);
});
