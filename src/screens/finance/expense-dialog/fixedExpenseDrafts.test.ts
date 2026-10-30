import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Expense } from '../../../types/finance';
import type { Cartao } from '../../../types/config';
import { createDraft, dialogReducer, initialDialogState } from './draftState';
import { buildCreateInput, summarizeDraft } from './draftRules';
import {
  buildFixedExpenseInput, canCreateFixedFromExpense, initialFixedMonth, mergeFixedOccurrences, selectedFixedOccurrences,
} from './fixedExpenseDrafts';

function forecast(id: number, month = '2026-11'): Expense {
  return {
    id, descricao: 'Energia', valorFinal: 100, categoria: 'Moradia', categoriaId: 1,
    formaPagamento: 'pix', dataCompra: `${month}-01`, dataVencimento: `${month}-10`,
    mes: Number(month.slice(5)) - 1, ano: Number(month.slice(0, 4)),
    status: 'prevista', pago: false, recorrente: false, parcelado: false,
    fixedExpenseId: 1, fixedCompetence: `${month}-01`,
  };
}

test('pendências começam desmarcadas, clique repetido não duplica e refetch preserva valor ajustado', () => {
  const initial = mergeFixedOccurrences([], [forecast(1), forecast(2), forecast(3)], '2026-11');
  assert.equal(selectedFixedOccurrences(initial, '2026-11').length, 0);
  initial[0] = { ...initial[0]!, selected: true, dirty: true, draft: { ...initial[0]!.draft, amountCents: 12000 } };
  const refreshed = mergeFixedOccurrences(initial, [forecast(1), forecast(2), forecast(2), forecast(3)], '2026-11');
  assert.equal(refreshed.length, 3);
  assert.equal(selectedFixedOccurrences(refreshed, '2026-11')[0]!.draft.amountCents, 12000);
  assert.equal(refreshed.reduce((sum, item) => sum + (item.draft.amountCents ?? 0), 0), 32000);
});

test('atualizar cadastro reflete nova estimativa em linha ainda não editada', () => {
  const items = mergeFixedOccurrences([], [forecast(1)], '2026-11');
  const refreshed = mergeFixedOccurrences(items, [{ ...forecast(1), valorFinal: 150 }], '2026-11');
  assert.equal(refreshed[0]!.draft.amountCents, 15000);
  assert.equal(refreshed[0]!.draft.key, items[0]!.draft.key);
});

test('seleção é restrita ao mês visível; outro mês mantém rascunho sem confirmação oculta', () => {
  let items = mergeFixedOccurrences([], [forecast(1)], '2026-11');
  items[0]!.selected = true;
  items = mergeFixedOccurrences(items, [forecast(2, '2026-12')], '2026-12');
  assert.equal(selectedFixedOccurrences(items, '2026-12').length, 0);
  assert.equal(selectedFixedOccurrences(items, '2026-11').length, 1);
  const externallyConfirmed = mergeFixedOccurrences(items, [], '2026-11');
  assert.deepEqual(externallyConfirmed.map((item) => item.expense.id), [2]);
});

test('mês das fixas segue contexto, calendário e hoje sem alterar a data da compra', () => {
  assert.equal(initialFixedMonth('2026-12', '2026-11-15', '2026-10-30'), '2026-12');
  assert.equal(initialFixedMonth(undefined, '2026-11-15', '2026-10-30'), '2026-11');
  assert.equal(initialFixedMonth(undefined, undefined, '2026-10-30'), '2026-10');
});

test('cadastro fixa não herda pagamento e usa estimativa com mês inicial explícito', () => {
  const draft = {
    ...createDraft({ paymentMethod: 'pix', cardId: null, purchaseDate: '01/11/2026', paymentMethodTouched: true }),
    description: 'Aluguel', categoryId: 1, amountCents: 200000, paid: true,
    paymentDate: '01/11/2026', amountPaidCents: 190000,
  };
  const next = dialogReducer(initialDialogState(draft), { type: 'update', key: draft.key, patch: { billingType: 'fixed' } });
  assert.equal(next.entry.paid, false);
  assert.equal(next.entry.paymentDate, '');
  const context = { todayIso: '2026-11-10', cards: [] };
  const input = buildFixedExpenseInput(next.entry, context, 19, '2026-11');
  assert.equal(input.amount, 2000);
  assert.equal(input.firstMonth, '2026-11');
  assert.equal('paid' in input, false);
  assert.equal(summarizeDraft(next.entry, context)?.status, 'Previsão');
});

