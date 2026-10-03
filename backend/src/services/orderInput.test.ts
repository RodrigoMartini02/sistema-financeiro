import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readOrderInput, readOrderStatusInput } from './orderInput';

const PRODUCT_A = '550e8400-e29b-41d4-a716-446655440000';
const PRODUCT_B = '550e8400-e29b-41d4-a716-446655440001';
const VALID_CPF = '52998224725';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    itens: [{ produto_id: PRODUCT_A, quantidade: 2 }],
    cliente: { nome: '  Maria Souza ', email: ' Maria@Email.com ', telefone: '(11) 98765-4321', cpf: '529.982.247-25' },
    entrega: { tipo: 'retirada' },
    pagamento: { forma: 'pix' },
    observacao: '  sem cebola ',
    ...overrides,
  };
}

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

const ADDRESS = { cep: '01310-100', rua: 'Av. Paulista', numero: '1000', complemento: '', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'sp' };

test('lê o pedido com retirada e Pix, normalizando cliente e observação', () => {
  const input = readOrderInput(body());
  assert.deepEqual(input.items, [{ productId: PRODUCT_A, quantity: 2 }]);
  assert.deepEqual(input.customer, { name: 'Maria Souza', email: 'maria@email.com', phone: '11987654321', cpf: VALID_CPF });
  assert.deepEqual(input.delivery, { type: 'retirada', address: null });
  assert.deepEqual(input.payment, { method: 'pix', cardToken: null, paymentMethodId: null });
  assert.equal(input.note, 'sem cebola');
});

test('itens repetidos se juntam e o limite vale por produto', () => {
  const input = readOrderInput(body({ itens: [
    { produto_id: PRODUCT_A, quantidade: 2 },
    { produto_id: PRODUCT_B, quantidade: 1 },
    { produto_id: PRODUCT_A.toUpperCase(), quantidade: 3 },
  ] }));
  assert.deepEqual(input.items, [{ productId: PRODUCT_A, quantity: 5 }, { productId: PRODUCT_B, quantity: 1 }]);
  assertRejects(
    () => readOrderInput(body({ itens: [{ produto_id: PRODUCT_A, quantidade: 60 }, { produto_id: PRODUCT_A, quantidade: 40 }] })),
    'Quantidade inválida: de 1 a 99 por produto',
  );
});

test('recusa sacola vazia, produto inválido e quantidade fora da faixa', () => {
  assertRejects(() => readOrderInput(body({ itens: [] })), 'A sacola está vazia');
  assertRejects(() => readOrderInput(body({ itens: [{ produto_id: 'x', quantidade: 1 }] })), 'Item inválido');
  assertRejects(() => readOrderInput(body({ itens: [{ produto_id: PRODUCT_A, quantidade: 0 }] })), 'Quantidade inválida: de 1 a 99 por produto');
  assertRejects(() => readOrderInput(body({ itens: [{ produto_id: PRODUCT_A, quantidade: 1.5 }] })), 'Quantidade inválida: de 1 a 99 por produto');
});

test('recusa cliente com nome curto, e-mail, telefone ou CPF inválidos', () => {
  const customer = (overrides: Record<string, unknown>) => body({ cliente: { ...(body()['cliente'] as object), ...overrides } });
  assertRejects(() => readOrderInput(customer({ nome: 'M' })), 'Informe seu nome');
  assertRejects(() => readOrderInput(customer({ email: 'maria@' })), 'E-mail inválido');
  assertRejects(() => readOrderInput(customer({ telefone: '98765-4321' })), 'Telefone inválido: informe o DDD e o número');
  assertRejects(() => readOrderInput(customer({ cpf: '111.111.111-11' })), 'CPF inválido');
});

test('entrega exige o endereço completo', () => {
  const input = readOrderInput(body({ entrega: { tipo: 'entrega', endereco: ADDRESS } }));
  assert.deepEqual(input.delivery.address, {
    cep: '01310100', street: 'Av. Paulista', number: '1000', complement: null, district: 'Bela Vista', city: 'São Paulo', state: 'SP',
  });
  assertRejects(() => readOrderInput(body({ entrega: { tipo: 'entrega' } })), 'Informe o endereço de entrega');
  assertRejects(() => readOrderInput(body({ entrega: { tipo: 'entrega', endereco: { ...ADDRESS, cep: '123' } } })), 'CEP inválido');
  assertRejects(() => readOrderInput(body({ entrega: { tipo: 'entrega', endereco: { ...ADDRESS, uf: 'XX' } } })), 'UF inválida');
  assertRejects(() => readOrderInput(body({ entrega: { tipo: 'entrega', endereco: { ...ADDRESS, numero: '' } } })), 'Informe o número');
  assertRejects(() => readOrderInput(body({ entrega: { tipo: 'correio' } })), 'Escolha retirada ou entrega');
});

test('cartão exige o token; a bandeira é opcional e conferida', () => {
  const card = readOrderInput(body({ pagamento: { forma: 'cartao', card_token: ' tok_123 ', payment_method_id: 'visa' } }));
  assert.deepEqual(card.payment, { method: 'cartao', cardToken: 'tok_123', paymentMethodId: 'visa' });
  const noBrand = readOrderInput(body({ pagamento: { forma: 'cartao', card_token: 'tok_123', payment_method_id: 'VISA; drop' } }));
  assert.equal(noBrand.payment.paymentMethodId, null);
  assertRejects(() => readOrderInput(body({ pagamento: { forma: 'cartao' } })), 'Confira os dados do cartão');
  assertRejects(() => readOrderInput(body({ pagamento: { forma: 'boleto' } })), 'Escolha Pix ou cartão');
});

test('situação pedida pela loja', () => {
  assert.equal(readOrderStatusInput({ situacao: 'enviado' }), 'enviado');
  assertRejects(() => readOrderStatusInput({ situacao: 'perdido' }), 'Situação inválida');
});
