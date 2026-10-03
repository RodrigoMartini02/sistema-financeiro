import assert from 'node:assert/strict';
import test from 'node:test';
import { cardsForPaymentMethod, type SlotCatalog } from './assistantSlotFilling';
import { seedDraftFromMessage } from './assistantSlotParser';
import { inferKind, inferKindWithOrigin } from './financialAssistant';

// Leitura da frase que preenche o card do assistente.

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

test('extrai valor por extenso, forma de pagamento e descricao da frase', () => {
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

test('cartao so de credito nao serve para compra no debito', () => {
  // "Miriam" e so credito: no debito sobra apenas o "Rodrigo".
  assert.deepEqual(cardsForPaymentMethod(catalog, 'debito').map((card) => card.name), ['Rodrigo']);
  assert.deepEqual(cardsForPaymentMethod(catalog, 'credito').map((card) => card.name), ['Rodrigo', 'Miriam']);
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

test('receita digitada livremente vira valor e descricao, sem forma de pagamento', () => {
  const draft = seedDraftFromMessage(inferKind('recebi 1200 do freela'), 'recebi 1200 do freela', catalog);
  assert.equal(draft.kind, 'income');
  assert.equal(draft.amount, 1200);
  assert.equal(draft.description, 'freela');
  assert.equal(draft.paymentMethod, null);
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

test('valor de compra parcelada nao e confundido com o numero de parcelas', () => {
  // "um celular" fazia o extrator de valor por extenso ler 1, e o numero antes
  // de "em 10x" nao era coberto por nenhuma extracao: o card abria com o valor
  // errado, que e pior que abrir vazio.
  const draft = seedDraftFromMessage('expense', 'comprei um celular 3000 em 10x no credito', catalog);

  assert.equal(draft.amount, 3000);
  assert.equal(draft.installments, 10);
  assert.equal(draft.billingType, 'parcelas');
});

test('valor antes do parcelamento e lido sem forma de pagamento na frase', () => {
  const draft = seedDraftFromMessage('expense', 'notebook 4500 em 12 vezes', catalog);

  assert.equal(draft.amount, 4500);
  assert.equal(draft.installments, 12);
});

test('valor por extenso continua valendo quando a frase nao tem digito', () => {
  // A correcao acima nao pode desligar a leitura por voz, onde o valor vem
  // escrito por extenso e nao ha numero na frase.
  const falado = seedDraftFromMessage('expense', 'gastei cinquenta reais no mercado', catalog);
  assert.equal(falado.amount, 50);

  const semNumero = seedDraftFromMessage('expense', 'comprei um cafe', catalog);
  assert.equal(semNumero.amount, 1);
});

test('frase sem sinal de tipo e marcada como palpite, nao como certeza', () => {
  // "freela 800" e "pix do cliente 500" sao receita na vida real, mas nada na
  // frase diz isso: viravam despesa com a mesma cara de certeza de "gastei 50".
  for (const frase of ['mercado 50', 'uber 25', 'freela 800', 'pix do cliente 500']) {
    assert.equal(inferKindWithOrigin(frase).origin, 'padrao', frase);
  }
});

test('verbo na frase decide o tipo sem precisar perguntar', () => {
  const despesa = inferKindWithOrigin('gastei 50 no mercado');
  assert.deepEqual(despesa, { kind: 'expense', origin: 'texto' });

  const receita = inferKindWithOrigin('recebi 1200 do freela');
  assert.deepEqual(receita, { kind: 'income', origin: 'texto' });

  const venda = inferKindWithOrigin('vendi a bicicleta 300');
  assert.deepEqual(venda, { kind: 'income', origin: 'texto' });
});

test('rascunho em andamento nao e palpite: o tipo ja foi decidido antes', () => {
  const comContexto = inferKindWithOrigin('mercado 50', { kind: 'income' });
  assert.deepEqual(comContexto, { kind: 'income', origin: 'texto' });
});

test('inferKind mantem o comportamento de sempre para quem so quer o tipo', () => {
  assert.equal(inferKind('gastei 50 no mercado'), 'expense');
  assert.equal(inferKind('recebi 1200 do freela'), 'income');
  assert.equal(inferKind('mercado 50'), 'expense');
});

test('boleto nao e forma de pagamento: a forma fica em aberto e o boleto segue na descricao', () => {
  const draft = seedDraftFromMessage('expense', 'paguei 120 no boleto da escola', catalog);
  assert.equal(draft.amount, 120);
  assert.equal(draft.paymentMethod, null);
});

test('parcela dita depois do parcelamento vira o total, como no modal do desktop', () => {
  // O card grava o valor como total e divide nas parcelas. "12 vezes de 250"
  // e o valor de cada parcela: o rascunho guarda 3000.
  const casos: Array<[string, number, number]> = [
    ['parcelei a tv em 12 vezes de 250', 3000, 12],
    ['comprei uma geladeira em 10x no credito de 300 reais', 3000, 10],
    ['10x de 300 no cartão', 3000, 10],
    ['camiseta em 3 parcelas de 49,90', 149.7, 3],
  ];
  for (const [frase, total, parcelas] of casos) {
    const draft = seedDraftFromMessage('expense', frase, catalog);
    assert.equal(draft.amount, total, frase);
    assert.equal(draft.installments, parcelas, frase);
    assert.equal(draft.billingType, 'parcelas', frase);
  }
});

test('valor dito antes do parcelamento continua sendo o total', () => {
  const casos: Array<[string, number, number]> = [
    ['comprei um celular 3000 em 10x no credito', 3000, 10],
    ['tênis 600 em 3x', 600, 3],
    ['comprei um notebook de 4.500,00 em 12 parcelas', 4500, 12],
  ];
  for (const [frase, total, parcelas] of casos) {
    const draft = seedDraftFromMessage('expense', frase, catalog);
    assert.equal(draft.amount, total, frase);
    assert.equal(draft.installments, parcelas, frase);
  }
});

test('descricao com acento no fim nao perde a ultima letra', () => {
  // Sem a flag `u`, o \b nao ve letra acentuada como letra: o "o" final de
  // "pão" saia como se fosse o artigo.
  assert.equal(seedDraftFromMessage('expense', 'comprei pão 10 reais', catalog).description, 'pão');
  assert.equal(seedDraftFromMessage('expense', 'gastei 30 no feijão', catalog).description, 'feijão');
});

test('"no cartão" e forma de pagar, nao descricao', () => {
  assert.equal(seedDraftFromMessage('expense', '10x de 300 no cartão', catalog).description, null);
  assert.equal(seedDraftFromMessage('expense', 'paguei 50 no cartão', catalog).description, null);
});