test('conversão conserva referência à despesa existente e recusa séries/renegociação', () => {
  const expense = { ...forecast(1), status: 'ativa' as const, fixedExpenseId: null };
  assert.equal(canCreateFixedFromExpense(expense), true);
  assert.equal(canCreateFixedFromExpense({ ...expense, parcelado: true }), false);
  assert.equal(canCreateFixedFromExpense({ ...expense, recorrente: true }), false);
  assert.equal(canCreateFixedFromExpense({ ...expense, invoiceOriginPaymentId: 1 }), false);
  assert.equal(canCreateFixedFromExpense(forecast(1)), false);
});

test('fixa PIX iniciada em mês futuro avança apenas datas automáticas sem mudar o lançamento comum', () => {
  const draft = {
    ...createDraft({ paymentMethod: 'pix', cardId: null, purchaseDate: '30/10/2026', paymentMethodTouched: true }),
    description: 'Aluguel', categoryId: 1, amountCents: 200000,
  };
  const context = { todayIso: '2026-10-30', cards: [] };
  const input = buildFixedExpenseInput(draft, context, 19, '2026-11');
  assert.equal(input.purchaseDate, '2026-11-30');
  assert.equal(input.dueDate, '2026-11-30');
  const common = buildCreateInput(draft, context, 19);
  assert.equal(common.purchaseDate, '2026-10-30');
  assert.equal(common.billingType === 'single' ? common.dueDate : null, '2026-10-30');
  assert.equal(draft.purchaseDate, '30/10/2026');
});

test('fixa no crédito conserva compra anterior quando a fatura já vence no mês inicial', () => {
  const card: Cartao = { id: 1, nome: 'Crédito', ativo: true, tipo: 'credito', dia_fechamento: 2, dia_vencimento: 9 };
  const draft = {
    ...createDraft({ paymentMethod: 'credito', cardId: card.id, purchaseDate: '30/10/2026', paymentMethodTouched: true }),
    description: 'Assinatura', categoryId: 1, amountCents: 10000,
  };
  const context = { todayIso: '2026-10-30', cards: [card] };
  const november = buildFixedExpenseInput(draft, context, 19, '2026-11');
  assert.equal(november.purchaseDate, '2026-10-30');
  assert.equal(november.dueDate, '2026-11-09');
  const december = buildFixedExpenseInput(draft, context, 19, '2026-12');
  assert.equal(december.purchaseDate, '2026-11-30');
  assert.equal(december.dueDate, '2026-12-09');
});

test('fixa preserva compra e vencimento informados explicitamente, inclusive anteriores ao ciclo', () => {
  const draft = {
    ...createDraft({ paymentMethod: 'pix', cardId: null, purchaseDate: '10/10/2026', purchaseDateTouched: true, paymentMethodTouched: true }),
    description: 'Aluguel', categoryId: 1, amountCents: 200000, dueDate: '15/10/2026',
  };
  const input = buildFixedExpenseInput(draft, { todayIso: '2026-10-30', cards: [] }, 19, '2026-11');
  assert.equal(input.purchaseDate, '2026-10-10');
  assert.equal(input.dueDate, '2026-10-15');
  const automaticDue = buildFixedExpenseInput({ ...draft, dueDate: '' }, { todayIso: '2026-10-30', cards: [] }, 19, '2026-11');
  assert.equal(automaticDue.purchaseDate, '2026-10-10');
  assert.equal(automaticDue.dueDate, '2026-11-10');
});

test('compra explícita no crédito não é mudada para forçar outra fatura', () => {
  const card: Cartao = { id: 1, nome: 'Crédito', ativo: true, tipo: 'credito', dia_fechamento: 20, dia_vencimento: 30 };
  const draft = {
    ...createDraft({ paymentMethod: 'credito', cardId: card.id, purchaseDate: '01/10/2026', purchaseDateTouched: true, paymentMethodTouched: true }),
    description: 'Assinatura', categoryId: 1, amountCents: 10000,
  };
  assert.throws(() => buildFixedExpenseInput(draft, { todayIso: '2026-10-01', cards: [card] }, 19, '2026-11'), /anterior ao mês inicial/);
  const manual = buildFixedExpenseInput({ ...draft, dueDate: '30/11/2026' }, { todayIso: '2026-10-01', cards: [card] }, 19, '2026-11');
  assert.equal(manual.purchaseDate, '2026-10-01');
  assert.equal(manual.dueDate, '2026-11-30');
});
