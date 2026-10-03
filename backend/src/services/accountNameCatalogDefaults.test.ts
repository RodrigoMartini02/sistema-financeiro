import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_JOB_TITLES, DEFAULT_SECTORS } from './accountNameCatalogDefaults';
import { MAX_ACCOUNT_CATALOG_NAME_LENGTH } from './accountNameInput';

test('listas padrão: 8 setores e 10 cargos', () => {
  assert.equal(DEFAULT_SECTORS.length, 8);
  assert.equal(DEFAULT_JOB_TITLES.length, 10);
});

test('listas padrão: nomes preenchidos, sem espaço sobrando, no limite da coluna e sem repetir', () => {
  for (const list of [DEFAULT_SECTORS, DEFAULT_JOB_TITLES]) {
    for (const name of list) {
      assert.ok(name.length > 0 && name === name.trim(), `"${name}"`);
      assert.ok(name.length <= MAX_ACCOUNT_CATALOG_NAME_LENGTH, name);
    }
    const lowered = list.map((name) => name.toLowerCase());
    assert.equal(new Set(lowered).size, lowered.length);
  }
});
