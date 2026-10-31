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
    paymentMethod: 'pix', cardId: null, purchaseDate: '2020-01-01', dueDate: '2020-01-10', endMonth: '2020-03',
    paid: false, paymentDate: null, amountPaid: null, attachments: null, invoiceNumber: null, invoiceDate: null,
    ...overrides,
  });
}

const february = '/financial/painel?de=2020-02-01&ate=2020-02-29';
const pending = (db: DemoFakeDatabase, month = '2020-02', accountId = 1) =>
  request<FixedExpenseOccurrenceDto[]>(db, `/expenses/fixed/pending?accountId=${accountId}&month=${month}`);
const confirmation: ExpenseUpdateInput = {
  description: 'Energia', categoryId: 1, amount: 120, paymentMethod: 'pix', cardId: null,
  purchaseDate: '2020-02-01', dueDate: '2020-02-10', paid: false, paymentDate: null,
  amountPaid: null, invoiceNumber: null, invoiceDate: null, attachments: null,
};

test('demo: atual lançada e próximas previstas até mês final, sem pagamento por data', () => {
  const db = database();
  const source = create(db);
  assert.equal(db.despesas.length, 3);
  assert.deepEqual(db.despesas.map((row) => row.fixa_competencia), ['2020-01-01', '2020-02-01', '2020-03-01']);
  assert.deepEqual(db.despesas.map((row) => row.status), ['ativa', 'prevista', 'prevista']);
  assert.ok(db.despesas.every((row) => !row.pago && row.despesa_fixa_id === source.id));
  assert.equal(pending(db).length, 1);
  assert.equal(pending(db).length, 1);
  assert.equal(db.despesas.length, 3);
});

test('demo: confirmação substitui estimativa na série e mantém outros meses, sem duplicação', () => {
  const db = database();
  create(db);
  create(db, { description: 'Condomínio' });
  create(db, { description: 'Aluguel' });
  const before = request<PainelData>(db, february);
  assert.equal(before.resumo.saiu, 0);
  assert.equal(before.serie.pontos[0]?.forecast, 300);
  const selected = pending(db)[0]!;
  request(db, `/expenses/${selected.id}/confirm`, 'POST', confirmation);
  const after = request<PainelData>(db, february);
  assert.equal(after.resumo.saiu, 120);
  assert.equal(after.resumo.pago, 0);
  assert.equal(after.serie.pontos[0]?.forecast, 200);
  assert.equal(after.serie.pontos[0]?.despesas, 120);
  assert.equal(after.forecastCount, 2);
  assert.equal(after.tipoGasto.fixo, 120);
  assert.equal(after.tipoGastoForecast?.fixo, 200);
  assert.equal(db.despesas.length, 9);
  assert.equal(db.despesas.find((row) => row.id === selected.id)?.valor_previsto, 100);
  assert.throws(() => request(db, `/expenses/${selected.id}/confirm`, 'POST', confirmation), /confirmada/);
});

test('demo: Adiar individual e todas persistem na consulta e não removem projeção', () => {
  const db = database();
  create(db);
  create(db);
  const ids = pending(db).map((row) => row.id);
  request(db, '/expenses/fixed/defer', 'PATCH', { accountId: 1, ids, deferred: true });
  assert.ok(pending(db).every((row) => row.deferred));
  assert.equal(request<PainelData>(db, february).serie.pontos[0]?.forecast, 200);
  assert.throws(() => request(db, `/expenses/${ids[0]}/confirm`, 'POST', confirmation), /Adiar/);
  request(db, '/expenses/fixed/defer', 'PATCH', { accountId: 1, ids: [ids[0]], deferred: false });
  request(db, `/expenses/${ids[0]}/confirm`, 'POST', confirmation);
  assert.equal(pending(db).length, 1);
  assert.equal(pending(db)[0]?.deferred, true);
});

test('demo: erro de conta ou ID no adiamento não modifica parcialmente o conjunto', () => {
  const db = database();
  create(db);
  const [row] = pending(db);
  assert.throws(() => request(db, '/expenses/fixed/defer', 'PATCH', { accountId: 2, ids: [row!.id], deferred: true }), /não encontrada/);
  assert.throws(() => request(db, '/expenses/fixed/defer', 'PATCH', { accountId: 1, ids: [row!.id, -1], deferred: true }), /não encontrada/);
  assert.equal(pending(db)[0]?.deferred, false);
  assert.equal(pending(db, '2020-02', 2).length, 0);
});

