import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFixedDeferral, readFixedExpenseInput, readFixedMonth } from './fixedExpenseInput';
import { readUpdateExpenseInput } from './expenseInput';

const input = () => ({ accountId: 3, description: ' Energia ', categoryId: 7, amount: 100.5, paymentMethod: 'pix', cardId: null,
  purchaseDate: '2026-10-30', dueDate: '2026-11-10', endMonth: '2027-03', paid: false });

test('fixa aceita dados explícitos da primeira ocorrência e limite entre anos', () => {
  const read = readFixedExpenseInput({ ...input(), paid: true, paymentDate: '2026-10-30', amountPaid: 95,
    invoiceNumber: '001', invoiceDate: '2026-10-30', attachments: [] });
  assert.equal(read.description, 'Energia');
  assert.equal(read.amount, 100.5);
  assert.equal(read.endMonth, '2027-03');
  assert.equal(read.sourceExpenseId, null);
  assert.equal(read.paid, true);
  assert.equal(read.amountPaid, 95);
  assert.equal(read.invoiceNumber, '001');
});

test('mês final é obrigatório e não pode anteceder primeiro vencimento', () => {
  for (const endMonth of [undefined, null, '', '2026-10', '2026-13', '2101-01']) {
    assert.throws(() => readFixedExpenseInput({ ...input(), endMonth }));
  }
  assert.equal(readFixedExpenseInput({ ...input(), endMonth: '2026-11' }).endMonth, '2026-11');
});

test('mês e ano financeiro válidos, sem aceitar dia no seletor', () => {
  for (const month of ['2026-00', '2026-13', '2026-1', '1999-12', '2101-01', '2026-11-01', null]) {
    assert.throws(() => readFixedMonth(month));
  }
  assert.equal(readFixedMonth('2026-11'), '2026-11');
});

test('fixa reutiliza validação normal de valor, categoria, forma, datas e comprovantes', () => {
  for (const patch of [{ amount: 0 }, { amount: -1 }, { amount: NaN }, { amount: 100_000_000 }, { categoryId: null },
    { paymentMethod: 'boleto' }, { purchaseDate: '2026-02-30' }, { dueDate: 'amanhã' }, { attachments: 'arquivo' }]) {
    assert.throws(() => readFixedExpenseInput({ ...input(), ...patch }));
  }
});

test('crédito exige cartão e pix não aceita cartão', () => {
  assert.throws(() => readFixedExpenseInput({ ...input(), paymentMethod: 'credito' }));
  assert.throws(() => readFixedExpenseInput({ ...input(), cardId: 4 }));
  assert.equal(readFixedExpenseInput({ ...input(), paymentMethod: 'credito', cardId: 4 }).cardId, 4);
});

test('Até pode ser enviado na edição habitual sem alterar o contrato antigo', () => {
  assert.equal(readUpdateExpenseInput(input()).endMonth, '2027-03');
  const { endMonth: _endMonth, ...ordinary } = input();
  assert.equal(readUpdateExpenseInput(ordinary).endMonth, undefined);
  assert.throws(() => readUpdateExpenseInput({ ...input(), endMonth: 'amanhã' }));
});

test('adiamento individual e em grupo exige booleano e IDs válidos', () => {
  assert.deepEqual(readFixedDeferral({ accountId: 3, ids: [1, 2, 1], deferred: true }), { accountId: 3, ids: [1, 2], deferred: true });
  for (const patch of [{ ids: [] }, { ids: [0] }, { ids: [1.2] }, { ids: ['x'] }, { ids: [1], deferred: 'sim' },
    { ids: Array.from({ length: 501 }, (_, index) => index + 1) }]) {
    assert.throws(() => readFixedDeferral({ accountId: 3, deferred: false, ...patch }));
  }
});
