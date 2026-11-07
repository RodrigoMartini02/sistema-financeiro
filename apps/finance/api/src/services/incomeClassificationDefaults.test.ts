import assert from 'node:assert/strict';
import test from 'node:test';
import { othersSubcategoryName } from './catalogRules';
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

test('PF: 6 raízes com subcategorias, cada uma terminando em "Outros de <raiz>"', () => {
  const raizes = getDefaultIncomeClassifications('pessoal');
  assert.equal(raizes.length, 6);
  for (const raiz of raizes) {
    assert.ok(raiz.subcategorias.length > 1, `"${raiz.nome}" não tem subcategorias`);
    assert.equal(raiz.subcategorias.at(-1), othersSubcategoryName(raiz.nome));
  }
  assert.equal(raizes.reduce((total, raiz) => total + raiz.subcategorias.length, 0), 30);
});

test('PJ: raízes soltas, terminando em "Outros"', () => {
  const raizes = getDefaultIncomeClassifications('empresa');
  assert.equal(raizes.at(-1)?.nome, 'Outros');
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

test('PF: salário é subcategoria de "Emprego" e "Comissões" e "Vendas" são subcategorias de "Renda Extra"; PJ mantém "Vendas" como raiz', () => {
  const pessoal = getDefaultIncomeClassifications('pessoal');
  assert.deepEqual(
    pessoal.find((item) => item.nome === 'Emprego')?.subcategorias,
    ['Salário', '13º', 'Férias', 'Vale Refeição/Alimentação', 'Bônus e PLR', 'Outros de Emprego'],
  );
  const rendaExtra = pessoal.find((item) => item.nome === 'Renda Extra');
  assert.ok(rendaExtra?.subcategorias.includes('Comissões'));
  assert.ok(rendaExtra?.subcategorias.includes('Vendas'));
  assert.ok(!pessoal.some((item) => item.nome === 'Vendas'));
  assert.ok(getDefaultIncomeClassifications('empresa').some((item) => item.nome === 'Vendas'));
});

test('PF: "FGTS" é uma subcategoria só, em "Benefícios"', () => {
  const beneficios = getDefaultIncomeClassifications('pessoal').find((item) => item.nome === 'Benefícios');
  assert.deepEqual(
    beneficios?.subcategorias,
    ['Aposentadoria', 'Pensão', 'Auxílios', 'Seguro-Desemprego', 'FGTS', 'Outros de Benefícios'],
  );
});
