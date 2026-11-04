import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveMonthParam, nextOpenInvoiceMonth } from './cardSchedule';

test('dia de vencimento ainda não passou: a fatura deste mês', () => {
  assert.deepEqual(nextOpenInvoiceMonth('2026-10-04', 4), { month: 9, year: 2026 });
  assert.deepEqual(nextOpenInvoiceMonth('2026-10-01', 10), { month: 9, year: 2026 });
});

test('dia de vencimento já passou: a fatura do mês seguinte', () => {
  assert.deepEqual(nextOpenInvoiceMonth('2026-10-05', 4), { month: 10, year: 2026 });
});

test('virada do ano', () => {
  assert.deepEqual(nextOpenInvoiceMonth('2026-12-20', 10), { month: 0, year: 2027 });
});

test('dia 31 em mês mais curto vale como o último dia', () => {
  assert.deepEqual(nextOpenInvoiceMonth('2027-02-28', 31), { month: 1, year: 2027 });
  assert.deepEqual(nextOpenInvoiceMonth('2026-11-30', 31), { month: 10, year: 2026 });
});

test('mês de vigência no formato do servidor', () => {
  assert.equal(effectiveMonthParam({ month: 10, year: 2026 }), '2026-11');
  assert.equal(effectiveMonthParam({ month: 0, year: 2027 }), '2027-01');
});
