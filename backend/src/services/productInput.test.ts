import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readProductAccountId, readProductInput, readStockMovementInput } from './productInput';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    conta_id: 19,
    nome: '  Camiseta azul  ',
    descricao: '  Algodão  ',
    valor: 59.9,
    desconto_tipo: null,
    desconto_valor: null,
    categoria: '  Roupas ',
    controla_estoque: false,
    quantidade_inicial: null,
    estoque_minimo: null,
    ...overrides,
  };
}

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('lê o produto e apara nome, descrição e categoria', () => {
  const input = readProductInput(body());
  assert.equal(input.name, 'Camiseta azul');
  assert.equal(input.description, 'Algodão');
  assert.equal(input.price, 59.9);
  assert.equal(input.category, 'Roupas');
  assert.equal(input.discount, null);
  assert.equal(input.tracksStock, false);
  assert.equal(input.initialQuantity, 0);
  assert.equal(input.minimumStock, null);
  assert.equal(input.active, undefined);
});

test('categoria e descrição vazias viram nulo; categoria acima de 60 caracteres é recusada', () => {
  const input = readProductInput(body({ categoria: '   ', descricao: '' }));
  assert.equal(input.category, null);
  assert.equal(input.description, null);
  assertRejects(() => readProductInput(body({ categoria: 'x'.repeat(61) })), 'Categoria: até 60 caracteres');
});

test('nome e valor são obrigatórios', () => {
  assertRejects(() => readProductInput(body({ nome: '   ' })), 'Informe o nome do produto');
  assertRejects(() => readProductInput(body({ valor: 0 })), 'Informe o valor do produto');
  assertRejects(() => readProductInput(body({ valor: '59.90' })), 'Informe o valor do produto');
});

test('lê o desconto junto com o preço', () => {
  const input = readProductInput(body({ valor: 100, desconto_tipo: 'percentual', desconto_valor: 20 }));
  assert.deepEqual(input.discount, { type: 'percentual', value: 20 });
  assertRejects(
    () => readProductInput(body({ valor: 100, desconto_tipo: 'valor', desconto_valor: 100 })),
    'Desconto em R$: use um valor menor que o preço do produto',
  );
});

test('quantidade inicial só com o controle de estoque ligado', () => {
  const input = readProductInput(body({ controla_estoque: true, quantidade_inicial: 10.5, estoque_minimo: 2 }));
  assert.equal(input.tracksStock, true);
  assert.equal(input.initialQuantity, 10.5);
  assert.equal(input.minimumStock, 2);
  assertRejects(
    () => readProductInput(body({ controla_estoque: false, quantidade_inicial: 5 })),
    'Ligue o controle de estoque para informar a quantidade inicial',
  );
});

test('recusa quantidade negativa, controle e situação que não sejam sim ou não', () => {
  assertRejects(() => readProductInput(body({ controla_estoque: true, quantidade_inicial: -1 })), 'Quantidade inicial inválida');
  assertRejects(() => readProductInput(body({ estoque_minimo: -2 })), 'Estoque mínimo inválido');
  assertRejects(() => readProductInput(body({ controla_estoque: 'sim' })), 'Controle de estoque inválido');
  assertRejects(() => readProductInput(body({ ativo: 'nao' })), 'Situação do produto inválida');
  assert.equal(readProductInput(body({ ativo: false })).active, false);
});

test('a conta do produto novo é obrigatória', () => {
  assert.equal(readProductAccountId(body()), 19);
  assert.equal(readProductAccountId(body({ conta_id: '19' })), 19);
  assertRejects(() => readProductAccountId(body({ conta_id: null })), 'Informe a conta do produto');
  assertRejects(() => readProductAccountId(body({ conta_id: true })), 'Informe a conta do produto');
});

test('lê a entrada ou saída manual de estoque', () => {
  assert.deepEqual(
    readStockMovementInput({ tipo: 'entrada', quantidade: 3, motivo: '  reposição ' }),
    { type: 'entrada', quantity: 3, reason: 'reposição' },
  );
  assert.deepEqual(readStockMovementInput({ tipo: 'saida', quantidade: 1.25 }), { type: 'saida', quantity: 1.25, reason: null });
  assertRejects(() => readStockMovementInput({ tipo: 'ajuste', quantidade: 1 }), 'Tipo deve ser entrada ou saida');
  assertRejects(() => readStockMovementInput({ tipo: 'entrada', quantidade: 0 }), 'Quantidade deve ser maior que zero');
  assertRejects(() => readStockMovementInput({ tipo: 'entrada' }), 'Quantidade deve ser maior que zero');
});
