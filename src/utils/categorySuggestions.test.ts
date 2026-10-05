import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryFilterNames, type CategoryFilterOption } from './categorySuggestions';

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
