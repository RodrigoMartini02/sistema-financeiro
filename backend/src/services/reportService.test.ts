import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expenseStatus,
  filterExpenses,
  filterIncomes,
  incomeStatus,
  installmentLabel,
  matchesPaymentDate,
  summarize,
  type ReportExpense,
  type ReportFilters,
  type ReportIncome,
} from './reportService';

const TODAY = '2026-09-28';

const NO_FILTERS: ReportFilters = {
  types: [], expenseStatuses: [], categoryIds: [], paymentMethods: [], cardIds: [], paymentDates: [],
};

function expense(overrides: Partial<ReportExpense> = {}): ReportExpense {
  return {
    id: 1, description: 'Mercado', categoryId: 10, categoryName: 'Mercado', categoryGroup: 'Alimentação',
    paymentMethod: 'credito', cardId: 6, cardName: 'Mercado-Pago', payerId: 1, payerName: 'Rodrigo Martini',
    authorId: 1, authorName: 'Rodrigo Martini', dueDate: '2026-09-10', paymentDate: null, status: 'on_time',
    installment: null, recurring: false, amount: 100, ...overrides,
  };
}

function income(overrides: Partial<ReportIncome> = {}): ReportIncome {
  return {
    id: 1, description: 'Salário', categoryName: 'Salário', categoryGroup: 'Emprego', receiptDate: '2026-09-05',
    status: 'received', authorId: 1, authorName: 'Rodrigo Martini', client: null, representative: null,
    commission: null, amount: 5000, ...overrides,
  };
}

test('status da despesa: paga, atrasada (venceu antes de hoje) ou em dia', () => {
  assert.equal(expenseStatus(true, '2026-01-01', TODAY), 'paid');
  assert.equal(expenseStatus(false, '2026-09-27', TODAY), 'overdue');
  assert.equal(expenseStatus(false, TODAY, TODAY), 'on_time');
});

test('status da receita: ativa é recebida; prevista/faturada fica prevista ou em atraso', () => {
  assert.equal(incomeStatus('ativa', '2026-09-01', TODAY), 'received');
  assert.equal(incomeStatus('prevista', '2026-09-27', TODAY), 'overdue');
  assert.equal(incomeStatus('faturada', '2026-10-05', TODAY), 'expected');
});

test('parcela "atual/total" só quando há número de parcelas', () => {
  assert.equal(installmentLabel(3, 10), '3/10');
  assert.equal(installmentLabel(null, 4), '1/4');
  assert.equal(installmentLabel(null, null), null);
});

test('janela da data de pagamento: hoje, últimos 7 dias e mês corrente', () => {
  assert.equal(matchesPaymentDate(null, [], TODAY), true);
  assert.equal(matchesPaymentDate(null, ['today'], TODAY), false);
  assert.equal(matchesPaymentDate(TODAY, ['today'], TODAY), true);
  assert.equal(matchesPaymentDate('2026-09-21', ['week'], TODAY), true);
  assert.equal(matchesPaymentDate('2026-09-20', ['week'], TODAY), false);
  assert.equal(matchesPaymentDate('2026-09-01', ['month'], TODAY), true);
  assert.equal(matchesPaymentDate('2026-08-31', ['week', 'month'], TODAY), false);
});

test('filtros de despesa combinam em AND entre grupos e OR dentro do grupo', () => {
  const rows = [
    expense({ id: 1, status: 'paid', paymentDate: TODAY }),
    expense({ id: 2, paymentMethod: 'pix', cardId: null, cardName: null }),
    expense({ id: 3, categoryId: 11, status: 'overdue' }),
  ];
  const ids = (filters: Partial<ReportFilters>) => filterExpenses(rows, { ...NO_FILTERS, ...filters }, TODAY).map((row) => row.id);

  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ expenseStatuses: ['paid', 'overdue'] }), [1, 3]);
  assert.deepEqual(ids({ categoryIds: [10], paymentMethods: ['credito'] }), [1]);
  assert.deepEqual(ids({ cardIds: [6] }), [1, 3]);
  assert.deepEqual(ids({ paymentDates: ['today'] }), [1]);
  assert.deepEqual(ids({ types: ['income'] }), []);
});

test('filtro de tipo esconde as receitas quando só despesas', () => {
  assert.equal(filterIncomes([income()], { ...NO_FILTERS, types: ['expense'] }).length, 0);
  assert.equal(filterIncomes([income()], { ...NO_FILTERS, types: ['income', 'expense'] }).length, 1);
});

test('totais: receitas previstas ficam fora do total de receitas', () => {
  const totals = summarize(
    [expense({ amount: 100 }), expense({ id: 2, amount: 50.5 })],
    [income({ amount: 5000 }), income({ id: 2, status: 'expected', amount: 900 })],
  );
  assert.deepEqual(totals, { income: 5000, incomeCount: 1, expense: 150.5, expenseCount: 2 });
});
