import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changedSeriesFields,
  invoiceDueDateForPurchase,
  isInstallmentInScope,
  isOpenFollowingOccurrence,
  planInstallmentUpdates,
  planRecurringUpdates,
  type SeriesFields,
  type SeriesOccurrence,
} from './expenseSeries';

// Os mesmos casos de invoiceDueDate do front (src/utils/expenseSchedule.test.ts):
// as duas regras precisam dar o mesmo vencimento.
test('fatura: compra até o fechamento entra no mês, depois dele na seguinte', () => {
  const card = { closingDay: 3, dueDay: 10 };
  assert.equal(invoiceDueDateForPurchase('2026-10-02', card), '2026-10-10');
  assert.equal(invoiceDueDateForPurchase('2026-10-03', card), '2026-10-10');
  assert.equal(invoiceDueDateForPurchase('2026-10-04', card), '2026-11-10');
  assert.equal(invoiceDueDateForPurchase('2026-12-20', card), '2027-01-10');
});

test('fatura: vencimento menor ou igual ao fechamento vence no mês seguinte', () => {
  const card = { closingDay: 25, dueDay: 5 };
  assert.equal(invoiceDueDateForPurchase('2026-09-20', card), '2026-10-05');
  assert.equal(invoiceDueDateForPurchase('2026-09-29', card), '2026-11-05');
  assert.equal(invoiceDueDateForPurchase('2026-09-10', { closingDay: 10, dueDay: 10 }), '2026-10-10');
  assert.equal(invoiceDueDateForPurchase('2026-01-05', { closingDay: 1, dueDay: 31 }), '2026-02-28');
});

const EDITED = { id: 10, installmentGroupId: 1, installmentNumber: null, dueDate: '2026-10-04' };

function occurrence(overrides: Partial<SeriesOccurrence> = {}): SeriesOccurrence {
  return {
    id: 11, installmentGroupId: 1, recurring: true, installment: false, installmentNumber: null, active: true, paid: false,
    invoicePaymentId: null, invoiceOriginPaymentId: null, dueDate: '2026-11-04', purchaseDate: null, ...overrides,
  };
}

test('mensal, próximas: só as da mesma série, em aberto, vigentes, fora da fatura e depois da editada', () => {
  assert.equal(isOpenFollowingOccurrence(occurrence(), EDITED), true);
  for (const outside of [
    { paid: true },
    { active: false },
    { recurring: false },
    { invoicePaymentId: 5 },
    { invoiceOriginPaymentId: 5 },
    { installmentGroupId: 2 },
    { dueDate: '2026-10-04' },
    { dueDate: '2026-09-04' },
    { id: 10 },
  ]) {
    assert.equal(isOpenFollowingOccurrence(occurrence(outside), EDITED), false, JSON.stringify(outside));
  }
  // Despesa sem série não tem próximas.
  assert.equal(isOpenFollowingOccurrence(occurrence({ installmentGroupId: null }), { ...EDITED, installmentGroupId: null }), false);
});

const EDITED_INSTALLMENT = { id: 10, installmentGroupId: 1, installmentNumber: 3, dueDate: '2026-10-10' };

function installment(number: number, overrides: Partial<SeriesOccurrence> = {}): SeriesOccurrence {
  return occurrence({ id: 100 + number, recurring: false, installment: true, installmentNumber: number, ...overrides });
}

test('parcelado, esta e as próximas: as de número maior, pagas incluídas; fora canceladas e ligadas à fatura', () => {
  assert.equal(isInstallmentInScope(installment(4), EDITED_INSTALLMENT, 'following'), true);
  assert.equal(isInstallmentInScope(installment(5, { paid: true }), EDITED_INSTALLMENT, 'following'), true);
  assert.equal(isInstallmentInScope(installment(2), EDITED_INSTALLMENT, 'following'), false);
  assert.equal(isInstallmentInScope(installment(4, { active: false }), EDITED_INSTALLMENT, 'following'), false);
  assert.equal(isInstallmentInScope(installment(4, { invoicePaymentId: 7 }), EDITED_INSTALLMENT, 'following'), false);
  assert.equal(isInstallmentInScope(installment(4, { installmentGroupId: 2 }), EDITED_INSTALLMENT, 'following'), false);
});

test('parcelado, todas: as anteriores e as pagas entram; fora a editada, canceladas e ligadas à fatura', () => {
  assert.equal(isInstallmentInScope(installment(1, { paid: true }), EDITED_INSTALLMENT, 'all'), true);
  assert.equal(isInstallmentInScope(installment(6), EDITED_INSTALLMENT, 'all'), true);
  assert.equal(isInstallmentInScope(installment(3, { id: 10 }), EDITED_INSTALLMENT, 'all'), false);
  assert.equal(isInstallmentInScope(installment(2, { active: false }), EDITED_INSTALLMENT, 'all'), false);
  assert.equal(isInstallmentInScope(installment(2, { invoiceOriginPaymentId: 7 }), EDITED_INSTALLMENT, 'all'), false);
  assert.equal(isInstallmentInScope(occurrence({ id: 20 }), EDITED_INSTALLMENT, 'all'), false, 'linha mensal não é parcela');
});

