import assert from 'node:assert/strict';
import test from 'node:test';
import { addCalendarDays, brasiliaDate, brasiliaDateTime, toPncpDate } from './dates';
import { sweepFinalDate } from './runs';

test('"hoje" é o dia de Brasília, não o do UTC', () => {
  // 02:30 UTC de 06/10 ainda é 23:30 de 05/10 em Brasília.
  const lateNightInBrasilia = new Date('2026-10-06T02:30:00Z');
  assert.equal(brasiliaDate(lateNightInBrasilia), '2026-10-05');
  assert.equal(brasiliaDateTime(lateNightInBrasilia), '2026-10-05T23:30:00');
});

test('data final da varredura: hoje em Brasília + horizonte, no formato do PNCP', () => {
  assert.equal(sweepFinalDate(new Date('2026-10-06T02:30:00Z'), 60), '20261204');
  assert.equal(sweepFinalDate(new Date('2026-10-06T12:00:00Z'), 60), '20261205');
});

test('soma de dias atravessa mês e ano', () => {
  assert.equal(addCalendarDays('2026-12-15', 60), '2027-02-13');
  assert.equal(addCalendarDays('2026-03-01', -1), '2026-02-28');
  assert.equal(toPncpDate('2026-10-05'), '20261005');
});
