import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryKey, matchesStorefrontFilter, normalizeSearchText, storefrontCategories } from './storefrontCatalog';

const produtos = [
  { nome: 'Camiseta Básica', descricao: 'Algodão orgânico', categoria: 'Roupas' },
  { nome: 'Caneca', descricao: null, categoria: 'Acessórios' },
  { nome: 'Boné', descricao: 'Aba curva', categoria: 'acessorios' },
  { nome: 'Adesivo', descricao: null, categoria: null },
];

test('texto de busca sem acento e minúsculo', () => {
  assert.equal(normalizeSearchText('  Pão de Açúcar '), 'pao de acucar');
  assert.equal(categoryKey('  '), null);
  assert.equal(categoryKey('Acessórios'), 'acessorios');
});

test('categorias sem repetir por acento ou maiúscula, em ordem', () => {
  assert.deepEqual(storefrontCategories(produtos), [
    { key: 'acessorios', label: 'Acessórios' },
    { key: 'roupas', label: 'Roupas' },
  ]);
});

test('filtra pela categoria escolhida', () => {
  const acessorios = produtos.filter((produto) => matchesStorefrontFilter(produto, 'acessorios', ''));
  assert.deepEqual(acessorios.map((produto) => produto.nome), ['Caneca', 'Boné']);
  assert.equal(produtos.filter((produto) => matchesStorefrontFilter(produto, null, '')).length, 4);
});

test('busca por nome, descrição ou categoria, sem acento e com várias palavras', () => {
  assert.deepEqual(produtos.filter((p) => matchesStorefrontFilter(p, null, 'algodao')).map((p) => p.nome), ['Camiseta Básica']);
  assert.deepEqual(produtos.filter((p) => matchesStorefrontFilter(p, null, 'bone aba')).map((p) => p.nome), ['Boné']);
  assert.deepEqual(produtos.filter((p) => matchesStorefrontFilter(p, null, 'roupas')).map((p) => p.nome), ['Camiseta Básica']);
  assert.equal(produtos.filter((p) => matchesStorefrontFilter(p, 'roupas', 'caneca')).length, 0);
});
