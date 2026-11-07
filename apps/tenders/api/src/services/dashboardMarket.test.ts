import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDailySeries, buildMonthlySeries, seriesStartDay, type PublicationRow } from './dashboardMarket';

// As séries do Dashboard (plano .plans/licitacoes-dashboard-gestao.md): 30 dias até ontem e 12 meses até o corrente,
// sem dia nem mês faltando, e o dia ou mês sem edital com a contagem vazia.

const TODAY = '2026-10-26';

test('série diária: 30 dias até ontem, do mais antigo ao mais novo, com o dia vazio sem contagem', () => {
  const rows: PublicationRow[] = [
    { day: '2026-10-25', modalityId: 6, total: 5 },
    { day: '2026-10-25', modalityId: 8, total: 2 },
    { day: '2026-09-26', modalityId: 6, total: 1 },
    { day: '2026-09-25', modalityId: 6, total: 9 },
    { day: '2026-10-26', modalityId: 6, total: 4 },
  ];
  const series = buildDailySeries(rows, TODAY);
  assert.equal(series.length, 30);
  assert.equal(series[0]?.day, '2026-09-26', 'o primeiro é hoje menos 30 dias');
  assert.equal(series.at(-1)?.day, '2026-10-25', 'o último é ontem');
  assert.deepEqual(series.at(-1)?.byModality, { '6': 5, '8': 2 });
  assert.deepEqual(series[0]?.byModality, { '6': 1 });
  assert.deepEqual(series[1]?.byModality, {}, 'dia sem edital');
  assert.ok(series.every((point) => point.day !== '2026-09-25' && point.day !== TODAY), 'fora da janela não entra');
});

test('série mensal: 12 meses até o corrente, só o corrente é parcial, e a virada do ano', () => {
  const rows: PublicationRow[] = [
    { day: '2026-02-09', modalityId: 6, total: 3 },
    { day: '2026-02-01', modalityId: 8, total: 1 },
    { day: '2025-03-01', modalityId: 6, total: 7 },
    { day: '2025-02-28', modalityId: 6, total: 99 },
  ];
  const series = buildMonthlySeries(rows, '2026-02-10');
  assert.equal(series.length, 12);
  assert.deepEqual([series[0]?.month, series.at(-1)?.month], ['2025-03', '2026-02']);
  assert.deepEqual(series.map((point) => point.partial), [...Array(11).fill(false), true]);
  assert.deepEqual(series.at(-1)?.byModality, { '6': 3, '8': 1 });
  assert.deepEqual(series[0]?.byModality, { '6': 7 });
  assert.deepEqual(series[1]?.byModality, {}, 'mês sem edital');
  assert.equal(
    series.some((point) => point.month === '2025-02'),
    false,
    'o mês fora da janela não entra',
  );
});

test('início da janela das séries: dia 1 do mês mais antigo', () => {
  assert.equal(seriesStartDay('2026-10-26'), '2025-11-01');
  assert.equal(seriesStartDay('2026-02-10'), '2025-03-01');
  assert.equal(seriesStartDay('2026-12-31'), '2026-01-01');
});
