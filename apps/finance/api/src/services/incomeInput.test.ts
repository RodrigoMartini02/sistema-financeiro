import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import {
  readCreateIncomeInput,
  readIncomeDeferral,
  readIncomeDuplicateQuery,
  readIncomeMonth,
  readIncomeSuggestionsQuery,
  readReceiveIncomeInput,
  readUpdateIncomeInput,
} from './incomeInput';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    accountId: 17,
    description: '  Consultoria  ',
    categoryId: 4,
    grossAmount: 1500,
    netAmount: 1500,
    receiptDate: '2026-09-29',
    clientId: 31,
    representativeId: null,
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
  assert.equal(readCreateIncomeInput(body({ clientId: null })).clientId, null);
});

test('lê produto vendido e horas a faturar', () => {
  const input = readCreateIncomeInput(body({
    productSale: { productId: 'a3f0c2d1-1111-4222-8333-944455556666', quantity: 2 },
    billableHours: { hourTypeId: 8, hours: 3.5 },
  }));
  assert.deepEqual(input.productSale, { productId: 'a3f0c2d1-1111-4222-8333-944455556666', quantity: 2 });
  assert.deepEqual(input.billableHours, { hourTypeId: 8, hours: 3.5 });
  assert.deepEqual(readCreateIncomeInput(body({ billableHours: { hourTypeId: 8, hours: 1.256 } })).billableHours, { hourTypeId: 8, hours: 1.26 });
});

test('recusa campos obrigatórios ausentes ou inválidos', () => {
  assertRejects(() => readCreateIncomeInput(body({ description: ' ' })), 'Informe a descrição');
  assertRejects(() => readCreateIncomeInput(body({ grossAmount: 0 })), 'Informe o valor bruto');
  assertRejects(() => readCreateIncomeInput(body({ netAmount: 0 })), 'Informe o valor líquido');
  assertRejects(() => readCreateIncomeInput(body({ grossAmount: undefined })), 'Informe o valor bruto');
  assertRejects(() => readCreateIncomeInput(body({ netAmount: undefined })), 'Informe o valor líquido');
  assertRejects(() => readCreateIncomeInput(body({ grossAmount: 100_000_000 })), 'Valor acima do limite permitido');
  assertRejects(() => readCreateIncomeInput(body({ receiptDate: '2026-02-30' })), 'Data do recebimento inválida');
  assertRejects(() => readCreateIncomeInput(body({ clientId: 'Empresa XYZ' })), 'Cliente inválido');
  assertRejects(() => readCreateIncomeInput(body({ representativeId: 'Ana' })), 'Representante inválido');
  assertRejects(() => readCreateIncomeInput('texto'), 'Pedido inválido');
});

test('a categoria é obrigatória na criação e na edição', () => {
  assertRejects(() => readCreateIncomeInput(body({ categoryId: null })), 'Escolha a categoria');
  assertRejects(() => readCreateIncomeInput(body({ categoryId: undefined })), 'Escolha a categoria');
  assertRejects(() => readCreateIncomeInput(body({ categoryId: 'Salário' })), 'Escolha a categoria');
  assertRejects(() => readUpdateIncomeInput(body({ categoryId: null })), 'Escolha a categoria');
});

