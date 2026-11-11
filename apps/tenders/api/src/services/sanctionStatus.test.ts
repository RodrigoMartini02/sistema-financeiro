import assert from 'node:assert/strict';
import test from 'node:test';
import { SANCTION_BASES, SANCTION_STATUSES, SANCTION_SUBJECT_BASES } from '../domains';
import {
  SANCTION_REUSE_MINUTES,
  SANCTION_STALE_DAYS,
  isSanctionCheckReusable,
  isSanctionCheckStale,
  isSanctionRecordInForce,
  parseSanctionDate,
  sanctionBaseStatusOn,
} from './sanctionStatus';

// Situação das bases de sanções por data (item 6): sem registro, em vigor ou encerrada contra uma data de referência, a leitura
// das duas formas de data da fonte e as janelas da consulta guardada. Puro, sem banco. O que mais pesa são as bordas: o dia da
// data final, a data que não se lê e o CEPIM, que não tem data final.

const TODAY = '2026-11-11';

test('as duas formas de data da fonte viram AAAA-MM-DD, com ou sem hora depois', () => {
  assert.equal(parseSanctionDate('31/12/2026'), '2026-12-31');
  assert.equal(parseSanctionDate('2026-12-31'), '2026-12-31');
  assert.equal(parseSanctionDate('2026-12-31T00:00:00'), '2026-12-31');
  assert.equal(parseSanctionDate('2026-12-31 10:30:00'), '2026-12-31');
  assert.equal(parseSanctionDate('01/02/2027 00:00:00'), '2027-02-01');
  assert.equal(parseSanctionDate('  05/01/2027  '), '2027-01-05');
  assert.equal(parseSanctionDate('29/02/2028'), '2028-02-29', '2028 é bissexto');
});

test('data que não se lê vira null: outra forma, dia que não existe, texto vazio ou de outro tipo', () => {
  assert.equal(parseSanctionDate('29/02/2027'), null);
  assert.equal(parseSanctionDate('2026-02-30'), null);
  assert.equal(parseSanctionDate('2026-13-01'), null);
  assert.equal(parseSanctionDate('31/13/2026'), null);
  assert.equal(parseSanctionDate('12/31/2026'), null, 'mês na frente não é uma forma da fonte');
  assert.equal(parseSanctionDate('2026/12/31'), null);
  assert.equal(parseSanctionDate('Indeterminado'), null);
  assert.equal(parseSanctionDate(''), null);
  assert.equal(parseSanctionDate('   '), null);
  assert.equal(parseSanctionDate(null), null);
  assert.equal(parseSanctionDate(undefined), null);
  assert.equal(parseSanctionDate(20261231), null);
  assert.equal(parseSanctionDate('0000-01-01'), null);
});

test('o registro sem data final está em vigor; o próprio dia da data final ainda vale; encerrado é só no dia seguinte', () => {
  assert.equal(isSanctionRecordInForce({ endDate: null }, TODAY), true);
  assert.equal(isSanctionRecordInForce({ endDate: '2026-11-11' }, TODAY), true, 'o dia da data final ainda vale');
  assert.equal(isSanctionRecordInForce({ endDate: '2026-11-12' }, TODAY), true);
  assert.equal(isSanctionRecordInForce({ endDate: '2026-11-10' }, TODAY), false, 'ontem: encerrado');
  assert.equal(isSanctionRecordInForce({ endDate: '2020-01-01' }, TODAY), false);
  assert.equal(isSanctionRecordInForce({ endDate: '9999-12-31' }, TODAY), true);
});

test('base sem registro: sem registro', () => {
  assert.equal(sanctionBaseStatusOn('CEIS', [], TODAY), 'SEM_REGISTRO');
  assert.equal(sanctionBaseStatusOn('CNEP', [], TODAY), 'SEM_REGISTRO');
  assert.equal(sanctionBaseStatusOn('CEPIM', [], TODAY), 'SEM_REGISTRO');
});

