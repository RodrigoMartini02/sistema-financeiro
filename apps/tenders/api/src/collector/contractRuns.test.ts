import assert from 'node:assert/strict';
import test from 'node:test';
import { addCalendarDays } from './dates';
import { dailyContractWindow, daysFromNewestToOldest, type DailyWindow } from './contractRuns';

test('carga: dias do mais recente para o mais antigo, com os dois extremos', () => {
  assert.deepEqual(daysFromNewestToOldest('2026-02-27', '2026-03-02'), ['2026-03-02', '2026-03-01', '2026-02-28', '2026-02-27']);
  assert.deepEqual(daysFromNewestToOldest('2026-09-30', '2026-09-30'), ['2026-09-30']);
  assert.deepEqual(daysFromNewestToOldest('2026-10-01', '2026-09-30'), []);
});

test('carga: a faixa desde 2021 até um dia de outubro de 2026 tem um dia por data', () => {
  const days = daysFromNewestToOldest('2021-01-01', '2026-10-12');
  assert.equal(days[0], '2026-10-12');
  assert.equal(days.at(-1), '2021-01-01');
  assert.equal(new Set(days).size, days.length);
  assert.equal(days.length, 2111);
});

test('coleta diária: sem coleta completa anterior, de ontem a hoje', () => {
  assert.deepEqual(dailyContractWindow('2026-10-16', null), { from: '2026-10-15', to: '2026-10-16' });
});

test('coleta diária: num dia normal, de ontem a hoje; data futura vale ontem', () => {
  assert.deepEqual(dailyContractWindow('2026-10-16', '2026-10-15'), { from: '2026-10-15', to: '2026-10-16' });
  assert.deepEqual(dailyContractWindow('2026-10-16', '2026-10-16'), { from: '2026-10-15', to: '2026-10-16' }, 'já rodou hoje');
  assert.deepEqual(dailyContractWindow('2026-10-16', '2026-10-20'), { from: '2026-10-15', to: '2026-10-16' });
});

test('coleta diária: depois de uma falha, a consulta relê desde a última completa', () => {
  // Os atualizados falharam em 15/10: a última completa deles foi a de 14/10.
  assert.deepEqual(dailyContractWindow('2026-10-16', '2026-10-14'), { from: '2026-10-14', to: '2026-10-16' });
  // Uma semana fora do ar: 8 dias numa execução só.
  assert.deepEqual(dailyContractWindow('2026-10-16', '2026-10-09'), { from: '2026-10-09', to: '2026-10-16' });
});

test('coleta diária: parada longa é recuperada em etapas de até 8 dias, sem dia perdido', () => {
  // Rotina parada de 05 a 14/10 (a última completa foi a de 04/10).
  const first = dailyContractWindow('2026-10-15', '2026-10-04');
  assert.deepEqual(first, { from: '2026-10-04', to: '2026-10-11' });
  assert.deepEqual(dailyContractWindow('2026-10-16', first.to), { from: '2026-10-11', to: '2026-10-16' }, 'em dia na seguinte');

  // Um mês parada: cada execução continua do fim da anterior até ficar em dia.
  const windows: DailyWindow[] = [];
  let today = '2026-11-15';
  let lastCompleted = '2026-10-15';
  while (windows.length < 10) {
    const window = dailyContractWindow(today, lastCompleted);
    windows.push(window);
    if (window.to === today) {
      break;
    }
    lastCompleted = window.to;
    today = addCalendarDays(today, 1);
  }
  assert.deepEqual(
    windows.map((window) => [window.from, window.to]),
    [
      ['2026-10-15', '2026-10-22'],
      ['2026-10-22', '2026-10-29'],
      ['2026-10-29', '2026-11-05'],
      ['2026-11-05', '2026-11-12'],
      ['2026-11-12', '2026-11-19'],
    ],
  );
});
