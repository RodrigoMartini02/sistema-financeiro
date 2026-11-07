import assert from 'node:assert/strict';
import test from 'node:test';
import { toBrasiliaIso } from './dates';

test('data do banco em Brasília vira ISO com -03:00', () => {
  assert.equal(toBrasiliaIso('2026-10-20 09:30:00-03'), '2026-10-20T09:30:00-03:00');
  assert.equal(toBrasiliaIso('2026-10-05 16:51:10.898-03'), '2026-10-05T16:51:10-03:00');
});

test('data do banco em outro fuso é convertida para Brasília', () => {
  assert.equal(toBrasiliaIso('2026-10-20 12:30:00+00'), '2026-10-20T09:30:00-03:00');
  assert.equal(toBrasiliaIso('2026-10-20T12:30:00Z'), '2026-10-20T09:30:00-03:00');
});

test('data do PNCP sem fuso já está em Brasília', () => {
  assert.equal(toBrasiliaIso('2026-10-05T16:49:05'), '2026-10-05T16:49:05-03:00');
});

test('vazio ou ilegível vira nulo', () => {
  assert.equal(toBrasiliaIso(null), null);
  assert.equal(toBrasiliaIso(''), null);
  assert.equal(toBrasiliaIso('ontem'), null);
});
