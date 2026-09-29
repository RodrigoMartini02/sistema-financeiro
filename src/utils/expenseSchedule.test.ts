import assert from 'node:assert/strict';
import test from 'node:test';
import { addMonthsClamped, dateInMonth, installmentDueDates, invoiceDueDate, splitAmountInCents } from './expenseSchedule';

test('divide o total em centavos com o resto na última parcela', () => {
  assert.deepEqual(splitAmountInCents(10000, 3), [3333, 3333, 3334]);
  assert.deepEqual(splitAmountInCents(10000, 4), [2500, 2500, 2500, 2500]);
  assert.deepEqual(splitAmountInCents(5, 2), [2, 3]);
});

test('soma meses sem pular o fim do mês', () => {
  assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsClamped('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonthsClamped('2026-01-31', 2), '2026-03-31');
  assert.equal(addMonthsClamped('2026-12-15', 1), '2027-01-15');
  assert.deepEqual(installmentDueDates('2026-01-31', 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('dia do mês cai no último dia quando o mês é mais curto', () => {
  assert.equal(dateInMonth('2026-02-10', 31), '2026-02-28');
  assert.equal(dateInMonth('2026-09-29', 10), '2026-09-10');
});

test('fatura: compra até o fechamento entra no mês, depois dele na seguinte', () => {
  const card = { dia_fechamento: 3, dia_vencimento: 10 };
  assert.equal(invoiceDueDate('2026-10-02', card), '2026-10-10');
  assert.equal(invoiceDueDate('2026-10-03', card), '2026-10-10');
  assert.equal(invoiceDueDate('2026-10-04', card), '2026-11-10');
  assert.equal(invoiceDueDate('2026-12-20', card), '2027-01-10');
});

test('fatura: vencimento menor ou igual ao fechamento vence no mês seguinte', () => {
  const card = { dia_fechamento: 25, dia_vencimento: 5 };
  assert.equal(invoiceDueDate('2026-09-20', card), '2026-10-05');
  assert.equal(invoiceDueDate('2026-09-29', card), '2026-11-05');
  assert.equal(invoiceDueDate('2026-09-10', { dia_fechamento: 10, dia_vencimento: 10 }), '2026-10-10');
  assert.equal(invoiceDueDate('2026-01-05', { dia_fechamento: 1, dia_vencimento: 31 }), '2026-02-28');
});
