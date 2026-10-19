import assert from 'node:assert/strict';
import test from 'node:test';
import type { PainelCategoria } from '../types/finance';
import { agruparCategoriasPorRaiz } from './painelCategorias';

function linha(parcial: Partial<PainelCategoria> & Pick<PainelCategoria, 'categoriaId' | 'categoria' | 'total'>): PainelCategoria {
  return { parentId: null, parentNome: null, usuarioId: 1, autorNome: 'Rodrigo', ...parcial };
}

test('subcategorias ficam sob o pai mesmo quando o pai não teve gasto próprio', () => {
  const raizes = agruparCategoriasPorRaiz([
    linha({ categoriaId: 10, categoria: 'Mercado', parentId: 1, parentNome: 'Alimentação', total: 300 }),
    linha({ categoriaId: 11, categoria: 'Delivery', parentId: 1, parentNome: 'Alimentação', total: 50 }),
    linha({ categoriaId: 20, categoria: 'Aluguel', parentId: 2, parentNome: 'Moradia', total: 1000 }),
  ]);
  assert.equal(raizes.length, 2);
  const alimentacao = raizes.find((raiz) => raiz.nome === 'Alimentação')!;
  assert.equal(alimentacao.categoriaId, 1);
  assert.equal(alimentacao.proprio, null);
  assert.deepEqual(alimentacao.subs.map((sub) => sub.categoria), ['Mercado', 'Delivery']);
  assert.equal(raizes.find((raiz) => raiz.nome === 'Moradia')!.subs.length, 1);
});

test('pai com gasto próprio aparece como principal e junta as subcategorias', () => {
  const raizes = agruparCategoriasPorRaiz([
    linha({ categoriaId: 2, categoria: 'Moradia', total: 80 }),
    linha({ categoriaId: 20, categoria: 'Aluguel', parentId: 2, parentNome: 'Moradia', total: 1000 }),
  ]);
  assert.equal(raizes.length, 1);
  assert.equal(raizes[0]!.proprio?.total, 80);
  assert.deepEqual(raizes[0]!.subs.map((sub) => sub.categoria), ['Aluguel']);
});

test('categoria sem pai e a categoria de sistema ficam como principais, sem subcategorias', () => {
  const raizes = agruparCategoriasPorRaiz([
    linha({ categoriaId: 99, categoria: 'Encargos de cartão', total: 40 }),
    linha({ categoriaId: null, categoria: 'Sem categoria', total: 15 }),
  ]);
  assert.deepEqual(raizes.map((raiz) => [raiz.nome, raiz.subs.length]), [['Encargos de cartão', 0], ['Sem categoria', 0]]);
  assert.equal(raizes[1]!.categoriaId, null);
});

test('sem o nome do pai a subcategoria fica como principal', () => {
  const raizes = agruparCategoriasPorRaiz([linha({ categoriaId: 10, categoria: 'Mercado', parentId: 1, parentNome: null, total: 300 })]);
  assert.deepEqual(raizes.map((raiz) => raiz.nome), ['Mercado']);
});

test('soma as linhas da mesma categoria e guarda a parte de cada pessoa; ignora total zero', () => {
  const raizes = agruparCategoriasPorRaiz([
    linha({ categoriaId: 10, categoria: 'Mercado', parentId: 1, parentNome: 'Alimentação', total: 300, usuarioId: 1, autorNome: 'Rodrigo' }),
    linha({ categoriaId: 10, categoria: 'Mercado', parentId: 1, parentNome: 'Alimentação', total: 120, usuarioId: 15, autorNome: 'Mirian' }),
    linha({ categoriaId: 11, categoria: 'Delivery', parentId: 1, parentNome: 'Alimentação', total: 0 }),
  ]);
  assert.equal(raizes.length, 1);
  const mercado = raizes[0]!.subs[0]!;
  assert.equal(mercado.total, 420);
  assert.deepEqual([...mercado.pessoas.values()].map((pessoa) => [pessoa.usuarioId, pessoa.valor]), [[1, 300], [15, 120]]);
  assert.equal(raizes[0]!.subs.length, 1);
});
