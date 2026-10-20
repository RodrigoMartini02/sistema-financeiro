import assert from 'node:assert/strict';
import test from 'node:test';
import { backfillRunView, neutralRunDetails, nextScheduledRun } from './collectionOverview';

test('histórico: mensagens de erro antigas aparecem sem o nome da fonte; as outras ficam como estão', () => {
  const details = {
    dataFinal: '20261217',
    errors: [
      { kind: 'request', message: 'PNCP falhou após 5 tentativa(s): HTTP 503' },
      { kind: 'request', message: 'PNCP respondeu HTTP 400: data inválida' },
      { kind: 'record', controlNumber: 'X-1', reason: 'CNPJ do órgão deve ter 14 dígitos' },
      { kind: 'archive', key: 'pncp/contratos/2026/10/18/1-0001.jsonl.gz', message: 'R2 fora do ar' },
    ],
  };
  assert.deepEqual(neutralRunDetails(details), {
    dataFinal: '20261217',
    errors: [
      { kind: 'request', message: 'A consulta falhou após 5 tentativa(s): HTTP 503' },
      { kind: 'request', message: 'A consulta recebeu HTTP 400: data inválida' },
      { kind: 'record', controlNumber: 'X-1', reason: 'CNPJ do órgão deve ter 14 dígitos' },
      { kind: 'archive', key: 'pncp/contratos/2026/10/18/1-0001.jsonl.gz', message: 'R2 fora do ar' },
    ],
  });
  const withoutErrors = { today: '2026-10-18' };
  assert.equal(neutralRunDetails(withoutErrors), withoutErrors);
});

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

test('contratos: coleta diária e carga todo dia às 06:00 (rotina diária); a limpeza saiu da agenda', () => {
  for (const type of ['CONTRATOS_DIARIA', 'CONTRATOS_CARGA'] as const) {
    assert.equal(nextScheduledRun(type, at('2026-10-05T12:00:00Z')), '2026-10-06T06:00:00-03:00');
  }
  assert.equal(nextScheduledRun('CONTRATOS_LIMPEZA', at('2026-10-05T12:00:00Z')), null);
});

test('carga de contratos: lê a faixa, os dias pendentes e o motivo da parada nos detalhes da execução', () => {
  const details = {
    backfill: { from: '2021-01-01', to: '2026-10-12', totalDays: 2111, pendingAfter: 1900, stoppedBy: 'time', finished: false },
  };
  assert.deepEqual(backfillRunView(details), {
    from: '2021-01-01',
    to: '2026-10-12',
    totalDays: 2111,
    pendingDays: 1900,
    stoppedBy: 'time',
    finished: false,
  });
  assert.equal(backfillRunView({ backfill: { ...details.backfill, stoppedBy: 'outro' } })?.stoppedBy, null);
  assert.equal(backfillRunView({}), null, 'execução ainda sem detalhes (em andamento)');
  assert.equal(backfillRunView({ backfill: { from: '2021-01-01' } }), null);
  assert.equal(backfillRunView(undefined), null);
});
