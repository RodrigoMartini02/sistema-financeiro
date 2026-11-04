import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomeCreateInput, IncomeOccurrenceDto, IncomeUpdateInput, PainelData } from '../types/finance';
import { registerDemoAttachment } from '../services/demo/demoAttachments';
import { createDemoFakeDatabase, todayIso, type DemoFakeDatabase, type RawIncomeDemo } from '../services/demo/demoFakeDatabase';
import { resolveFakeApiRequest } from '../services/demo/fakeApiResolver';
import { addMonthsClamped } from './expenseSchedule';

function database(): DemoFakeDatabase {
  const db = createDemoFakeDatabase();
  db.receitas = [];
  db.despesas = [];
  return db;
}

function request<T>(db: DemoFakeDatabase, endpoint: string, method = 'GET', body?: unknown): T {
  return resolveFakeApiRequest(db, endpoint, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) as T;
}

const input: IncomeCreateInput = {
  accountId: 1, description: 'Salário', categoryId: 2, grossAmount: 1500, netAmount: 1400,
  receiptDate: '2020-01-31', billingType: 'fixed', endMonth: '2020-03', received: false,
  clientId: null, representativeId: null, attachmentIds: [], productSale: null, billableHours: null,
};
const fields: IncomeUpdateInput = {
  description: 'Salário confirmado', categoryId: 2, grossAmount: 1600, netAmount: 1500,
  receiptDate: '2020-02-01', clientId: null, representativeId: null, attachmentIds: [],
};
const create = (db: DemoFakeDatabase, patch: Partial<IncomeCreateInput> = {}) => request<RawIncomeDemo>(db, '/incomes', 'POST', { ...input, ...patch });
const pending = (db: DemoFakeDatabase, month = '2020-01', accountId = 1) => request<IncomeOccurrenceDto[]>(db, `/incomes/pending?accountId=${accountId}&month=${month}`);
const panel = (db: DemoFakeDatabase) => request<PainelData>(db, '/financial/painel?de=2020-01-01&ate=2020-03-31');

test('demo receitas: Recebida define só a atual; futuras são previstas, com datas ancoradas e sem anexos', () => {
  const db = database();
  const first = create(db);
  assert.equal(first.status, 'prevista');
  assert.deepEqual(db.receitas.map(row => row.data_recebimento), ['2020-01-31', '2020-02-29', '2020-03-31']);
  assert.ok(db.receitas.every(row => row.status === 'prevista'));
  const attachment = registerDemoAttachment(new File(['x'], 'Comprovante.txt', { type: 'text/plain' }));
  const received = create(db, { received: true, attachmentIds: [attachment.id] });
  const series = db.receitas.filter(row => row.classificacao_fixa_id === received.classificacao_fixa_id);
  assert.equal(series[0]?.status, 'ativa');
  assert.deepEqual(series[0]?.attachments, [attachment]);
  assert.ok(series.slice(1).every(row => row.status === 'prevista' && row.attachments.length === 0));
  assert.notEqual(first.classificacao_fixa_id, received.classificacao_fixa_id);
});

test('demo receitas: pendências seguem mês, disponibilidade e conta, incluindo adiadas', () => {
  const db = database();
  create(db);
  create(db, { accountId: 2 });
  const future = addMonthsClamped(todayIso(), 1);
  create(db, { receiptDate: future, endMonth: future.slice(0, 7) });
  assert.equal(pending(db).length, 1);
  assert.equal(pending(db, '2020-02').length, 1);
  assert.equal(pending(db, '2020-01', 2).length, 1);
  assert.equal(pending(db, future.slice(0, 7)).length, 0);
  const row = pending(db)[0]!;
  request(db, '/incomes/defer', 'PATCH', { accountId: 1, ids: [row.id], deferred: true });
  assert.equal(pending(db)[0]?.deferred, true);
});

test('demo receitas: adiamento de conjunto é atômico e bloqueia recebimento sem alterar a previsão', () => {
  const db = database();
  const first = create(db);
  const second = create(db);
  const foreign = create(db, { accountId: 2 });
  assert.throws(() => request(db, '/incomes/defer', 'PATCH', { accountId: 1, ids: [first.id, foreign.id], deferred: true }), /não encontrada/);
  assert.ok(pending(db).every(row => !row.deferred));
  request(db, '/incomes/defer', 'PATCH', { accountId: 1, ids: [first.id, second.id], deferred: true });
  const before = JSON.stringify(db.receitas);
  assert.throws(() => request(db, `/incomes/${first.id}/receber`, 'PUT', { changes: fields }), /Adiar/);
  assert.equal(JSON.stringify(db.receitas), before);
  assert.equal(panel(db).receitas.aReceber.total, 12600);
  assert.equal(panel(db).resumo.entrou, 0);
});

