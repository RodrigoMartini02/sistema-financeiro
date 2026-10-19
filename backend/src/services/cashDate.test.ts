import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { defaultReceiptDate, expenseCashDate, expenseCashDateColumn, expenseCashDateSql, monthRange } from './cashDate';

const base = { dataVencimento: '2026-03-20', dataPagamento: null as string | null };

test('despesa paga conta no dia do pagamento; em aberto, no vencimento', () => {
  assert.equal(expenseCashDate({ ...base, pago: true, dataPagamento: '2026-10-19' }), '2026-10-19');
  assert.equal(expenseCashDate({ ...base, pago: false }), '2026-03-20');
  // Paga adiantada: conta no mês em que o dinheiro saiu, antes do vencimento.
  assert.equal(expenseCashDate({ dataVencimento: '2026-11-05', dataPagamento: '2026-10-15', pago: true }), '2026-10-15');
});

test('paga sem data de pagamento conta no vencimento; data de pagamento de despesa em aberto é ignorada', () => {
  assert.equal(expenseCashDate({ ...base, pago: true, dataPagamento: null }), '2026-03-20');
  assert.equal(expenseCashDate({ ...base, pago: false, dataPagamento: '2026-10-19' }), '2026-03-20');
});

test('SQL cru e Drizzle expressam a mesma regra', () => {
  const raw = expenseCashDateSql('d').replace(/\s+/g, ' ');
  assert.match(raw, /COALESCE\(d\.pago, false\)/);
  assert.match(raw, /COALESCE\(d\.status, 'ativa'\) = 'ativa'/);
  assert.match(raw, /THEN COALESCE\(d\.data_pagamento, d\.data_vencimento\) ELSE d\.data_vencimento END/);
  const { sql: text } = new PgDialect().sqlToQuery(expenseCashDateColumn());
  const drizzle = text.replace(/\s+/g, ' ');
  assert.match(drizzle, /COALESCE\("despesas"\."pago", false\)/);
  assert.match(drizzle, /"despesas"\."status" = 'ativa'/);
  assert.match(drizzle, /THEN COALESCE\("despesas"\."data_pagamento", "despesas"\."data_vencimento"\) ELSE "despesas"\."data_vencimento" END/);
});

test('monthRange: mês de 0 a 11, com fevereiro, ano bissexto e virada do ano', () => {
  assert.deepEqual(monthRange(9, 2026), { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(monthRange(1, 2026), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(monthRange(1, 2028), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(monthRange(11, 2026), { start: '2026-12-01', end: '2026-12-31' });
});

test('data do recebimento sem informar: a prevista se é do mês atual; senão, hoje', () => {
  const today = '2026-10-19';
  // Do mês atual, antes ou depois de hoje: fica a prevista.
  assert.equal(defaultReceiptDate('2026-10-05', today), '2026-10-05');
  assert.equal(defaultReceiptDate('2026-10-25', today), '2026-10-25');
  // De mês fechado: hoje (não escreve em mês que já fechou).
  assert.equal(defaultReceiptDate('2026-03-10', today), '2026-10-19');
  // De mês que ainda não chegou (recebeu adiantado): hoje.
  assert.equal(defaultReceiptDate('2026-11-05', today), '2026-10-19');
  // Mesmo mês de outro ano não é o mês atual.
  assert.equal(defaultReceiptDate('2025-10-05', today), '2026-10-19');
});
