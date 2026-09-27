import assert from 'node:assert/strict';
import test from 'node:test';
import {
  competenciaDe,
  competenciaParaLancar,
  dataDoLancamento,
  primeiraCompetencia,
  type ConfiguracaoFixa,
} from './fixedIncomeSchedule';

const config = (parcial: Partial<ConfiguracaoFixa>): ConfiguracaoFixa => ({
  diaRecebimento: 5,
  lancarAutomatico: true,
  automaticoDesde: '2026-01-01',
  ...parcial,
});

test('competência é o primeiro dia do mês', () => {
  assert.equal(competenciaDe('2026-09-27'), '2026-09-01');
});

test('dia além do fim do mês vira o último dia (meses curtos e bissexto)', () => {
  assert.equal(dataDoLancamento('2026-02-01', 31), '2026-02-28');
  assert.equal(dataDoLancamento('2028-02-01', 30), '2028-02-29');
  assert.equal(dataDoLancamento('2026-04-01', 31), '2026-04-30');
  assert.equal(dataDoLancamento('2026-09-01', 5), '2026-09-05');
});

test('primeiro mês: ligado antes ou no dia vale o mês; depois do dia, o seguinte', () => {
  assert.equal(primeiraCompetencia('2026-09-03', 5), '2026-09-01');
  assert.equal(primeiraCompetencia('2026-09-05', 5), '2026-09-01');
  assert.equal(primeiraCompetencia('2026-09-06', 5), '2026-10-01');
  assert.equal(primeiraCompetencia('2026-12-20', 5), '2027-01-01');
});

test('lança só a partir do dia do mês atual e uma vez só', () => {
  assert.equal(competenciaParaLancar('2026-09-04', config({}), false), null);
  assert.equal(competenciaParaLancar('2026-09-05', config({}), false), '2026-09-01');
  assert.equal(competenciaParaLancar('2026-09-20', config({}), false), '2026-09-01');
  assert.equal(competenciaParaLancar('2026-09-20', config({}), true), null);
});

test('automático desligado ou ligado depois do dia no mês atual não lança', () => {
  assert.equal(competenciaParaLancar('2026-09-20', config({ lancarAutomatico: false }), false), null);
  assert.equal(competenciaParaLancar('2026-09-20', config({ automaticoDesde: '2026-09-10' }), false), null);
  assert.equal(competenciaParaLancar('2026-10-05', config({ automaticoDesde: '2026-09-10' }), false), '2026-10-01');
});