test('demo receitas: receber grava campos pelo mesmo ID e não repete ao tentar novamente', () => {
  const db = database();
  const first = create(db);
  const result = request<RawIncomeDemo>(db, `/incomes/${first.id}/receber`, 'PUT', { changes: fields });
  assert.equal(result.id, first.id);
  assert.equal(result.status, 'ativa');
  assert.equal(result.valor_liquido, 1500);
  assert.equal(result.data_recebimento, '2020-02-01');
  assert.equal(result.fixa_competencia, '2020-01-01');
  assert.equal(db.receitas.length, 3);
  assert.equal(db.receitas.find(row => row.fixa_competencia === '2020-02-01')?.valor_liquido, 1400);
  const before = JSON.stringify(db.receitas);
  assert.throws(() => request(db, `/incomes/${first.id}/receber`, 'PUT', { changes: { ...fields, netAmount: 1 } }), /já recebida/);
  assert.equal(JSON.stringify(db.receitas), before);
});

test('demo receitas: painel troca estimativa pelo recebido e distingue fixa/variável na mesma subcategoria', () => {
  const db = database();
  const first = create(db);
  create(db, { billingType: 'single', grossAmount: 200, netAmount: 200 });
  const before = panel(db);
  assert.equal(before.resumo.entrou, 200);
  assert.equal(before.receitas.aReceber.total, 4200);
  assert.equal(before.receitas.fixa, 4200);
  assert.equal(before.receitas.variavel, 200);
  request(db, `/incomes/${first.id}/receber`, 'PUT', { changes: fields });
  const after = panel(db);
  assert.equal(after.resumo.entrou, 1700);
  assert.equal(after.receitas.aReceber.total, 2800);
  assert.equal(after.receitas.rendaPrevista, 4500);
  assert.equal(after.receitas.fixa, 4300);
  assert.equal(after.receitas.variavel, 200);
});

test('demo receitas: reduzir Até apaga as previstas além do limite e ampliar recria só o que falta', () => {
  const db = database();
  const date = todayIso();
  const month = (offset: number) => addMonthsClamped(date, offset).slice(0, 7);
  const first = create(db, { receiptDate: date, endMonth: month(3), received: true });
  const currentFields = { ...fields, receiptDate: date, endMonth: month(1) };
  request(db, `/incomes/${first.id}`, 'PUT', currentFields);
  assert.equal(db.receitas.length, 2);
  assert.equal(db.receitas.some(row => row.status === 'cancelada'), false);
  assert.equal(db.receitas.find(row => row.id === first.id)?.status, 'ativa');
  const nextMonth = db.receitas.find(row => row.status === 'prevista')!;
  request(db, `/incomes/${nextMonth.id}`, 'DELETE');
  request(db, `/incomes/${first.id}`, 'PUT', { ...currentFields, endMonth: month(4) });
  assert.equal(db.receitas.length, 5);
  assert.deepEqual(db.receitas.filter(row => row.status === 'cancelada').map(row => row.id), [nextMonth.id]);
  assert.equal(db.receitas.filter(row => row.fixa_competencia?.startsWith(month(4))).length, 1);
  assert.equal(db.receitas.filter(row => row.fixa_competencia?.startsWith(month(1))).length, 1);
});

test('demo receitas: edição inválida não altera dados ou confirma recebimento', () => {
  const db = database();
  const first = create(db);
  const before = JSON.stringify(db.receitas);
  assert.throws(() => request(db, `/incomes/${first.id}/receber`, 'PUT', { changes: { ...fields, endMonth: '2019-12' } }), /mês final/);
  assert.equal(JSON.stringify(db.receitas), before);
  assert.throws(() => request(db, `/incomes/${first.id}`, 'PUT', { ...fields, netAmount: 0 }), /valores válidos/);
  assert.equal(JSON.stringify(db.receitas), before);
});

test('demo receitas: receber pelo consumidor antigo e cancelar preservam identidade da série', () => {
  const db = database();
  const first = create(db);
  const result = request<RawIncomeDemo>(db, `/incomes/${first.id}/receber`, 'PUT', { data_recebimento: '2020-02-10', valor_recebido: 1450 });
  assert.equal(result.status, 'ativa');
  assert.equal(result.valor_liquido, 1450);
  const second = db.receitas.find(row => row.status === 'prevista')!;
  request(db, `/incomes/${second.id}`, 'DELETE');
  assert.equal(db.receitas.find(row => row.id === second.id)?.status, 'cancelada');
  assert.equal(db.receitas.find(row => row.id === second.id)?.fixa_competencia, second.fixa_competencia);
});
