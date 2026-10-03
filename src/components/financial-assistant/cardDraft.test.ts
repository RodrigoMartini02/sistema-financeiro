import assert from 'node:assert/strict';
import test from 'node:test';
import type { Cartao } from '../../types/config';
import type { ExpenseCreateInput, ExpenseInstallmentInput } from '../../types/finance';
import type { FinancialAssistantDraft } from '../../types/financialAssistant';
import type { RuleContext } from '../../screens/finance/expense-dialog/draftRules';
import {
  buildExpenseSave, categoryIdByName, duplicateCheckKey, fillDraftDefaults, toExpenseDraft, type CardCategory,
} from './cardDraft';

const TODAY = '2026-10-02';
const NUBANK: Cartao = { id: 1, nome: 'Nubank', ativo: true, tipo: 'credito', dia_fechamento: 5, dia_vencimento: 12 };
const context: RuleContext = { todayIso: TODAY, cards: [NUBANK] };
const categories: CardCategory[] = [{ id: 10, nome: 'Alimentação' }, { id: 11, nome: 'Eletrônicos' }];

function draft(overrides: Partial<FinancialAssistantDraft> = {}): FinancialAssistantDraft {
  return {
    kind: 'expense',
    description: 'Celular',
    amount: 3000,
    date: TODAY,
    dueDate: null,
    category: 'Eletrônicos',
    paymentMethod: 'pix',
    paid: false,
    confidence: 'high',
    billingType: 'nao',
    installments: null,
    ...overrides,
  };
}

function save(value: FinancialAssistantDraft): ExpenseCreateInput {
  const result = buildExpenseSave(value, { categories, context, accountId: 7, attachments: [] });
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.input;
}

function installmentsOf(input: ExpenseCreateInput): ExpenseInstallmentInput[] {
  assert.equal(input.billingType, 'installments');
  return input.billingType === 'installments' ? input.installments : [];
}

test('"3000 em 10x" grava 10 parcelas de 300: o valor do card é o total, como no modal', () => {
  const installments = installmentsOf(save(draft({ billingType: 'parcelas', installments: 10 })));

  assert.equal(installments.length, 10);
  assert.ok(installments.every((installment) => installment.amount === 300));
  assert.deepEqual(installments.slice(0, 2).map((installment) => installment.dueDate), ['2026-10-02', '2026-11-02']);
});

test('divisão do total com o resto na última parcela', () => {
  const installments = installmentsOf(save(draft({ amount: 100, billingType: 'parcelas', installments: 3 })));

  assert.deepEqual(installments.map((installment) => installment.amount), [33.33, 33.33, 33.34]);
});

test('crédito sem vencimento digitado vence na fatura do cartão', () => {
  const beforeClosing = save(draft({ paymentMethod: 'credito', cardId: NUBANK.id, date: '2026-10-02' }));
  const afterClosing = save(draft({ paymentMethod: 'credito', cardId: NUBANK.id, date: '2026-10-06' }));

  assert.equal(beforeClosing.billingType === 'single' && beforeClosing.dueDate, '2026-10-12');
  assert.equal(afterClosing.billingType === 'single' && afterClosing.dueDate, '2026-11-12');
});

test('crédito com cartão de crédito cadastrado exige o cartão, como no modal', () => {
  const result = buildExpenseSave(draft({ paymentMethod: 'credito', cardId: null }), { categories, context, accountId: 7, attachments: [] });

  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /cartão/);
});

test('frase sem data: a compra é hoje e o vencimento, a data da compra', () => {
  const filled = fillDraftDefaults(draft({ date: null, paid: true }), TODAY);
  const input = save(filled);

  assert.equal(filled.date, TODAY);
  assert.equal(input.purchaseDate, TODAY);
  assert.equal(input.billingType === 'single' && input.dueDate, TODAY);
  assert.equal(input.billingType === 'single' && input.paymentDate, TODAY);
});

test('despesa paga com juros grava o valor e a data do pagamento', () => {
  const input = save(draft({
    amount: 99, dueDate: '2026-09-30', paid: true, amountPaid: 121.29, paymentDate: '2026-10-01',
  }));

  assert.equal(input.billingType, 'single');
  if (input.billingType !== 'single') return;
  assert.equal(input.paid, true);
  assert.equal(input.dueDate, '2026-09-30');
  assert.equal(input.paymentDate, '2026-10-01');
  assert.equal(input.amountPaid, 121.29);
});

