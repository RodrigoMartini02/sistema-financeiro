import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOG_RULES, canAccessCatalog, isCatalogListRequest, type CatalogName } from './catalogAccess';

const CATALOGS = Object.keys(CATALOG_RULES) as CatalogName[];
const WRITES: Array<[string, string]> = [['POST', '/'], ['PUT', '/7'], ['PATCH', '/7/toggle-active'], ['DELETE', '/7']];

function allowed(catalog: CatalogName, permissions: Parameters<typeof canAccessCatalog>[1], method: string, path: string) {
  return canAccessCatalog(catalog, permissions, isCatalogListRequest(catalog, method, path));
}

test('a permissão do cadastro libera listagem, detalhe e escrita', () => {
  for (const catalog of CATALOGS) {
    const permissions = { [CATALOG_RULES[catalog].manageFlag]: true };
    assert.ok(allowed(catalog, permissions, 'GET', '/'), catalog);
    assert.ok(allowed(catalog, permissions, 'GET', '/7'), catalog);
    for (const [method, path] of WRITES) {
      assert.ok(allowed(catalog, permissions, method, path), `${catalog} ${method} ${path}`);
    }
  }
});

test('quem depende da lista lê só a listagem: nada de detalhe nem escrita', () => {
  for (const catalog of CATALOGS) {
    const readers = CATALOG_RULES[catalog].listReaders;
    if (!Array.isArray(readers)) continue;
    for (const flag of readers) {
      const permissions = { [flag]: true };
      assert.ok(allowed(catalog, permissions, 'GET', '/'), `${catalog} lido por ${flag}`);
      assert.equal(allowed(catalog, permissions, 'GET', '/7'), false, `${catalog} detalhe com ${flag}`);
      for (const [method, path] of WRITES) {
        assert.equal(allowed(catalog, permissions, method, path), false, `${catalog} ${method} com ${flag}`);
      }
    }
  }
});

test('lançar despesa lê categorias de despesa, cartões e limites; lançar receita lê os cadastros da receita', () => {
  const expenses = { accessExpenses: true };
  assert.ok(allowed('expenseCategories', expenses, 'GET', '/'));
  assert.ok(allowed('cards', expenses, 'GET', '/'));
  assert.ok(allowed('cards', expenses, 'GET', '/limites'));
  assert.equal(allowed('incomeCategories', expenses, 'GET', '/'), false);
  assert.equal(allowed('clients', expenses, 'GET', '/'), false);

  const incomes = { accessIncomes: true };
  for (const catalog of ['incomeCategories', 'clients', 'contracts', 'representatives', 'products'] as const) {
    assert.ok(allowed(catalog, incomes, 'GET', '/'), catalog);
  }
  assert.equal(allowed('expenseCategories', incomes, 'GET', '/'), false);
  assert.equal(allowed('cards', incomes, 'GET', '/'), false);
  assert.equal(allowed('services', incomes, 'GET', '/'), false);
});

test('Setores e Cargos: cada tela com a sua permissão, uma não libera a outra', () => {
  assert.ok(allowed('sectors', { accessSectors: true }, 'POST', '/'));
  assert.equal(allowed('jobTitles', { accessSectors: true }, 'GET', '/'), false);
  assert.ok(allowed('jobTitles', { accessJobTitles: true }, 'DELETE', '/7'));
  assert.equal(allowed('sectors', { accessJobTitles: true, accessAccounts: true }, 'GET', '/'), false);
});

test('sem permissão nenhuma só a lista de contas fica aberta', () => {
  for (const catalog of CATALOGS) {
    const expected = catalog === 'accounts';
    assert.equal(allowed(catalog, {}, 'GET', '/'), expected, catalog);
    assert.equal(allowed(catalog, null, 'GET', '/'), expected, catalog);
    assert.equal(allowed(catalog, null, 'POST', '/'), false, catalog);
  }
  assert.equal(allowed('accounts', null, 'PUT', '/3'), false);
});

test('só GET conta como listagem, e só nos caminhos da lista', () => {
  assert.ok(isCatalogListRequest('cards', 'GET', '/limites'));
  assert.equal(isCatalogListRequest('cards', 'POST', '/'), false);
  assert.equal(isCatalogListRequest('cards', 'HEAD', '/'), false);
  assert.equal(isCatalogListRequest('expenseCategories', 'GET', '/stats/usage'), false);
  assert.equal(isCatalogListRequest('contracts', 'GET', '/faturamento'), false);
});
