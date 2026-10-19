import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultReceiptDate, expenseCashDate } from './cashDate';

const open = { pago: false, status: 'ativa' as const, dataVencimento: '2026-03-20', dataPagamento: null as string | null };

test('despesa paga conta no dia do pagamento; em aberto, no vencimento', () => {
  assert.equal(expenseCashDate({ ...open, pago: true, dataPagamento: '2026-10-19' }), '2026-10-19');
  assert.equal(expenseCashDate(open), '2026-03-20');
  // Paga adiantada: conta no mês em que o dinheiro saiu, antes do vencimento.
  assert.equal(expenseCashDate({ ...open, dataVencimento: '2026-11-05', pago: true, dataPagamento: '2026-10-15' }), '2026-10-15');
});

test('paga sem data de pagamento conta no vencimento; data de pagamento de despesa em aberto é ignorada', () => {
  assert.equal(expenseCashDate({ ...open, pago: true, dataPagamento: null }), '2026-03-20');
  assert.equal(expenseCashDate({ ...open, pago: false, dataPagamento: '2026-10-19' }), '2026-03-20');
});

test('cancelada fica no vencimento, mesmo com pagamento gravado (como no servidor)', () => {
  assert.equal(expenseCashDate({ ...open, status: 'cancelada', pago: true, dataPagamento: '2026-10-19' }), '2026-03-20');
});

test('datas com horário vêm cortadas em AAAA-MM-DD', () => {
  assert.equal(expenseCashDate({ ...open, pago: true, dataPagamento: '2026-10-19T00:00:00.000Z' }), '2026-10-19');
  assert.equal(expenseCashDate({ ...open, dataVencimento: '2026-03-20T00:00:00.000Z' }), '2026-03-20');
});

test('data do recebimento sem escolher: a prevista se é do mês atual; senão, hoje (mesmos casos do servidor)', () => {
  const today = '2026-10-19';
  assert.equal(defaultReceiptDate('2026-10-05', today), '2026-10-05');
  assert.equal(defaultReceiptDate('2026-10-25', today), '2026-10-25');
  assert.equal(defaultReceiptDate('2026-03-10', today), '2026-10-19');
  assert.equal(defaultReceiptDate('2026-11-05', today), '2026-10-19');
  assert.equal(defaultReceiptDate('2025-10-05', today), '2026-10-19');
});
