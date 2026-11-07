import assert from 'node:assert/strict';
import test from 'node:test';
import { addCalendarDays } from './dates';
import { cycleCurrentWindows, cycleRecentWindow, loadYears, remeasureWindows, splitIntoWindows, yearWindow } from './federalRuns';

// Partes puras das execuções dos contratos federais (federalRuns.ts): as janelas da carga e do ciclo. As execuções
// inteiras, com banco e R2 simulado, estão em federalRuns.db.test.ts.

const TODAY = '2026-10-26';
const SPAN_DAYS = (window: { from: string; to: string }) => (Date.parse(`${window.to}T00:00:00Z`) - Date.parse(`${window.from}T00:00:00Z`)) / 86_400_000;

test('janela de um ano: o ano inteiro, e o bissexto cabe nos 365 dias que a fonte aceita', () => {
  assert.deepEqual(yearWindow(2025), { from: '2025-01-01', to: '2025-12-31' });
  assert.deepEqual(yearWindow(2024), { from: '2024-01-01', to: '2024-12-31' });
  assert.equal(SPAN_DAYS(yearWindow(2024)), 365);
  assert.equal(SPAN_DAYS(yearWindow(2025)), 364);
});

test('anos da carga: do ano atual para trás, retomando do ano anterior ao mais antigo lido', () => {
  assert.deepEqual(loadYears(2026, null, 2021, false), [2026, 2025, 2024, 2023, 2022, 2021]);
  assert.deepEqual(loadYears(2026, 2024, 2021, false), [2023, 2022, 2021]);
  assert.deepEqual(loadYears(2026, 2021, 2021, false), [], 'já leu até o ano de início');
  assert.deepEqual(loadYears(2026, 2019, 2021, false), [], 'leu além do ano de início, de uma configuração antiga');
  assert.deepEqual(loadYears(2026, null, 2026, false), [2026]);
  assert.deepEqual(loadYears(2026, null, 2027, false), [], 'início depois de hoje: nada a ler');
});

test('anos da carga em reparo: todos os da faixa, mesmo os já lidos', () => {
  assert.deepEqual(loadYears(2026, 2021, 2021, true), [2026, 2025, 2024, 2023, 2022, 2021]);
  assert.deepEqual(loadYears(2026, 2024, 2023, true), [2026, 2025, 2024, 2023]);
});

test('divisão em janelas: contíguas, sem sobreposição e cada uma com o fim a até 365 dias do início', () => {
  const windows = splitIntoWindows('2026-09-26', '2030-01-02');
  assert.equal(windows[0]?.from, '2026-09-26');
  assert.equal(windows.at(-1)?.to, '2030-01-02');
  for (const [index, window] of windows.entries()) {
    assert.ok(SPAN_DAYS(window) >= 0 && SPAN_DAYS(window) <= 365, JSON.stringify(window));
    if (index > 0) {
      assert.equal(window.from, addCalendarDays(windows[index - 1]?.to ?? '', 1), 'começa no dia seguinte ao fim da anterior');
    }
  }
  assert.equal(windows.length, 4);
  assert.deepEqual(splitIntoWindows('2026-10-01', '2026-10-01'), [{ from: '2026-10-01', to: '2026-10-01' }], 'um dia só');
  assert.deepEqual(splitIntoWindows('2026-10-02', '2026-10-01'), [], 'faixa invertida');
});

test('vigentes do ciclo: de 30 dias atrás até o maior fim visto, no mínimo um ano à frente', () => {
  const noEnd = cycleCurrentWindows(TODAY, null);
  assert.deepEqual(noEnd, [
    { from: '2026-09-26', to: '2027-09-26' },
    { from: '2027-09-27', to: '2027-10-26' },
  ]);
  assert.deepEqual(cycleCurrentWindows(TODAY, '2026-12-31'), noEnd, 'um fim visto antes do mínimo não encurta a faixa');
  assert.equal(cycleCurrentWindows(TODAY, '2029-06-30').at(-1)?.to, '2029-06-30');
});

test('vigentes do ciclo: o fim visto mais longe que 15 anos é cortado', () => {
  const windows = cycleCurrentWindows(TODAY, '2090-01-01');
  assert.equal(windows.at(-1)?.to, '2041-10-26');
  assert.ok(windows.length <= 16);
});

test('recentes do ciclo: os 120 dias até hoje, pelo início da vigência', () => {
  assert.deepEqual(cycleRecentWindow(TODAY), { from: '2026-06-28', to: '2026-10-26' });
});

test('medição de um órgão sem dado: o ano anterior e o atual', () => {
  assert.deepEqual(remeasureWindows(TODAY), [yearWindow(2025), yearWindow(2026)]);
});
