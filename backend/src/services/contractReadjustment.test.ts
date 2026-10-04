import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addYears, latestReachedAnniversary, nextReadjustmentAnniversary, readjustAmount, readjustmentState,
} from './contractReadjustment';

test('aviso disponível a partir do aniversário da data-base', () => {
  assert.deepEqual(readjustmentState('2027-01-15', null, '2028-01-14'), { available: false, anniversary: '2028-01-15' });
  assert.deepEqual(readjustmentState('2027-01-15', null, '2028-01-15'), { available: true, anniversary: '2028-01-15' });
  assert.deepEqual(readjustmentState('2027-01-15', null, '2028-07-01'), { available: true, anniversary: '2028-01-15' });
});

test('depois de aplicado ou dispensado, o aviso volta só no próximo ciclo', () => {
  assert.deepEqual(readjustmentState('2027-01-15', '2028-01-15', '2028-07-01'), { available: false, anniversary: '2029-01-15' });
  assert.deepEqual(readjustmentState('2027-01-15', '2028-01-15', '2029-01-15'), { available: true, anniversary: '2029-01-15' });
});

test('ciclos atrasados: um tratamento grava o aniversário mais recente e fecha todos', () => {
  assert.equal(nextReadjustmentAnniversary('2024-03-10', null), '2025-03-10');
  assert.equal(latestReachedAnniversary('2024-03-10', '2026-04-01'), '2026-03-10');
  assert.equal(latestReachedAnniversary('2024-03-10', '2025-03-09'), null);
  assert.deepEqual(readjustmentState('2024-03-10', '2026-03-10', '2026-04-01'), { available: false, anniversary: '2027-03-10' });
});

test('data-base em 29 de fevereiro faz aniversário em 28 nos anos que não são bissextos', () => {
  assert.equal(addYears('2024-02-29', 1), '2025-02-28');
  assert.equal(addYears('2024-02-29', 4), '2028-02-29');
  assert.equal(nextReadjustmentAnniversary('2024-02-29', '2025-02-28'), '2026-02-28');
});

test('aplicar 4,62% em R$ 4.500,00 resulta em R$ 4.707,90; 0,00% não altera', () => {
  assert.equal(readjustAmount(4500, 4.62), 4707.9);
  assert.equal(readjustAmount(4500, 0), 4500);
  assert.equal(readjustAmount(150, 10), 165);
  // 333,33 × 1,0462 = 348,729846 → 348,73.
  assert.equal(readjustAmount(333.33, 4.62), 348.73);
});
