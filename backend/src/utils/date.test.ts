import assert from 'node:assert/strict';
import test from 'node:test';
import { addMonthsClamped } from './date';

test('addMonthsClamped mantém o dia quando o mês de destino tem esse dia', () => {
  assert.equal(addMonthsClamped('2026-01-15', 1), '2026-02-15');
  assert.equal(addMonthsClamped('2026-03-31', 2), '2026-05-31');
  assert.equal(addMonthsClamped('2026-05-10', 0), '2026-05-10');
});

test('addMonthsClamped cai no último dia quando o mês de destino é mais curto', () => {
  assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsClamped('2026-03-31', 1), '2026-04-30');
  assert.equal(addMonthsClamped('2026-01-29', 1), '2026-02-28');
  assert.equal(addMonthsClamped('2026-01-30', 1), '2026-02-28');
});

test('addMonthsClamped usa 29/02 em ano bissexto', () => {
  assert.equal(addMonthsClamped('2028-01-31', 1), '2028-02-29');
});

test('addMonthsClamped parte sempre da data base, sem acumular o encurtamento', () => {
  assert.equal(addMonthsClamped('2026-01-31', 2), '2026-03-31');
  assert.equal(addMonthsClamped('2026-01-31', 3), '2026-04-30');
});

test('addMonthsClamped atravessa a virada de ano', () => {
  assert.equal(addMonthsClamped('2026-11-30', 3), '2027-02-28');
  assert.equal(addMonthsClamped('2026-12-31', 12), '2027-12-31');
});
