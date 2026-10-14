import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContractsCollection } from '../types';
import { backfillSummary, runErrorLines } from './collectionRuns';
import { RUN_TYPE_LABELS } from './labels';

type Backfill = ContractsCollection['backfill'];

const lastRun = (overrides: Partial<NonNullable<Backfill['lastRun']>> = {}): NonNullable<Backfill['lastRun']> => ({
  from: '2021-01-01',
  to: '2026-10-12',
  totalDays: 2111,
  pendingDays: 1900,
  stoppedBy: null,
  finished: false,
  ...overrides,
});

test('carga de contratos: sem execução nem dia carregado, não iniciada', () => {
  assert.deepEqual(backfillSummary({ completedDays: 0, oldestDay: null, lastRun: null }), {
    status: 'Carga não iniciada',
    progress: null,
    notes: [],
  });
});

test('carga de contratos: parou no tempo, com os dias da faixa e o dia mais antigo', () => {
  const summary = backfillSummary({ completedDays: 211, oldestDay: '2026-03-15', lastRun: lastRun({ stoppedBy: 'time' }) });
  assert.equal(summary.status, 'Carga em andamento');
  assert.equal(summary.progress, '211 de 2.111 dias');
  assert.deepEqual(summary.notes, [
    'Dia mais antigo carregado: 15/03/2026.',
    'Parou no limite de tempo do bloco; continua na próxima rotina.',
  ]);
});

test('carga de contratos: parou no limite de espaço', () => {
  const summary = backfillSummary({ completedDays: 10, oldestDay: '2026-10-03', lastRun: lastRun({ stoppedBy: 'space', pendingDays: 2101 }) });
  assert.equal(summary.notes.at(-1), 'Parou no limite de espaço do banco.');
});

test('carga de contratos: concluída quando não sobra dia pendente', () => {
  const summary = backfillSummary({ completedDays: 2111, oldestDay: '2021-01-01', lastRun: lastRun({ pendingDays: 0, finished: true }) });
  assert.equal(summary.status, 'Carga concluída');
  assert.equal(summary.progress, '2.111 de 2.111 dias');
});

test('carga de contratos: execução em andamento (sem detalhes ainda) mostra os dias já carregados', () => {
  assert.equal(backfillSummary({ completedDays: 1, oldestDay: '2026-10-12', lastRun: null }).progress, '1 dia carregado');
  assert.equal(backfillSummary({ completedDays: 30, oldestDay: '2026-09-01', lastRun: null }).progress, '30 dias carregados');
});

test('tipos de execução de contratos têm rótulo', () => {
  assert.equal(RUN_TYPE_LABELS.CONTRATOS_DIARIA, 'Contratos: coleta diária');
  assert.equal(RUN_TYPE_LABELS.CONTRATOS_CARGA, 'Contratos: carga inicial');
  assert.equal(RUN_TYPE_LABELS.CONTRATOS_LIMPEZA, 'Contratos: limpeza');
});

test('erro de termo de contrato aparece com o número de controle', () => {
  const lines = runErrorLines({
    details: { errors: [{ kind: 'term', controlNumber: '83102277000152-2-000028/2024', reason: 'termo 4: data de fim fora do formato' }] },
  });
  assert.deepEqual(lines, ['83102277000152-2-000028/2024: termo 4: data de fim fora do formato']);
});