test('demo: disponibilidade usa compra e mês do vencimento; mover conserva competência', () => {
  const db = database();
  create(db);
  const [row] = pending(db);
  request(db, `/expenses/${row!.id}/mover`, 'POST');
  assert.equal(pending(db).length, 0);
  const moved = pending(db, '2020-03').find((item) => item.id === row!.id)!;
  assert.equal(moved.fixedCompetence, '2020-02-01');
  assert.equal(moved.dueDate, '2020-03-10');
  create(db, { purchaseDate: '2099-01-01', dueDate: '2099-01-10', endMonth: '2099-02' });
  assert.equal(pending(db, '2099-02').length, 0);
});

test('demo: pago e comprovantes ficam só na atual; crédito usa fatura após lançamento', () => {
  const db = database();
  const attachment = { id: 'bill', nome: 'conta.pdf', tipo: 'application/pdf', tamanho: 1, dados: 'data:application/pdf;base64,AA==', dataUpload: '2020-01-10' };
  create(db, { paid: true, paymentDate: '2020-01-10', amountPaid: 95, attachments: [attachment], invoiceNumber: '123', invoiceDate: '2020-01-01' });
  assert.equal(db.despesas[0]?.valor_pago, 95);
  assert.deepEqual(db.despesas[0]?.anexos, [attachment]);
  assert.ok(db.despesas.slice(1).every((row) => !row.pago && row.anexos === null && row.numero_nf === null));
  assert.throws(() => create(db, { paymentMethod: 'credito', cardId: 1, paid: true }), /fatura/);
  const second = database();
  create(second, { paymentMethod: 'credito', cardId: 1, purchaseDate: '2019-12-25', dueDate: '2020-01-28', endMonth: '2020-02' });
  assert.deepEqual(second.despesas.map((row) => row.data_vencimento), ['2020-01-28', '2020-02-28']);
  assert.equal(second.despesas[0]?.data_compra, '2019-12-25');
  const forecast = pending(second)[0]!;
  assert.throws(() => request(second, `/expenses/${forecast.id}/pay`, 'POST', {}), /previsão/);
  request(second, `/expenses/${forecast.id}/confirm`, 'POST', { ...confirmation, paymentMethod: 'credito', cardId: 1, dueDate: '2020-02-28' });
  assert.throws(() => request(second, `/expenses/${forecast.id}/pay`, 'POST', {}), /fatura/);
});

test('demo: limite atravessa ano e ampliação não cria passado nem recria competência retirada', () => {
  const db = database();
  create(db, { purchaseDate: '2019-11-01', dueDate: '2019-11-10', endMonth: '2020-03' });
  assert.equal(db.despesas.length, 5);
  const [forecast] = pending(db);
  request(db, `/expenses/${forecast!.id}`, 'DELETE');
  const first = db.despesas[0]!;
  request(db, `/expenses/${first.id}`, 'PUT', { ...confirmation, purchaseDate: '2019-11-01', dueDate: '2019-11-10', endMonth: '2020-04' });
  assert.equal(db.despesas.length, 5);
  assert.equal(db.despesas.find((row) => row.id === forecast!.id)?.status, 'cancelada');
  assert.equal(new Set(db.despesas.map((row) => row.fixa_competencia)).size, 5);
});

test('demo: primeiro vencimento de crédito postergado mantém um mês por ocorrência', () => {
  const db = database();
  create(db, { paymentMethod: 'credito', cardId: 1, purchaseDate: '2019-10-30', dueDate: '2019-12-28', endMonth: '2020-02' });
  assert.deepEqual(db.despesas.map((row) => row.data_vencimento), ['2019-12-28', '2020-01-28', '2020-02-28']);
  assert.deepEqual(db.despesas.map((row) => row.fixa_competencia), ['2019-12-01', '2020-01-01', '2020-02-01']);
});

test('demo: edição do limite preserva atuais e cancelamento retira só futuras pendentes', () => {
  const db = database();
  create(db, { purchaseDate: '2099-01-01', dueDate: '2099-01-10', endMonth: '2099-03' });
  const first = db.despesas[0]!;
  request(db, `/expenses/${first.id}`, 'PUT', { ...confirmation, purchaseDate: '2099-01-01', dueDate: '2099-01-10', endMonth: '2099-02' });
  assert.equal(first.status, 'ativa');
  assert.equal(first.valor_original, 120);
  assert.equal(db.despesas[1]?.valor_original, 100);
  assert.equal(db.despesas[2]?.status, 'cancelada');
  assert.ok(db.despesas.every((row) => row.fixa_mes_final === '2099-02'));
  request(db, `/expenses/${first.id}`, 'PUT', { ...confirmation, purchaseDate: '2099-01-01', dueDate: '2099-01-10', endMonth: '2099-04' });
  assert.equal(db.despesas.length, 4);
  assert.equal(db.despesas[2]?.status, 'cancelada');
  assert.equal(db.despesas[3]?.data_vencimento, '2099-04-10');
});