const FIELDS: SeriesFields = {
  description: 'DonPetine', categoryId: 4, paymentMethod: 'credito', cardId: 6,
  amount: 103, purchaseDate: '2026-09-06', dueDate: '2026-10-04',
};

test('campos alterados: o valor é comparado em centavos e o que não mudou não aparece', () => {
  assert.deepEqual([...changedSeriesFields(FIELDS, { ...FIELDS })], []);
  assert.deepEqual([...changedSeriesFields(FIELDS, { ...FIELDS, amount: 103.001 })], []);
  assert.deepEqual([...changedSeriesFields(FIELDS, { ...FIELDS, amount: 110, description: 'Don Petine' })].sort(), ['amount', 'description']);
  assert.deepEqual([...changedSeriesFields(FIELDS, { ...FIELDS, purchaseDate: '2026-09-17' })], ['purchaseDate']);
});

test('campos alterados: sem data de compra gravada, o vencimento que o modal devolve no campo não é mudança', () => {
  const withoutPurchase = { ...FIELDS, purchaseDate: null, dueDate: '2026-11-09' };
  // Só o valor mudou: o campo da compra voltou com o vencimento, como o modal mostra.
  assert.deepEqual([...changedSeriesFields(withoutPurchase, { ...withoutPurchase, purchaseDate: '2026-11-09', amount: 90 })], ['amount']);
  // Vencimento mudou e o campo da compra continuou com o vencimento antigo: só o vencimento mudou.
  assert.deepEqual(
    [...changedSeriesFields(withoutPurchase, { ...withoutPurchase, purchaseDate: '2026-11-09', dueDate: '2026-11-10' })],
    ['dueDate'],
  );
  // Uma data de compra de verdade, diferente do vencimento, é mudança.
  assert.deepEqual([...changedSeriesFields(withoutPurchase, { ...withoutPurchase, purchaseDate: '2026-10-17' })], ['purchaseDate']);
});

test('mensal, só o valor: as próximas mudam o valor e mantêm as datas', () => {
  const next = { ...FIELDS, amount: 110 };
  const updates = planRecurringUpdates(
    { originalDueDate: '2026-10-04', next },
    changedSeriesFields(FIELDS, next),
    [{ id: 11, dueDate: '2026-11-09', purchaseDate: null }, { id: 12, dueDate: '2026-12-09', purchaseDate: null }],
    { closingDay: 2, dueDay: 9 },
  );
  assert.deepEqual(updates, [{ id: 11, amount: 110 }, { id: 12, amount: 110 }]);
});

test('mensal, data de compra no crédito com cartão: cada próxima vence na fatura da compra dela (exemplo do DonPetine)', () => {
  // Cobrança no dia 17; o cartão fecha no dia 2 e, a partir de novembro, vence no dia 9.
  const next = { ...FIELDS, purchaseDate: '2026-09-17' };
  const updates = planRecurringUpdates(
    { originalDueDate: '2026-10-04', next },
    changedSeriesFields(FIELDS, next),
    [{ id: 11, dueDate: '2026-11-09', purchaseDate: '2026-11-06' }, { id: 12, dueDate: '2026-12-09', purchaseDate: '2026-12-06' }],
    { closingDay: 2, dueDay: 9 },
  );
  assert.deepEqual(updates, [
    { id: 11, purchaseDate: '2026-10-17', dueDate: '2026-11-09' },
    { id: 12, purchaseDate: '2026-11-17', dueDate: '2026-12-09' },
  ]);
});

test('mensal, data de compra no dia 31 cai no último dia do mês mais curto', () => {
  const current = { ...FIELDS, purchaseDate: '2027-01-20', dueDate: '2027-02-05' };
  const next = { ...current, purchaseDate: '2027-01-31' };
  const [update] = planRecurringUpdates(
    { originalDueDate: '2027-02-05', next },
    changedSeriesFields(current, next),
    [{ id: 11, dueDate: '2027-03-05', purchaseDate: null }],
    { closingDay: 28, dueDay: 5 },
  );
  // 28/02 não passa do fechamento (dia 28): fatura de fevereiro, que vence em 05/03.
  assert.equal(update?.purchaseDate, '2027-02-28');
  assert.equal(update?.dueDate, '2027-03-05');
});

test('mensal, vencimento fora do crédito: as próximas vão para o mesmo dia no mês delas', () => {
  const current = { ...FIELDS, paymentMethod: 'pix', cardId: null, purchaseDate: null, dueDate: '2026-10-05' };
  const next = { ...current, dueDate: '2026-10-10' };
  const updates = planRecurringUpdates(
    { originalDueDate: '2026-10-05', next },
    changedSeriesFields(current, next),
    [{ id: 11, dueDate: '2026-11-05', purchaseDate: null }, { id: 12, dueDate: '2026-12-05', purchaseDate: null }],
    null,
  );
  assert.deepEqual(updates, [{ id: 11, dueDate: '2026-11-10' }, { id: 12, dueDate: '2026-12-10' }]);
});

