import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import {
  readCreateExpenseInput,
  readDuplicateQuery,
  readSuggestionsQuery,
  readUpdateExpenseInput,
} from './expenseInput';

function singleBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    accountId: 17,
    description: '  Conta de luz  ',
    categoryId: 10,
    paymentMethod: 'pix',
    cardId: null,
    purchaseDate: '2026-09-29',
    billingType: 'single',
    amount: 187.4,
    dueDate: '2026-10-05',
    paid: false,
    paymentDate: null,
    amountPaid: null,
    invoiceNumber: null,
    invoiceDate: null,
    attachments: null,
    ...overrides,
  };
}

function installment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { amount: 33.33, dueDate: '2026-10-10', paid: false, paymentDate: null, amountPaid: null, ...overrides };
}

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('lê a despesa única e apara a descrição', () => {
  const input = readCreateExpenseInput(singleBody());
  assert.equal(input.description, 'Conta de luz');
  assert.equal(input.accountId, 17);
  assert.ok(input.billingType === 'single');
  assert.equal(input.amount, 187.4);
  assert.equal(input.dueDate, '2026-10-05');
});

test('lê o parcelado com a lista de parcelas', () => {
  const input = readCreateExpenseInput(singleBody({
    billingType: 'installments',
    paymentMethod: 'credito',
    cardId: 6,
    amount: undefined,
    dueDate: undefined,
    paid: undefined,
    installments: [
      installment({ paid: true, paymentDate: '2026-10-10', amountPaid: 33.33 }),
      installment({ dueDate: '2026-11-10' }),
      installment({ amount: 33.34, dueDate: '2026-12-10' }),
    ],
  }));
  assert.ok(input.billingType === 'installments');
  assert.equal(input.installments.length, 3);
  assert.equal(input.installments[0]?.paid, true);
  assert.equal(input.installments[2]?.amount, 33.34);
});

test('recusa campos obrigatórios ausentes ou inválidos', () => {
  assertRejects(() => readCreateExpenseInput(singleBody({ description: '   ' })), 'Informe a descrição');
  assertRejects(() => readCreateExpenseInput(singleBody({ paymentMethod: 'boleto' })), 'Forma de pagamento inválida');
  assertRejects(() => readCreateExpenseInput(singleBody({ billingType: 'weekly' })), 'Tipo de cobrança inválido');
  assertRejects(() => readCreateExpenseInput(singleBody({ amount: 0 })), 'Informe o valor');
  assertRejects(() => readCreateExpenseInput(singleBody({ purchaseDate: '2026-02-30' })), 'Data da compra inválida');
  assertRejects(() => readCreateExpenseInput(singleBody({ dueDate: '05/10/2026' })), 'Data de vencimento inválida');
  assertRejects(() => readCreateExpenseInput(singleBody({ categoryId: 'mercado' })), 'Categoria inválida');
  assertRejects(() => readCreateExpenseInput('texto'), 'Pedido inválido');
});

test('recusa valor acima do limite da coluna', () => {
  assertRejects(() => readCreateExpenseInput(singleBody({ amount: 100_000_000 })), 'Valor acima do limite permitido');
});

test('recusa cartão fora de débito e crédito', () => {
  assertRejects(() => readCreateExpenseInput(singleBody({ cardId: 6 })), 'O cartão só vale para débito ou crédito');
});

test('recusa data e valor pagos numa despesa não paga', () => {
  assertRejects(
    () => readCreateExpenseInput(singleBody({ paymentDate: '2026-09-29' })),
    'Data e valor pagos só valem para despesa paga',
  );
  assertRejects(
    () => readCreateExpenseInput(singleBody({ amountPaid: 10 })),
    'Data e valor pagos só valem para despesa paga',
  );
});

test('recusa parcelado fora do limite de 2 a 360 parcelas', () => {
  const base = singleBody({ billingType: 'installments', amount: undefined, dueDate: undefined, paid: undefined });
  assertRejects(() => readCreateExpenseInput({ ...base, installments: [installment()] }), 'Informe de 2 a 360 parcelas');
  assertRejects(
    () => readCreateExpenseInput({ ...base, installments: Array.from({ length: 361 }, () => installment()) }),
    'Informe de 2 a 360 parcelas',
  );
  assertRejects(
    () => readCreateExpenseInput({ ...base, installments: [installment(), installment({ amount: -1 })] }),
    'Informe o valor da parcela 2',
  );
});

test('recusa número da nota fiscal longo demais', () => {
  assertRejects(
    () => readCreateExpenseInput(singleBody({ invoiceNumber: 'x'.repeat(51) })),
    'Número da nota fiscal: até 50 caracteres',
  );
});

test('edição lê só os campos editáveis', () => {
  const input = readUpdateExpenseInput(singleBody({ paid: true, paymentDate: '2026-10-06', amountPaid: 190 }));
  assert.equal(input.amount, 187.4);
  assert.equal(input.paid, true);
  assert.equal(input.amountPaid, 190);
  assert.equal('billingType' in input, false);
});

test('sugestões ignoram texto com menos de 2 letras', () => {
  assert.deepEqual(readSuggestionsQuery({ description: 'u', account_id: '17' }), {
    description: '', accountId: 17, categoryId: null,
  });
  assert.equal(readSuggestionsQuery({ description: ' ub ' }).description, 'ub');
  assertRejects(() => readSuggestionsQuery({ account_id: 'abc' }), 'Conta inválida');
});

test('duplicata lê valor, forma e parcelas', () => {
  const query = readDuplicateQuery({
    description: 'Uber', amount: '23.5', payment_method: 'credito', installment_count: '3', exclude_id: '9',
  });
  assert.deepEqual(query, {
    description: 'Uber', amount: 23.5, paymentMethod: 'credito', installmentCount: 3, accountId: null, excludeId: 9,
  });
  assertRejects(() => readDuplicateQuery({ description: 'Uber', amount: 'x', payment_method: 'pix' }), 'Informe o valor');
  assertRejects(
    () => readDuplicateQuery({ description: 'Uber', amount: '10', payment_method: 'pix', installment_count: '1' }),
    'Número de parcelas inválido',
  );
});
