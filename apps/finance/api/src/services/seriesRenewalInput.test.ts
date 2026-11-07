import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readSeriesRenewalDecisions } from './seriesRenewalInput';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('renovação: lê as decisões, e a série repetida vale a última', () => {
  assert.deepEqual(
    readSeriesRenewalDecisions({ decisions: [{ seriesId: 10, renew: true }, { seriesId: 11, renew: false }, { seriesId: 10, renew: false }] }),
    [{ seriesId: 10, renew: false }, { seriesId: 11, renew: false }],
  );
});

test('renovação: recusa pedido vazio, acima de 100 e tipos errados', () => {
  assertRejects(() => readSeriesRenewalDecisions('texto'), 'Pedido inválido');
  assertRejects(() => readSeriesRenewalDecisions({ decisions: [] }), 'Informe de 1 a 100 decisões');
  assertRejects(
    () => readSeriesRenewalDecisions({ decisions: Array.from({ length: 101 }, (_, index) => ({ seriesId: index + 1, renew: true })) }),
    'Informe de 1 a 100 decisões',
  );
  assertRejects(() => readSeriesRenewalDecisions({ decisions: ['x'] }), 'Decisão inválida');
  assertRejects(() => readSeriesRenewalDecisions({ decisions: [{ seriesId: '10', renew: true }] }), 'Série inválida');
  assertRejects(() => readSeriesRenewalDecisions({ decisions: [{ renew: true }] }), 'Série inválida');
  assertRejects(() => readSeriesRenewalDecisions({ decisions: [{ seriesId: 10, renew: 'sim' }] }), 'Informe se a série renova');
});
