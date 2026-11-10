import assert from 'node:assert/strict';
import test from 'node:test';
import { optionsWithCurrent } from './listOptions';

const LIST = [{ id: 'ME', name: 'ME — Microempresa' }, { id: 'EPP', name: 'EPP — Empresa de Pequeno Porte' }];

test('lista de seleção: o valor atual que está na lista não se repete', () => {
  assert.deepEqual(optionsWithCurrent(LIST, 'ME'), LIST);
  assert.deepEqual(optionsWithCurrent(LIST, ''), LIST);
});

test('lista de seleção: o valor atual que saiu da lista (ou a lista ainda carregando) continua visível', () => {
  assert.deepEqual(optionsWithCurrent(LIST, 'XYZ'), [...LIST, { id: 'XYZ', name: 'XYZ' }]);
  assert.deepEqual(optionsWithCurrent(undefined, 'ME'), [{ id: 'ME', name: 'ME' }]);
  assert.deepEqual(optionsWithCurrent(undefined, ''), []);
});