test('mensal, mês pago no meio da série: a distância em meses continua certa', () => {
  const current = { ...FIELDS, paymentMethod: 'pix', cardId: null, purchaseDate: null, dueDate: '2026-10-05' };
  const next = { ...current, dueDate: '2026-10-10' };
  // Novembro está paga e não entra; dezembro continua dois meses depois de outubro.
  const updates = planRecurringUpdates(
    { originalDueDate: '2026-10-05', next },
    changedSeriesFields(current, next),
    [{ id: 12, dueDate: '2026-12-05', purchaseDate: null }],
    null,
  );
  assert.deepEqual(updates, [{ id: 12, dueDate: '2026-12-10' }]);
});

test('mensal, troca de cartão: o vencimento das próximas passa a sair da fatura do cartão novo', () => {
  const next = { ...FIELDS, cardId: 9, dueDate: '2026-10-20' };
  const updates = planRecurringUpdates(
    { originalDueDate: '2026-10-04', next },
    changedSeriesFields(FIELDS, next),
    [{ id: 11, dueDate: '2026-11-04', purchaseDate: '2026-11-15' }, { id: 12, dueDate: '2026-12-04', purchaseDate: null }],
    { closingDay: 10, dueDay: 20 },
  );
  assert.deepEqual(updates, [
    // Com data de compra: a fatura do cartão novo.
    { id: 11, cardId: 9, dueDate: '2026-12-20' },
    // Sem data de compra: o vencimento novo da editada, no mês da próxima.
    { id: 12, cardId: 9, dueDate: '2026-12-20' },
  ]);
});

test('pagamento, anexos e nota fiscal nunca vão para as outras linhas da série', () => {
  const next = { ...FIELDS, amount: 110, description: 'Don Petine', purchaseDate: '2026-09-17' };
  const changed = changedSeriesFields(FIELDS, next);
  const updates = [
    ...planRecurringUpdates({ originalDueDate: '2026-10-04', next }, changed, [{ id: 11, dueDate: '2026-11-09', purchaseDate: null }], { closingDay: 2, dueDay: 9 }),
    ...planInstallmentUpdates({ originalDueDate: '2026-10-04', next }, changed, [{ id: 12, dueDate: '2026-11-04' }]),
  ];
  const allowed = new Set(['id', 'description', 'categoryId', 'paymentMethod', 'cardId', 'amount', 'purchaseDate', 'dueDate']);
  for (const update of updates) {
    for (const key of Object.keys(update)) assert.ok(allowed.has(key), key);
  }
});

const INSTALLMENT_FIELDS: SeriesFields = {
  description: 'Genova', categoryId: 2, paymentMethod: 'credito', cardId: 6,
  amount: 240, purchaseDate: '2026-08-05', dueDate: '2026-10-10',
};

test('parcelado, data de compra: a nova vale igual para todas as parcelas do escopo', () => {
  const next = { ...INSTALLMENT_FIELDS, purchaseDate: '2026-08-06' };
  const updates = planInstallmentUpdates(
    { originalDueDate: '2026-10-10', next },
    changedSeriesFields(INSTALLMENT_FIELDS, next),
    [{ id: 101, dueDate: '2026-08-10' }, { id: 104, dueDate: '2026-11-10' }],
  );
  // O vencimento da editada não mudou: as outras ficam onde estavam.
  assert.deepEqual(updates, [
    { id: 101, purchaseDate: '2026-08-06', dueDate: '2026-08-10' },
    { id: 104, purchaseDate: '2026-08-06', dueDate: '2026-11-10' },
  ]);
});

test('parcelado, vencimento: as outras parcelas acompanham mês a mês, inclusive as anteriores em "Todas"', () => {
  const next = { ...INSTALLMENT_FIELDS, dueDate: '2026-10-15' };
  const updates = planInstallmentUpdates(
    { originalDueDate: '2026-10-10', next },
    changedSeriesFields(INSTALLMENT_FIELDS, next),
    // A 2/6 (setembro) foi excluída antes; a 5/6 (dezembro) mantém a distância.
    [{ id: 101, dueDate: '2026-08-10' }, { id: 104, dueDate: '2026-11-10' }, { id: 105, dueDate: '2026-12-10' }],
  );
  assert.deepEqual(updates, [
    { id: 101, dueDate: '2026-08-15' },
    { id: 104, dueDate: '2026-11-15' },
    { id: 105, dueDate: '2026-12-15' },
  ]);
});

test('parcelado, só o valor: as parcelas do escopo mudam o valor e mantêm as datas', () => {
  const next = { ...INSTALLMENT_FIELDS, amount: 250 };
  const updates = planInstallmentUpdates(
    { originalDueDate: '2026-10-10', next },
    changedSeriesFields(INSTALLMENT_FIELDS, next),
    [{ id: 104, dueDate: '2026-11-10' }],
  );
  assert.deepEqual(updates, [{ id: 104, amount: 250 }]);
});