test('paga sem valor digitado manda o valor vazio: o servidor grava o previsto', () => {
  const input = save(draft({ paid: true, paymentDate: TODAY }));

  assert.equal(input.billingType === 'single' && input.amountPaid, null);
});

test('recorrente: vence no dia digitado; sem ele, no dia da compra', () => {
  const typed = save(draft({ billingType: 'mensal', dueDate: '2026-10-15' }));
  const fromPurchase = save(draft({ billingType: 'mensal', date: '2026-10-07' }));

  assert.equal(typed.billingType, 'monthly');
  assert.equal(typed.billingType === 'monthly' && typed.dueDate, '2026-10-15');
  assert.equal(fromPurchase.billingType === 'monthly' && fromPurchase.dueDate, '2026-10-07');
});

test('parcelas pagas fora do crédito: data e valor de cada uma, vazio vale o vencimento e o previsto', () => {
  const installments = installmentsOf(save(draft({
    amount: 900,
    billingType: 'parcelas',
    installments: 3,
    dueDate: '2026-09-05',
    installmentPayments: {
      0: { paymentDate: '10/09/2026', amountPaidCents: 31_000 },
      1: { paymentDate: '', amountPaidCents: null },
    },
  })));

  assert.deepEqual(installments[0], { amount: 300, dueDate: '2026-09-05', paid: true, paymentDate: '2026-09-10', amountPaid: 310 });
  assert.deepEqual(installments[1], { amount: 300, dueDate: '2026-10-05', paid: true, paymentDate: '2026-10-05', amountPaid: 300 });
  assert.deepEqual(installments[2], { amount: 300, dueDate: '2026-11-05', paid: false, paymentDate: null, amountPaid: null });
});

test('parcelas pagas no crédito: quitadas no vencimento, pelo valor previsto', () => {
  const installments = installmentsOf(save(draft({
    amount: 600,
    paymentMethod: 'credito',
    cardId: NUBANK.id,
    billingType: 'parcelas',
    installments: 2,
    installmentPayments: { 0: { paymentDate: '01/10/2026', amountPaidCents: 40_000 } },
  })));

  assert.equal(installments[0]!.paid, true);
  assert.equal(installments[0]!.amountPaid, 300);
  assert.equal(installments[0]!.paymentDate, installments[0]!.dueDate);
});

test('categoria vai pelo nome, sem acento nem caixa; sem categoria o salvar acusa', () => {
  assert.equal(categoryIdByName(categories, 'eletronicos'), 11);
  assert.equal(categoryIdByName(categories, null), null);

  const result = buildExpenseSave(draft({ category: null }), { categories, context, accountId: 7, attachments: [] });
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /categoria/);
});

test('padrões não sobrescrevem o que veio da frase', () => {
  const fromSentence = fillDraftDefaults(draft({ date: '2026-09-30', paid: true }), TODAY);
  assert.equal(fromSentence.date, '2026-09-30');
  assert.equal(fromSentence.paymentDate, '2026-09-30');

  const withPaymentDate = fillDraftDefaults(draft({ paid: true, paymentDate: '2026-09-29' }), TODAY);
  assert.equal(withPaymentDate.paymentDate, '2026-09-29');

  const unpaid = fillDraftDefaults(draft({ date: null }), TODAY);
  assert.equal(unpaid.paymentDate, null);
});

test('receita sem data vem com hoje, como o modal do desktop; com data, fica a da frase', () => {
  const income = (overrides: Partial<FinancialAssistantDraft>): FinancialAssistantDraft => ({ ...draft(overrides), kind: 'income' });

  assert.equal(fillDraftDefaults(income({ date: null }), TODAY).date, TODAY);
  assert.equal(fillDraftDefaults(income({ date: '2026-09-28' }), TODAY).date, '2026-09-28');
  // Receita não tem "Pago em": o padrão da despesa paga não vale para ela.
  assert.equal(fillDraftDefaults(income({ date: null, paid: true }), TODAY).paymentDate, undefined);
});

test('aviso de duplicata compara a parcela e o vencimento efetivo', () => {
  const expenseDraft = toExpenseDraft(draft({ billingType: 'parcelas', installments: 10 }), categories, TODAY);

  assert.deepEqual(duplicateCheckKey(expenseDraft, context), { amount: 300, dueDate: TODAY });
});
