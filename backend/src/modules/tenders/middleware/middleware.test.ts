import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { readAccountIdParam } from './tenderAccess';
import { userRateLimiter } from './userRateLimiter';

test('accountId: ausente é null; inteiro positivo vale; o resto é inválido', () => {
  assert.equal(readAccountIdParam(undefined), null);
  assert.equal(readAccountIdParam(''), null);
  assert.equal(readAccountIdParam('42'), 42);
  assert.equal(readAccountIdParam('0'), 'invalid');
  assert.equal(readAccountIdParam('-1'), 'invalid');
  assert.equal(readAccountIdParam('1.5'), 'invalid');
  assert.equal(readAccountIdParam('abc'), 'invalid');
  assert.equal(readAccountIdParam(['1', '2']), 'invalid');
  assert.equal(readAccountIdParam('99999999999'), 'invalid');
});

function fakeResponse() {
  const response = { statusCode: 200, body: undefined as unknown };
  const res = {
    status(code: number) {
      response.statusCode = code;
      return res;
    },
    json(body: unknown) {
      response.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, response };
}

test('limite por usuário: passa até o máximo, depois 429; cada usuário tem a própria janela', () => {
  const limiter = userRateLimiter({ max: 2, windowMs: 60_000, message: 'Muitas prévias' });
  const run = (userId: number) => {
    const { res, response } = fakeResponse();
    let passed = false;
    const next: NextFunction = () => {
      passed = true;
    };
    limiter({ user: { id: userId, document: '', type: 'titular' } } as unknown as Request, res, next);
    return { passed, response };
  };
  assert.equal(run(1).passed, true);
  assert.equal(run(1).passed, true);
  const blocked = run(1);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.response.statusCode, 429);
  assert.deepEqual(blocked.response.body, { success: false, message: 'Muitas prévias' });
  assert.equal(run(2).passed, true, 'outro usuário não é afetado');
});
