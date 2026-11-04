import assert from 'node:assert/strict';
import test from 'node:test';
import { contractSavedSearchTotal } from './savedSearchTotal';

test('total da busca salva: o número com a data da contagem', () => {
  assert.deepEqual(contractSavedSearchTotal({ activeCount: 1234, countedAt: '2026-10-19T06:30:00-03:00' }), {
    count: '1.234',
    label: 'contratos vigentes',
    note: 'Contados em 19/10/2026',
  });
  assert.equal(contractSavedSearchTotal({ activeCount: 1, countedAt: '2026-10-19T06:30:00-03:00' }).label, 'contrato vigente');
  assert.equal(contractSavedSearchTotal({ activeCount: 0, countedAt: '2026-10-19T06:30:00-03:00' }).count, '0');
});

test('total da busca salva: ainda não contado mostra o traço e explica', () => {
  const total = contractSavedSearchTotal({ activeCount: null, countedAt: null });
  assert.equal(total.count, '—');
  assert.match(total.note ?? '', /Ainda não contado/);
});
