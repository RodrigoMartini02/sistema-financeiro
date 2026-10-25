import assert from 'node:assert/strict';
import test from 'node:test';
import type { Cartao } from '../../../types/config';
import type { Expense } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import {
  createDraft, dialogReducer, draftFromExpense, initialDialogState, withRecurringOnCredit, type ExpenseDraft,
} from './draftState';
import {
  billingLockReason, buildCreateInput, buildUpdateInput, canBeRecurring, duplicateQuery, errorMessage, installmentAmounts, installmentGrid,
  installmentMismatch, installmentsTotal, markOverdueAsPaid, summarizeDraft, validateDraft, type RuleContext,
} from './draftRules';

const TODAY = '2026-09-29';
const NUBANK: Cartao = { id: 1, nome: 'Nubank', ativo: true, tipo: 'credito', dia_fechamento: 3, dia_vencimento: 10 };
const CAJU: Cartao = { id: 2, nome: 'Caju', ativo: true, tipo: 'debito' };
const context: RuleContext = { todayIso: TODAY, cards: [NUBANK, CAJU] };

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    ...createDraft({ paymentMethod: 'pix', cardId: null, purchaseDate: '29/09/2026', paymentMethodTouched: false }),
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

test('edição da despesa à vista vencida e não paga: não vira "Pago" sozinha, só na criação', () => {
  const editing: RuleContext = { ...context, editing: true, savedDueDate: '2026-09-10' };
  // Vencida há 19 dias, desmarcada como paga: continua em aberto.
  const unpaid = summarizeDraft(draft({ dueDate: '10/09/2026' }), editing);
  assert.equal(unpaid?.status, 'Agendado');
  assert.equal(unpaid?.dueText, 'Vence 10/09 · data informada');
  // Marcada como paga: aí sim "Pago".
  assert.equal(summarizeDraft(draft({ dueDate: '10/09/2026', paid: true, paymentDate: '10/09/2026' }), editing)?.status, 'Pago');
  // Na criação, a mesma despesa nasce paga (regra de sempre).
  assert.equal(summarizeDraft(draft({ dueDate: '10/09/2026' }), context)?.status, 'Pago');
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
  const overdue = draft({ billingType: 'installments', installmentCount: 4, amountCents: 10000, purchaseDate: '10/07/2026' });
  const first = summarizeDraft(overdue, context);
  assert.equal(first?.status, 'Com vencidas');
  assert.deepEqual(first?.badges, [{ text: '3 vencidas em aberto', tone: 'danger' }]);
  assert.equal(first?.totalText, `4x de ${brl(100)} = ${brl(400)} · próxima vence 10/07`);

  const marked = { ...overdue, ...markOverdueAsPaid(overdue, context) };
  const second = summarizeDraft(marked, context);
  assert.equal(second?.status, 'Em andamento');
  assert.equal(second?.totalText, `4x de ${brl(100)} = ${brl(400)} · 3 pagas · próxima vence 10/10`);

  const allPaid = { ...marked, installmentPayments: { ...marked.installmentPayments, 3: { paymentDate: '10/10/2026', amountPaidCents: null } } };
  assert.equal(summarizeDraft(allPaid, context)?.status, 'Pago');
  assert.match(summarizeDraft(allPaid, context)!.totalText, /quitado/);
});

test('sem descrição ou sem valor não há resumo', () => {
  assert.equal(summarizeDraft(draft({ description: ' ' }), context), null);
  assert.equal(summarizeDraft(draft({ amountCents: null }), context), null);
});

test('badges: juros embutido, multa e juros, desconto', () => {
  const withCashPrice = credit({ billingType: 'installments', installmentCount: 10, amountCents: 12000, cashPriceCents: 100000 });
  assert.deepEqual(summarizeDraft(withCashPrice, context)?.badges, [{ text: `+ ${brl(200)} de juros (20,0%) · entra em juros e taxas`, tone: 'warning' }]);

  // À vista igual ou maior que a soma das parcelas: não há juros para avisar.
  assert.deepEqual(summarizeDraft({ ...withCashPrice, cashPriceCents: 120000 }, context)?.badges, []);
  assert.deepEqual(summarizeDraft({ ...withCashPrice, cashPriceCents: 150000 }, context)?.badges, []);

  const late = draft({ paid: true, paymentDate: '29/09/2026', amountPaidCents: 19000 });
  assert.deepEqual(summarizeDraft(late, context)?.badges, [{ text: `+ ${brl(2.6)} de multa e juros`, tone: 'warning' }]);

  const discounted = draft({ paid: true, paymentDate: '29/09/2026', amountPaidCents: 18000 });
  assert.deepEqual(summarizeDraft(discounted, context)?.badges, [{ text: `${brl(7.4)} de desconto`, tone: 'success' }]);
});

