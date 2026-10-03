import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ITEM_QUANTITY,
  addToCart,
  buildOrderMessage,
  buildWhatsappUrl,
  cartItemCount,
  cartLines,
  cartSavings,
  cartTotal,
  formatBrl,
  parseStoredCart,
  reconcileCart,
  removeFromCart,
  setCartQuantity,
  type CartProduct,
} from './storefrontCart';

const camiseta: CartProduct = { id: 'p1', nome: 'Camiseta azul', valor: 59.9, valorFinal: 49.9, esgotado: false };
const caneca: CartProduct = { id: 'p2', nome: 'Caneca', valor: 25, valorFinal: 25, esgotado: false };
const bone: CartProduct = { id: 'p3', nome: 'Boné', valor: 35, valorFinal: 35, esgotado: true };

test('adiciona, soma no mesmo item e respeita o limite por item', () => {
  let cart = addToCart([], 'p1');
  cart = addToCart(cart, 'p1', 2);
  cart = addToCart(cart, 'p2');
  assert.deepEqual(cart, [{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 1 }]);
  assert.equal(addToCart(cart, 'p1', 500)[0]!.quantity, MAX_ITEM_QUANTITY);
});

test('muda a quantidade, e zero tira o item', () => {
  const cart = [{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 1 }];
  assert.deepEqual(setCartQuantity(cart, 'p1', 5), [{ productId: 'p1', quantity: 5 }, { productId: 'p2', quantity: 1 }]);
  assert.deepEqual(setCartQuantity(cart, 'p2', 0), [{ productId: 'p1', quantity: 3 }]);
  assert.deepEqual(removeFromCart(cart, 'p1'), [{ productId: 'p2', quantity: 1 }]);
});

test('sacola guardada perde o que sumiu ou esgotou e junta repetidos', () => {
  const stored = [
    { productId: 'p1', quantity: 2 },
    { productId: 'p1', quantity: 1 },
    { productId: 'p3', quantity: 1 },
    { productId: 'removido', quantity: 4 },
    { productId: 'p2', quantity: 0 },
  ];
  assert.deepEqual(reconcileCart(stored, [camiseta, caneca, bone]), [{ productId: 'p1', quantity: 3 }]);
});

test('subtotais e total pelo preço final de agora', () => {
  const lines = cartLines([{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 2 }], [camiseta, caneca]);
  assert.deepEqual(lines.map((line) => line.subtotal), [149.7, 50]);
  assert.equal(cartTotal(lines), 199.7);
  assert.equal(cartItemCount([{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 2 }]), 5);
});

test('lê a sacola guardada e ignora o que estiver fora do formato', () => {
  assert.deepEqual(parseStoredCart('[{"productId":"p1","quantity":2},{"x":1},"lixo"]'), [{ productId: 'p1', quantity: 2 }]);
  assert.deepEqual(parseStoredCart('{"productId":"p1"}'), []);
  assert.deepEqual(parseStoredCart('não é json'), []);
  assert.deepEqual(parseStoredCart(null), []);
});

test('mensagem do pedido com itens, total, nome e observação', () => {
  const lines = cartLines([{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }], [camiseta, caneca]);
  const message = buildOrderMessage({
    storeName: 'Doces da Ana',
    lines,
    total: cartTotal(lines),
    customerName: '  Maria  ',
    note: ' Entregar à tarde ',
  });
  assert.equal(message, [
    'Olá, Doces da Ana! Quero fazer este pedido pela vitrine:',
    '',
    `2x Camiseta azul — ${formatBrl(99.8)}`,
    `1x Caneca — ${formatBrl(25)}`,
    '',
    `Total: ${formatBrl(124.8)}`,
    'Nome: Maria',
    'Observação: Entregar à tarde',
  ].join('\n'));
});

test('sem observação, a mensagem não tem a linha dela', () => {
  const lines = cartLines([{ productId: 'p2', quantity: 1 }], [caneca]);
  const message = buildOrderMessage({ storeName: 'Loja', lines, total: 25, customerName: 'João', note: '   ' });
  assert.equal(message.includes('Observação'), false);
});

test('link do WhatsApp da loja, com a mensagem codificada', () => {
  assert.equal(buildWhatsappUrl('5511987654321'), 'https://wa.me/5511987654321');
  assert.equal(buildWhatsappUrl('5511987654321', 'Olá & até'), 'https://wa.me/5511987654321?text=Ol%C3%A1%20%26%20at%C3%A9');
});

test('você economiza: a soma dos descontos dos produtos', () => {
  const lines = cartLines([{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 2 }], [camiseta, caneca]);
  assert.equal(cartSavings(lines), 30);
});
