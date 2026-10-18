import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContractsCollection } from '../types';
import { backfillSummary, dailyCollectionSummary, runErrorLines } from './collectionRuns';
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

test('coleta diária de contratos: período lido pelas consultas gravadas, sem nota num dia normal', () => {
  const summary = dailyCollectionSummary({
    details: {
      today: '2026-10-13',
      queries: [
        { endpoint: 'contratos', from: '2026-10-12', to: '2026-10-13', completed: true, recordsRead: 10 },
        { endpoint: 'contratos-atualizacao', from: '2026-10-11', to: '2026-10-13', completed: true, recordsRead: 5 },
      ],
      termsRetry: { pendingAtStart: 0, checked: 0, resolved: 0, expiryChanged: 0, failed: 0, stoppedByFailures: false },
    },
  });
  assert.deepEqual(summary, { period: '11/10/2026 a 13/10/2026', notes: [] });
});

test('coleta diária de contratos: execução antiga mostra o período do PNCP; sem nada, sem linha', () => {
  assert.equal(
    dailyCollectionSummary({ details: { period: { dataInicial: '20261012', dataFinal: '20261013' } } }).period,
    '12/10/2026 a 13/10/2026',
  );
  assert.deepEqual(dailyCollectionSummary({ details: {} }), { period: null, notes: [] });
});

test('coleta diária de contratos: fim antes de hoje é recuperação de dias sem coleta', () => {
  const summary = dailyCollectionSummary({
    details: {
      today: '2026-10-15',
      queries: [
        { endpoint: 'contratos', from: '2026-10-04', to: '2026-10-11', completed: true, recordsRead: 0 },
        { endpoint: 'contratos-atualizacao', from: '2026-10-04', to: '2026-10-11', completed: false, recordsRead: 0 },
      ],
    },
  });
  assert.equal(summary.period, '04/10/2026 a 11/10/2026');
  assert.deepEqual(summary.notes, ['Recuperando dias sem coleta: lido até 11/10/2026; continua na próxima rotina.']);
});

test('coleta diária de contratos: reconsulta dos aditivos, com e sem pendentes, e a parada por falhas', () => {
  const notesOf = (termsRetry: Record<string, unknown>) => dailyCollectionSummary({ details: { termsRetry } }).notes;
  assert.deepEqual(notesOf({ pendingAtStart: 15, checked: 12, resolved: 12, stoppedByFailures: false }), [
    'Aditivos reconsultados em 12 contratos; 3 ainda pendentes.',
  ]);
  assert.deepEqual(notesOf({ pendingAtStart: 1, checked: 1, resolved: 1, stoppedByFailures: false }), [
    'Aditivos reconsultados em 1 contrato; nenhum pendente.',
  ]);
  assert.deepEqual(notesOf({ pendingAtStart: 1, checked: 0, resolved: 0, stoppedByFailures: false }), [
    '1 contrato com aditivos pendentes; reconsulta na próxima rotina.',
  ]);
  assert.deepEqual(notesOf({ pendingAtStart: 40, checked: 3, resolved: 0, stoppedByFailures: true }), [
    'Aditivos reconsultados em 3 contratos; 40 ainda pendentes.',
    'A reconsulta dos aditivos parou porque o PNCP não respondeu; continua na próxima rotina.',
  ]);
});
