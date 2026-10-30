import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoFakeDatabase, type DemoFakeDatabase } from '../services/demo/demoFakeDatabase';
import { resolveFakeApiRequest } from '../services/demo/fakeApiResolver';
import type { ExpenseUpdateInput, FixedExpense, FixedExpenseCreateInput, FixedExpenseOccurrenceDto, PainelData } from '../types/finance';

function database(): DemoFakeDatabase {
  const db = createDemoFakeDatabase();
  db.despesas = [];
  db.receitas = [];
  return db;
}

function request<T>(db: DemoFakeDatabase, endpoint: string, method = 'GET', body?: unknown): T {
  return resolveFakeApiRequest(db, endpoint, { method, body: body === undefined ? undefined : JSON.stringify(body) }) as T;
}

function create(db: DemoFakeDatabase, overrides: Partial<FixedExpenseCreateInput> = {}): FixedExpense {
  return request<FixedExpense>(db, '/expenses/fixed', 'POST', {
    accountId: 1, description: 'Energia', categoryId: 1, amount: 100,
    paymentMethod: 'pix', cardId: null, purchaseDate: '2026-11-01', dueDate: '2026-11-10',
    firstMonth: '2026-11', ...overrides,
  });
}

const november = '/financial/painel?de=2026-11-01&ate=2026-11-30';
const pending = (db: DemoFakeDatabase) => request<FixedExpenseOccurrenceDto[]>(db, '/expenses/fixed/pending?accountId=1&month=2026-11');
const confirmation: ExpenseUpdateInput = {
  description: 'Energia', categoryId: 1, amount: 120, paymentMethod: 'pix', cardId: null,
  purchaseDate: '2026-11-01', dueDate: '2026-11-10', paid: false, paymentDate: null,
  amountPaid: null, invoiceNumber: null, invoiceDate: null, attachments: null,
};

test('demo: fonte gera primeiro mês previsto e dezembro, com identidade estável', () => {
  const db = database();
  const source = create(db);
  assert.equal(db.despesas.length, 2);
  assert.deepEqual(db.despesas.map((row) => row.fixa_competencia), ['2026-11-01', '2026-12-01']);
  assert.ok(db.despesas.every((row) => row.status === 'prevista' && !row.pago && row.despesa_fixa_id === source.id));
  assert.equal(pending(db).length, 1);
  assert.equal(pending(db).length, 1);
  assert.equal(db.despesas.length, 2);
  assert.equal(request<PainelData>(db, november).resumo.saiu, 0);
});

test('demo: confirmar uma entre três substitui 100 por 120, sem duplicar ou pagar', () => {
  const db = database();
  create(db);
  create(db, { description: 'Condomínio' });
  create(db, { description: 'Aluguel' });
  assert.equal(request<PainelData>(db, november).expenseProjection?.total, 300);
  const selected = pending(db)[0]!;
  request(db, `/expenses/${selected.id}/confirm`, 'POST', confirmation);
  const panel = request<PainelData>(db, november);
  assert.deepEqual(panel.expenseProjection, { confirmed: 120, scheduled: 0, planned: 200, total: 320, plannedCount: 2 });
  assert.equal(panel.resumo.pago, 0);
  assert.equal(pending(db).length, 2);
  assert.equal(db.despesas.length, 6);
  assert.equal(db.despesas.find((row) => row.id === selected.id)?.valor_previsto, 100);
  assert.throws(() => request(db, `/expenses/${selected.id}/confirm`, 'POST', { ...confirmation, amount: 150 }), /confirmada/);
  assert.equal(request<PainelData>(db, november).expenseProjection?.total, 320);
});

test('demo: previsão não entra no saldo, relatório ou pagamento comum, mesmo vencida', () => {
  const db = database();
  create(db, { firstMonth: '2020-11', purchaseDate: '2020-11-01', dueDate: '2020-11-10' });
  const row = db.despesas[0]!;
  const balance = request<{ despesas: number; despesas_pagas: number }>(db, '/meses/2020/10/saldo');
  assert.equal(balance.despesas, 0);
  assert.equal(balance.despesas_pagas, 0);
  const report = request<{ expenses: unknown[] }>(db, '/reports?start_date=2020-01-01&end_date=2020-12-31');
  assert.equal(report.expenses.length, 0);
  assert.throws(() => request(db, `/expenses/${row.id}/pay`, 'POST', { data_pagamento: '2020-11-11', valor_pago: 100 }), /Confirme/);
  assert.equal(row.status, 'prevista');
  assert.equal(row.pago, false);
});

