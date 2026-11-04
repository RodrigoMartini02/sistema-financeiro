import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkoutTotals, formatCardExpiry, formatCardNumber, formatCountdown, hasErrors, parseCardExpiry, validateAddress,
  validateCard, validateIdentification,
} from './storefrontCheckout';
import type { CartLine } from './storefrontCart';

test('identificação: nome, e-mail, telefone e CPF', () => {
  const ok = validateIdentification({ nome: 'Maria', email: 'maria@email.com', telefone: '(11) 98765-4321', cpf: '529.982.247-25' });
  assert.equal(hasErrors(ok), false);
  const bad = validateIdentification({ nome: 'M', email: 'maria@', telefone: '9876', cpf: '111' });
  assert.deepEqual(Object.keys(bad).sort(), ['cpf', 'email', 'nome', 'telefone']);
});

test('endereço de entrega completo', () => {
  const address = { cep: '01310-100', rua: 'Av. Paulista', numero: '1000', complemento: '', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'sp' };
  assert.equal(hasErrors(validateAddress(address)), false);
  assert.deepEqual(Object.keys(validateAddress({ ...address, cep: '123', numero: ' ', uf: 'XX' })).sort(), ['cep', 'numero', 'uf']);
});

test('cartão: máscaras, validade e campos', () => {
  const today = new Date(2026, 9, 3);
  assert.equal(formatCardNumber('4235647728025682'), '4235 6477 2802 5682');
  assert.equal(formatCardNumber('4235 64'), '4235 64');
  assert.equal(formatCardExpiry('1130'), '11/30');
  assert.equal(formatCardExpiry('1'), '1');
  assert.deepEqual(parseCardExpiry('11/30', today), { month: '11', year: '2030' });
  assert.deepEqual(parseCardExpiry('10/26', today), { month: '10', year: '2026' });
  assert.equal(parseCardExpiry('09/26', today), null);
  assert.equal(parseCardExpiry('13/30', today), null);
  assert.equal(parseCardExpiry('1/30', today), null);

  const card = { numero: '4235 6477 2802 5682', nome: 'MARIA SILVA', validade: '11/30', cvv: '123', cpf: '529.982.247-25' };
  assert.equal(hasErrors(validateCard(card, today)), false);
  assert.deepEqual(
    Object.keys(validateCard({ numero: '4235', nome: ' ', validade: '01/20', cvv: '12', cpf: '111' }, today)).sort(),
    ['cpf', 'cvv', 'nome', 'numero', 'validade'],
  );
});

test('total do checkout: produtos pelo preço final, economia e a taxa da entrega', () => {
  const lines: CartLine[] = [
    { product: { id: 'a', nome: 'Bolo', valor: 50, valorFinal: 40, esgotado: false }, quantity: 2, subtotal: 80 },
    { product: { id: 'b', nome: 'Torta', valor: 30.1, valorFinal: 30.1, esgotado: false }, quantity: 1, subtotal: 30.1 },
  ];
  assert.deepEqual(checkoutTotals(lines, 0), { subtotal: 110.1, savings: 20, deliveryFee: 0, total: 110.1 });
  assert.deepEqual(checkoutTotals(lines, 12.9), { subtotal: 110.1, savings: 20, deliveryFee: 12.9, total: 123 });
});

test('contagem regressiva do Pix', () => {
  assert.equal(formatCountdown(30 * 60 * 1000), '30:00');
  assert.equal(formatCountdown(61_500), '01:01');
  assert.equal(formatCountdown(-5000), '00:00');
});
