import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anoDaRenovacao,
  competenciaDe,
  competenciasAteDezembro,
  competenciasDaRenovacao,
  dataDoLancamento,
  primeiraCompetencia,
  renovacaoPendente,
} from './fixedIncomeSchedule';

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

test('ligar a fixa grava do mês atual (ou do seguinte, se o dia passou) até dezembro', () => {
  assert.deepEqual(competenciasAteDezembro('2026-10-13', 20), ['2026-10-01', '2026-11-01', '2026-12-01']);
  assert.deepEqual(competenciasAteDezembro('2026-10-13', 5), ['2026-11-01', '2026-12-01']);
  assert.equal(competenciasAteDezembro('2026-01-31', 31).length, 12);
  // Ligada em dezembro, depois do dia: o ano seguinte inteiro.
  const nextYear = competenciasAteDezembro('2026-12-20', 5);
  assert.deepEqual([nextYear.length, nextYear[0], nextYear[11]], [12, '2027-01-01', '2027-12-01']);
});

test('renovação: o ano seguinte inteiro, ou a partir do mês atual se a decisão vem no ano novo', () => {
  assert.equal(competenciasDaRenovacao('2026-12-10', 2027, 5).length, 12);
  assert.deepEqual(competenciasDaRenovacao('2027-03-10', 2027, 5)[0], '2027-04-01');
  assert.deepEqual(competenciasDaRenovacao('2027-03-03', 2027, 5)[0], '2027-03-01');
  assert.deepEqual(competenciasDaRenovacao('2027-12-20', 2027, 5), []);
  assert.equal(anoDaRenovacao(2026, '2026-12-10'), 2027);
  assert.equal(anoDaRenovacao(2026, '2028-01-05'), 2028);
});

test('renovação pendente a partir de 1º de dezembro do último ano gravado, sem fim', () => {
  assert.equal(renovacaoPendente(2026, '2026-11-30'), false);
  assert.equal(renovacaoPendente(2026, '2026-12-01'), true);
  assert.equal(renovacaoPendente(2026, '2027-06-01'), true);
  assert.equal(renovacaoPendente(2027, '2026-12-15'), false);
});
