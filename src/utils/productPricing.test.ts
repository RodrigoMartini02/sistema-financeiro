import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDiscountPercent,
  calculateFinalPrice,
  productDiscountOf,
  validateProductDiscount,
} from './productPricing';

test('preço final sem desconto, com desconto em R$ e em %', () => {
  assert.equal(calculateFinalPrice(100, null), 100);
  assert.equal(calculateFinalPrice(100, { type: 'valor', value: 30 }), 70);
  assert.equal(calculateFinalPrice(100, { type: 'percentual', value: 20 }), 80);
  assert.equal(calculateFinalPrice(19.9, { type: 'percentual', value: 15 }), 16.92);
});

test('selo de desconto: inteiro, e nenhum abaixo de 1%', () => {
  assert.equal(calculateDiscountPercent(80, { type: 'valor', value: 20 }), 25);
  assert.equal(calculateDiscountPercent(100, { type: 'percentual', value: 12.5 }), 13);
  assert.equal(calculateDiscountPercent(1000, { type: 'valor', value: 1 }), null);
  assert.equal(calculateDiscountPercent(100, null), null);
});

test('desconto do produto como chega da API', () => {
  assert.deepEqual(productDiscountOf({ descontoTipo: 'percentual', descontoValor: '20.00' }), { type: 'percentual', value: 20 });
  assert.equal(productDiscountOf({ descontoTipo: null, descontoValor: null }), null);
});

test('mensagem do campo de desconto, nas mesmas faixas do servidor', () => {
  assert.equal(validateProductDiscount(100, null), null);
  assert.equal(validateProductDiscount(100, { type: 'percentual', value: 20 }), null);
  assert.equal(validateProductDiscount(100, { type: 'percentual', value: 0 }), 'Informe o desconto');
  assert.equal(validateProductDiscount(100, { type: 'percentual', value: 100 }), 'Use um desconto menor que 100%');
  assert.equal(validateProductDiscount(100, { type: 'valor', value: 100 }), 'Use um desconto menor que o preço');
  assert.equal(validateProductDiscount(0.5, { type: 'percentual', value: 99.99 }), 'O preço com desconto precisa ser de pelo menos R$ 0,01');
});

test('sem preço ainda, só o desconto em % é conferido', () => {
  assert.equal(validateProductDiscount(undefined, { type: 'valor', value: 10 }), null);
  assert.equal(validateProductDiscount(undefined, { type: 'percentual', value: 150 }), 'Use um desconto menor que 100%');
});
