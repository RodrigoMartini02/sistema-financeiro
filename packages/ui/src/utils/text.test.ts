import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSearchText } from './text';

test('texto de busca sem acento e minúsculo', () => {
  assert.equal(normalizeSearchText('  Pão de Açúcar '), 'pao de acucar');
  assert.equal(normalizeSearchText('ÁGUA'), 'agua');
  assert.equal(normalizeSearchText(''), '');
});
