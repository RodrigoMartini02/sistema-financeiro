import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { after, describe, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { users } from '../db/identity';
import { testCnpj, uniqueEmail } from '../services/apiTestSupport';
import { signTendersToken, verifyTendersToken, type TendersAuthConfig } from '../services/authTokens';
import type { GoogleProfile } from '../services/googleAuth';
import type { RecoveryEmailSender } from '../services/recoveryEmail';
import { createTendersAuth } from './auth';

const PASSWORD = 'http-test-password-1';
const CONFIG: TendersAuthConfig = { jwtSecret: 'tenders-http-test-secret-with-more-than-32-characters', jwtExpiresIn: '7d' };

interface SessionData {
  token: string;
  usuario: { id: number; nome: string; email: string; documento: string; tipo: 'titular' | 'admin' | 'membro' };
}

interface ApiResponse<T> {
  status: number;
  body: { success: boolean; data?: T; message?: string; user?: { id: number; type: string }; hasFinanceUser?: boolean };
}

type ApiCall = <T = SessionData>(method: string, path: string, body?: unknown, token?: string) => Promise<ApiResponse<T>>;

interface ApiOptions {
  sendRecoveryEmail?: RecoveryEmailSender;
  readGoogleProfile?: (code: string, redirectUri: string) => Promise<GoogleProfile>;
}

async function withAuthApi(tx: TendersDb, run: (call: ApiCall) => Promise<void>, options: ApiOptions = {}): Promise<void> {
  const app = express();
  app.use(express.json());
  const auth = createTendersAuth({
    db: tx,
    config: CONFIG,
    now: () => new Date(),
    sendRecoveryEmail: options.sendRecoveryEmail ?? (async () => { throw new Error('Unexpected email request in test'); }),
    readGoogleProfile: options.readGoogleProfile ?? (async () => { throw new Error('Unexpected Google request in test'); }),
  });
  app.use('/api/tenders/auth', auth.authRoutes);
  app.get('/api/tenders/admin/probe', auth.authenticate, auth.requireAdmin, (_req, res) => res.json({ success: true }));
  app.get('/api/tenders/probe', auth.authenticate, (req, res) => {
    res.json({ success: true, user: req.tendersUser, hasFinanceUser: Object.hasOwn(req, 'user') });
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const call: ApiCall = async <T>(method: string, path: string, body?: unknown, token?: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/tenders${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() as ApiResponse<T>['body'] };
  };
  try {
    await run(call);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function registration(seed: number, email = uniqueEmail('http')) {
  return { documento: testCnpj(seed), razao_social: `HTTP Test ${seed} Ltda`, email, senha: PASSWORD };
}

async function register(call: ApiCall, seed: number): Promise<SessionData> {
  const response = await call('POST', '/auth/register', registration(seed));
  assert.equal(response.status, 201);
  assert.ok(response.body.data);
  return response.body.data;
}

describe('rotas públicas e autenticação de Licitações (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('cadastro exige CNPJ válido, login próprio e devolve só a identidade pública', async () => {
    await withRollback(async (tx) => {
      await withAuthApi(tx, async (call) => {
        for (const invalid of [
          { ...registration(201), documento: '52998224725' },
          { ...registration(201), documento: '11222333000182' },
          { ...registration(201), razao_social: '' },
          { ...registration(201), email: 'invalid' },
          { ...registration(201), senha: 'short' },
        ]) {
          assert.equal((await call('POST', '/auth/register', invalid)).status, 400);
        }
        const input = registration(201);
        const response = await call('POST', '/auth/register', input);
        assert.equal(response.status, 201);
        const session = response.body.data!;
        assert.deepEqual(Object.keys(session.usuario).sort(), ['documento', 'email', 'id', 'nome', 'sobrenome', 'status', 'tipo']);
        assert.equal(session.usuario.tipo, 'titular');
        assert.equal(verifyTendersToken(session.token, CONFIG).id, session.usuario.id);
        assert.equal((await call('POST', '/auth/register', { ...registration(202), email: input.email })).status, 400);
        assert.equal((await call('POST', '/auth/register', { ...registration(201), email: uniqueEmail('duplicate-cnpj') })).status, 400);

        assert.equal((await call('POST', '/auth/login', { documento: input.email, senha: PASSWORD })).status, 200);
        assert.equal((await call('POST', '/auth/login', { documento: input.documento, senha: PASSWORD })).status, 200);
        assert.equal((await call('POST', '/auth/login', { documento: input.email, senha: 'wrong-password' })).status, 401);
        assert.equal((await call('POST', '/auth/login', { documento: uniqueEmail('missing'), senha: PASSWORD })).status, 401);
        assert.equal((await call('POST', '/auth/login', {})).status, 400);
      });
    });
  });

  test('autenticação recusa token ausente, inválido, vencido ou de Finanças', async () => {
    await withRollback(async (tx) => {
      await withAuthApi(tx, async (call) => {
        const session = await register(call, 203);
        for (const token of [
          undefined,
          'invalid-token',
          jwt.sign({ id: session.usuario.id }, CONFIG.jwtSecret, { audience: 'licitacoes', expiresIn: -1 }),
          jwt.sign({ id: session.usuario.id, tipo: 'admin' }, CONFIG.jwtSecret, { expiresIn: '7d' }),
        ]) {
          assert.equal((await call('GET', '/probe', undefined, token)).status, 401);
        }
        const probe = await call('GET', '/probe', undefined, session.token);
        assert.equal(probe.status, 200);
        assert.equal(probe.body.user?.id, session.usuario.id);
        assert.equal(probe.body.hasFinanceUser, false);

        const absentUser = signTendersToken({ id: 2_000_000_000, document: null, type: 'admin' }, CONFIG);
        assert.equal((await call('GET', '/probe', undefined, absentUser)).status, 401);
      });
    });
  });

  test('status e permissão de admin vêm do banco a cada pedido', async () => {
    await withRollback(async (tx) => {
      await withAuthApi(tx, async (call) => {
        const session = await register(call, 204);
        const oldAdminToken = signTendersToken({ id: session.usuario.id, document: null, type: 'admin' }, CONFIG);
        assert.equal((await call('GET', '/admin/probe', undefined, oldAdminToken)).status, 403, 'tipo no token não promove a admin');
        await tx.update(users).set({ type: 'admin' }).where(eq(users.id, session.usuario.id));
        assert.equal((await call('GET', '/admin/probe', undefined, session.token)).status, 200);
        await tx.update(users).set({ type: 'titular' }).where(eq(users.id, session.usuario.id));
        assert.equal((await call('GET', '/admin/probe', undefined, oldAdminToken)).status, 403);
        for (const status of ['bloqueado', 'inativo'] as const) {
          await tx.update(users).set({ status }).where(eq(users.id, session.usuario.id));
          assert.equal((await call('GET', '/probe', undefined, session.token)).status, 401);
          assert.equal((await call('POST', '/auth/login', { documento: session.usuario.email, senha: PASSWORD })).status, 403);
        }
      });
    });
  });

  test('recuperação por HTTP usa o e-mail simulado e o código só redefine uma vez', async () => {
    await withRollback(async (tx) => {
      let sent: { to: string; code: string } | undefined;
      await withAuthApi(tx, async (call) => {
        const session = await register(call, 205);
        const email = session.usuario.email;
        assert.equal((await call('POST', '/auth/forgot-password', { email })).status, 200);
        assert.equal(sent?.to, email);
        assert.match(sent!.code, /^\d{6}$/);
        assert.equal((await call('POST', '/auth/verify-recovery-code', { email, codigo: 'wrong' })).status, 400);
        assert.equal((await call('POST', '/auth/verify-recovery-code', { email, codigo: sent!.code })).status, 200);
        assert.equal((await call('POST', '/auth/reset-password', { email, codigo: sent!.code, nova_senha: 'short' })).status, 400);
        const reset = { email, codigo: sent!.code, nova_senha: 'new-http-password-2' };
        assert.equal((await call('POST', '/auth/reset-password', reset)).status, 200);
        assert.equal((await call('POST', '/auth/reset-password', reset)).status, 400);
        assert.equal((await call('POST', '/auth/login', { documento: email, senha: PASSWORD })).status, 401);
        assert.equal((await call('POST', '/auth/login', { documento: email, senha: reset.nova_senha })).status, 200);
      }, { sendRecoveryEmail: async (input) => { sent = input; } });
    });
  });

  test('Google por HTTP só entra em conta existente e respeita bloqueio', async () => {
    await withRollback(async (tx) => {
      let profile: GoogleProfile = { email: uniqueEmail('missing-google'), googleId: 'google-test-id' };
      await withAuthApi(tx, async (call) => {
        const session = await register(call, 206);
        const request = { code: 'simulated-code', redirect_uri: 'http://localhost:5173/index.html' };
        assert.equal((await call('POST', '/auth/google', {})).status, 400);
        assert.equal((await call('POST', '/auth/google', request)).status, 403);
        profile = { ...profile, email: session.usuario.email };
        const entered = await call('POST', '/auth/google', request);
        assert.equal(entered.status, 200);
        assert.equal(entered.body.data?.usuario.id, session.usuario.id);
        await tx.update(users).set({ status: 'bloqueado' }).where(eq(users.id, session.usuario.id));
        assert.equal((await call('POST', '/auth/google', request)).status, 403);
      }, { readGoogleProfile: async () => profile });
    });
  });

  test('login bloqueia a sexta tentativa e não mistura a identidade de outro e-mail', async () => {
    await withRollback(async (tx) => {
      await withAuthApi(tx, async (call) => {
        const email = uniqueEmail('rate-limit');
        for (let attempt = 0; attempt < 5; attempt++) {
          assert.equal((await call('POST', '/auth/login', { documento: email, senha: PASSWORD })).status, 401);
        }
        assert.equal((await call('POST', '/auth/login', { documento: email.toUpperCase(), senha: PASSWORD })).status, 429);
        assert.equal((await call('POST', '/auth/login', { documento: uniqueEmail('other-rate-limit'), senha: PASSWORD })).status, 401);
      });
    });
  });
});
