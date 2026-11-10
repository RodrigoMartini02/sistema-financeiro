import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createTendersApp, type TendersAppDependencies } from './app';
import type { TendersDb } from './collector/database';
import type { ContractStoreAccess } from './contractStore/reader';
import { signTendersToken } from './services/authTokens';

const AUTH_CONFIG = { jwtSecret: 'independent-tenders-api-test-secret-over-32-characters', jwtExpiresIn: '7d' };

function dependencies(options: { env?: NodeJS.ProcessEnv; healthFails?: boolean } = {}): TendersAppDependencies {
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ status: 'ativo', type: 'titular', document: '123' }] }) }) }),
  } as unknown as TendersDb;
  const contractStore: ContractStoreAccess = {
    query: async () => { throw new Error('The HTTP bootstrap must not start collection or query the store'); },
    status: () => ({ ready: false, revision: null, publishedAt: null, today: null, totals: null }),
  };
  return {
    api: { db, contractStore, userFiles: null, now: () => new Date(), pncpDetails:{ fetchDetailList: async () => { throw new Error('Unexpected PNCP request'); } } },
    auth: {
      db, config: AUTH_CONFIG, now: () => new Date(),
      sendRecoveryEmail: async () => { throw new Error('Unexpected email request'); },
      readGoogleProfile: async () => { throw new Error('Unexpected Google request'); },
    },
    checkDatabase: async () => { if (options.healthFails) throw new Error('postgres://private:password@finance/private'); },
    env: options.env ?? { NODE_ENV: 'production' },
  };
}

async function withApi(deps: TendersAppDependencies, run: (url: string) => Promise<void>): Promise<void> {
  const server = createTendersApp(deps).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('API própria: health usa sua verificação de banco, sem depender de contratos prontos', async () => {
  for (const healthFails of [false, true]) {
    let checked = 0;
    const deps = dependencies({ healthFails });
    const check = deps.checkDatabase;
    deps.checkDatabase = async () => { checked += 1; await check(); };
    await withApi(deps, async (url) => {
      const response = await fetch(`${url}/health`);
      assert.equal(response.status, healthFails ? 503 : 200);
      assert.deepEqual(await response.json(), {
        status: healthFails ? 'error' : 'ok', service: 'tenders-api', database: healthFails ? 'disconnected' : 'connected',
      });
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.equal(response.headers.get('x-powered-by'), null);
      assert.ok(response.headers.get('strict-transport-security'));
    });
    assert.equal(checked, 1);
  }
});

test('API própria: auth e webhook públicos, demais rotas autenticadas e admin confere o papel atual', async () => {
  await withApi(dependencies(), async (url) => {
    assert.equal((await fetch(`${url}/api/tenders/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })).status, 400);
    assert.equal((await fetch(`${url}/api/tenders/billing/webhook`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`${url}/api/tenders/billing/config`)).status, 401);
    assert.equal((await fetch(`${url}/api/tenders/admin/accounts`)).status, 401);
    assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST' })).status, 404);

    const financeToken = jwt.sign({ id: 1 }, AUTH_CONFIG.jwtSecret);
    assert.equal((await fetch(`${url}/api/tenders/billing/config`, { headers: { Authorization: `Bearer ${financeToken}` } })).status, 401);
    const token = signTendersToken({ id: 1, document: null, type: 'admin' }, AUTH_CONFIG);
    const headers = { Authorization: `Bearer ${token}` };
    assert.equal((await fetch(`${url}/api/tenders/billing/config`, { headers })).status, 200);
    assert.equal((await fetch(`${url}/api/tenders/admin/accounts`, { headers })).status, 403);
  });
});

test('API própria: CORS aceita o site e preflight, recusa origem externa e localhost em produção', async () => {
  await withApi(dependencies(), async (url) => {
    const origin = 'https://fin-gerence.com.br';
    const preflight = await fetch(`${url}/api/tenders/notices`, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    for (const blocked of ['https://externo.example', 'http://localhost:5173']) {
      const response = await fetch(`${url}/health`, { headers: { Origin: blocked } });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
  });
});

test('API própria: desenvolvimento permite Vite local; origens explícitas substituem as públicas', async () => {
  await withApi(dependencies({ env: { ALLOWED_ORIGINS: 'https://licitacoes.example' } }), async (url) => {
    for (const origin of ['http://localhost:5173', 'https://licitacoes.example']) {
      const response = await fetch(`${url}/health`, { headers: { Origin: origin } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('strict-transport-security'), null);
    }
    assert.equal((await fetch(`${url}/health`, { headers: { Origin: 'https://fin-gerence.com.br' } })).status, 403);
  });
});

test('API própria: JSON inválido recebe erro de entrada sem expor o corpo', async () => {
  await withApi(dependencies(), async (url) => {
    const response = await fetch(`${url}/api/tenders/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"senha":"private-password"',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { success: false, message: 'JSON inválido.' });
  });
});