test('base com algum registro que não terminou: em vigor, mesmo que os outros tenham terminado', () => {
  assert.equal(sanctionBaseStatusOn('CEIS', [{ endDate: null }], TODAY), 'EM_VIGOR');
  assert.equal(sanctionBaseStatusOn('CEIS', [{ endDate: '2026-11-11' }], TODAY), 'EM_VIGOR');
  assert.equal(sanctionBaseStatusOn('CEIS', [{ endDate: '2020-01-01' }, { endDate: '2027-06-30' }], TODAY), 'EM_VIGOR');
  assert.equal(sanctionBaseStatusOn('CNEP', [{ endDate: '2020-01-01' }, { endDate: null }], TODAY), 'EM_VIGOR');
});

test('base só com registros que já terminaram: encerrada', () => {
  assert.equal(sanctionBaseStatusOn('CEIS', [{ endDate: '2026-11-10' }], TODAY), 'ENCERRADA');
  assert.equal(sanctionBaseStatusOn('CNEP', [{ endDate: '2020-01-01' }, { endDate: '2025-12-31' }], TODAY), 'ENCERRADA');
});

test('o CEPIM não tem data final: qualquer registro é uma entidade impedida, em vigor', () => {
  assert.equal(sanctionBaseStatusOn('CEPIM', [{ endDate: null }], TODAY), 'EM_VIGOR');
  assert.equal(sanctionBaseStatusOn('CEPIM', [{ endDate: '2020-01-01' }], TODAY), 'EM_VIGOR');
});

test('a data de referência muda o resultado (o checklist por edital usa a data da sessão, não a de hoje)', () => {
  const records = [{ endDate: '2026-12-20' }];
  assert.equal(sanctionBaseStatusOn('CEIS', records, '2026-12-20'), 'EM_VIGOR');
  assert.equal(sanctionBaseStatusOn('CEIS', records, '2026-12-21'), 'ENCERRADA');
  assert.equal(sanctionBaseStatusOn('CEIS', records, '2026-01-01'), 'EM_VIGOR');
});

test('a consulta guardada vale por menos de 15 minutos e é antiga com mais de 7 dias', () => {
  const now = new Date('2026-11-11T15:00:00.000Z');
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();

  assert.equal(SANCTION_REUSE_MINUTES, 15);
  assert.equal(isSanctionCheckReusable(at(0), now), true);
  assert.equal(isSanctionCheckReusable(at(14), now), true);
  assert.equal(isSanctionCheckReusable(at(15), now), false, 'com 15 minutos exatos já não vale');
  assert.equal(isSanctionCheckReusable(at(16), now), false);
  assert.equal(isSanctionCheckReusable('2026-11-11T12:05:00-03:00', now), true, 'o instante vale com qualquer fuso');
  assert.equal(isSanctionCheckReusable(at(-3), now), true, 'relógio um pouco adiantado: ainda vale');
  assert.equal(isSanctionCheckReusable('ontem', now), false, 'data ilegível não vale');

  assert.equal(SANCTION_STALE_DAYS, 7);
  assert.equal(isSanctionCheckStale(at(60 * 24 * 7), now), false, 'exatamente 7 dias ainda não é antiga');
  assert.equal(isSanctionCheckStale(at(60 * 24 * 7 + 1), now), true);
  assert.equal(isSanctionCheckStale(at(5), now), false);
  assert.equal(isSanctionCheckStale('ontem', now), true, 'data ilegível é antiga');
});

test('invariantes das listas: as bases por assunto saem das bases, e o CEPIM só é da empresa', () => {
  assert.deepEqual([...SANCTION_BASES], ['CEIS', 'CNEP', 'CEPIM']);
  for (const bases of Object.values(SANCTION_SUBJECT_BASES)) {
    for (const base of bases) {
      assert.ok((SANCTION_BASES as readonly string[]).includes(base));
    }
  }
  assert.deepEqual([...SANCTION_SUBJECT_BASES.COMPANY], ['CEIS', 'CNEP', 'CEPIM']);
  assert.deepEqual([...SANCTION_SUBJECT_BASES.PERSON], ['CEIS', 'CNEP']);
  assert.deepEqual([...SANCTION_STATUSES], ['NAO_CONSULTADO', 'SEM_REGISTRO', 'EM_VIGOR', 'ENCERRADA']);
});
