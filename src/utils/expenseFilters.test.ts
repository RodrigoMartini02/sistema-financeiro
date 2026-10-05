import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense } from '../types/finance';
import {
  expenseFiltersKey, filterExpenses, getExpenseStatus, isBatchSelectable, type ExpenseFilters, type ExpenseVisibility,
} from './expenseFilters';

const DATES = { today: '2026-10-15', weekAgo: '2026-10-08' };
const MONTH = 9; // outubro (0-based)
const YEAR = 2026;

function expense(id: number, overrides: Partial<Expense> = {}): Expense {
  return {
    id, descricao: `Despesa ${id}`, valorFinal: 100, categoria: 'Mercado', categoriaId: 1, formaPagamento: 'pix',
    dataVencimento: '2026-10-20', mes: MONTH, ano: YEAR, pago: false, recorrente: false, parcelado: false,
    autorId: 1, autorNome: 'Ana', pagadorNome: 'Ana',
    ...overrides,
  };
}

function filters(overrides: Partial<ExpenseFilters> = {}): ExpenseFilters {
  return {
    types: new Set(['receita', 'despesa']), statuses: new Set(), categoryIds: new Set(),
    paymentMethods: new Set(), cardIds: new Set(), paymentDates: new Set(),
    ...overrides,
  };
}

const EVERYONE: ExpenseVisibility = { meId: '1', visibleNames: new Set(['Ana', 'Bia']) };
const ids = (items: Expense[]) => items.map((item) => item.id);
const run = (items: Expense[], applied: ExpenseFilters, visibility: ExpenseVisibility = EVERYONE) =>
  ids(filterExpenses(items, applied, visibility, MONTH, YEAR, DATES));

test('status: pago, atrasada (vencida antes de hoje) e em dia', () => {
  assert.equal(getExpenseStatus(expense(1, { pago: true, dataVencimento: '2026-10-01' }), DATES.today), 'pago');
  assert.equal(getExpenseStatus(expense(2, { dataVencimento: '2026-10-14' }), DATES.today), 'atrasada');
  assert.equal(getExpenseStatus(expense(3, { dataVencimento: '2026-10-15' }), DATES.today), 'em_dia');
});

test('sem filtro passam todas; sem "despesa" no tipo, nenhuma', () => {
  const items = [expense(1), expense(2)];
  assert.deepEqual(run(items, filters()), [1, 2]);
  assert.deepEqual(run(items, filters({ types: new Set(['receita']) })), []);
});

test('status, categoria, forma de pagamento e cartão', () => {
  const items = [
    expense(1, { pago: true, categoriaId: 1, formaPagamento: 'pix' }),
    expense(2, { dataVencimento: '2026-10-10', categoriaId: 2, formaPagamento: 'credito', cartaoId: 7 }),
    expense(3, { categoriaId: 2, formaPagamento: 'credito', cartaoId: 8 }),
  ];
  assert.deepEqual(run(items, filters({ statuses: new Set(['pago']) })), [1]);
  assert.deepEqual(run(items, filters({ statuses: new Set(['atrasada', 'em_dia']) })), [2, 3]);
  assert.deepEqual(run(items, filters({ categoryIds: new Set(['2']) })), [2, 3]);
  assert.deepEqual(run(items, filters({ paymentMethods: new Set(['pix']) })), [1]);
  assert.deepEqual(run(items, filters({ cardIds: new Set(['7']) })), [2]);
});

test('data de pagamento: hoje, semana e mês', () => {
  const items = [
    expense(1, { pago: true, dataPagamento: '2026-10-15' }),
    expense(2, { pago: true, dataPagamento: '2026-10-09' }),
    expense(3, { pago: true, dataPagamento: '2026-10-02' }),
    expense(4, { pago: true, dataPagamento: '2026-09-30' }),
    expense(5),
  ];
  assert.deepEqual(run(items, filters({ paymentDates: new Set(['hoje']) })), [1]);
  assert.deepEqual(run(items, filters({ paymentDates: new Set(['semana']) })), [1, 2]);
  assert.deepEqual(run(items, filters({ paymentDates: new Set(['mes']) })), [1, 2, 3]);
  assert.deepEqual(run(items, filters({ paymentDates: new Set(['hoje', 'mes']) })), [1, 2, 3]);
});

test('visibilidade: quem paga ou quem cadastrou, se estiver marcado', () => {
  const items = [
    expense(1, { autorId: 1, autorNome: 'Ana', pagadorNome: 'Ana' }),
    expense(2, { autorId: 2, autorNome: 'Bia', pagadorNome: 'Bia' }),
    expense(3, { autorId: 1, autorNome: 'Ana', pagadorNome: 'Bia' }),
    expense(4, { autorId: 2, autorNome: 'Bia', pagadorNome: 'Ana' }),
  ];
  const onlyAna: ExpenseVisibility = { meId: '1', visibleNames: new Set(['Ana']) };
  assert.deepEqual(run(items, filters(), onlyAna), [1, 3, 4]);
  const onlyBia: ExpenseVisibility = { meId: '1', visibleNames: new Set(['Bia']) };
  assert.deepEqual(run(items, filters(), onlyBia), [2, 3]);
  const loading: ExpenseVisibility = { meId: null, visibleNames: new Set() };
  assert.deepEqual(run(items, filters(), loading), [1, 2, 3, 4]);
});

test('pagamento em lote: só a despesa não paga e não cancelada', () => {
  assert.equal(isBatchSelectable(expense(1)), true);
  assert.equal(isBatchSelectable(expense(2, { status: 'ativa' })), true);
  assert.equal(isBatchSelectable(expense(3, { pago: true })), false);
  assert.equal(isBatchSelectable(expense(4, { status: 'cancelada' })), false);
});

test('chave dos filtros: a mesma escolha dá o mesmo texto; mudar qualquer filtro muda o texto', () => {
  const base = expenseFiltersKey(filters({ categoryIds: new Set(['2', '1']) }), new Set(['Bia', 'Ana']));
  assert.equal(expenseFiltersKey(filters({ categoryIds: new Set(['1', '2']) }), new Set(['Ana', 'Bia'])), base);
  assert.notEqual(expenseFiltersKey(filters({ categoryIds: new Set(['1']) }), new Set(['Ana', 'Bia'])), base);
  assert.notEqual(expenseFiltersKey(filters({ categoryIds: new Set(['1', '2']), paymentMethods: new Set(['pix']) }), new Set(['Ana', 'Bia'])), base);
  assert.notEqual(expenseFiltersKey(filters({ categoryIds: new Set(['1', '2']) }), new Set(['Ana'])), base);
});
