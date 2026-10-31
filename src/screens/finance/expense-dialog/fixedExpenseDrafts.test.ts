import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Expense } from '../../../types/finance';
import { saveInOrder } from '../entry-dialog/batchState';
import { buildCreateInput, buildUpdateInput, validateDraft } from './draftRules';
import { createDraft, dialogReducer, draftFromExpense, initialDialogState, type DialogState, type ExpenseDraft, type DraftErrors } from './draftState';
import { canCreateFixedFromExpense, contextForDraft, initialFixedMonth, readyToSave } from './fixedExpenseDrafts';

const context = { todayIso: '2026-10-30', cards: [] };
const draft = (patch: Partial<ExpenseDraft> = {}) => ({ ...createDraft({ paymentMethod: 'pix', cardId: null,
  purchaseDate: '30/10/2026', paymentMethodTouched: true }), description: 'Energia', categoryId: 2, amountCents: 10000,
  dueDate: '10/11/2026', ...patch });
const forecast = (id: number, patch: Partial<Expense> = {}): Expense => ({ id, descricao: 'Energia', categoria: 'Moradia',
  categoriaId: 2, formaPagamento: 'pix', valorFinal: 100, dataCompra: '2026-10-30', dataVencimento: '2026-11-10',
  mes: 10, ano: 2026, status: 'prevista', pago: false, recorrente: false, parcelado: false,
  fixedExpenseId: id + 100, fixedCompetence: '2026-11-01', fixedEndMonth: '2027-03', deferred: false, ...patch });

test('Fixa antes ou depois do + produz o mesmo lançamento e preserva pagamento explícito', () => {
  const initial = draft({ paid: true, paymentDate: '30/10/2026', amountPaidCents: 9500 });
  let before = initialDialogState(initial);
  before = dialogReducer(before, { type: 'update', key: initial.key, patch: { billingType: 'fixed', endMonth: '2027-03' } });
  before = dialogReducer(before, { type: 'moveEntryToBatch', nextEntry: draft({ description: '', amountCents: null }) });
  let after = initialDialogState(initial);
  after = dialogReducer(after, { type: 'moveEntryToBatch', nextEntry: draft({ description: '', amountCents: null }) });
  after = dialogReducer(after, { type: 'update', key: initial.key, patch: { billingType: 'fixed', endMonth: '2027-03' } });
  const input = buildCreateInput(before.batch[0]!, context, 19);
  assert.deepEqual(input, buildCreateInput(after.batch[0]!, context, 19));
  assert.equal(input.billingType, 'fixed');
  if (input.billingType !== 'fixed') throw new Error('Expected fixed input');
  assert.equal(input.endMonth, '2027-03');
  assert.equal(input.paid, true);
  assert.equal(input.amountPaid, 95);
  assert.equal(input.paymentDate, '2026-10-30');
  assert.ok(!('firstMonth' in input));
});

test('Até é obrigatório, permite cruzar ano e não antecede a primeira ocorrência nova', () => {
  assert.equal(validateDraft(draft({ billingType: 'fixed' }), context).endMonth, true);
  assert.equal(validateDraft(draft({ billingType: 'fixed', endMonth: '2026-10' }), context).endMonth, true);
  assert.equal(validateDraft(draft({ billingType: 'fixed', endMonth: '2027-03' }), context).endMonth, undefined);
  assert.equal(validateDraft(draft({ billingType: 'fixed', endMonth: '2026-11' }), context).endMonth, undefined);
  assert.equal(validateDraft(draft({ billingType: 'fixed', endMonth: '2027-13' }), context).endMonth, true);
});

test('previsões entram no mesmo lote, sem duplicatas e sem apagar rascunho alterado', () => {
  let state = initialDialogState(draft());
  state = dialogReducer(state, { type: 'moveEntryToBatch', nextEntry: draft({ description: '', amountCents: null }) });
  state = dialogReducer(state, { type: 'mergeForecasts', expenses: [forecast(1), forecast(2), forecast(2)], excludedIds: [] });
  const row = state.batch.find(item => item.forecastId === 1)!;
  state = dialogReducer(state, { type: 'update', key: row.key, patch: { amountCents: 12345 } });
  state = dialogReducer(state, { type: 'mergeForecasts', expenses: [forecast(1, { valorFinal: 150 }), forecast(2, { valorFinal: 200 })], excludedIds: [] });
  assert.equal(state.batch.length, 3);
  assert.equal(state.batch.find(item => item.forecastId === 1)!.amountCents, 12345);
  assert.equal(state.batch.find(item => item.forecastId === 2)!.amountCents, 20000);
  assert.equal(state.batch[0]!.forecastId, undefined);
});

