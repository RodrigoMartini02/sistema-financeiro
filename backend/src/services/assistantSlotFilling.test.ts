import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDraftDefaults,
  cardsForPaymentMethod,
  createEmptySlotDraft,
  nextSlotQuestion,
  pendingConfirmations,
  type SlotCatalog,
  type SlotDraft,
} from './assistantSlotFilling';
import { applySlotAnswer, seedDraftFromMessage } from './assistantSlotParser';
import { inferKind } from './financialAssistant';
import { advanceSlotSession } from './assistantSlotSession';

const catalog: SlotCatalog = {
  categories: [
    { id: 1, name: 'Alimentação' },
    { id: 2, name: 'Contas' },
  ],
  cards: [
    { id: 10, name: 'Rodrigo', type: 'ambos' },
    { id: 11, name: 'Miriam', type: 'credito' },
  ],
  isCompanyAccount: false,
};

const personalCatalog = catalog;
const companyCatalog: SlotCatalog = { ...catalog, isCompanyAccount: true };
const singleCardCatalog: SlotCatalog = { ...catalog, cards: [{ id: 10, name: 'Rodrigo', type: 'ambos' }] };

function expenseDraft(overrides: Partial<SlotDraft> = {}): SlotDraft {
  return { ...createEmptySlotDraft('expense'), ...overrides };
}

test('extrai valor por extenso e nao pergunta o que ja veio na frase', () => {
  const draft = seedDraftFromMessage('expense', 'paguei quatrocentos reais de internet no credito', catalog);
  assert.equal(draft.amount, 400);
  assert.equal(draft.paymentMethod, 'credito');
  assert.ok(draft.description);
});

test('extrai data relativa', () => {
  const hoje = seedDraftFromMessage('income', 'recebi 1200 do freela hoje', catalog);
  assert.ok(hoje.date);
  const semData = seedDraftFromMessage('income', 'recebi 1200 do freela', catalog);
  assert.equal(semData.date, null);
});

test('a descricao e sempre confirmada, mesmo extraida com clareza', () => {
  const draft = expenseDraft({ description: 'internet', amount: 400 });
  assert.deepEqual(pendingConfirmations(draft, []), ['description']);
  assert.deepEqual(pendingConfirmations(draft, ['description']), []);
});

test('credito nao pergunta se ja foi paga nem valor pago', () => {
  const draft = expenseDraft({
    description: 'internet', category: 'Contas', amount: 400,
    paymentMethod: 'credito', cardId: 10, billingType: 'nao',
  });
  const question = nextSlotQuestion(draft, catalog);
  assert.notEqual(question?.slot, 'paid');
  assert.notEqual(question?.slot, 'amountPaid');
});

test('despesa nao paga pergunta o vencimento', () => {
  const draft = expenseDraft({
    description: 'internet', category: 'Contas', amount: 400,
    paymentMethod: 'pix', billingType: 'nao', paid: false,
  });
  assert.equal(nextSlotQuestion(draft, catalog)?.slot, 'dueDate');
});

test('despesa paga pergunta valor pago e nao pergunta vencimento', () => {
  const draft = expenseDraft({
    description: 'mercado', category: 'Alimentação', amount: 120,
    paymentMethod: 'pix', billingType: 'nao', paid: true,
  });
  assert.equal(nextSlotQuestion(draft, catalog)?.slot, 'amountPaid');

  const comValorPago = { ...draft, amountPaid: 120 };
  assert.equal(nextSlotQuestion(comValorPago, catalog), null);
});

test('parcelamento pergunta parcelas e parcelas ja pagas', () => {
  const draft = expenseDraft({
    description: 'geladeira', category: 'Contas', amount: 300,
    paymentMethod: 'credito', cardId: 10, billingType: 'parcelas',
  });
  assert.equal(nextSlotQuestion(draft, catalog)?.slot, 'installments');

  const comParcelas = { ...draft, installments: 10 };
  assert.equal(nextSlotQuestion(comParcelas, catalog)?.slot, 'paidInstallments');
});

