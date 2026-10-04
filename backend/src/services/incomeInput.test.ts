import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import {
  readCreateIncomeInput,
  readIncomeDuplicateQuery,
  readIncomeSuggestionsQuery,
  readReceiveIncomeInput,
  readUpdateIncomeInput,
} from './incomeInput';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    accountId: 17,
    description: '  Consultoria  ',
    categoryId: 4,
    amount: 1500,
    receiptDate: '2026-09-29',
    clientId: 31,
    representativeId: null,
    attachments: null,
    repeatUntil: null,
    productSale: null,
    billableHours: null,
    ...overrides,
  };
}

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('lê a receita, apara a descrição e guarda o cliente do cadastro pelo id', () => {
  const input = readCreateIncomeInput(body());
  assert.equal(input.description, 'Consultoria');
  assert.equal(input.clientId, 31);
  assert.equal(input.accountId, 17);
  assert.equal(input.repeatUntil, null);
  assert.equal(readCreateIncomeInput(body({ clientId: null })).clientId, null);
});

test('lê repetir até, produto vendido e horas a faturar', () => {
  const input = readCreateIncomeInput(body({
    repeatUntil: { month: 11, year: 2026 },
    productSale: { productId: 'a3f0c2d1-1111-4222-8333-944455556666', quantity: 2 },
    billableHours: { hourTypeId: 8, hours: 3.5 },
  }));
  assert.deepEqual(input.repeatUntil, { month: 11, year: 2026 });
  assert.deepEqual(input.productSale, { productId: 'a3f0c2d1-1111-4222-8333-944455556666', quantity: 2 });
  assert.deepEqual(input.billableHours, { hourTypeId: 8, hours: 3.5 });
  assert.deepEqual(readCreateIncomeInput(body({ billableHours: { hourTypeId: 8, hours: 1.256 } })).billableHours, { hourTypeId: 8, hours: 1.26 });
});

test('recusa campos obrigatórios ausentes ou inválidos', () => {
  assertRejects(() => readCreateIncomeInput(body({ description: ' ' })), 'Informe a descrição');
  assertRejects(() => readCreateIncomeInput(body({ amount: 0 })), 'Informe o valor');
  assertRejects(() => readCreateIncomeInput(body({ amount: 100_000_000 })), 'Valor acima do limite permitido');
  assertRejects(() => readCreateIncomeInput(body({ receiptDate: '2026-02-30' })), 'Data do recebimento inválida');
  assertRejects(() => readCreateIncomeInput(body({ clientId: 'Empresa XYZ' })), 'Cliente inválido');
  assertRejects(() => readCreateIncomeInput(body({ representativeId: 'Ana' })), 'Representante inválido');
  assertRejects(() => readCreateIncomeInput('texto'), 'Pedido inválido');
});

test('repetir até precisa ser depois do mês da receita e no máximo 36 meses', () => {
  assertRejects(
    () => readCreateIncomeInput(body({ repeatUntil: { month: 8, year: 2026 } })),
    'Repetir até: escolha um mês depois do mês da receita',
  );
  assertRejects(
    () => readCreateIncomeInput(body({ repeatUntil: { month: 9, year: 2029 } })),
    'Repetir até: no máximo 36 meses',
  );
  assertRejects(() => readCreateIncomeInput(body({ repeatUntil: { month: 12, year: 2026 } })), 'Repetir até: informe mês e ano');
  assert.deepEqual(readCreateIncomeInput(body({ repeatUntil: { month: 8, year: 2029 } })).repeatUntil, { month: 8, year: 2029 });
});

test('produto e horas precisam de quantidade maior que zero', () => {
  assertRejects(
    () => readCreateIncomeInput(body({ productSale: { productId: 'p1', quantity: 0 } })),
    'Informe a quantidade vendida',
  );
  assertRejects(() => readCreateIncomeInput(body({ productSale: { productId: '', quantity: 1 } })), 'Produto vendido inválido');
  assertRejects(
    () => readCreateIncomeInput(body({ billableHours: { hourTypeId: null, hours: 2 } })),
    'Escolha o tipo de hora',
  );
  assertRejects(
    () => readCreateIncomeInput(body({ billableHours: { hourTypeId: 8, hours: 0.001 } })),
    'Informe a quantidade de horas',
  );
});

test('edição lê só os campos da própria receita', () => {
  const input = readUpdateIncomeInput(body({ repeatUntil: { month: 11, year: 2026 } }));
  assert.equal(input.amount, 1500);
  assert.equal('repeatUntil' in input, false);
  assert.equal('accountId' in input, false);
});

test('sugestões ignoram texto com menos de 2 letras', () => {
  assert.deepEqual(readIncomeSuggestionsQuery({ description: 'c', account_id: '17' }), { description: '', accountId: 17 });
  assert.equal(readIncomeSuggestionsQuery({ description: ' co ' }).description, 'co');
});

test('duplicata lê valor e cliente', () => {
  assert.deepEqual(readIncomeDuplicateQuery({ description: 'Consultoria', amount: '1500.00', client_id: '', exclude_id: '3' }), {
    description: 'Consultoria', amount: 1500, clientId: null, accountId: null, excludeId: 3,
  });
  assert.equal(readIncomeDuplicateQuery({ description: 'Consultoria', amount: '10', client_id: '31' }).clientId, 31);
  assertRejects(() => readIncomeDuplicateQuery({ description: 'Consultoria', amount: 'x' }), 'Informe o valor');
  assertRejects(() => readIncomeDuplicateQuery({ amount: '10' }), 'Informe a descrição');
});

test('recebimento: data e valor opcionais; vazio ou zero mantém o valor da receita', () => {
  assert.deepEqual(readReceiveIncomeInput(undefined), { receivedDate: null, receivedAmount: null });
  assert.deepEqual(readReceiveIncomeInput({ data_recebimento: '2026-10-05', valor_recebido: '4059.00' }), {
    receivedDate: '2026-10-05', receivedAmount: 4059,
  });
  assert.deepEqual(readReceiveIncomeInput({ valor_recebido: 0 }), { receivedDate: null, receivedAmount: null });
  assertRejects(() => readReceiveIncomeInput({ data_recebimento: '2026-13-01' }), 'Data do recebimento inválida');
  assertRejects(() => readReceiveIncomeInput({ valor_recebido: 'abc' }), 'Valor recebido inválido');
});
