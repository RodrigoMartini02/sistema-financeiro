import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedConversionRefusal, fixedExpenseDates, fixedExpenseRangeDates } from './fixedExpenseSchedule';

const source = { firstMonth: '2026-11', purchaseDate: '2026-10-30', dueDate: '2026-11-10', paymentMethod: 'pix' };

test('intervalo inclui mês final e atravessa dezembro sem renovar', () => {
  const dates = fixedExpenseRangeDates(source, '2027-03', null);
  assert.deepEqual(dates.map(item => item.dueDate), ['2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10', '2027-03-10']);
  assert.deepEqual(fixedExpenseRangeDates(source, '2026-11', null).map(item => item.competence), ['2026-11-01']);
  assert.deepEqual(fixedExpenseRangeDates(source, '2026-10', null), []);
});

test('dia 31 limita mês curto sem perder o dia original nos seguintes', () => {
  const monthEnd = { firstMonth: '2027-01', purchaseDate: '2027-01-31', dueDate: '2027-01-31', paymentMethod: 'dinheiro' };
  assert.equal(fixedExpenseDates(monthEnd, '2027-02-01', null).dueDate, '2027-02-28');
  assert.equal(fixedExpenseDates(monthEnd, '2027-03-01', null).dueDate, '2027-03-31');
  assert.equal(fixedExpenseDates(monthEnd, '2028-02-01', null).dueDate, '2028-02-29');
});

test('crédito preserva data inicial e calcula próximas faturas pela compra', () => {
  const credit = { ...source, dueDate: '2026-11-09', paymentMethod: 'credito' };
  const dates = fixedExpenseRangeDates(credit, '2027-01', { closingDay: 2, dueDay: 9 });
  assert.deepEqual(dates.map(item => item.dueDate), ['2026-11-09', '2026-12-09', '2027-01-09']);
  assert.equal(dates[1]!.purchaseDate, '2026-11-30');
  assert.equal(dates[1]!.competence, '2026-12-01');
});

test('limite considera vencimento da fatura, não mês de compra ou competência legada', () => {
  const legacy = { firstMonth: '2026-11', purchaseDate: '2026-11-20', dueDate: '2026-12-09', paymentMethod: 'credito' };
  assert.deepEqual(fixedExpenseRangeDates(legacy, '2026-12', { closingDay: 2, dueDay: 9 }), [
    { competence: '2026-11-01', purchaseDate: '2026-11-20', dueDate: '2026-12-09' },
  ]);
  const fresh = { ...legacy, firstMonth: '2026-12' };
  const dates = fixedExpenseRangeDates(fresh, '2027-02', { closingDay: 2, dueDay: 9 });
  assert.deepEqual(dates.map(item => item.dueDate), ['2026-12-09', '2027-01-09', '2027-02-09']);
  assert.equal(dates[2]!.purchaseDate, '2027-01-20');
});

test('competência não depende do vencimento ajustado da ocorrência', () => {
  assert.equal(fixedExpenseDates(source, '2026-12-01', null).competence, '2026-12-01');
});

test('primeiro vencimento manual em outra fatura mantém a frequência mensal', () => {
  const manual = { firstMonth: '2026-12', purchaseDate: '2026-10-30', dueDate: '2026-12-09', paymentMethod: 'credito' };
  const dates = fixedExpenseRangeDates(manual, '2027-02', { closingDay: 2, dueDay: 9 });
  assert.deepEqual(dates.map(item => item.dueDate), ['2026-12-09', '2027-01-09', '2027-02-09']);
  assert.equal(dates[1]!.purchaseDate, '2026-11-30');
});

test('somente despesa única ativa e sem vínculo pode originar fixa', () => {
  const row = { status: 'ativa', fixedExpenseId: null, installment: false, recurring: false, installmentGroupId: null,
    sourceIncomeId: null, invoiceOriginPaymentId: null, invoicePaymentId: null };
  assert.equal(fixedConversionRefusal(row), null);
  for (const patch of [{ status: 'cancelada' }, { fixedExpenseId: 4 }, { installment: true }, { recurring: true },
    { installmentGroupId: 2 }, { sourceIncomeId: 1 }, { invoiceOriginPaymentId: 1 }, { invoicePaymentId: 1 }]) {
    assert.ok(fixedConversionRefusal({ ...row, ...patch }));
  }
});