test('recorrencia nao pergunta dia nem preco a vista: o banco nao guarda nenhum dos dois', () => {
  const noPix = expenseDraft({
    description: 'aluguel', category: 'Contas', amount: 2000,
    paymentMethod: 'pix', billingType: 'mensal',
  });
  // Segue direto para "ja foi paga", sem perguntar o dia da recorrencia.
  assert.equal(nextSlotQuestion(noPix, catalog)?.slot, 'paid');

  const parcelado = expenseDraft({
    description: 'geladeira', category: 'Contas', amount: 300,
    paymentMethod: 'credito', cardId: 10, billingType: 'parcelas',
    installments: 10, paidInstallments: 0,
  });
  // Parcelado no credito vai direto ao vencimento, sem passar por preco a vista.
  assert.equal(nextSlotQuestion(parcelado, catalog)?.slot, 'dueDate');
});

test('NF so e oferecida em conta empresa', () => {
  const draft = expenseDraft({
    description: 'servico', category: 'Contas', amount: 500,
    paymentMethod: 'pix', billingType: 'nao', paid: true, amountPaid: 500,
  });
  assert.equal(nextSlotQuestion(draft, personalCatalog), null);
  assert.equal(nextSlotQuestion(draft, companyCatalog)?.slot, 'invoiceNumber');
});

test('cartao unico e sugerido em vez de listado', () => {
  const draft = expenseDraft({ description: 'internet', category: 'Contas', paymentMethod: 'credito' });
  const question = nextSlotQuestion(draft, singleCardCatalog);
  assert.equal(question?.slot, 'cardId');
  assert.equal(question?.isConfirmation, true);
});

test('cartoes de credito nao aparecem numa compra no debito', () => {
  // "Miriam" e so credito: sobra um cartao, e a pergunta vira confirmacao.
  const draft = expenseDraft({ description: 'mercado', category: 'Alimentação', paymentMethod: 'debito' });
  const question = nextSlotQuestion(draft, catalog);
  assert.equal(question?.slot, 'cardId');
  assert.equal(question?.isConfirmation, true);
  assert.equal(question?.question, 'No cartão Rodrigo, certo?');
  assert.deepEqual(cardsForPaymentMethod(catalog, 'debito').map((card) => card.name), ['Rodrigo']);
  assert.deepEqual(cardsForPaymentMethod(catalog, 'credito').map((card) => card.name), ['Rodrigo', 'Miriam']);
});

test('corrigir a forma de pagamento descarta o cartao ja escolhido', () => {
  const draft = expenseDraft({
    description: 'internet', category: 'Contas', amount: 400,
    paymentMethod: 'credito', cardId: 11,
  });
  const result = applySlotAnswer(draft, 'paymentMethod', 'debito', catalog);
  assert.equal(result.understood, true);
  assert.equal(result.draft.paymentMethod, 'debito');
  assert.equal(result.draft.cardId, null);
});

test('trocar o tipo de cobranca descarta as parcelas', () => {
  const draft = expenseDraft({ billingType: 'parcelas', installments: 10, paidInstallments: 2 });
  const result = applySlotAnswer(draft, 'billingType', 'nao repete', catalog);
  assert.equal(result.draft.billingType, 'nao');
  assert.equal(result.draft.installments, null);
  assert.equal(result.draft.paidInstallments, null);
});

test('categoria inexistente nao vira palpite: sobe como pedido de criacao', () => {
  const draft = expenseDraft({ description: 'mercado' });
  const result = applySlotAnswer(draft, 'category', 'categoria que nao existe', catalog);
  // Nao cai em "Outros" nem na categoria mais parecida: o rascunho segue vazio
  // e o nome pedido volta para o fluxo oferecer a criacao.
  assert.equal(result.draft.category, null);
  assert.equal(result.confirmed, null);
  assert.equal(result.categoryToCreate, 'categoria que nao existe');
});

