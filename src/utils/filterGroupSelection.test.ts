import assert from 'node:assert/strict';
import test from 'node:test';
import { groupHeaderState, toggleGroupSelection } from './filterGroupSelection';

// Alimentação (809) com as subcategorias Academia (823) e subcat (914).
const PARENT = '809';
const CHILDREN = ['823', '914'];

test('marcar o grupo marca o pai e as subcategorias, sem mexer no resto', () => {
  const next = toggleGroupSelection(new Set(['811']), PARENT, CHILDREN);
  assert.deepEqual([...next].sort(), ['809', '811', '823', '914']);
});

test('desmarcar o grupo inteiro limpa o pai e as subcategorias', () => {
  const next = toggleGroupSelection(new Set(['809', '823', '914', '811']), PARENT, CHILDREN);
  assert.deepEqual([...next], ['811']);
});

test('grupo parcial: o clique completa o grupo em vez de limpar', () => {
  const next = toggleGroupSelection(new Set(['823']), PARENT, CHILDREN);
  assert.deepEqual([...next].sort(), ['809', '823', '914']);
});

test('estado do cabeçalho: marcado, parcial e vazio', () => {
  assert.equal(groupHeaderState(new Set(['809', '823', '914']), PARENT, CHILDREN), 'checked');
  assert.equal(groupHeaderState(new Set(['823']), PARENT, CHILDREN), 'partial');
  assert.equal(groupHeaderState(new Set(['809']), PARENT, CHILDREN), 'partial');
  assert.equal(groupHeaderState(new Set(['811']), PARENT, CHILDREN), 'empty');
});

test('subcategorias marcadas uma a uma, sem o pai, deixam o cabeçalho parcial', () => {
  assert.equal(groupHeaderState(new Set(['823', '914']), PARENT, CHILDREN), 'partial');
});

test('a seleção original não é alterada', () => {
  const selected = new Set(['823']);
  toggleGroupSelection(selected, PARENT, CHILDREN);
  assert.deepEqual([...selected], ['823']);
});
