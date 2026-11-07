import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { RequestInputError } from '../utils/requestInput';
import { authRoute } from './authHandler';

function fakeResponse() {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) { sent.status = code; return response; },
    json(body: unknown) { sent.body = body; return response; },
  };
  return { response: response as unknown as Response, sent };
}

test('auth: erro do banco não coloca query, parâmetros, código, hash ou dados pessoais na resposta nem no log', async (context) => {
  const logged = context.mock.method(console, 'error', () => undefined);
  const secretError = new DrizzleQueryError(
    'delete from codigo_recuperacao where codigo = $1',
    ['654321', 'private@example.test', '11222333000181', '$2a$password-hash'],
    new Error('provider-secret-in-cause'),
  );
  const handler = authRoute('reset-password', 'Não foi possível redefinir a senha agora.', async () => { throw secretError; });
  const { response, sent } = fakeResponse();
  await handler({} as Request, response, () => undefined);
  assert.equal(sent.status, 500);
  assert.deepEqual(sent.body, { success: false, message: 'Não foi possível redefinir a senha agora.' });
  assert.deepEqual(logged.mock.calls.map((call) => call.arguments), [
    ['[Tenders auth] Unexpected failure:', { operation: 'reset-password' }],
  ]);
});

test('auth: erros esperados preservam status e mensagem sem registrar dados do pedido', async (context) => {
  const logged = context.mock.method(console, 'error', () => undefined);
  const handler = authRoute('login', 'Tente de novo', async () => { throw new RequestInputError('Conta bloqueada', 403); });
  const { response, sent } = fakeResponse();
  await handler({} as Request, response, () => undefined);
  assert.equal(sent.status, 403);
  assert.deepEqual(sent.body, { success: false, message: 'Conta bloqueada' });
  assert.equal(logged.mock.callCount(), 0);
});