test('resposta nao compreendida mantem o rascunho intacto', () => {
  const draft = expenseDraft({ description: 'mercado', amount: 50 });
  const result = applySlotAnswer(draft, 'amount', 'sei la', catalog);
  assert.equal(result.understood, false);
  assert.equal(result.draft.amount, 50);
});

test('pular deixa o campo em branco sem travar o fluxo', () => {
  const draft = expenseDraft({ billingType: 'parcelas', installments: 3 });
  const result = applySlotAnswer(draft, 'paidInstallments', 'pular', catalog);
  assert.equal(result.skipped, 'paidInstallments');
  assert.equal(result.draft.paidInstallments, null);
});

test('parcelas ja pagas nao passam do total', () => {
  const draft = expenseDraft({ billingType: 'parcelas', installments: 3 });
  assert.equal(applySlotAnswer(draft, 'paidInstallments', '5', catalog).understood, false);
  assert.equal(applySlotAnswer(draft, 'paidInstallments', '2', catalog).draft.paidInstallments, 2);
});

test('"em 3x" tambem responde a quantidade de parcelas', () => {
  const draft = expenseDraft({ description: 'geladeira' });
  const result = applySlotAnswer(draft, 'billingType', 'parcelei em 3x', catalog);
  assert.equal(result.draft.billingType, 'parcelas');
  assert.equal(result.draft.installments, 3);
});

test('o botao Sim do valor pago repete o valor da compra', () => {
  const draft = expenseDraft({ amount: 400, paid: true });
  const result = applySlotAnswer(draft, 'amountPaid', 'sim', catalog);
  assert.equal(result.draft.amountPaid, 400);
});

test('valor pago diferente do valor da compra e aceito', () => {
  const draft = expenseDraft({ amount: 400, paid: true });
  const result = applySlotAnswer(draft, 'amountPaid', '420', catalog);
  assert.equal(result.draft.amountPaid, 420);
});

test('corrigir a descricao a devolve para pergunta aberta', () => {
  const draft = expenseDraft({ description: 'internet' });
  const result = applySlotAnswer(draft, 'description', 'corrigir', catalog);
  assert.equal(result.reask, 'description');
  assert.equal(result.draft.description, null);
});

test('resposta aberta de descricao vale inteira', () => {
  const draft = expenseDraft();
  const result = applySlotAnswer(draft, 'description', 'mercado do mes', catalog);
  assert.equal(result.draft.description, 'mercado do mes');
  assert.equal(result.confirmed, 'description');
});

test('defaults completam data, cobranca e vencimento como o modal faz', () => {
  const draft = applyDraftDefaults(expenseDraft({ description: 'mercado', amount: 50, paymentMethod: 'pix', paid: true }));
  assert.ok(draft.date);
  assert.equal(draft.billingType, 'nao');
  assert.equal(draft.amountPaid, 50);
  assert.equal(draft.dueDate, draft.date);
});

test('no credito a despesa entra na fatura em vez de ser marcada paga', () => {
  const draft = applyDraftDefaults(expenseDraft({
    description: 'internet', amount: 400, paymentMethod: 'credito', cardId: 10, paid: true,
  }));
  assert.equal(draft.paid, false);
  assert.equal(draft.amountPaid, null);
});

test('receita so pergunta descricao, valor e data', () => {
  const draft = { ...createEmptySlotDraft('income'), description: 'freela', amount: 1200 };
  assert.equal(nextSlotQuestion(draft, catalog), null);
});

test('receita sem valor pergunta o valor', () => {
  const draft = { ...createEmptySlotDraft('income'), description: 'freela' };
  assert.equal(nextSlotQuestion(draft, catalog)?.slot, 'amount');
});

test('a descricao nao carrega valor, forma de pagamento nem data', () => {
  const casos: Array<[string, string]> = [
    ['paguei quatrocentos de internet no credito', 'internet'],
    ['gastei cinquenta reais no mercado hoje', 'mercado'],
    ['mercado do mes, 200 no pix, hoje', 'mercado do mes'],
    ['comprei uma geladeira em 10x no credito de 300 reais', 'geladeira'],
  ];
  for (const [frase, esperado] of casos) {
    assert.equal(seedDraftFromMessage('expense', frase, catalog).description, esperado, frase);
  }
});

