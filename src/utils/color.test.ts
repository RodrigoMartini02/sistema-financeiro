import assert from 'node:assert/strict';
import test from 'node:test';
import { DARK_INK, LIGHT_INK, hexToHsv, hsvToHex, normalizeHex, readableTextColor } from './color';

test('normaliza o código da cor', () => {
  assert.equal(normalizeHex('#1E40AF'), '#1e40af');
  assert.equal(normalizeHex('1e40af'), '#1e40af');
  assert.equal(normalizeHex(' #fA3 '), '#ffaa33');
});

test('código inválido não vira cor', () => {
  for (const value of ['', '#12', '#12345', '#1234567', 'azul', '#ggg000']) {
    assert.equal(normalizeHex(value), null, value);
  }
});

test('ida e volta entre código e HSV', () => {
  for (const hex of ['#1e40af', '#065f46', '#7c2d12', '#ffffff', '#000000', '#808080', '#ff0000', '#12ab9f']) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex);
  }
});

test('HSV das cores puras', () => {
  assert.deepEqual(hexToHsv('#ff0000'), { h: 0, s: 1, v: 1 });
  assert.deepEqual(hexToHsv('#00ff00'), { h: 120, s: 1, v: 1 });
  assert.equal(hsvToHex({ h: 240, s: 1, v: 1 }), '#0000ff');
  assert.equal(hsvToHex({ h: 360, s: 1, v: 1 }), '#ff0000');
});

test('texto escuro em cor clara e branco em cor escura', () => {
  assert.equal(readableTextColor('#facc15'), DARK_INK);
  assert.equal(readableTextColor('#ffffff'), DARK_INK);
  assert.equal(readableTextColor('#a7f3d0'), DARK_INK);
  assert.equal(readableTextColor('#1e293b'), LIGHT_INK);
  assert.equal(readableTextColor('#1e40af'), LIGHT_INK);
  assert.equal(readableTextColor('#7c2d12'), LIGHT_INK);
});