test('adiamento vem do servidor ao reabrir e falha permanece excluída do salvamento', () => {
  let state = initialDialogState(draft());
  state = dialogReducer(state, { type: 'mergeForecasts', expenses: [forecast(1, { deferred: true }), forecast(2)], excludedIds: [] });
  assert.equal(readyToSave(state.batch[0]!), false);
  assert.equal(readyToSave(state.batch[1]!), true);
  state = dialogReducer(state, { type: 'setDeferred', ids: [2], deferred: true, error: 'Falha ao adiar' });
  state = dialogReducer(state, { type: 'mergeForecasts', expenses: [forecast(1, { deferred: true }), forecast(2)], excludedIds: [] });
  assert.equal(readyToSave(state.batch[1]!), false);
  assert.equal(state.batch[1]!.deferError, 'Falha ao adiar');
  state = dialogReducer(state, { type: 'setDeferred', ids: [2], deferred: false });
  assert.equal(readyToSave(state.batch[1]!), true);
});

test('sem valor ou adiada não entra no lote a gravar; novas despesas permanecem independentes', () => {
  const rows = [draft(), draftFromExpense(forecast(1)), draftFromExpense(forecast(2, { deferred: true })),
    { ...draftFromExpense(forecast(3)), amountCents: null }, { ...draftFromExpense(forecast(4)), amountCents: 0 }];
  assert.deepEqual(rows.filter(readyToSave).map(row => row.forecastId ?? 'nova'), ['nova', 1]);
});

test('confirmação usa contexto de edição e mantém dados da ocorrência', () => {
  const row = { ...draftFromExpense(forecast(1)), amountCents: 12000, paid: true, paymentDate: '30/10/2026', amountPaidCents: 11500 };
  const rowContext = contextForDraft(row, context);
  assert.equal(rowContext.editing, true);
  assert.equal(rowContext.savedDueDate, '2026-11-10');
  const input = buildUpdateInput(row, rowContext);
  assert.equal(input.amount, 120);
  assert.equal(input.amountPaid, 115);
  assert.equal(input.endMonth, undefined);
  assert.equal(buildUpdateInput({ ...row, endMonth: '2027-04' }, rowContext).endMonth, '2027-04');
});

test('falha parcial conserva restantes e resposta antiga não reinsere previsão confirmada', async () => {
  let state: DialogState = initialDialogState(draft({ description: '', amountCents: null }));
  state = dialogReducer(state, { type: 'mergeForecasts', expenses: [forecast(1), forecast(2)], excludedIds: [] });
  const saved: number[] = [];
  const result = await saveInOrder<ExpenseDraft, DraftErrors>({ items: state.batch, entryKey: state.entry.key, nextEntry: state.entry,
    save: async row => { if (row.forecastId === 2) throw new Error('Falha esperada'); saved.push(row.forecastId!); },
    dispatch: action => { state = dialogReducer(state, action); }, itemLabel: 'Despesa', fallbackMessage: 'Falha' });
  assert.equal(result.saved, 1);
  state = dialogReducer(state, { type: 'mergeForecasts', expenses: [forecast(1), forecast(2)], excludedIds: saved });
  assert.deepEqual(state.batch.map(row => row.forecastId), [2]);
});

test('mês de origem é preservado e conversão só aceita despesa única comum', () => {
  assert.equal(initialFixedMonth('2027-02', '2026-12-30', '2026-10-30'), '2027-02');
  assert.equal(initialFixedMonth(undefined, '2026-12-30', '2026-10-30'), '2026-12');
  const common = forecast(1, { status: 'ativa', fixedExpenseId: null });
  assert.equal(canCreateFixedFromExpense(common), true);
  assert.equal(canCreateFixedFromExpense({ ...common, parcelado: true }), false);
  assert.equal(canCreateFixedFromExpense(forecast(1)), false);
});
