import assert from 'node:assert/strict';
import test from 'node:test';
import type { Cartao } from '../../../types/config';
import { formatCurrency } from '../formatters';
import { createDraft, type ExpenseDraft } from './draftState';
import {
  buildCreateInput, buildUpdateInput, duplicateQuery, errorMessage, installmentAmounts, installmentGrid,
  installmentMismatch, markOverdueAsPaid, summarizeDraft, validateDraft, type RuleContext,
} from './draftRules';

const TODAY = '2026-09-29';
const NUBANK: Cartao = { id: 1, nome: 'Nubank', ativo: true, tipo: 'credito', dia_fechamento: 3, dia_vencimento: 10 };
const CAJU: Cartao = { id: 2, nome: 'Caju', ativo: true, tipo: 'debito' };
const context: RuleContext = { todayIso: TODAY, cards: [NUBANK, CAJU] };

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    ...createDraft({ paymentMethod: 'pix', cardId: null, purchaseDate: '29/09/2026', paymentMethodTouched: false }, TODAY),
    description: 'Conta de luz',
    categoryId: 10,
    amountCents: 18740,
    ...overrides,
  };
}

function credit(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return draft({ paymentMethod: 'credito', cardId: NUBANK.id, ...overrides });
}

const brl = (reais: number) => formatCurrency(reais);

test('status Pago: fora do crédito, vencimento até hoje já nasce pago', () => {
  const summary = summarizeDraft(draft(), context);
  assert.equal(summary?.status, 'Pago');
  assert.equal(summary?.dueText, 'Pago na hora');
  assert.equal(summary?.totalText, `total ${brl(187.4)}`);
});

test('status Agendado: vencimento futuro informado', () => {
  const summary = summarizeDraft(draft({ dueDate: '05/10/2026' }), context);
  assert.equal(summary?.status, 'Agendado');
  assert.equal(summary?.dueText, 'Vence 05/10 · data informada');
});

test('status Entra na fatura: crédito vence na fatura do cartão', () => {
  const summary = summarizeDraft(credit(), context);
  assert.equal(summary?.status, 'Entra na fatura');
  assert.equal(summary?.dueText, 'Vence 10/10 · fatura Nubank');
});

test('status Com vencidas, Em andamento e Pago no parcelado', () => {
  const overdue = draft({ billingType: 'installments', installmentCount: 4, amountCents: 40000, purchaseDate: '10/07/2026' });
  const first = summarizeDraft(overdue, context);
  assert.equal(first?.status, 'Com vencidas');
  assert.deepEqual(first?.badges, [{ text: '3 vencidas em aberto', tone: 'danger' }]);
  assert.equal(first?.totalText, `4x de ${brl(100)} · próxima vence 10/07 · total ${brl(400)}`);

  const marked = { ...overdue, ...markOverdueAsPaid(overdue, context) };
  const second = summarizeDraft(marked, context);
  assert.equal(second?.status, 'Em andamento');
  assert.equal(second?.totalText, `4x de ${brl(100)} · 3 pagas · próxima vence 10/10 · total ${brl(400)}`);

  const allPaid = { ...marked, installmentPayments: { ...marked.installmentPayments, 3: { paymentDate: '10/10/2026', amountPaidCents: null } } };
  assert.equal(summarizeDraft(allPaid, context)?.status, 'Pago');
  assert.match(summarizeDraft(allPaid, context)!.totalText, /quitado/);
});

test('sem descrição ou sem valor não há resumo', () => {
  assert.equal(summarizeDraft(draft({ description: ' ' }), context), null);
  assert.equal(summarizeDraft(draft({ amountCents: null }), context), null);
});

