import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import type { TendersDb } from '../collector/database';
import { signTendersToken } from '../services/authTokens';
import { createTendersAuthenticate } from './authenticate';

test('autenticação: falha do banco é registrada sem mensagem, causa ou parâmetros externos', async (context) => {
  const logged = context.mock.method(console, 'error', () => undefined);
  const secretError = new DrizzleQueryError('select private_query', ['private@example.test', '654321'], new Error('provider-secret'));
  const database = { select: () => { throw secretError; } } as unknown as TendersDb;
  const config = { jwtSecret: 'authentication-log-test-secret-with-more-than-32-characters', jwtExpiresIn: '7d' };
  const token = signTendersToken({ id: 1, document: null, type: 'titular' }, config);
  const request = { header: () => `Bearer ${token}` } as unknown as Request;
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) { sent.status = code; return response; },
    json(body: unknown) { sent.body = body; return response; },
  };
  let proceeded = false;
  await createTendersAuthenticate(database, config)(request, response as unknown as Response, () => { proceeded = true; });
  assert.equal(proceeded, false);
  assert.equal(sent.status, 500);
  assert.deepEqual(sent.body, { success: false, message: 'Não foi possível validar a sessão agora. Tente de novo em instantes.' });
  assert.deepEqual(logged.mock.calls.map((call) => call.arguments), [
    ['[Tenders auth] Unexpected failure:', { operation: 'authenticate' }],
  ]);
});
