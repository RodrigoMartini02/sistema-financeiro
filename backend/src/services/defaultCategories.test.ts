import assert from 'node:assert/strict';
import test from 'node:test';
import { othersSubcategoryName } from './catalogRules';
import { BUSINESS_DEFAULT_CATEGORIES, PERSONAL_DEFAULT_CATEGORIES, getDefaultCategories } from './defaultCategories';

function allNames(accountType: 'pessoal' | 'empresa'): string[] {
  return getDefaultCategories(accountType).flatMap((item) => [item.name, ...item.subcategories]);
}

test('listas padrão não repetem nome dentro do mesmo tipo de conta (índice único por nome)', () => {
  for (const accountType of ['pessoal', 'empresa'] as const) {
    const names = allNames(accountType).map((name) => name.toLowerCase());
    assert.equal(new Set(names).size, names.length, `nome repetido na lista ${accountType}`);
  }
});

test('PF: 12 grupos e 74 subcategorias, cada grupo terminando em "Outros de <grupo>"', () => {
  assert.equal(PERSONAL_DEFAULT_CATEGORIES.length, 12);
  for (const item of PERSONAL_DEFAULT_CATEGORIES) {
    assert.ok(item.subcategories.length > 1, `"${item.name}" não tem subcategorias`);
    assert.equal(item.subcategories.at(-1), othersSubcategoryName(item.name));
  }
  assert.equal(PERSONAL_DEFAULT_CATEGORIES.reduce((total, item) => total + item.subcategories.length, 0), 74);
});

test('PF: não há grupo "Outros" solto nem categoria de juros e encargos', () => {
  const names = allNames('pessoal').map((name) => name.toLowerCase());
  assert.ok(!names.includes('outros'));
  assert.ok(!names.some((name) => name.includes('encargos') || name.includes('juros')));
});

test('PJ: categorias soltas, sem subcategorias, e a lista de sempre', () => {
  assert.equal(BUSINESS_DEFAULT_CATEGORIES.length, 14);
  assert.ok(BUSINESS_DEFAULT_CATEGORIES.every((item) => item.subcategories.length === 0));
  assert.equal(BUSINESS_DEFAULT_CATEGORIES.at(-1)?.name, 'Outros');
  assert.ok(BUSINESS_DEFAULT_CATEGORIES.some((item) => item.name === 'Jurídico/Consultoria'));
});

test('PF: Academia fica em Saúde, Internet e Telefone em Moradia, restaurantes em Alimentação', () => {
  const byName = new Map(PERSONAL_DEFAULT_CATEGORIES.map((item) => [item.name, item.subcategories]));
  assert.ok(byName.get('Saúde')?.includes('Academia'));
  assert.ok(byName.get('Moradia')?.includes('Internet'));
  assert.ok(byName.get('Moradia')?.includes('Telefone'));
  assert.ok(byName.get('Alimentação')?.includes('Restaurantes e Bares'));
});