test('badges: juros embutido, multa e juros, desconto', () => {
  const withCashPrice = credit({ billingType: 'installments', installmentCount: 10, amountCents: 120000, knowsCashPrice: true, cashPriceCents: 100000 });
  assert.deepEqual(summarizeDraft(withCashPrice, context)?.badges, [{ text: `+ ${brl(200)} de juros embutido (20,0%)`, tone: 'warning' }]);

  const late = draft({ paid: true, paymentDate: '29/09/2026', amountPaidCents: 19000 });
  assert.deepEqual(summarizeDraft(late, context)?.badges, [{ text: `+ ${brl(2.6)} de multa e juros`, tone: 'warning' }]);

  const discounted = draft({ paid: true, paymentDate: '29/09/2026', amountPaidCents: 18000 });
  assert.deepEqual(summarizeDraft(discounted, context)?.badges, [{ text: `${brl(7.4)} de desconto`, tone: 'success' }]);
});

test('parcelas: total dividido em centavos, ajuste à mão e aviso de soma diferente', () => {
  const installments = draft({ billingType: 'installments', installmentCount: 3, amountCents: 10000 });
  assert.deepEqual(installmentAmounts(installments), [3333, 3333, 3334]);
  assert.equal(installmentMismatch(installments), null);

  const adjusted = { ...installments, installmentAdjustments: { 1: 3000 } };
  assert.deepEqual(installmentAmounts(adjusted), [3333, 3000, 3667]);

  const lastAdjusted = { ...installments, installmentAdjustments: { 2: 3500 } };
  assert.equal(installmentMismatch(lastAdjusted), `A soma das parcelas (${brl(101.66)}) difere do valor total informado (${brl(100)}).`);
});

test('grade de parcelas: atraso, juros e situação das abertas', () => {
  const installments = draft({
    billingType: 'installments', installmentCount: 3, amountCents: 10000, purchaseDate: '20/09/2026',
    installmentPayments: { 0: { paymentDate: '23/09/2026', amountPaidCents: 3400 } },
  });
  const grid = installmentGrid(installments, context);
  assert.equal(grid.rows[0]?.status, `3 dias de atraso · + ${brl(0.67)} de juros`);
  assert.equal(grid.rows[0]?.tone, 'warning');
  assert.equal(grid.rows[1]?.status, 'próxima');
  assert.equal(grid.rows[2]?.status, 'a vencer');
  assert.equal(grid.paidCents, 3400);
  assert.equal(grid.remainingCents, 6667);

  const card = installmentGrid(credit({ billingType: 'installments', installmentCount: 2, amountCents: 10000 }), context);
  assert.deepEqual(card.rows.map((row) => [row.invoiceMonth, row.status]), [['out/26', 'fatura aberta'], ['nov/26', 'futura']]);
});

test('validação aponta os campos e monta a mensagem do rodapé', () => {
  const empty = draft({ description: '', categoryId: null, amountCents: null });
  const emptyErrors = validateDraft(empty, context);
  assert.deepEqual(emptyErrors, { description: true, category: true, amount: true });
  assert.equal(errorMessage(emptyErrors), 'Preencha descrição, categoria e valor.');

  const noCard = validateDraft(credit({ cardId: null, description: '' }), context);
  assert.equal(errorMessage(noCard), 'Preencha descrição e escolha o cartão de crédito.');
  assert.equal(errorMessage(validateDraft(credit({ cardId: null }), { ...context, cards: [CAJU] })), '');

  const badDates = validateDraft(draft({ purchaseDate: '31/02/2026', dueDate: '05/13' }), context);
  assert.equal(errorMessage(badDates), 'Confira a data da compra e o vencimento.');
  // Campo ainda não completado (Enter antes de sair dele) vale como o campo completaria.
  assert.deepEqual(validateDraft(draft({ dueDate: '5' }), context), {});
  const typedDay = buildCreateInput(draft({ dueDate: '5' }), context, null);
  assert.ok(typedDay.billingType === 'single');
  assert.equal(typedDay.dueDate, '2026-09-05');

  const badDay = validateDraft(draft({ billingType: 'monthly', recurrenceDay: null }), context);
  assert.equal(errorMessage(badDay), 'Informe o dia do mês, de 1 a 31.');

  const negativeLast = validateDraft(draft({ billingType: 'installments', installmentCount: 3, amountCents: 10000, installmentAdjustments: { 0: 6000, 1: 6000 } }), context);
  assert.equal(errorMessage(negativeLast), 'Confira as parcelas.');
});

