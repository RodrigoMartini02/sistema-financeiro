import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidProdutoImagemMimeType,
  isValidProdutoImagemSize,
  isUuid,
} from './catalogo';

test('accepts jpeg, png and webp mime types for produto imagens', () => {
  assert.equal(isValidProdutoImagemMimeType('image/jpeg'), true);
  assert.equal(isValidProdutoImagemMimeType('image/png'), true);
  assert.equal(isValidProdutoImagemMimeType('image/webp'), true);
});

test('rejects mime types outside the allowed image list', () => {
  assert.equal(isValidProdutoImagemMimeType('application/pdf'), false);
  assert.equal(isValidProdutoImagemMimeType('image/gif'), false);
});

test('accepts image sizes within the 8MB limit', () => {
  assert.equal(isValidProdutoImagemSize(1024), true);
  assert.equal(isValidProdutoImagemSize(8 * 1024 * 1024), true);
});

test('rejects zero or oversized image sizes', () => {
  assert.equal(isValidProdutoImagemSize(0), false);
  assert.equal(isValidProdutoImagemSize(8 * 1024 * 1024 + 1), false);
});

test('accepts a well-formed UUID as a catalog id', () => {
  assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
});

test('rejects non-UUID or sequential-looking catalog ids', () => {
  assert.equal(isUuid('123'), false);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(''), false);
});
