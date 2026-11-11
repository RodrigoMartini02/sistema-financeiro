import assert from 'node:assert/strict';
import test from 'node:test';
import { DOCUMENT_URGENT_DAYS, DOCUMENT_WARNING_DAYS, calendarDaysBetween, documentStatusOn, expiryNoticeType } from './documentStatus';

// Situação do documento por data (item 5): válido, vencendo ou vencido contra uma data de referência, e a faixa do aviso do
// sino. Puro, sem banco. O que mais pesa são as bordas: o dia da validade, o 30º e o 31º dia.

const TODAY = '2026-11-11';

test('dias de calendário entre duas datas, sem depender de fuso nem de mês curto ou ano bissexto', () => {
  assert.equal(calendarDaysBetween('2026-11-11', '2026-11-11'), 0);
  assert.equal(calendarDaysBetween('2026-11-11', '2026-11-12'), 1);
  assert.equal(calendarDaysBetween('2026-11-11', '2026-11-10'), -1);
  assert.equal(calendarDaysBetween('2026-11-11', '2026-12-11'), 30);
  assert.equal(calendarDaysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(calendarDaysBetween('2028-02-28', '2028-03-01'), 2, '2028 é bissexto');
  assert.equal(calendarDaysBetween('2027-02-28', '2027-03-01'), 1);
});

test('sem validade o documento não vence: válido, sem contagem', () => {
  assert.deepEqual(documentStatusOn(null, TODAY), { status: 'VALID', daysToExpire: null });
});

test('o próprio dia da validade ainda vale: vencendo, com 0 dia; vencido só no dia seguinte', () => {
  assert.deepEqual(documentStatusOn('2026-11-11', TODAY), { status: 'EXPIRING', daysToExpire: 0 });
  assert.deepEqual(documentStatusOn('2026-11-10', TODAY), { status: 'EXPIRED', daysToExpire: -1 });
  assert.deepEqual(documentStatusOn('2020-01-01', TODAY).status, 'EXPIRED');
});

test('vencendo de 0 a 30 dias; com 31 dias ou mais, válido', () => {
  assert.deepEqual(documentStatusOn('2026-11-12', TODAY), { status: 'EXPIRING', daysToExpire: 1 });
  assert.deepEqual(documentStatusOn('2026-12-11', TODAY), { status: 'EXPIRING', daysToExpire: 30 });
  assert.deepEqual(documentStatusOn('2026-12-12', TODAY), { status: 'VALID', daysToExpire: 31 });
  assert.deepEqual(documentStatusOn('2028-01-01', TODAY).status, 'VALID');
});

test('a data de referência muda o resultado (o checklist por edital usa a data da sessão, não a de hoje)', () => {
  assert.equal(documentStatusOn('2026-12-20', TODAY).status, 'VALID');
  assert.equal(documentStatusOn('2026-12-20', '2026-12-10').status, 'EXPIRING');
  assert.equal(documentStatusOn('2026-12-20', '2026-12-21').status, 'EXPIRED');
});

test('a antecedência do "vencendo" é um parâmetro', () => {
  assert.equal(documentStatusOn('2026-11-21', TODAY, 7).status, 'VALID');
  assert.equal(documentStatusOn('2026-11-18', TODAY, 7).status, 'EXPIRING');
  assert.equal(documentStatusOn('2026-11-19', TODAY, 7).status, 'VALID');
  assert.equal(DOCUMENT_WARNING_DAYS, 30);
  assert.equal(DOCUMENT_URGENT_DAYS, 7);
});

test('faixa do aviso: de 0 a 7 dias, o urgente; de 8 a 30, o primeiro; fora disso, nenhum', () => {
  assert.equal(expiryNoticeType(0), 'DOCUMENTO_VENCE_7D');
  assert.equal(expiryNoticeType(7), 'DOCUMENTO_VENCE_7D');
  assert.equal(expiryNoticeType(8), 'DOCUMENTO_VENCE_30D');
  assert.equal(expiryNoticeType(30), 'DOCUMENTO_VENCE_30D');
  assert.equal(expiryNoticeType(31), null);
  assert.equal(expiryNoticeType(-1), null, 'vencido não gera aviso novo');
  assert.equal(expiryNoticeType(400), null);
});