test('demo: edição da previsão não confirma e mover preserva competência', () => {
  const db = database();
  create(db);
  const row = db.despesas[0]!;
  request(db, `/expenses/${row.id}`, 'PUT', { ...confirmation, amount: 130 });
  assert.equal(row.status, 'prevista');
  assert.equal(row.pago, false);
  assert.equal(row.valor_original, 130);
  request(db, `/expenses/${row.id}/mover`, 'POST');
  assert.equal(row.data_vencimento, '2026-12-10');
  assert.equal(row.fixa_competencia, '2026-11-01');
  assert.equal(pending(db)[0]?.id, row.id);
});

test('demo: pagamento em outro mês move a contribuição, sem recriar a previsão anterior', () => {
  const db = database();
  create(db);
  const row = db.despesas[0]!;
  request(db, `/expenses/${row.id}/confirm`, 'POST', confirmation);
  request(db, `/expenses/${row.id}/pay`, 'POST', { data_pagamento: '2026-12-01', valor_pago: 120 });
  assert.equal(request<PainelData>(db, november).expenseProjection?.total, 0);
  assert.equal(request<PainelData>(db, '/financial/painel?de=2026-12-01&ate=2026-12-31').expenseProjection?.total, 220);
  assert.equal(row.fixa_competencia, '2026-11-01');
  assert.equal(db.despesas.length, 2);
});

test('demo: cancelamento mantém identidade e renovação é manual, sem restaurar mês retirado', () => {
  const db = database();
  const source = create(db);
  const row = db.despesas[0]!;
  request(db, `/expenses/${row.id}`, 'DELETE');
  assert.equal(row.status, 'cancelada');
  assert.equal(row.despesa_fixa_id, source.id);
  request(db, `/expenses/fixed/${source.id}/renew`, 'POST', { year: 2027 });
  assert.equal(db.despesas.length, 14);
  assert.equal(row.status, 'cancelada');
  assert.equal(source.registeredYear, 2027);
  request(db, `/expenses/fixed/${source.id}/renew`, 'POST', { year: 2027 });
  assert.equal(db.despesas.length, 14);
  assert.throws(() => request(db, `/expenses/fixed/${source.id}/renew`, 'POST', { year: 2029 }), /próximo ano/);
});

test('demo: ciclo inicial preserva compra e vencimento quando a fatura cai no mês seguinte', () => {
  const db = database();
  create(db, { paymentMethod: 'credito', cardId: 1, purchaseDate: '2026-11-25', dueDate: '2026-12-28' });
  const first = db.despesas[0]!;
  assert.equal(first.fixa_competencia, '2026-11-01');
  assert.equal(first.data_compra, '2026-11-25');
  assert.equal(first.data_vencimento, '2026-12-28');
  assert.equal(db.despesas[1]?.data_compra, '2026-12-25');
  assert.equal(db.despesas[1]?.data_vencimento, '2027-01-28');
});

test('demo: conversão mantém lançamento atual e cria só competências seguintes', () => {
  const db = database();
  const row = request<{ id: number }>(db, '/expenses', 'POST', {
    ...confirmation, accountId: 1, billingType: 'single', amount: 90, paid: true,
    paymentDate: '2026-11-10', amountPaid: 90,
  });
  create(db, { sourceExpenseId: row.id });
  assert.equal(db.despesas.length, 2);
  const existing = db.despesas.find((item) => item.id === row.id)!;
  assert.equal(existing.status, 'ativa');
  assert.equal(existing.pago, true);
  assert.equal(existing.valor_original, 90);
  assert.equal(existing.data_pagamento, '2026-11-10');
  assert.equal(pending(db).length, 0);
});
