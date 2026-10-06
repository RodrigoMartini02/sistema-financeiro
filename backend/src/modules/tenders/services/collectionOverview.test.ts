import assert from 'node:assert/strict';
import test from 'node:test';
import { nextScheduledRun } from './collectionOverview';

// 2026-10-05 é segunda-feira. Horários em UTC; Brasília = UTC−3.
const at = (isoUtc: string) => new Date(isoUtc);

test('varredura: todo dia às 03:00 de Brasília', () => {
  assert.equal(nextScheduledRun('VARREDURA', at('2026-10-05T05:59:00Z')), '2026-10-05T03:00:00-03:00');
  assert.equal(nextScheduledRun('VARREDURA', at('2026-10-05T06:00:00Z')), '2026-10-06T03:00:00-03:00');
});

test('incremental: de 07:00 a 21:00, a cada 2 h; depois das 21:00, amanhã às 07:00', () => {
  assert.equal(nextScheduledRun('INCREMENTAL', at('2026-10-05T12:30:00Z')), '2026-10-05T11:00:00-03:00');
  assert.equal(nextScheduledRun('INCREMENTAL', at('2026-10-06T00:30:00Z')), '2026-10-06T07:00:00-03:00');
});

test('lembretes: toda hora aos 15 minutos', () => {
  assert.equal(nextScheduledRun('LEMBRETES', at('2026-10-05T12:10:00Z')), '2026-10-05T09:15:00-03:00');
  assert.equal(nextScheduledRun('LEMBRETES', at('2026-10-05T12:15:00Z')), '2026-10-05T10:15:00-03:00');
});

test('limpeza: domingo às 04:00', () => {
  assert.equal(nextScheduledRun('LIMPEZA', at('2026-10-05T12:00:00Z')), '2026-10-11T04:00:00-03:00');
  assert.equal(nextScheduledRun('LIMPEZA', at('2026-10-11T06:59:00Z')), '2026-10-11T04:00:00-03:00');
  assert.equal(nextScheduledRun('LIMPEZA', at('2026-10-11T07:00:00Z')), '2026-10-18T04:00:00-03:00');
});
