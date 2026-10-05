import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPITAL_INCOME_CLASSIFICATION,
  CONTRACT_INCOME_CLASSIFICATION,
  getDefaultIncomeClassifications,
} from './incomeClassificationDefaults';

function todosOsNomes(tipo: 'pessoal' | 'empresa'): string[] {
  return getDefaultIncomeClassifications(tipo).flatMap((item) => [item.nome, ...item.subcategorias]);
}

test('listas padrão não repetem nome dentro do mesmo tipo de conta (índice único por nome)', () => {
  for (const tipo of ['pessoal', 'empresa'] as const) {
    const nomes = todosOsNomes(tipo).map((nome) => nome.toLowerCase());
    assert.equal(new Set(nomes).size, nomes.length, `nome repetido na lista ${tipo}`);
  }
});

test('listas padrão terminam em "Outros" e têm uma palavra por raiz', () => {
  for (const tipo of ['pessoal', 'empresa'] as const) {
    const raizes = getDefaultIncomeClassifications(tipo).map((item) => item.nome);
    assert.equal(raizes.at(-1), 'Outros');
    for (const raiz of raizes) assert.equal(raiz.trim().split(/\s+/).length, 1, `"${raiz}" tem mais de uma palavra`);
  }
});

test('a lista da empresa traz as classificações que o contrato usa', () => {
  const contratos = getDefaultIncomeClassifications('empresa').find((item) => item.nome === CONTRACT_INCOME_CLASSIFICATION.raiz);
  assert.ok(contratos);
  assert.deepEqual(
    [...contratos.subcategorias],
    [CONTRACT_INCOME_CLASSIFICATION.mensalidade, CONTRACT_INCOME_CLASSIFICATION.implantacao, CONTRACT_INCOME_CLASSIFICATION.projeto],
  );
  assert.equal(todosOsNomes('pessoal').includes(CONTRACT_INCOME_CLASSIFICATION.raiz), false);
});

test('a lista da empresa traz "Aportes", onde entra o capital dos sócios; a pessoal não', () => {
  assert.ok(getDefaultIncomeClassifications('empresa').some((item) => item.nome === CAPITAL_INCOME_CLASSIFICATION));
  assert.equal(todosOsNomes('pessoal').includes(CAPITAL_INCOME_CLASSIFICATION), false);
});

test('PF: salário é subcategoria de "Emprego" e "Vendas" virou "Comissões"; PJ mantém "Vendas"', () => {
  const pessoal = getDefaultIncomeClassifications('pessoal');
  assert.deepEqual(pessoal.find((item) => item.nome === 'Emprego')?.subcategorias, ['Salário', '13º', 'Férias', 'Vale refeição']);
  assert.ok(pessoal.some((item) => item.nome === 'Comissões'));
  assert.ok(!todosOsNomes('pessoal').includes('Vendas'));
  assert.ok(todosOsNomes('empresa').includes('Vendas'));
});
