import assert from 'node:assert/strict';
import test from 'node:test';
import type { Categoria } from '../types/config';
import {
  categoryFilterNames,
  compararNomesCatalogo,
  createdCategoryId,
  groupSelectableCategories,
  newCategoryFormValues,
  suggestCategoryForDescription,
  type CategoryFilterOption,
} from './categorySuggestions';

// Como sai de categoryFilterOptions: A→Z, com as subs apontando para o pai.
const OPTIONS: CategoryFilterOption[] = [
  { value: '823', label: 'Academia', parentValue: '809' },
  { value: '809', label: 'Alimentação' },
  { value: '811', label: 'Moradia' },
  { value: '914', label: 'subcat', parentValue: '809' },
];

test('grupo inteiro marcado aparece só com o nome do pai', () => {
  assert.deepEqual(categoryFilterNames(OPTIONS, new Set(['914', '809', '823', '811'])), ['Alimentação', 'Moradia']);
});

test('parte do grupo: os nomes das subcategorias marcadas', () => {
  assert.deepEqual(categoryFilterNames(OPTIONS, new Set(['823'])), ['Academia']);
  assert.deepEqual(categoryFilterNames(OPTIONS, new Set(['914', '823'])), ['Academia', 'subcat']);
});

test('categoria solta: o nome dela', () => {
  assert.deepEqual(categoryFilterNames(OPTIONS, new Set(['811'])), ['Moradia']);
});

test('id marcado sem opção aparece como veio, no fim', () => {
  assert.deepEqual(categoryFilterNames(OPTIONS, new Set(['999', '811'])), ['Moradia', '999']);
});

test('nada marcado: nenhum nome', () => {
  assert.deepEqual(categoryFilterNames(OPTIONS, new Set()), []);
});

function categoria(id: number, nome: string, overrides: Partial<Categoria> = {}): Categoria {
  return { id, nome, ativo: true, data_criacao: '2026-10-18', parent_id: null, ...overrides };
}

// Conta pessoal como o servidor devolve: o grupo não recebe lançamento, as subs sim.
const CATALOGO_PF: Categoria[] = [
  categoria(1, 'Alimentação', { selectable: false }),
  categoria(2, 'Mercado', { parent_id: 1, selectable: true }),
  categoria(3, 'Outros de Alimentação', { parent_id: 1, selectable: true }),
  categoria(4, 'Encargos de cartão', { is_system: true, selectable: false }),
  categoria(5, 'Moradia', { selectable: false }),
];

test('o servidor decide quem recebe: o grupo é só cabeçalho, o sistema e o grupo vazio não aparecem', () => {
  const grupos = groupSelectableCategories(CATALOGO_PF);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0]!.parent?.nome, 'Alimentação');
  assert.deepEqual(grupos[0]!.items.map((item) => item.nome), ['Mercado', 'Outros de Alimentação']);
});

test('conta empresa: a categoria solta que recebe entra sozinha, e a raiz com sub recebe vira cabeçalho', () => {
  const catalogo = [
    categoria(10, 'Fornecedores', { selectable: true }),
    categoria(11, 'Operacional', { selectable: false }),
    categoria(12, 'Frete', { parent_id: 11, selectable: true }),
  ];
  const grupos = groupSelectableCategories(catalogo);
  assert.deepEqual(grupos.map((grupo) => grupo.parent?.nome ?? null), [null, 'Operacional']);
  assert.deepEqual(grupos[0]!.items.map((item) => item.nome), ['Fornecedores']);
  assert.deepEqual(grupos[1]!.items.map((item) => item.nome), ['Frete']);
});

test('sem a flag do servidor, vale o que valia antes: raiz sem filhos recebe, raiz com filhos é cabeçalho', () => {
  const grupos = groupSelectableCategories([categoria(1, 'Lazer'), categoria(2, 'Cinema', { parent_id: 1 }), categoria(3, 'Outros')]);
  assert.deepEqual(grupos.map((grupo) => grupo.items.map((item) => item.nome)), [['Cinema'], ['Outros']]);
});

test('subcategoria inativa não aparece, e o grupo some quando não sobra nenhuma', () => {
  const catalogo = [
    categoria(1, 'Alimentação', { selectable: false }),
    categoria(2, 'Mercado', { parent_id: 1, selectable: true, ativo: false }),
  ];
  assert.deepEqual(groupSelectableCategories(catalogo), []);
});

test('"Outros" e "Outros de ..." ficam por último no seu nível', () => {
  const nomes = ['Outros de Moradia', 'Mercado', 'Outros', 'Aluguel', 'Água e Gás'];
  assert.deepEqual(nomes.sort(compararNomesCatalogo), ['Água e Gás', 'Aluguel', 'Mercado', 'Outros', 'Outros de Moradia']);
});

test('a sugestão por palavra-chave cai na subcategoria do catálogo padrão', () => {
  const catalogo = [
    categoria(1, 'Alimentação', { selectable: false }),
    categoria(2, 'Mercado', { parent_id: 1, selectable: true }),
    categoria(3, 'Delivery', { parent_id: 1, selectable: true }),
    categoria(4, 'Transporte', { selectable: false }),
    categoria(5, 'Combustível', { parent_id: 4, selectable: true }),
  ];
  assert.equal(suggestCategoryForDescription('Mercado Extra', catalogo, [])?.name, 'Mercado');
  assert.equal(suggestCategoryForDescription('pedido ifood', catalogo, [])?.name, 'Delivery');
  assert.equal(suggestCategoryForDescription('Gasolina posto', catalogo, [])?.name, 'Combustível');
  assert.equal(suggestCategoryForDescription('qualquer coisa', catalogo, []), null);
});

test('a sugestão por histórico só aponta para categoria que recebe lançamento', () => {
  const catalogo = [
    categoria(1, 'Alimentação', { selectable: false }),
    categoria(2, 'Mercado', { parent_id: 1, selectable: true }),
  ];
  const historico = [{ description: 'Bistek', categoryId: 1 }, { description: 'Angeloni', categoryId: 2 }];
  assert.equal(suggestCategoryForDescription('Bistek centro', catalogo, historico), null);
  assert.equal(suggestCategoryForDescription('Angeloni centro', catalogo, historico)?.id, 2);
});

test('"+ criar": subcategoria num grupo existente ou grupo novo com a primeira subcategoria', () => {
  assert.deepEqual(newCategoryFormValues({ name: 'Ração', parentId: 7 }), { nome: 'Ração', parent_id: 7 });
  assert.deepEqual(newCategoryFormValues({ name: 'Ração', newParentName: 'Pets' }), { nome: 'Pets', subcategories: ['Ração'] });
  assert.deepEqual(newCategoryFormValues({ name: 'Vestuário' }), { nome: 'Vestuário', parent_id: undefined });
});

test('depois de criar, fica escolhida a subcategoria, mesmo quando nasceu junto com o grupo', () => {
  assert.equal(createdCategoryId({ name: 'Ração', parentId: 7 }, { id: 30 }), 30);
  assert.equal(createdCategoryId({ name: 'Ração', newParentName: 'Pets' }, { id: 40, subcategories: [{ id: 41 }] }), 41);
  assert.equal(createdCategoryId({ name: 'Ração', newParentName: 'Pets' }, { id: 40 }), 40);
});
