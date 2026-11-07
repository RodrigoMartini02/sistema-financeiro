import assert from 'node:assert/strict';
import test from 'node:test';
import { isUniqueViolation } from './dbErrors';

test('violação de índice único: o código do Postgres, direto ou dentro de cause (Drizzle)', () => {
  assert.equal(isUniqueViolation({ code: '23505' }), true);
  assert.equal(isUniqueViolation({ message: 'Failed query', cause: { code: '23505' } }), true);
});

test('outros erros não são violação de índice único', () => {
  assert.equal(isUniqueViolation({ code: '23503' }), false);
  assert.equal(isUniqueViolation({ cause: { code: '42P01' } }), false);
  assert.equal(isUniqueViolation(new Error('qualquer')), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation('23505'), false);
});