test('envio da despesa única: vencimento calculado e data real do pagamento', () => {
  const open = buildCreateInput(draft({ cardId: CAJU.id }), context, 17);
  assert.deepEqual(open, {
    description: 'Conta de luz', categoryId: 10, paymentMethod: 'pix', cardId: null, purchaseDate: '2026-09-29',
    invoiceNumber: null, invoiceDate: null, attachments: null, accountId: 17,
    billingType: 'single', amount: 187.4, dueDate: '2026-09-29', paid: false, paymentDate: null, amountPaid: null,
  });

  const paid = buildCreateInput(draft({ dueDate: '05/10/2026', paid: true, paymentDate: '01/10/2026', amountPaidCents: 19000 }), context, 17);
  assert.ok(paid.billingType === 'single');
  assert.equal(paid.dueDate, '2026-10-05');
  assert.equal(paid.paymentDate, '2026-10-01');
  assert.equal(paid.amountPaid, 190);
});

test('envio da mensal: dia 31 cai no último dia do mês curto', () => {
  const monthly = buildCreateInput(draft({ billingType: 'monthly', recurrenceDay: 31, purchaseDate: '10/02/2026' }), context, null);
  assert.ok(monthly.billingType === 'monthly');
  assert.equal(monthly.dueDate, '2026-02-28');
});

test('envio do parcelado: valores da grade, ajustes e pagamentos', () => {
  const pix = buildCreateInput(draft({
    billingType: 'installments', installmentCount: 3, amountCents: 10000, dueDate: '31/10/2026',
    installmentAdjustments: { 1: 3000 },
    installmentPayments: { 0: { paymentDate: '02/11/2026', amountPaidCents: 3400 }, 2: { paymentDate: '', amountPaidCents: null } },
  }), context, 17);
  assert.ok(pix.billingType === 'installments');
  assert.deepEqual(pix.installments, [
    { amount: 33.33, dueDate: '2026-10-31', paid: true, paymentDate: '2026-11-02', amountPaid: 34 },
    { amount: 30, dueDate: '2026-11-30', paid: false, paymentDate: null, amountPaid: null },
    { amount: 36.67, dueDate: '2026-12-31', paid: true, paymentDate: '2026-12-31', amountPaid: 36.67 },
  ]);

  const card = buildCreateInput(credit({
    billingType: 'installments', installmentCount: 2, amountCents: 10000,
    installmentPayments: { 0: { paymentDate: '15/10/2026', amountPaidCents: 9999 } },
  }), context, 17);
  assert.ok(card.billingType === 'installments');
  assert.equal(card.cardId, NUBANK.id);
  assert.deepEqual(card.installments[0], { amount: 50, dueDate: '2026-10-10', paid: true, paymentDate: '2026-10-10', amountPaid: 50 });
});

test('edição envia só os campos editáveis', () => {
  const input = buildUpdateInput(draft({ dueDate: '10/12/2026', paymentMethod: 'debito', cardId: CAJU.id }), context);
  assert.equal('billingType' in input, false);
  assert.equal(input.cardId, CAJU.id);
  assert.equal(input.dueDate, '2026-12-10');
});

test('duplicata no parcelado compara o valor da 1ª parcela e o nº de parcelas', () => {
  assert.deepEqual(duplicateQuery(draft({ billingType: 'installments', installmentCount: 3, amountCents: 10000 }), null), {
    description: 'Conta de luz', amount: 33.33, paymentMethod: 'pix', installmentCount: 3, excludeId: null,
  });
  assert.equal(duplicateQuery(draft({ amountCents: null }), null), null);
  assert.equal(duplicateQuery(draft(), 9)?.excludeId, 9);
});
