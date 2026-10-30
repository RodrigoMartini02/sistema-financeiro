import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedConversionRefusal, fixedExpenseDates, fixedExpenseYearDates } from './fixedExpenseSchedule';

const source = { firstMonth: '2026-11', purchaseDate: '2026-10-30', dueDate: '2026-11-10', paymentMethod: 'pix' };

test('ano começa no mês escolhido e termina em dezembro, incluindo primeiro mês', () => {
  assert.deepEqual(fixedExpenseYearDates(source, 2026, null), [
    { competence: '2026-11-01', purchaseDate: '2026-10-30', dueDate: '2026-11-10' },
    { competence: '2026-12-01', purchaseDate: '2026-11-30', dueDate: '2026-12-10' },
  ]);
  assert.equal(fixedExpenseYearDates(source, 2025, null).length, 0);
  assert.equal(fixedExpenseYearDates(source, 2027, null).length, 12);
});

test('dia 31 limita mês curto sem perder o dia original nos seguintes', () => {
  const monthEnd = { firstMonth: '2027-01', purchaseDate: '2027-01-31', dueDate: '2027-01-31', paymentMethod: 'dinheiro' };
  assert.equal(fixedExpenseDates(monthEnd, '2027-02-01', null).dueDate, '2027-02-28');
  assert.equal(fixedExpenseDates(monthEnd, '2027-03-01', null).dueDate, '2027-03-31');
  assert.equal(fixedExpenseDates(monthEnd, '2028-02-01', null).dueDate, '2028-02-29');
});

test('crédito preserva data inicial e calcula próximas faturas pela compra', () => {
  const credit = { firstMonth: '2026-11', purchaseDate: '2026-10-30', dueDate: '2026-11-09', paymentMethod: 'credito' };
  const dates = fixedExpenseYearDates(credit, 2026, { closingDay: 2, dueDay: 9 });
  assert.equal(dates[0]!.dueDate, '2026-11-09');
  assert.equal(dates[1]!.purchaseDate, '2026-11-30');
  assert.equal(dates[1]!.dueDate, '2026-12-09');
  assert.equal(dates[1]!.competence, '2026-12-01');
});

test('primeiro ciclo preserva compra e vencimento mesmo quando vence no mês seguinte', () => {
  const credit = { firstMonth: '2026-11', purchaseDate: '2026-11-20', dueDate: '2026-12-09', paymentMethod: 'credito' };
  const dates = fixedExpenseYearDates(credit, 2026, { closingDay: 2, dueDay: 9 });
  assert.deepEqual(dates, [
    { competence: '2026-11-01', purchaseDate: '2026-11-20', dueDate: '2026-12-09' },
    { competence: '2026-12-01', purchaseDate: '2026-12-20', dueDate: '2027-01-09' },
  ]);
  const cash = fixedExpenseYearDates({ ...credit, paymentMethod: 'pix' }, 2026, null);
  assert.equal(cash[0]!.purchaseDate, '2026-11-20');
  assert.equal(cash[0]!.dueDate, '2026-12-09');
  assert.equal(cash[1]!.dueDate, '2027-01-09');
});

test('competência não depende do vencimento ajustado da ocorrência', () => {
  assert.equal(fixedExpenseDates(source, '2026-12-01', null).competence, '2026-12-01');
});

test('somente despesa única ativa e sem vínculo pode originar fixa', () => {
  const row = { status: 'ativa', fixedExpenseId: null, installment: false, recurring: false, installmentGroupId: null,
    sourceIncomeId: null, invoiceOriginPaymentId: null };
  assert.equal(fixedConversionRefusal(row), null);
  for (const patch of [{ status: 'cancelada' }, { fixedExpenseId: 4 }, { installment: true }, { recurring: true },
    { installmentGroupId: 2 }, { sourceIncomeId: 1 }, { invoiceOriginPaymentId: 1 }]) {
    assert.ok(fixedConversionRefusal({ ...row, ...patch }));
  }
});
