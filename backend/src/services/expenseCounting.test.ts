import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  cardLimitPaymentMethodSql,
  countedExpenseSql,
  countingDate,
  isCountedExpense,
  openCardDebtCondition,
  openCardDebtSql,
  type CountableExpense,
} from './expenseCounting';

const TODAY = '2026-10-07';

function expense(overrides: Partial<CountableExpense> = {}): CountableExpense {
  return {
    recurring: true, paid: false, paymentMethod: 'credito', cardId: 6,
    purchaseDate: '2026-10-06', dueDate: '2026-11-09', ...overrides,
  };
}

test('crédito com cartão: conta pela data de compra, a partir do dia seguinte', () => {
  // Cobrada em 06/10: em 07/10 já conta.
  assert.equal(isCountedExpense(expense(), TODAY), true);
  // Cobrança hoje ou no futuro: ainda não conta.
  assert.equal(isCountedExpense(expense({ purchaseDate: '2026-10-07' }), TODAY), false);
  assert.equal(isCountedExpense(expense({ purchaseDate: '2026-10-17' }), TODAY), false);
  // Sem data de compra, vale o vencimento.
  assert.equal(countingDate(expense({ purchaseDate: null })), '2026-11-09');
  assert.equal(isCountedExpense(expense({ purchaseDate: null }), TODAY), false);
});

test('fora do crédito com cartão: conta pelo vencimento', () => {
  const rent = expense({ paymentMethod: 'pix', cardId: null, purchaseDate: '2026-09-01', dueDate: '2026-10-10' });
  assert.equal(countingDate(rent), '2026-10-10');
  assert.equal(isCountedExpense(rent, TODAY), false);
  assert.equal(isCountedExpense(rent, '2026-10-11'), true);
  // Crédito sem cartão também segue o vencimento.
  assert.equal(countingDate(expense({ cardId: null })), '2026-11-09');
});

test('paga conta sempre; despesa que não é mensal conta sempre', () => {
  assert.equal(isCountedExpense(expense({ purchaseDate: '2026-10-17', paid: true }), TODAY), true);
  assert.equal(isCountedExpense(expense({ purchaseDate: '2026-10-17', recurring: false }), TODAY), true);
});

test('SQL cru: a mesma regra, com o apelido e o marcador da data', () => {
  const condition = countedExpenseSql('d', '$6');
  assert.match(condition, /COALESCE\(d\.recorrente, false\)/);
  assert.match(condition, /d\.forma_pagamento = 'credito' AND d\.cartao_id IS NOT NULL/);
  assert.match(condition, /COALESCE\(d\.data_compra, d\.data_vencimento\)/);
  assert.match(condition, />= \$6::date/);
});

test('dívida em aberto do cartão: pago em branco conta e status em branco é ativa', () => {
  const condition = openCardDebtSql('d');
  assert.match(condition, /NOT COALESCE\(d\.pago, false\)/);
  assert.match(condition, /COALESCE\(d\.status, 'ativa'\) = 'ativa'/);
});

test('dívida em aberto do cartão: a condição Drizzle da fatura é a mesma regra do limite', () => {
  const { sql: text } = new PgDialect().sqlToQuery(openCardDebtCondition());
  assert.match(text, /NOT COALESCE\("despesas"\."pago", false\)/);
  assert.match(text, /COALESCE\("despesas"\."status", 'ativa'\) = 'ativa'/);
});

test('limite: cartão sem tipo soma tudo, de crédito soma crédito e antigo, ambos só crédito', () => {
  const condition = cardLimitPaymentMethodSql('d', 'c').replace(/\s+/g, ' ');
  // Sem tipo: lançamentos antigos continuam somando.
  assert.match(condition, /c\.tipo IS NULL/);
  // Crédito: a forma de pagamento da despesa é crédito ou nem foi informada (antigo).
  assert.match(condition, /c\.tipo = 'credito' AND \(d\.forma_pagamento IS NULL OR d\.forma_pagamento = 'credito'\)/);
  // Ambos: só o crédito; o débito do mesmo cartao_id não ocupa o limite.
  assert.match(condition, /c\.tipo = 'ambos' AND d\.forma_pagamento = 'credito'/);
  assert.doesNotMatch(condition, /'ambos'\)/);
});
