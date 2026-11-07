import assert from 'node:assert/strict';
import test from 'node:test';
import { moveDueDateToDay, parseEffectiveMonth } from './cardDueDate';

test('novo dia de vencimento no mesmo mês', () => {
  assert.equal(moveDueDateToDay('2026-11-04', 10), '2026-11-10');
  assert.equal(moveDueDateToDay('2027-01-04', 1), '2027-01-01');
});

test('dia que não existe no mês cai no último dia', () => {
  assert.equal(moveDueDateToDay('2026-11-04', 31), '2026-11-30');
  assert.equal(moveDueDateToDay('2026-12-04', 31), '2026-12-31');
  assert.equal(moveDueDateToDay('2027-02-04', 31), '2027-02-28');
  assert.equal(moveDueDateToDay('2028-02-04', 30), '2028-02-29');
});

test('mês de vigência válido vira o 1º dia do mês', () => {
  assert.equal(parseEffectiveMonth('2026-11'), '2026-11-01');
  assert.equal(parseEffectiveMonth('2027-01'), '2027-01-01');
});

test('mês de vigência inválido', () => {
  for (const value of ['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01', '', 202611, undefined, null]) {
    assert.equal(parseEffectiveMonth(value), null, String(value));
  }
});
