import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense } from '../types/finance';
import { countingDate, countsFromDate, isCountedExpense } from './expenseCounting';

const TODAY = '2026-10-07';

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1, descricao: 'Assinatura', valorFinal: 103, categoria: 'Outros', categoriaId: 1,
    formaPagamento: 'credito', cartaoId: 6, dataCompra: '2026-10-06', dataVencimento: '2026-11-09',
    mes: 10, ano: 2026, status: 'ativa', pago: false, recorrente: true, parcelado: false, ...overrides,
  } as Expense;
}

test('crédito com cartão: conta pela data de compra, a partir do dia seguinte', () => {
  assert.equal(isCountedExpense(expense(), TODAY), true);
  assert.equal(isCountedExpense(expense({ dataCompra: '2026-10-07' }), TODAY), false);
  assert.equal(isCountedExpense(expense({ dataCompra: '2026-10-17' }), TODAY), false);
  // Sem data de compra, vale o vencimento.
  assert.equal(countingDate(expense({ dataCompra: null })), '2026-11-09');
});

test('fora do crédito com cartão: conta pelo vencimento', () => {
  const rent = expense({ formaPagamento: 'pix', cartaoId: null, dataCompra: '2026-09-01', dataVencimento: '2026-10-10' });
  assert.equal(isCountedExpense(rent, TODAY), false);
  assert.equal(isCountedExpense(rent, '2026-10-11'), true);
  assert.equal(countingDate(expense({ cartaoId: null })), '2026-11-09');
});

test('paga conta sempre; despesa que não é mensal conta sempre', () => {
  assert.equal(isCountedExpense(expense({ dataCompra: '2026-10-17', pago: true }), TODAY), true);
  assert.equal(isCountedExpense(expense({ dataCompra: '2026-10-17', recorrente: false }), TODAY), true);
});

test('passa a contar no dia seguinte à data, inclusive na virada do mês e do ano', () => {
  assert.equal(countsFromDate(expense({ dataCompra: '2026-10-17' })), '2026-10-18');
  assert.equal(countsFromDate(expense({ dataCompra: '2026-10-31' })), '2026-11-01');
  assert.equal(countsFromDate(expense({ formaPagamento: 'pix', cartaoId: null, dataVencimento: '2026-12-31' })), '2027-01-01');
});
