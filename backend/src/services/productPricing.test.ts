import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import {
  buildProductPricing,
  calculateDiscountPercent,
  calculateFinalPrice,
  readProductDiscount,
  storedProductDiscount,
} from './productPricing';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('preço final sem desconto, com desconto em R$ e em %', () => {
  assert.equal(calculateFinalPrice(100, null), 100);
  assert.equal(calculateFinalPrice(100, { type: 'valor', value: 30 }), 70);
  assert.equal(calculateFinalPrice(100, { type: 'percentual', value: 20 }), 80);
});

test('preço final arredonda em centavos', () => {
  assert.equal(calculateFinalPrice(19.9, { type: 'percentual', value: 15 }), 16.92);
  assert.equal(calculateFinalPrice(10, { type: 'percentual', value: 33.33 }), 6.67);
});

test('selo de desconto: o próprio % ou o calculado no desconto em R$, inteiro', () => {
  assert.equal(calculateDiscountPercent(100, null), null);
  assert.equal(calculateDiscountPercent(100, { type: 'percentual', value: 12.5 }), 13);
  assert.equal(calculateDiscountPercent(80, { type: 'valor', value: 20 }), 25);
});

test('desconto abaixo de 1% não tem selo', () => {
  assert.equal(calculateDiscountPercent(1000, { type: 'valor', value: 1 }), null);
});

test('desconto gravado vira o objeto do cálculo; tipo desconhecido é ignorado', () => {
  assert.deepEqual(storedProductDiscount('valor', '30.00'), { type: 'valor', value: 30 });
  assert.equal(storedProductDiscount(null, null), null);
  assert.equal(storedProductDiscount('brinde', '5.00'), null);
});

test('preço do produto gravado para a resposta da API', () => {
  assert.deepEqual(
    buildProductPricing({ valor: '100.00', descontoTipo: 'percentual', descontoValor: '20.00' }),
    { valorFinal: 80, descontoPercentual: 20 },
  );
  assert.deepEqual(
    buildProductPricing({ valor: '59.90', descontoTipo: null, descontoValor: null }),
    { valorFinal: 59.9, descontoPercentual: null },
  );
});

test('lê o desconto do pedido: vazio é sem desconto', () => {
  assert.equal(readProductDiscount(undefined, undefined, 100), null);
  assert.equal(readProductDiscount(null, null, 100), null);
  assert.equal(readProductDiscount('', '', 100), null);
  assert.deepEqual(readProductDiscount('percentual', 20, 100), { type: 'percentual', value: 20 });
  assert.deepEqual(readProductDiscount('valor', 29.999, 100), { type: 'valor', value: 30 });
});

test('recusa desconto incompleto, de tipo desconhecido ou não positivo', () => {
  assertRejects(() => readProductDiscount('valor', null, 100), 'Desconto: informe o tipo e o valor');
  assertRejects(() => readProductDiscount(null, 10, 100), 'Desconto: informe o tipo e o valor');
  assertRejects(() => readProductDiscount('brinde', 10, 100), 'Tipo de desconto inválido');
  assertRejects(() => readProductDiscount('valor', 0, 100), 'Desconto deve ser maior que zero');
  assertRejects(() => readProductDiscount('valor', '10', 100), 'Desconto deve ser maior que zero');
});

test('recusa desconto de 100% ou mais e desconto em R$ igual ou acima do preço', () => {
  assertRejects(() => readProductDiscount('percentual', 100, 100), 'Desconto em %: use um valor menor que 100');
  assertRejects(() => readProductDiscount('valor', 100, 100), 'Desconto em R$: use um valor menor que o preço do produto');
  assertRejects(() => readProductDiscount('valor', 150, 100), 'Desconto em R$: use um valor menor que o preço do produto');
});

test('recusa desconto que deixaria o produto abaixo de R$ 0,01', () => {
  assertRejects(() => readProductDiscount('percentual', 99.99, 0.5), 'O preço com desconto precisa ser de pelo menos R$ 0,01');
});
