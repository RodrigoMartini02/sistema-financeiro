import assert from 'node:assert/strict';
import test from 'node:test';
import { nextScheduledRun } from './collectionOverview';

// 2026-10-05 é segunda-feira. Horários em UTC; Brasília = UTC−3.
const at = (isoUtc: string) => new Date(isoUtc);

test('varredura: todo dia às 06:00 de Brasília (rotina diária)', () => {
  assert.equal(nextScheduledRun('VARREDURA', at('2026-10-05T08:59:00Z')), '2026-10-05T06:00:00-03:00');
  assert.equal(nextScheduledRun('VARREDURA', at('2026-10-05T09:00:00Z')), '2026-10-06T06:00:00-03:00');
});

test('incremental: sem agenda', () => {
  assert.equal(nextScheduledRun('INCREMENTAL', at('2026-10-05T12:30:00Z')), null);
});

test('lembretes: junto com a varredura, todo dia às 06:00', () => {
  assert.equal(nextScheduledRun('LEMBRETES', at('2026-10-05T12:10:00Z')), '2026-10-06T06:00:00-03:00');
  assert.equal(nextScheduledRun('LEMBRETES', at('2026-10-06T08:00:00Z')), '2026-10-06T06:00:00-03:00');
});

test('limpeza: domingo às 06:00', () => {
  assert.equal(nextScheduledRun('LIMPEZA', at('2026-10-05T12:00:00Z')), '2026-10-11T06:00:00-03:00');
  assert.equal(nextScheduledRun('LIMPEZA', at('2026-10-11T08:59:00Z')), '2026-10-11T06:00:00-03:00');
  assert.equal(nextScheduledRun('LIMPEZA', at('2026-10-11T09:00:00Z')), '2026-10-18T06:00:00-03:00');
});
