import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyResultsWindow, pendingResultsDays } from './resultRuns';

// Partes puras das execuções dos vencedores (resultRuns.ts): a janela da coleta diária e os dias pendentes da carga. As execuções inteiras, com banco e R2 simulado, estão em resultRuns.db.test.ts.

const TODAY = '2026-10-26';

test('janela diária sem histórico: ontem menos 7 dias até hoje, ou seja, de hoje − 8 a hoje', () => {
  assert.deepEqual(dailyResultsWindow(TODAY, null), { from: '2026-10-18', to: '2026-10-26' });
});

test('janela diária num dia normal: o último dia lido é ontem ou hoje, e a janela é a mesma', () => {
  assert.deepEqual(dailyResultsWindow(TODAY, '2026-10-25'), { from: '2026-10-18', to: '2026-10-26' });
  assert.deepEqual(dailyResultsWindow(TODAY, '2026-10-26'), { from: '2026-10-18', to: '2026-10-26' });
});

test('janela diária depois de uma parada longa: etapas de até 7 dias a partir do último dia lido, com 7 de sobreposição', () => {
  // Último dia lido 01/10: lê de 24/09 a 08/10 (7 dias de sobreposição, mais 7 de avanço).
  assert.deepEqual(dailyResultsWindow(TODAY, '2026-10-01'), { from: '2026-09-24', to: '2026-10-08' });
  // A etapa seguinte parte de 08/10, e assim até alcançar hoje, sem pular nenhum dia.
  assert.deepEqual(dailyResultsWindow(TODAY, '2026-10-08'), { from: '2026-10-01', to: '2026-10-15' });
  assert.deepEqual(dailyResultsWindow(TODAY, '2026-10-22'), { from: '2026-10-15', to: '2026-10-26' });
});

test('janela diária com a fonte atrás do calendário: o último dia lido não anda, e a janela só se repete', () => {
  // Última leitura parou em 29/09 (a fonte não tinha mais nada): a janela de todo dia é a mesma etapa de 7 dias.
  const first = dailyResultsWindow(TODAY, '2026-09-29');
  assert.deepEqual(first, { from: '2026-09-22', to: '2026-10-06' });
  assert.deepEqual(dailyResultsWindow('2026-10-27', '2026-09-29'), first);
});

test('janela diária com histórico no futuro: vale o dia normal', () => {
  assert.deepEqual(dailyResultsWindow(TODAY, '2026-11-30'), { from: '2026-10-18', to: '2026-10-26' });
});

test('janela diária vira o mês e o ano pelo calendário', () => {
  assert.deepEqual(dailyResultsWindow('2027-01-03', null), { from: '2026-12-26', to: '2027-01-03' });
});

test('carga: os dias pendentes, do mais recente para o mais antigo, sem os já concluídos', () => {
  const range = { from: '2026-09-01', to: '2026-09-06' };
  assert.deepEqual(pendingResultsDays(range, new Set(), false), ['2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01']);
  assert.deepEqual(pendingResultsDays(range, new Set(['2026-09-06', '2026-09-04', '2026-09-01']), false), ['2026-09-05', '2026-09-03', '2026-09-02']);
  assert.deepEqual(pendingResultsDays(range, new Set(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']), false), []);
});

test('carga: --from e --to (reparo) releem a faixa inteira, mesmo os dias já concluídos', () => {
  const range = { from: '2026-09-01', to: '2026-09-03' };
  assert.deepEqual(pendingResultsDays(range, new Set(['2026-09-02']), true), ['2026-09-03', '2026-09-02', '2026-09-01']);
});

test('carga: faixa invertida ou vazia não tem dia pendente', () => {
  assert.deepEqual(pendingResultsDays({ from: '2026-09-10', to: '2026-09-01' }, new Set(), false), []);
  assert.deepEqual(pendingResultsDays({ from: '2026-09-05', to: '2026-09-05' }, new Set(), false), ['2026-09-05']);
});