test('o pedido da tela antiga com repetir até é recusado e manda recarregar a página', () => {
  const message = 'A tela está desatualizada: recarregue a página para lançar receitas fixas';
  assertRejects(() => readCreateIncomeInput(body({ repeatUntil: { month: 11, year: 2026 } })), message);
  assertRejects(() => readCreateIncomeInput(body({ repeatUntil: { month: 11, year: 2026 }, billingType: 'fixed', endMonth: '2026-12' })), message);
  // Nulo ou ausente é o pedido da tela nova: segue a receita única de sempre.
  assert.equal(readCreateIncomeInput(body({ repeatUntil: null })).billingType, 'single');
  assert.equal('repeatUntil' in readCreateIncomeInput(body()), false);
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

test('o líquido pode ser menor que o bruto (taxa ou juros), mas nunca maior', () => {
  const comTaxa = readCreateIncomeInput(body({ grossAmount: 1000, netAmount: 900 }));
  assert.equal(comTaxa.grossAmount, 1000);
  assert.equal(comTaxa.netAmount, 900);
  assert.equal(readCreateIncomeInput(body({ grossAmount: 1000, netAmount: 1000 })).netAmount, 1000);
  assertRejects(() => readCreateIncomeInput(body({ grossAmount: 900, netAmount: 1000 })), 'O valor líquido não pode passar do bruto');
  assertRejects(() => readUpdateIncomeInput(body({ grossAmount: 900, netAmount: 1000 })), 'O valor líquido não pode passar do bruto');
});

test('edição lê só os campos da própria receita', () => {
  const input = readUpdateIncomeInput(body({ repeatUntil: { month: 11, year: 2026 } }));
  assert.equal(input.grossAmount, 1500);
  assert.equal(input.netAmount, 1500);
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

test('fixa: o limite é obrigatório e a primeira ocorrência só nasce recebida se for pedido', () => {
  const fixed = readCreateIncomeInput(body({ billingType: 'fixed', endMonth: '2026-12' }));
  assert.equal(fixed.billingType, 'fixed');
  assert.equal(fixed.endMonth, '2026-12');
  assert.equal(fixed.received, false);
  assert.equal(readCreateIncomeInput(body({ billingType: 'fixed', endMonth: '2026-12', received: true })).received, true);
  assertRejects(() => readCreateIncomeInput(body({ billingType: 'fixed' })), 'Escolha um mês e ano válidos para a receita fixa');
  assertRejects(() => readCreateIncomeInput(body({ billingType: 'fixed', endMonth: '2026-13' })), 'Escolha um mês e ano válidos para a receita fixa');
  assertRejects(() => readCreateIncomeInput(body({ billingType: 'fixed', endMonth: '2026-12', received: 'sim' })), 'Informe se a receita foi recebida');
  assertRejects(() => readCreateIncomeInput(body({ billingType: 'mensal' })), 'Tipo de repetição inválido');
});

test('fixa: o limite vai do próprio mês da receita até 36 meses depois', () => {
  assert.equal(readCreateIncomeInput(body({ billingType: 'fixed', endMonth: '2026-09' })).endMonth, '2026-09');
  assert.equal(readCreateIncomeInput(body({ billingType: 'fixed', endMonth: '2029-09' })).endMonth, '2029-09');
  const message = 'Escolha um limite entre o mês da receita e 36 meses depois';
  assertRejects(() => readCreateIncomeInput(body({ billingType: 'fixed', endMonth: '2026-08' })), message);
  assertRejects(() => readCreateIncomeInput(body({ billingType: 'fixed', endMonth: '2029-10' })), message);
});

test('não repete ignora o limite e nasce recebida', () => {
  const single = readCreateIncomeInput(body({ billingType: 'single', endMonth: '2026-12' }));
  assert.equal(single.billingType, 'single');
  assert.equal(single.endMonth, null);
  assert.equal(single.received, true);
});

test('edição aceita o limite da fixa e ignora o campo vazio', () => {
  assert.equal(readUpdateIncomeInput(body({ endMonth: '2027-03' })).endMonth, '2027-03');
  assert.equal('endMonth' in readUpdateIncomeInput(body({ endMonth: null })), false);
  assert.equal('endMonth' in readUpdateIncomeInput(body()), false);
  assertRejects(() => readUpdateIncomeInput(body({ endMonth: '27-03' })), 'Escolha um mês e ano válidos para a receita fixa');
});

test('mês da consulta: AAAA-MM entre 2000 e 2100', () => {
  assert.equal(readIncomeMonth('2026-11'), '2026-11');
  for (const invalid of ['2026-1', '2026-00', '2026-13', '1999-12', '2101-01', '2026-11-01', 202611, null, undefined]) {
    assertRejects(() => readIncomeMonth(invalid), 'Escolha um mês e ano válidos para a receita fixa');
  }
});

test('adiar: de 1 a 500 receitas, sem repetir, com o novo estado explícito', () => {
  assert.deepEqual(readIncomeDeferral({ accountId: 17, ids: [3, 3, 5], deferred: true }), { accountId: 17, ids: [3, 5], deferred: true });
  assert.deepEqual(readIncomeDeferral({ ids: [3], deferred: false }), { accountId: null, ids: [3], deferred: false });
  const message = 'Selecione de 1 a 500 receitas previstas';
  assertRejects(() => readIncomeDeferral({ ids: [], deferred: true }), message);
  assertRejects(() => readIncomeDeferral({ ids: Array.from({ length: 501 }, (_, index) => index + 1), deferred: true }), message);
  assertRejects(() => readIncomeDeferral({ ids: [3], deferred: 'sim' }), message);
  assertRejects(() => readIncomeDeferral({ ids: 'x', deferred: true }), message);
  assertRejects(() => readIncomeDeferral({ ids: [0], deferred: true }), 'Receita inválida');
  assertRejects(() => readIncomeDeferral('texto'), 'Pedido inválido');
});

test('recebimento com edição: leva os campos da própria receita e o limite', () => {
  const received = readReceiveIncomeInput({ changes: body({ endMonth: '2027-03' }) });
  assert.equal(received.receivedDate, null);
  assert.equal(received.changes?.description, 'Consultoria');
  assert.equal(received.changes?.endMonth, '2027-03');
  assert.equal(readReceiveIncomeInput({ data_recebimento: '2026-10-05' }).changes, undefined);
  assertRejects(() => readReceiveIncomeInput({ changes: body({ description: ' ' }) }), 'Informe a descrição');
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