test('edição de parcela: o resumo mostra o juros embutido gravado, à parte do multa e juros do pago a mais', () => {
  const editing: RuleContext = { ...context, editing: true, savedInterest: 5 };
  assert.deepEqual(summarizeDraft(draft({ dueDate: '05/10/2026' }), editing)?.badges, [{ text: `inclui ${brl(5)} de juros`, tone: 'neutral' }]);

  const paidMore = draft({ paid: true, paymentDate: '29/09/2026', amountPaidCents: 19000 });
  assert.deepEqual(summarizeDraft(paidMore, editing)?.badges, [
    { text: `+ ${brl(2.6)} de multa e juros`, tone: 'warning' },
    { text: `inclui ${brl(5)} de juros`, tone: 'neutral' },
  ]);

  // Sem juros gravado (nulo, zero ou contexto sem o campo, como o do assistente): nada a mostrar.
  for (const savedInterest of [null, 0, undefined]) {
    assert.deepEqual(summarizeDraft(draft({ dueDate: '05/10/2026' }), { ...editing, savedInterest })?.badges, []);
  }
});

test('Cobrança fixa na edição: o motivo muda com a parcelada', () => {
  assert.equal(
    billingLockReason({ parcelado: true }),
    'A cobrança não muda na edição: para mudar o nº de parcelas, exclua e lance de novo.',
  );
  assert.equal(
    billingLockReason({ parcelado: false }),
    'A cobrança não muda na edição: para trocá-la, exclua e lance de novo.',
  );
});

test('valor informado "Total": total dividido em centavos, ajuste à mão e aviso de soma diferente', () => {
  const installments = draft({ billingType: 'installments', installmentCount: 3, amountCents: 10000, amountIsTotal: true });
  assert.deepEqual(installmentAmounts(installments), [3333, 3333, 3334]);
  assert.equal(installmentMismatch(installments), null);

  const adjusted = { ...installments, installmentAdjustments: { 1: 3000 } };
  assert.deepEqual(installmentAmounts(adjusted), [3333, 3000, 3667]);

  const lastAdjusted = { ...installments, installmentAdjustments: { 2: 3500 } };
  assert.equal(installmentMismatch(lastAdjusted), `A soma das parcelas (${brl(101.66)}) difere do valor total informado (${brl(100)}).`);
});

test('valor da parcela: cada parcela vale o digitado, o total é a soma e o ajuste não mexe nas outras', () => {
  const perInstallment = draft({ billingType: 'installments', installmentCount: 3, amountCents: 24000 });
  assert.deepEqual(installmentAmounts(perInstallment), [24000, 24000, 24000]);
  assert.equal(installmentsTotal(perInstallment), 72000);
  assert.equal(summarizeDraft(perInstallment, context)?.totalText, `3x de ${brl(240)} = ${brl(720)} · próxima vence 29/09`);

  const adjusted = { ...perInstallment, installmentAdjustments: { 1: 25000 } };
  assert.deepEqual(installmentAmounts(adjusted), [24000, 25000, 24000]);
  assert.equal(summarizeDraft(adjusted, context)?.totalText, `3x = ${brl(730)} · próxima vence 29/09`);
  // Sem total digitado, não há soma diferente para avisar.
  assert.equal(installmentMismatch(adjusted), null);

  const input = buildCreateInput(perInstallment, context, null);
  assert.ok(input.billingType === 'installments');
  assert.deepEqual(input.installments.map((installment) => installment.amount), [240, 240, 240]);
});

test('valor informado "Total": R$ 720 em 3x dá 3x de R$ 240', () => {
  const total = draft({ billingType: 'installments', installmentCount: 3, amountCents: 72000, amountIsTotal: true });
  assert.deepEqual(installmentAmounts(total), [24000, 24000, 24000]);
  assert.equal(summarizeDraft(total, context)?.totalText, `3x de ${brl(240)} = ${brl(720)} · próxima vence 29/09`);
});

