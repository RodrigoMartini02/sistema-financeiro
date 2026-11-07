import assert from 'node:assert/strict';
import test from 'node:test';
import { moveTargetDate } from './overdueExpenseRules';

test('mover vencida: mesmo dia do mês atual quando ainda não passou', () => {
  assert.equal(moveTargetDate('2026-08-25', '2026-10-19'), '2026-10-25');
  assert.equal(moveTargetDate('2026-10-19', '2026-10-19'), '2026-10-19');
});

test('mover vencida: se o dia do mês atual já passou, vai para hoje', () => {
  assert.equal(moveTargetDate('2026-08-05', '2026-10-19'), '2026-10-19');
});

test('mover vencida: mês curto usa o último dia, e nunca antes de hoje', () => {
  assert.equal(moveTargetDate('2026-01-31', '2026-02-10'), '2026-02-28');
  assert.equal(moveTargetDate('2026-01-31', '2026-02-28'), '2026-02-28');
});
