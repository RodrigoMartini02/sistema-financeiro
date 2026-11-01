import assert from 'node:assert/strict';
import test from 'node:test';
import {
  billingLabel, draftBillingMenu, draftBillingOptions, editBillingNote, editBillingOptions, editBillingText, editBillingValue,
  fixedEndMinimum, pickEditBilling, seriesCountHint, singleCountHint, type DraftBillingHandlers,
} from './billingMenu';
import type { RuleContext } from './draftRules';
import { createDraft, type ExpenseDraft } from './draftState';

const context: RuleContext = { todayIso: '2026-10-30', cards: [] };
const draft = (patch: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  ...createDraft({ paymentMethod: 'pix', cardId: null, purchaseDate: '30/10/2026', paymentMethodTouched: true }),
  description: 'Energia', categoryId: 2, amountCents: 10000, ...patch,
});

function recorder() {
  const calls: unknown[] = [];
  const handlers: DraftBillingHandlers = {
    onUpdate: (patch) => calls.push({ update: patch }),
    onSetInstallmentCount: (count, force) => calls.push({ count, force }),
    onCancelInstallmentCount: () => calls.push('cancel'),
  };
  return { calls, handlers };
}

const view = { recurringAvailable: false, pendingCount: null, endMonthInvalid: false };

test('texto do botão fechado: o nº de parcelas, Fixa, Mensal ou Não repete', () => {
  assert.equal(billingLabel(draft()), 'Não repete');
  assert.equal(billingLabel(draft({ billingType: 'installments', installmentCount: 3 })), '3x');
  assert.equal(billingLabel(draft({ billingType: 'monthly' })), 'Mensal');
  assert.equal(billingLabel(draft({ billingType: 'fixed' })), 'Fixa');
});

test('opções: Recorrente só no crédito; a previsão e a série fixa só têm a Fixa', () => {
  assert.deepEqual(draftBillingOptions(draft(), false), ['single', 'installments', 'fixed']);
  assert.deepEqual(draftBillingOptions(draft(), true), ['single', 'installments', 'monthly', 'fixed']);
  assert.deepEqual(draftBillingOptions(draft({ forecastId: 5, fixedExpenseId: 7 }), true), ['fixed']);
  assert.deepEqual(draftBillingOptions(draft({ fixedExpenseId: 7 }), true), ['fixed']);
});

test('limite da fixa: o piso é o mês do vencimento e a série que já existe não tem piso', () => {
  assert.equal(fixedEndMinimum(draft({ dueDate: '10/11/2026' }), context), '2026-11');
  assert.equal(fixedEndMinimum(draft(), context), '2026-10');
  assert.equal(fixedEndMinimum(draft({ fixedExpenseId: 7 }), context), undefined);
});

test('menu do rascunho: marcar a opção que já está marcada não muda nada; as outras escolhas vão para o rascunho', () => {
  const { calls, handlers } = recorder();
  const menu = draftBillingMenu(draft(), context, view, handlers);
  assert.deepEqual([menu.value, menu.label], ['single', 'Não repete']);
  assert.deepEqual(menu.installments && [menu.installments.value, menu.installments.min], [2, 2]);
  assert.equal(menu.fixedEnd?.value, '');
  menu.onSelect('single');
  assert.deepEqual(calls, []);
  menu.onSelect('installments');
  menu.installments?.onChange(6);
  menu.fixedEnd?.onChange('2027-03');
  assert.deepEqual(calls, [{ update: { billingType: 'installments' } }, { count: 6, force: false }, { update: { endMonth: '2027-03' } }]);
});

test('menu do rascunho: a redução que apaga ajustes pede confirmação e confirma com força', () => {
  const { calls, handlers } = recorder();
  const withPending = draftBillingMenu(draft({ billingType: 'installments', installmentCount: 6 }), context, { ...view, pendingCount: 3 }, handlers);
  assert.equal(withPending.pendingCount?.count, 3);
  withPending.pendingCount?.onConfirm();
  withPending.pendingCount?.onCancel();
  assert.deepEqual(calls, [{ count: 3, force: true }, 'cancel']);
  assert.equal(draftBillingMenu(draft(), context, view, handlers).pendingCount, null);
});

