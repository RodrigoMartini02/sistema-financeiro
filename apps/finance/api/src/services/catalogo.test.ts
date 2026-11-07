import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid } from './catalogo';

test('accepts a well-formed UUID as a catalog id', () => {
  assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
});

test('rejects non-UUID or sequential-looking catalog ids', () => {
  assert.equal(isUuid('123'), false);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(''), false);
});
