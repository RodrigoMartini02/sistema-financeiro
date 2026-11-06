import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { createSession } from '@ui/auth/session';
import { apiRequest, getActiveAccountId } from './apiClient';

const originalFetch = globalThis.fetch;
const originalBrowser = new Map(['window', 'localStorage', 'sessionStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function browser(status: number) {
  Object.defineProperty(globalThis, 'window', { value: { location: { hostname: 'localhost', port: '5173' } }, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Credenciais inválidas' }), { status });
  const finance = createSession('finance');
  const tenders = createSession('tenders');
  finance.setSession('finance-token', { id: 1 });
  tenders.setSession('tenders-token', { id: 2 });
  return { finance, tenders };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, descriptor] of originalBrowser) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('401 de Finanças encerra somente sua sessão e sua conta ativa', async () => {
  const { finance, tenders } = browser(401);
  finance.setActiveAccount({ id: 10, name: 'Pessoal', type: 'pessoal' });
  tenders.setActiveAccount({ id: 20, name: 'Empresa', type: 'empresa' });
  assert.equal(getActiveAccountId(), 10);
  await assert.rejects(apiRequest('/auth/verify'), /Sessão expirada/);
  assert.equal(finance.getToken(), null);
  assert.equal(finance.getUser(), null);
  assert.equal(getActiveAccountId(), null);
  assert.equal(tenders.getToken(), 'tenders-token');
  assert.equal(tenders.getActiveAccountId(), 20);
});

test('401 de login público não encerra nenhuma sessão e não envia token', async () => {
  const { finance, tenders } = browser(401);
  let authorization: string | null = 'unread';
  globalThis.fetch = async (_url, init) => {
    authorization = new Headers(init?.headers).get('Authorization');
    return new Response(JSON.stringify({ success: false, message: 'Senha incorreta' }), { status: 401 });
  };
  await assert.rejects(apiRequest('/auth/login', { method: 'POST', body: '{}' }, { anonymous: true }), /Senha incorreta/);
  assert.equal(authorization, null);
  assert.equal(finance.getToken(), 'finance-token');
  assert.equal(tenders.getToken(), 'tenders-token');
});
