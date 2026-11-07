import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReceiveEntries,
  normalizeCatalogName,
  othersSubcategoryName,
  readInitialSubcategoryNames,
  requiresInitialSubcategory,
  selectableEntryIds,
  type CatalogEntry,
} from './catalogRules';

function entry(id: number, parentId: number | null, options: Partial<CatalogEntry> = {}): CatalogEntry {
  return { id, parentId, active: true, isSystem: false, ...options };
}

test('conta PF: só subcategoria recebe lançamento, com ou sem subcategorias no grupo', () => {
  assert.equal(canReceiveEntries(entry(2, 1), false, 'pessoal'), true);
  assert.equal(canReceiveEntries(entry(1, null), true, 'pessoal'), false);
  assert.equal(canReceiveEntries(entry(1, null), false, 'pessoal'), false);
});

test('conta PJ e conta desconhecida: a raiz só recebe quando não tem subcategoria ativa', () => {
  for (const accountType of ['empresa', null] as const) {
    assert.equal(canReceiveEntries(entry(1, null), true, accountType), false);
    assert.equal(canReceiveEntries(entry(1, null), false, accountType), true);
    assert.equal(canReceiveEntries(entry(2, 1), false, accountType), true);
  }
});

test('linha de sistema nunca recebe lançamento, em nenhum tipo de conta', () => {
  for (const accountType of ['pessoal', 'empresa', null] as const) {
    assert.equal(canReceiveEntries(entry(3, 1, { isSystem: true }), false, accountType), false);
    assert.equal(canReceiveEntries(entry(3, null, { isSystem: true }), false, accountType), false);
  }
});

test('linha inativa continua valendo: desativar não trava a edição de lançamento antigo', () => {
  assert.equal(canReceiveEntries(entry(2, 1, { active: false }), false, 'pessoal'), true);
  assert.equal(canReceiveEntries(entry(1, null, { active: false }), false, 'empresa'), true);
});

test('lista inteira: a raiz de PJ com subcategoria ativa fica de fora; com todas inativas, volta', () => {
  const withActiveSub = [entry(1, null), entry(2, 1), entry(3, null)];
  assert.deepEqual([...selectableEntryIds(withActiveSub, 'empresa')].sort(), [2, 3]);

  const allSubsInactive = [entry(1, null), entry(2, 1, { active: false })];
  assert.deepEqual([...selectableEntryIds(allSubsInactive, 'empresa')].sort(), [1, 2]);
});

test('lista inteira em conta PF: nenhuma raiz recebe, mesmo sem subcategoria, e o sistema fica de fora', () => {
  const entries = [entry(1, null), entry(2, 1), entry(3, null), entry(4, 3, { isSystem: true })];
  assert.deepEqual([...selectableEntryIds(entries, 'pessoal')], [2]);
});

test('só a conta PF exige subcategoria inicial no grupo novo', () => {
  assert.equal(requiresInitialSubcategory('pessoal'), true);
  assert.equal(requiresInitialSubcategory('empresa'), false);
  assert.equal(requiresInitialSubcategory(null), false);
});

test('subcategorias iniciais: aparadas, sem repetir e dentro do limite', () => {
  assert.deepEqual(readInitialSubcategoryNames(undefined, 10), []);
  assert.deepEqual(readInitialSubcategoryNames(null, 10), []);
  assert.deepEqual(readInitialSubcategoryNames(['  Pets ', 'Filhos'], 10), ['Pets', 'Filhos']);
  assert.equal(readInitialSubcategoryNames('Pets', 10), null);
  assert.equal(readInitialSubcategoryNames([''], 10), null);
  assert.equal(readInitialSubcategoryNames([42], 10), null);
  assert.equal(readInitialSubcategoryNames(['Pets', 'PETS'], 10), null);
  assert.equal(readInitialSubcategoryNames(['Nome grande demais'], 10), null);
});

test('nome do "Outros" do grupo e comparação de nomes', () => {
  assert.equal(othersSubcategoryName('Moradia'), 'Outros de Moradia');
  assert.equal(normalizeCatalogName('  Mercado '), 'mercado');
});