test('limite inválido realça o botão só com a Fixa marcada', () => {
  const { handlers } = recorder();
  const invalid = { ...view, endMonthInvalid: true };
  assert.equal(draftBillingMenu(draft({ billingType: 'fixed' }), context, invalid, handlers).invalid, true);
  assert.equal(draftBillingMenu(draft(), context, invalid, handlers).invalid, false);
  assert.equal(draftBillingMenu(draft({ billingType: 'fixed' }), context, view, handlers).invalid, false);
});

test('edição da despesa única: oferece parcelar e fixar conforme o servidor aceita', () => {
  assert.deepEqual(editBillingOptions({ installments: false, fixed: false }), ['single']);
  assert.deepEqual(editBillingOptions({ installments: true, fixed: false }), ['single', 'installments']);
  assert.deepEqual(editBillingOptions({ installments: false, fixed: true }), ['single', 'fixed']);
  assert.deepEqual(editBillingOptions({ installments: true, fixed: true }), ['single', 'installments', 'fixed']);
});

test('edição da despesa única: o rodapé diz o que o menu oferece', () => {
  const tail = 'Depois disso, a cobrança só muda excluindo e lançando de novo.';
  assert.equal(editBillingNote({ installments: true, fixed: true }), `No menu Cobrança, esta despesa pode virar parcelada ou fixa. ${tail}`);
  assert.equal(editBillingNote({ installments: true, fixed: false }), `No menu Cobrança, esta despesa pode virar parcelada. ${tail}`);
  assert.equal(editBillingNote({ installments: false, fixed: true }), `No menu Cobrança, esta despesa pode virar fixa. ${tail}`);
});

test('edição da despesa única: a opção marcada e o texto seguem o rascunho e o nº de parcelas', () => {
  assert.equal(editBillingValue('single', null), 'single');
  assert.equal(editBillingValue('single', 3), 'installments');
  assert.equal(editBillingValue('fixed', null), 'fixed');
  assert.equal(editBillingText('single', null), 'Não repete');
  assert.equal(editBillingText('installments', 4), '4x');
  assert.equal(editBillingText('fixed', null), 'Fixa');
});

test('edição da despesa única: escolher uma opção ajusta a cobrança do rascunho e o nº de parcelas', () => {
  assert.deepEqual(pickEditBilling('installments', null), { billingType: 'single', installmentCount: 2 });
  assert.deepEqual(pickEditBilling('installments', 5), { billingType: 'single', installmentCount: 5 });
  assert.deepEqual(pickEditBilling('fixed', 5), { billingType: 'fixed', installmentCount: null });
  assert.deepEqual(pickEditBilling('single', 5), { billingType: 'single', installmentCount: null });
});

test('parcelar a despesa única: só a paga explica que o valor é o total e o pagamento se divide', () => {
  assert.equal(singleCountHint(false), undefined);
  assert.equal(singleCountHint(true), 'Despesa paga: o valor é o total da compra e o pagamento se divide entre as parcelas.');
});

test('edição da parcelada: o texto abaixo do Parcelado diz por que não muda, ou o mínimo', () => {
  const base = { loaded: true, scopeIsAll: true, generated: false, block: null, shown: 5 };
  assert.equal(seriesCountHint({ ...base, loaded: false }), undefined);
  assert.equal(seriesCountHint({ ...base, generated: true, scopeIsAll: false }), 'A parcela gerada pelo pagamento da fatura não muda de número.');
  assert.equal(seriesCountHint({ ...base, scopeIsAll: false }), 'Para mudar o número de parcelas, escolha "Todas" em "Aplicar a".');
  const block = { minimum: 3, reason: 'já foi paga' };
  assert.equal(seriesCountHint({ ...base, block, shown: 3 }), 'Mínimo 3: a parcela 3 já foi paga.');
  assert.equal(seriesCountHint({ ...base, block, shown: 4 }), 'Só entram ou saem parcelas em aberto.');
  assert.equal(seriesCountHint(base), 'Só entram ou saem parcelas em aberto.');
});
