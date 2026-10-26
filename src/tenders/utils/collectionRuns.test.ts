import assert from 'node:assert/strict';
import test from 'node:test';
import { COLLECTION_RUN_TYPES, type ContractsCollection } from '../types';
import { archiveSummaryLabel, backfillSummary, dailyCollectionSummary, runErrorLines, winnersDailySummary, winnersRowsLabel } from './collectionRuns';
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

test('carga de contratos: parou porque a fonte dos dados não respondeu', () => {
  const summary = backfillSummary({ completedDays: 10, oldestDay: '2026-10-03', lastRun: lastRun({ stoppedBy: 'pncp', pendingDays: 2101 }) });
  assert.equal(summary.notes.at(-1), 'Parou porque a fonte dos dados não respondeu; continua na próxima rotina.');
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
  assert.equal(RUN_TYPE_LABELS.CONTRATOS_AVISOS, 'Contratos: avisos');
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
    'A reconsulta dos aditivos parou porque a fonte dos dados não respondeu; continua na próxima rotina.',
  ]);
});

test('arquivo bruto: arquivos e tamanho, em KB abaixo de 1 MB, com as falhas de envio', () => {
  const labelOf = (archive: Record<string, unknown>) => archiveSummaryLabel({ details: { archive } });
  assert.equal(labelOf({ enabled: true, files: 3, records: 120, bytes: 13_002_342, failures: 0 }), '3 arquivos · 12,4 MB');
  assert.equal(labelOf({ enabled: true, files: 1, records: 2, bytes: 524_288, failures: 0 }), '1 arquivo · 512 KB');
  assert.equal(labelOf({ enabled: true, files: 1, records: 1, bytes: 300, failures: 0 }), '1 arquivo · 1 KB');
  assert.equal(labelOf({ enabled: true, files: 2, records: 9, bytes: 2_097_152, failures: 1 }), '2 arquivos · 2 MB · 1 falha no envio');
  assert.equal(labelOf({ enabled: true, files: 0, records: 0, bytes: 0, failures: 3 }), 'Nenhum arquivo · 3 falhas no envio');
});

test('arquivo bruto: desligado; sem o resumo nos detalhes, sem linha', () => {
  assert.equal(archiveSummaryLabel({ details: { archive: { enabled: false, files: 0, records: 0, bytes: 0, failures: 0 } } }), 'Desligado');
  assert.equal(archiveSummaryLabel({ details: {} }), null);
  assert.equal(archiveSummaryLabel({ details: { archive: 'texto' } }), null);
});

// ---- Vencedores (plano .plans/licitacoes-vencedores.md) ----

test('todo tipo de execução tem rótulo, e os dos vencedores não citam a fonte', () => {
  for (const type of COLLECTION_RUN_TYPES) {
    assert.ok(RUN_TYPE_LABELS[type], type);
  }
  assert.equal(RUN_TYPE_LABELS.VENCEDORES_DIARIA, 'Vencedores: coleta diária');
  assert.equal(RUN_TYPE_LABELS.VENCEDORES_CARGA, 'Vencedores: carga inicial');
  for (const label of Object.values(RUN_TYPE_LABELS)) {
    assert.doesNotMatch(label, /pncp|compras\.gov/i, label);
  }
});

test('painel da coleta: linhas dos vencedores na base, "—" quando ainda não há cópia ou publicação', () => {
  assert.equal(winnersRowsLabel(null), '—');
  assert.equal(winnersRowsLabel(0), '0 linhas');
  assert.equal(winnersRowsLabel(1), '1 linha');
  assert.equal(winnersRowsLabel(1_234_567), '1.234.567 linhas');
});

test('coleta diária de vencedores: a janela lida e o dia mais recente da fonte, sem nota num dia normal', () => {
  const summary = winnersDailySummary({
    details: {
      today: '2026-10-26',
      sourceLastDay: '2026-10-25',
      queries: [{ endpoint: 'resultados', from: '2026-10-18', to: '2026-10-25', windowTo: '2026-10-26', completed: true, recordsRead: 9000 }],
    },
  });
  assert.deepEqual(summary, { period: '18/10/2026 a 26/10/2026', sourceLastDay: '2026-10-25', notes: [] });
});

test('coleta diária de vencedores: a fonte atrás do calendário vira uma nota, e um fim de semana não', () => {
  const behind = winnersDailySummary({
    details: {
      today: '2026-10-26',
      sourceLastDay: '2026-09-29',
      queries: [{ endpoint: 'resultados', from: '2026-09-22', to: '2026-09-29', windowTo: '2026-10-06', completed: true, recordsRead: 70000 }],
    },
  });
  assert.equal(behind.sourceLastDay, '2026-09-29');
  assert.deepEqual(behind.notes, ['A fonte só tem resultados até 29/09/2026; a coleta continua de onde ela parou.']);
  // Segunda de manhã com dado até sexta: três dias, ainda normal.
  assert.deepEqual(winnersDailySummary({ details: { today: '2026-10-26', sourceLastDay: '2026-10-23' } }).notes, []);
  assert.equal(winnersDailySummary({ details: { today: '2026-10-27', sourceLastDay: '2026-10-23' } }).notes.length, 1);
});

test('coleta diária de vencedores: execução antiga ou em andamento, sem as consultas, usa o período ou nada', () => {
  assert.deepEqual(winnersDailySummary({ details: {} }), { period: null, sourceLastDay: null, notes: [] });
  assert.equal(winnersDailySummary({ details: { period: { dataInicial: '20261018', dataFinal: '20261026' } } }).period, '18/10/2026 a 26/10/2026');
  assert.equal(winnersDailySummary({ details: { queries: 'texto', sourceLastDay: 'ontem' } }).sourceLastDay, null);
});

test('carga de vencedores: o andamento usa a mesma leitura da carga de contratos', () => {
  const summary = backfillSummary({
    completedDays: 40,
    oldestDay: '2026-08-02',
    lastRun: { from: '2021-08-01', to: '2026-09-29', totalDays: 1886, pendingDays: 1846, stoppedBy: 'time', finished: false },
  });
  assert.equal(summary.status, 'Carga em andamento');
  assert.equal(summary.progress, '40 de 1.886 dias');
  assert.deepEqual(summary.notes, ['Dia mais antigo carregado: 02/08/2026.', 'Parou no limite de tempo do bloco; continua na próxima rotina.']);
});

test('coleta diária de vencedores: o arquivo bruto usa o mesmo rótulo', () => {
  assert.equal(archiveSummaryLabel({ details: { archive: { enabled: true, files: 2, records: 40, bytes: 3_145_728, failures: 0 } } }), '2 arquivos · 3 MB');
});
