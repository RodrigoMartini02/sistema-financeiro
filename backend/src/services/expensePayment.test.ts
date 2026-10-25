import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEditedPayment, resolvePayment } from './expensePayment';

const TODAY = '2026-10-20';
const NOT_PAID = { paid: false, paymentDate: null, amountPaid: null };

test('criação: fora do crédito, a despesa com vencimento até hoje já nasce paga, com o valor da despesa', () => {
  assert.deepEqual(
    resolvePayment(NOT_PAID, 187.4, '2026-10-05', 'pix', TODAY, true),
    { paid: true, paymentDate: '2026-10-05', amountPaid: '187.40' },
  );
  // Vence hoje também.
  assert.equal(resolvePayment(NOT_PAID, 50, TODAY, 'dinheiro', TODAY, true).paid, true);
  // Vence depois de hoje, ou é no crédito: continua em aberto.
  assert.deepEqual(resolvePayment(NOT_PAID, 50, '2026-10-21', 'pix', TODAY, true), NOT_PAID);
  assert.deepEqual(resolvePayment(NOT_PAID, 50, '2026-10-05', 'credito', TODAY, true), NOT_PAID);
});

test('criação sem pagamento automático (parcelas): a vencida continua em aberto', () => {
  assert.deepEqual(resolvePayment(NOT_PAID, 50, '2026-10-05', 'pix', TODAY, false), NOT_PAID);
});

test('edição: a despesa vencida e não paga continua em aberto, sem religar "paga" sozinha', () => {
  for (const paymentMethod of ['pix', 'dinheiro', 'debito'] as const) {
    assert.deepEqual(
      resolveEditedPayment({ ...NOT_PAID, amount: 187.4, dueDate: '2026-10-05', paymentMethod }, TODAY),
      NOT_PAID,
      paymentMethod,
    );
  }
  // Com a data de pagamento no passado, também: só "paga" marcada na tela vale.
  assert.deepEqual(
    resolveEditedPayment({ ...NOT_PAID, amount: 50, dueDate: TODAY, paymentMethod: 'pix' }, TODAY),
    NOT_PAID,
  );
});

test('edição: desmarcar "paga" na despesa única fora do crédito grava em aberto, sem data nem valor pago', () => {
  // A tela manda paid=false, data e valor nulos (o servidor recusa data e valor pagos em despesa não paga).
  assert.deepEqual(
    resolveEditedPayment({ paid: false, paymentDate: null, amountPaid: null, amount: 120, dueDate: '2026-09-10', paymentMethod: 'pix' }, TODAY),
    { paid: false, paymentDate: null, amountPaid: null },
  );
});

test('edição: marcar "paga" grava a data e o valor que a tela mandou, e o valor da despesa quando vem sem valor pago', () => {
  const marked = { paid: true, paymentDate: '2026-10-18', amountPaid: null, amount: 120, dueDate: '2026-10-05', paymentMethod: 'pix' } as const;
  assert.deepEqual(resolveEditedPayment(marked, TODAY), { paid: true, paymentDate: '2026-10-18', amountPaid: '120.00' });
  assert.deepEqual(
    resolveEditedPayment({ ...marked, amountPaid: 123.5 }, TODAY),
    { paid: true, paymentDate: '2026-10-18', amountPaid: '123.50' },
  );
  // Sem data de pagamento, vale o vencimento.
  assert.equal(resolveEditedPayment({ ...marked, paymentDate: null }, TODAY).paymentDate, '2026-10-05');
});

test('edição do valor de uma linha paga: o valor pago que a tela reenviou continua, não acompanha o valor novo', () => {
  // Estava paga com R$ 100,00 exatos; o dono corrige o valor para R$ 120,00 e a tela reenvia os R$ 100,00 pagos.
  const edited = { paid: true, paymentDate: '2026-09-10', amountPaid: 100, amount: 120, dueDate: '2026-09-10', paymentMethod: 'pix' } as const;
  assert.deepEqual(resolveEditedPayment(edited, TODAY), { paid: true, paymentDate: '2026-09-10', amountPaid: '100.00' });
  // O dono corrigindo o valor pago também: vale o que ele digitou.
  assert.equal(resolveEditedPayment({ ...edited, amountPaid: 120 }, TODAY).amountPaid, '120.00');
});