test('valor à vista vai no pedido só do parcelado e só quando informado', () => {
  const withCash = draft({ billingType: 'installments', installmentCount: 12, amountCents: 100000, cashPriceCents: 1000000 });
  const input = buildCreateInput(withCash, context, null);
  assert.ok(input.billingType === 'installments');
  assert.equal(input.cashPrice, 10000);
  assert.equal(input.installments.length, 12);

  const withoutCash = buildCreateInput({ ...withCash, cashPriceCents: null }, context, null);
  assert.ok(withoutCash.billingType === 'installments');
  assert.equal(withoutCash.cashPrice, null);

  // Despesa única e mensal ignoram o valor à vista que sobrou no rascunho.
  const single = buildCreateInput({ ...withCash, billingType: 'single' }, context, null);
  assert.equal('cashPrice' in single, false);
});

test('grade de parcelas: atraso, juros e situação das abertas', () => {
  const installments = draft({
    billingType: 'installments', installmentCount: 3, amountCents: 10000, amountIsTotal: true, purchaseDate: '20/09/2026',
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

  // A recorrente é do cartão de crédito: no Pix, ou sem cartão de crédito cadastrado, é recusada.
  const recurringMessage = 'A recorrente é só no cartão de crédito.';
  assert.equal(errorMessage(validateDraft(draft({ billingType: 'monthly' }), context)), recurringMessage);
  assert.equal(errorMessage(validateDraft(credit({ billingType: 'monthly', cardId: null }), { ...context, cards: [CAJU] })), recurringMessage);
  // No crédito sem o cartão escolhido, aponta o cartão.
  assert.equal(errorMessage(validateDraft(credit({ billingType: 'monthly', cardId: null }), context)), 'Escolha o cartão de crédito.');
  assert.deepEqual(validateDraft(credit({ billingType: 'monthly' }), context), {});

  const negativeLast = validateDraft(draft({
    billingType: 'installments', installmentCount: 3, amountCents: 10000, amountIsTotal: true, installmentAdjustments: { 0: 6000, 1: 6000 },
  }), context);
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

test('envio da mensal: no crédito com cartão, com o vencimento pela fatura', () => {
  const monthly = buildCreateInput(credit({ billingType: 'monthly', purchaseDate: '17/10/2026' }), context, null);
  assert.ok(monthly.billingType === 'monthly');
  assert.equal(monthly.cardId, NUBANK.id);
  assert.equal(monthly.dueDate, '2026-11-10');
  assert.equal(summarizeDraft(credit({ billingType: 'monthly' }), context)?.totalText, `${brl(187.4)} · todo mês na fatura Nubank · até dezembro`);
});

test('recorrente só no crédito: a opção depende de cartão de crédito, e a forma fora do crédito volta para não repete', () => {
  assert.equal(canBeRecurring(credit(), [NUBANK, CAJU]), true);
  assert.equal(canBeRecurring(draft(), [NUBANK, CAJU]), false);
  assert.equal(canBeRecurring(credit({ cardId: null }), [CAJU]), false);
  assert.equal(withRecurringOnCredit(draft({ billingType: 'monthly' })).billingType, 'single');
  assert.equal(withRecurringOnCredit(credit({ billingType: 'monthly' })).billingType, 'monthly');

  // Trocar a forma (linha, barra "Lançando em" ou sugestão do histórico) passa pelo reducer.
  const state = initialDialogState(credit({ billingType: 'monthly' }));
  const toPix = dialogReducer(state, { type: 'update', key: state.entry.key, patch: { paymentMethod: 'pix', cardId: null } });
  assert.equal(toPix.entry.billingType, 'single');
  const suggested = dialogReducer(state, { type: 'applySuggestion', key: state.entry.key, patch: { paymentMethod: 'debito', cardId: CAJU.id } });
  assert.equal(suggested.entry.billingType, 'single');
  const otherCard = dialogReducer(state, { type: 'update', key: state.entry.key, patch: { cardId: null } });
  assert.equal(otherCard.entry.billingType, 'monthly');
});

test('envio do parcelado: valores da grade, ajustes e pagamentos', () => {
  const pix = buildCreateInput(draft({
    billingType: 'installments', installmentCount: 3, amountCents: 10000, amountIsTotal: true, dueDate: '31/10/2026',
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
    billingType: 'installments', installmentCount: 2, amountCents: 10000, amountIsTotal: true,
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

/** Despesa gravada como a API entrega, só com o que a edição lê. */
function savedExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 7, descricao: 'Conta de luz', valorFinal: 100, categoria: 'Casa', categoriaId: 10, formaPagamento: 'pix', cartaoId: null,
    dataVencimento: '2026-09-10', dataCompra: '2026-09-01', dataPagamento: '2026-09-10', mes: 8, ano: 2026, status: 'ativa',
    pago: true, valorPago: 100, recorrente: false, parcelado: false, anexos: null, numeroNf: null, dataEmissaoNf: null,
    ...overrides,
  } as Expense;
}

const editContext: RuleContext = { ...context, editing: true, savedDueDate: '2026-09-10' };

test('edição de linha paga com o valor pago exato: o valor pago antigo volta no campo e é reenviado ao mudar o valor', () => {
  const edited = { ...draftFromExpense(savedExpense()), amountCents: 12000 };
  assert.equal(edited.amountPaidCents, 10000);
  const input = buildUpdateInput(edited, editContext);
  assert.equal(input.amount, 120);
  assert.equal(input.paid, true);
  assert.equal(input.paymentDate, '2026-09-10');
  // O realizado do mês não muda em silêncio: os R$ 100,00 pagos seguem.
  assert.equal(input.amountPaid, 100);
  // O resumo mostra a diferença, para o dono perceber e corrigir o "Valor pago" se quiser.
  assert.deepEqual(summarizeDraft(edited, editContext)?.badges, [{ text: `${brl(20)} de desconto`, tone: 'success' }]);
});

test('edição de linha paga antiga, sem valor pago gravado: vale o valor antigo da despesa, que é reenviado', () => {
  const legacy = draftFromExpense(savedExpense({ valorPago: null }));
  assert.equal(legacy.amountPaidCents, 10000);
  assert.equal(buildUpdateInput({ ...legacy, amountCents: 12000 }, editContext).amountPaid, 100);
});

test('edição de linha paga com juros ou desconto: o valor pago gravado continua', () => {
  assert.equal(draftFromExpense(savedExpense({ valorPago: 110 })).amountPaidCents, 11000);
  assert.equal(draftFromExpense(savedExpense({ valorPago: 95.5 })).amountPaidCents, 9550);
});

test('edição: o dono corrige o valor pago apagando o campo (vale o valor novo) ou digitando outro', () => {
  const edited = { ...draftFromExpense(savedExpense()), amountCents: 12000 };
  assert.equal(buildUpdateInput({ ...edited, amountPaidCents: null }, editContext).amountPaid, null);
  assert.equal(buildUpdateInput({ ...edited, amountPaidCents: 12000 }, editContext).amountPaid, 120);
});

test('edição de linha em aberto: sem pagamento, sem valor pago; desmarcar "paga" manda tudo em branco', () => {
  const open = draftFromExpense(savedExpense({ pago: false, valorPago: null, dataPagamento: null }));
  assert.equal(open.paid, false);
  assert.equal(open.paymentDate, '');
  assert.equal(open.amountPaidCents, null);
  const unmarked = { ...draftFromExpense(savedExpense()), paid: false, paymentDate: '', amountPaidCents: null };
  const input = buildUpdateInput(unmarked, editContext);
  assert.deepEqual([input.paid, input.paymentDate, input.amountPaid], [false, null, null]);
  assert.equal(input.dueDate, '2026-09-10');
});

test('duplicata no parcelado compara o valor da 1ª parcela e o nº de parcelas', () => {
  assert.deepEqual(duplicateQuery(draft({ billingType: 'installments', installmentCount: 3, amountCents: 10000, amountIsTotal: true }), null), {
    description: 'Conta de luz', amount: 33.33, paymentMethod: 'pix', installmentCount: 3, excludeId: null,
  });
  assert.equal(duplicateQuery(draft({ amountCents: null }), null), null);
  assert.equal(duplicateQuery(draft(), 9)?.excludeId, 9);
});
