import assert from 'node:assert/strict';
import test from 'node:test';
import { daysFromNewestToOldest } from './contractRuns';

test('carga: dias do mais recente para o mais antigo, com os dois extremos', () => {
  assert.deepEqual(daysFromNewestToOldest('2026-02-27', '2026-03-02'), ['2026-03-02', '2026-03-01', '2026-02-28', '2026-02-27']);
  assert.deepEqual(daysFromNewestToOldest('2026-09-30', '2026-09-30'), ['2026-09-30']);
  assert.deepEqual(daysFromNewestToOldest('2026-10-01', '2026-09-30'), []);
});

test('carga: a faixa desde 2021 até um dia de outubro de 2026 tem um dia por data', () => {
  const days = daysFromNewestToOldest('2021-01-01', '2026-10-12');
  assert.equal(days[0], '2026-10-12');
  assert.equal(days.at(-1), '2021-01-01');
  assert.equal(new Set(days).size, days.length);
  assert.equal(days.length, 2111);
});