test('demo: editar descrição da fixa já paga pela fatura preserva pagamento e travas', () => {
  const db = database();
  create(db, { paymentMethod: 'credito', cardId: 1 });
  const first = db.despesas[0]!;
  Object.assign(first, { pago: true, data_pagamento: '2020-01-28', valor_pago: 100, pagamento_fatura_id: 7 });
  const edit = { ...confirmation, amount: 100, paymentMethod: 'credito' as const, cardId: 1,
    purchaseDate: '2020-01-01', dueDate: '2020-01-10', paid: true, paymentDate: '2020-01-28', amountPaid: 100 };
  request(db, `/expenses/${first.id}`, 'PUT', { ...edit, description: 'Energia corrigida' });
  assert.equal(first.descricao, 'Energia corrigida');
  assert.equal(first.valor_pago, 100);
  assert.equal(first.pagamento_fatura_id, 7);
  assert.throws(() => request(db, `/expenses/${first.id}`, 'PUT', { ...edit, amount: 120 }), /fatura/);
  assert.throws(() => request(db, `/expenses/${first.id}`, 'PUT', { ...edit, paid: false }), /fatura/);
});

test('demo: conversão no editor conserva ID e aplica os dados enviados à atual', () => {
  const db = database();
  const existing = request<{ id: number }>(db, '/expenses', 'POST', {
    ...confirmation, accountId: 1, billingType: 'single', amount: 90, paid: true,
    purchaseDate: '2020-01-01', dueDate: '2020-01-10', paymentDate: '2020-01-10', amountPaid: 90,
  });
  create(db, { sourceExpenseId: existing.id, description: 'Aluguel', amount: 110, paid: true, paymentDate: '2020-01-10', amountPaid: 90 });
  assert.equal(db.despesas.length, 3);
  const first = db.despesas.find((row) => row.id === existing.id)!;
  assert.equal(first.status, 'ativa');
  assert.equal(first.descricao, 'Aluguel');
  assert.equal(first.valor_original, 110);
  assert.equal(first.valor_pago, 90);
  assert.equal(pending(db).length, 1);
});

test('demo: valor inválido mantém previsão e não é convertido em zero', () => {
  const db = database();
  create(db);
  const row = pending(db)[0]!;
  assert.throws(() => request(db, `/expenses/${row.id}/confirm`, 'POST', { ...confirmation, amount: 0 }), /valor positivo/);
  assert.equal(pending(db)[0]?.amount, 100);
  assert.equal(pending(db)[0]?.status, 'prevista');
  assert.throws(() => create(db, { endMonth: '2019-12' }), /mês final/);
  assert.equal(db.despesas.length, 3);
});

test('demo: edição histórica mantém vínculo inativo, mas confirmar ou ampliar exige catálogo ativo', () => {
  const db = database();
  create(db);
  db.categorias[0]!.ativo = false;
  const first = db.despesas[0]!;
  const edit = { ...confirmation, amount: 100, purchaseDate: '2020-01-01', dueDate: '2020-01-10' };
  request(db, `/expenses/${first.id}`, 'PUT', { ...edit, description: 'Histórico corrigido' });
  assert.equal(first.descricao, 'Histórico corrigido');
  assert.throws(() => request(db, `/expenses/${first.id}`, 'PUT', { ...edit, endMonth: '2020-05' }), /Categoria indisponível/);
  const forecast = pending(db)[0]!;
  assert.throws(() => request(db, `/expenses/${forecast.id}/confirm`, 'POST', confirmation), /Categoria indisponível/);
  assert.equal(db.despesas.length, 3);
  const credit = database();
  create(credit, { paymentMethod: 'credito', cardId: 1 });
  credit.cartoes[0]!.ativo = false;
  const oldCard = credit.despesas[0]!;
  const creditEdit = { ...edit, paymentMethod: 'credito', cardId: 1, description: 'Cartão histórico' };
  request(credit, `/expenses/${oldCard.id}`, 'PUT', creditEdit);
  assert.equal(oldCard.descricao, 'Cartão histórico');
  assert.throws(() => request(credit, `/expenses/${oldCard.id}`, 'PUT', { ...creditEdit, paymentMethod: 'debito' }), /Cartão indisponível/);
});