test('valor por extenso sem a palavra reais', () => {
  assert.equal(seedDraftFromMessage('expense', 'paguei quatrocentos de internet no credito', catalog).amount, 400);
  assert.equal(seedDraftFromMessage('expense', 'paguei mil e duzentos de aluguel', catalog).amount, 1200);
});

test('valor grudado na forma de pagamento', () => {
  assert.equal(seedDraftFromMessage('expense', 'mercado do mes, 200 no pix, hoje', catalog).amount, 200);
});

test('numero solto nao vira valor sem verbo de gasto nem forma de pagamento', () => {
  assert.equal(seedDraftFromMessage('expense', 'dois mercados', catalog).amount, null);
});

test('responde o valor por extenso quando a pergunta e o valor', () => {
  const draft = expenseDraft({ description: 'internet' });
  assert.equal(applySlotAnswer(draft, 'amount', 'quatrocentos', catalog).draft.amount, 400);
});

test('a frase decide o tipo quando o usuario nao clicou no menu', () => {
  const receitas = [
    'recebi mil e duzentos do freela ontem',
    'salario caiu hoje 5000',
    'ganhei 300 de bonus',
    'vendi um movel por 800',
  ];
  for (const frase of receitas) assert.equal(inferKind(frase), 'income', frase);

  const despesas = [
    'paguei quatrocentos de internet no credito',
    'gastei cinquenta reais no mercado hoje',
    'mercado do mes, 200 no pix, hoje',
  ];
  for (const frase of despesas) assert.equal(inferKind(frase), 'expense', frase);
});

test('receita digitada livremente nao pergunta forma de pagamento', () => {
  const draft = seedDraftFromMessage(inferKind('recebi 1200 do freela'), 'recebi 1200 do freela', catalog);
  assert.equal(draft.kind, 'income');
  assert.equal(draft.amount, 1200);
  assert.equal(draft.description, 'freela');
  // Confirmada a descricao, uma receita completa vai direto para o card.
  assert.equal(nextSlotQuestion(draft, catalog), null);
});

test('a origem da receita vira descricao', () => {
  const casos: Array<[string, string]> = [
    ['recebi 1200 do freela', 'freela'],
    ['recebi mil e duzentos do freela ontem', 'freela'],
    ['ganhei 300 de bonus', 'bonus'],
  ];
  for (const [frase, esperado] of casos) {
    assert.equal(seedDraftFromMessage('income', frase, catalog).description, esperado, frase);
  }
});

test('categoria inexistente vira oferta de criacao, sem gravar nada', async () => {
  const state = {
    draft: expenseDraft({ description: 'academia' }),
    pendingSlot: 'category' as const,
    skipped: [],
    confirmed: ['description' as const],
  };
  const step = await advanceSlotSession({
    state,
    message: 'saude e bem estar',
    catalog,
    userId: 1,
    account: { id: 1, type: 'pessoal', name: 'Pessoal' },
  });

  assert.equal(step.state.pendingCategory, 'saude e bem estar');
  assert.equal(step.state.draft.category, null, 'nada e gravado no rascunho antes do sim');
  assert.ok(step.question?.question.includes('Quer criar?'), step.question?.question);
  assert.deepEqual(step.question?.options.map((option) => option.label), ['Criar', 'Escolher outra']);
});

test('recusar a criacao volta a perguntar a categoria', async () => {
  const state = {
    draft: expenseDraft({ description: 'academia' }),
    pendingSlot: 'category' as const,
    skipped: [],
    confirmed: ['description' as const],
    pendingCategory: 'saude e bem estar',
  };
  const step = await advanceSlotSession({
    state,
    message: 'nao',
    catalog,
    userId: 1,
    account: { id: 1, type: 'pessoal', name: 'Pessoal' },
  });

  assert.equal(step.state.pendingCategory, null);
  assert.equal(step.state.draft.category, null);
  assert.equal(step.question?.slot, 'category');
});
