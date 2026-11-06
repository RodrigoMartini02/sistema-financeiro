import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { getToken, logout, setSession } from './session';
import { tendersRequest } from './tendersApi';
import { readLoggedUserName } from '../utils/loggedUser';

const originalFetch = globalThis.fetch;

function createStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function installStorages(sessionData: Record<string, string>, localData: Record<string, string>) {
  const session = createStorage(sessionData);
  const local = createStorage(localData);
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
  return { session, local };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'sessionStorage');
  Reflect.deleteProperty(globalThis, 'localStorage');
  Reflect.deleteProperty(globalThis, 'window');
  Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true });
});

test('sessão de Licitações: o token da aba vale antes do guardado no navegador', () => {
  installStorages({ 'tenders.token': 'da-aba' }, { 'tenders.token': 'do-navegador' });
  assert.equal(getToken(), 'da-aba');
});

test('sessão de Licitações: sem token na aba, vale o guardado no navegador; sem nenhum, nulo', () => {
  installStorages({}, { 'tenders.token': 'do-navegador' });
  assert.equal(getToken(), 'do-navegador');
  installStorages({}, {});
  assert.equal(getToken(), null);
});

test('sessão de Licitações: sair apaga só as chaves do próprio produto', () => {
  const { session, local } = installStorages(
    { 'tenders.token': 'a', 'finance.token': 'finance-aba' },
    {
      'tenders.token': 'b',
      'tenders.user': '{"id":1}',
      'tenders.activeAccountId': '1',
      'tenders.activeAccountName': 'Empresa',
      'tenders.activeAccountType': 'empresa',
      'finance.token': 'finance-navegador',
      'finance.user': '{"id":2}',
      tema: 'dark',
    },
  );

  logout();

  assert.equal(session.getItem('tenders.token'), null);
  for (const key of ['tenders.token', 'tenders.user', 'tenders.activeAccountId', 'tenders.activeAccountName', 'tenders.activeAccountType']) {
    assert.equal(local.getItem(key), null, key);
  }
  assert.equal(session.getItem('finance.token'), 'finance-aba');
  assert.equal(local.getItem('finance.token'), 'finance-navegador');
  assert.equal(local.getItem('finance.user'), '{"id":2}');
  assert.equal(local.getItem('tema'), 'dark', 'outras preferências ficam');
});

test('sessão de Licitações: tokens antigos e de Finanças não entram no produto', () => {
  installStorages({ token: 'antigo', 'finance.token': 'finance-aba' }, { token: 'antigo', 'finance.token': 'finance-navegador' });
  assert.equal(getToken(), null);
});

test('nome de quem entrou vem da sessão própria, mesmo com outra pessoa em Finanças', () => {
  installStorages({}, { 'finance.user': '{"id":2,"nome":"Outra pessoa"}' });
  assert.equal(readLoggedUserName(), 'Usuário');
  setSession('tenders-token', { id: 1, nome: 'Ana', sobrenome: 'Silva' });
  assert.equal(readLoggedUserName(), 'Ana Silva');
});

test('401 da API de Licitações encerra só a sessão de Licitações', async () => {
  const { session, local } = installStorages(
    { 'tenders.token': 'tenders-aba', 'finance.token': 'finance-aba' },
    { 'tenders.token': 'tenders-local', 'tenders.user': '{"id":1}', 'finance.token': 'finance-local', 'finance.user': '{"id":2}' },
  );
  Object.defineProperty(globalThis, 'window', { value: { location: { hostname: 'localhost', port: '5173' } }, configurable: true });
  Object.defineProperty(globalThis, 'fetch', {
    value: async (_url: string, init: RequestInit) => {
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer tenders-aba');
      return new Response(JSON.stringify({ success: false, message: 'Sessão vencida' }), { status: 401 });
    },
    configurable: true,
  });

  await assert.rejects(tendersRequest('/access'), { status: 401 });
  assert.equal(getToken(), null);
  assert.equal(local.getItem('tenders.user'), null);
  assert.equal(session.getItem('finance.token'), 'finance-aba');
  assert.equal(local.getItem('finance.token'), 'finance-local');
  assert.equal(local.getItem('finance.user'), '{"id":2}');
});
