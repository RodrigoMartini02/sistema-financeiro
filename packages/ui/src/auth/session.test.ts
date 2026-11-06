import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from './session';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function sessions() {
  const local = memoryStorage();
  const tab = memoryStorage();
  const stores = { local, tab };
  return { local, tab, finance: createSession('finance', stores), tenders: createSession('tenders', stores) };
}

test('sessions coexist; logout removes only the selected product and preserves unrelated storage', () => {
  const { finance, tenders, local, tab } = sessions();
  local.values.set('theme', 'dark');
  // Old unprefixed sessions deliberately do not grant access after the switch.
  local.values.set('token', 'legacy');
  assert.equal(finance.getToken(), null);
  assert.equal(tenders.getToken(), null);

  finance.setSession('finance-token', { id: 1, nome: 'Finanças' });
  tenders.setSession('tenders-token', { id: 2, nome: 'Licitações' });
  finance.setActiveAccount({ id: 10, name: 'Pessoal', type: 'pessoal' });
  tenders.setActiveAccount({ id: 20, name: 'Empresa', type: 'empresa' });
  tenders.setLoginOrigin('tenders');
  assert.equal(finance.getToken(), 'finance-token');
  assert.equal(tenders.getUser()?.nome, 'Licitações');

  finance.clear();
  assert.equal(finance.getToken(), null);
  assert.equal(finance.getUser(), null);
  assert.equal(finance.getActiveAccountId(), null);
  assert.equal(tab.values.has('finance.token'), false);
  assert.equal(tenders.getToken(), 'tenders-token');
  assert.equal(tenders.getActiveAccountId(), 20);
  assert.equal(tenders.getActiveAccountName(), 'Empresa');
  assert.equal(tenders.getActiveAccountType(), 'empresa');
  assert.equal(tenders.consumeLoginOrigin(), 'tenders');
  assert.equal(local.values.get('theme'), 'dark');
  assert.equal(local.values.get('token'), 'legacy');
});

test('independent page instances share a product session and preserve the assistant destination once', () => {
  const { finance, local, tab } = sessions();
  finance.setLoginOrigin('assistant');
  const site = createSession('finance', { local, tab });
  site.setSession('token', { id: 3 });
  assert.equal(finance.getToken(), 'token');
  assert.equal(finance.getUser()?.id, 3);
  assert.equal(site.consumeLoginOrigin(), 'assistant');
  assert.equal(finance.consumeLoginOrigin(), null);
  tab.values.delete('finance.token');
  assert.equal(finance.getToken(), 'token', 'persistent session survives a new tab');
});

test('switching user discards the previous active account only for that product', () => {
  const { finance, tenders } = sessions();
  finance.setSession('first', { id: 1 });
  finance.setActiveAccount({ id: 10, name: 'Conta', type: 'empresa' });
  tenders.setActiveAccount({ id: 20, name: 'Outra conta', type: 'empresa' });
  finance.setSession('renewed', { id: 1 });
  assert.equal(finance.getActiveAccountId(), 10);
  finance.setSession('second', { id: 2 });
  assert.equal(finance.getActiveAccountId(), null);
  assert.equal(finance.getActiveAccountName(), null);
  assert.equal(finance.getActiveAccountType(), null);
  assert.equal(tenders.getActiveAccountId(), 20);
});

test('typed readers reject malformed browser values and unrecognized account types', () => {
  const { finance, local } = sessions();
  for (const raw of ['{', 'null', '[]', '{"id":"1"}', '{"id":0}', '{"id":1.5}']) {
    local.values.set('finance.user', raw);
    assert.equal(finance.getUser(), null);
  }
  local.values.set('finance.user', '{"id":1,"nome":17,"email":{},"tipo":"titular"}');
  assert.equal(finance.getUser()?.id, 1);
  assert.equal(finance.getUser()?.nome, undefined);
  assert.equal(finance.getUser()?.email, undefined);
  for (const raw of ['0', '-1', 'NaN', '1.5']) {
    local.values.set('finance.activeAccountId', raw);
    assert.equal(finance.getActiveAccountId(), null);
  }
  local.values.set('finance.activeAccountType', 'other');
  assert.equal(finance.getActiveAccountType(), null);
  assert.throws(() => finance.setSession('', { id: 1 }), /Invalid session/);
  assert.throws(() => finance.setSession('token', { id: -1 }), /Invalid session/);
});

test('session services can be imported and read without browser globals', () => {
  const finance = createSession('finance');
  assert.equal(finance.getToken(), null);
  assert.equal(finance.getUser(), null);
  assert.equal(finance.getActiveAccountId(), null);
  finance.clear();
});

test('blocked browser storage grants no identity; unexpected failures remain visible', () => {
  const blocked = {
    ...memoryStorage(),
    getItem: (): string | null => { throw new DOMException('Storage denied', 'SecurityError'); },
  };
  const finance = createSession('finance', { local: blocked, tab: blocked });
  assert.equal(finance.getToken(), null);
  assert.equal(finance.getUser(), null);
  assert.equal(finance.getActiveAccountId(), null);
  assert.equal(finance.getActiveAccountName(), null);
  assert.equal(finance.getActiveAccountType(), null);
  const broken = {
    ...memoryStorage(),
    getItem: (): string | null => { throw new Error('Unexpected failure'); },
  };
  assert.throws(() => createSession('finance', { local: broken, tab: broken }).getUser(), /Unexpected failure/);
});
