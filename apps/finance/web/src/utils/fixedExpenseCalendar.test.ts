import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense } from '../types/finance';
import { getExpenseStatus } from '../screens/finance/calendar/calendarStatus';

test('calendário conserva previsão em datas passadas e futuras até a confirmação', () => {
  const base = {
    status: 'prevista', pago: false, dataVencimento: '2000-01-01', fixedExpenseId: 1,
  } as Expense;
  assert.equal(getExpenseStatus(base), 'previsto');
  assert.equal(getExpenseStatus({ ...base, dataVencimento: '2099-01-01' }), 'previsto');
  assert.equal(getExpenseStatus({ ...base, pago: true }), 'previsto');
  assert.equal(getExpenseStatus({ ...base, status: 'ativa', pago: true }), 'pago');
  assert.equal(getExpenseStatus({ ...base, status: 'ativa' }), 'atrasado');
});
