import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidProdutoValor,
  isValidProdutoImagemMimeType,
  isValidProdutoImagemSize,
  isValidCatalogoContaId,
} from './catalogo';

test('accepts a positive finite value for produto valor', () => {
  assert.equal(isValidProdutoValor(10), true);
  assert.equal(isValidProdutoValor('19.90'), true);
});

test('rejects zero, negative or non-numeric produto valor', () => {
  assert.equal(isValidProdutoValor(0), false);
  assert.equal(isValidProdutoValor(-5), false);
  assert.equal(isValidProdutoValor('abc'), false);
  assert.equal(isValidProdutoValor(undefined), false);
});

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

test('accepts a well-formed UUID as catalogo conta id', () => {
  assert.equal(isValidCatalogoContaId('550e8400-e29b-41d4-a716-446655440000'), true);
});

test('rejects non-UUID or sequential-looking catalogo conta ids', () => {
  assert.equal(isValidCatalogoContaId('123'), false);
  assert.equal(isValidCatalogoContaId('not-a-uuid'), false);
  assert.equal(isValidCatalogoContaId(''), false);
});
