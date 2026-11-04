import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { getToken, logout } from './session';

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
});

test('sessão de Licitações: o token da aba vale antes do guardado no navegador', () => {
  installStorages({ token: 'da-aba' }, { token: 'do-navegador' });
  assert.equal(getToken(), 'da-aba');
});

test('sessão de Licitações: sem token na aba, vale o guardado no navegador; sem nenhum, nulo', () => {
  installStorages({}, { token: 'do-navegador' });
  assert.equal(getToken(), 'do-navegador');
  installStorages({}, {});
  assert.equal(getToken(), null);
});

test('sessão de Licitações: sair apaga as mesmas chaves de Finanças e não toca nas outras', () => {
  const { session, local } = installStorages(
    { token: 'a', auth_origin: 'tenders' },
    {
      token: 'b',
      usuarioAtual: '{}',
      dadosUsuarioLogado: '{}',
      contaAtivaId: '1',
      contaAtivaNome: 'Conta',
      contaAtivaTipo: 'pj',
      tema: 'dark',
    },
  );

  logout();

  assert.equal(session.getItem('token'), null);
  for (const key of ['token', 'usuarioAtual', 'dadosUsuarioLogado', 'contaAtivaId', 'contaAtivaNome', 'contaAtivaTipo']) {
    assert.equal(local.getItem(key), null, key);
  }
  assert.equal(session.getItem('auth_origin'), 'tenders', 'a origem do login não é da sessão');
  assert.equal(local.getItem('tema'), 'dark', 'outras preferências ficam');
});
