import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFixedExpenseInput, readFixedExpenseUpdateInput, readFixedMonth, readFixedRenewalYear } from './fixedExpenseInput';

const input = () => ({ accountId: 3, description: ' Energia ', categoryId: 7, amount: 100.5, paymentMethod: 'pix', cardId: null,
  purchaseDate: '2026-10-30', dueDate: '2026-11-10', firstMonth: '2026-11' });

test('fixa aceita valor de referência e normaliza descrição sem inferir pagamento', () => {
  const read = readFixedExpenseInput({ ...input(), paid: true });
  assert.equal(read.description, 'Energia');
  assert.equal(read.amount, 100.5);
  assert.equal(read.sourceExpenseId, null);
  assert.equal('paid' in read, false);
});

test('fixa valida mês e ano financeiro', () => {
  for (const month of ['2026-00', '2026-13', '2026-1', '1999-12', '2101-01', '2026-11-01', null]) {
    assert.throws(() => readFixedMonth(month));
  }
  assert.equal(readFixedMonth('2026-11'), '2026-11');
});

test('fixa valida valor positivo, categoria, forma e datas', () => {
  for (const patch of [{ amount: 0 }, { amount: -1 }, { amount: NaN }, { amount: 100_000_000 }, { categoryId: null },
    { paymentMethod: 'boleto' }, { purchaseDate: '2026-02-30' }, { dueDate: 'amanhã' }]) {
    assert.throws(() => readFixedExpenseInput({ ...input(), ...patch }));
  }
});

test('crédito exige cartão e pix não aceita cartão', () => {
  assert.throws(() => readFixedExpenseInput({ ...input(), paymentMethod: 'credito' }));
  assert.throws(() => readFixedExpenseInput({ ...input(), cardId: 4 }));
  assert.equal(readFixedExpenseInput({ ...input(), paymentMethod: 'credito', cardId: 4 }).cardId, 4);
});

test('alteração exige alcance futuro explícito e não troca origem', () => {
  assert.throws(() => readFixedExpenseUpdateInput(input()));
  assert.throws(() => readFixedExpenseUpdateInput({ ...input(), applyToFuture: true, sourceExpenseId: 2 }));
  assert.equal(readFixedExpenseUpdateInput({ ...input(), applyToFuture: false }).applyToFuture, false);
});

test('renovação só aceita ano inteiro no intervalo financeiro', () => {
  for (const year of [null, '2027', 2027.5, 1999, 2101]) assert.throws(() => readFixedRenewalYear({ year }));
  assert.equal(readFixedRenewalYear({ year: 2027 }), 2027);
});
