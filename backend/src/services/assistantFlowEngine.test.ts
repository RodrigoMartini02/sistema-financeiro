import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptySlotDraft, type SlotCatalog, type SlotDraft } from './assistantSlotFilling';
import { AssistantFlowEngine } from './assistantFlowEngine';
import { DEFAULT_FLOW_DEFINITION, comAberturaPadrao } from './assistantFlowDefault';
import { parseFlowDefinition, FlowDefinitionError } from './assistantFlowSchema';

/**
 * Comportamento do motor que le o fluxo do banco.
 *
 * Os valores esperados aqui foram capturados do motor anterior, quando os dois
 * conviviam: cada assercao e o texto exato que o assistente dizia antes da
 * migracao. Mudar um deles e mudar a conversa — o que so deve acontecer de
 * proposito, pela tela de fluxo.
 */

const engine = new AssistantFlowEngine(DEFAULT_FLOW_DEFINITION);

function catalogo(overrides: Partial<SlotCatalog> = {}): SlotCatalog {
  return {
    categories: [{ id: 1, name: 'Mercado' }, { id: 2, name: 'Outros' }],
    cards: [{ id: 10, name: 'Nubank', type: 'credito' }, { id: 11, name: 'Inter', type: 'debito' }],
    isCompanyAccount: false,
    ...overrides,
  };
}

function despesa(overrides: Partial<SlotDraft> = {}): SlotDraft {
  return { ...createEmptySlotDraft('expense'), ...overrides };
}

/** Despesa a um passo da pergunta que o teste quer checar. */
function despesaBase(overrides: Partial<SlotDraft> = {}): SlotDraft {
  return despesa({
    description: 'x', category: 'Outros', paymentMethod: 'pix',
    billingType: 'nao', amount: 50, ...overrides,
  });
}

test('fluxo padrao e uma definicao valida', () => {
  const parsed = parseFlowDefinition(JSON.parse(JSON.stringify(DEFAULT_FLOW_DEFINITION)));
  assert.equal(parsed.nos.length, DEFAULT_FLOW_DEFINITION.nos.length);
  assert.deepEqual(parsed.ordem, DEFAULT_FLOW_DEFINITION.ordem);
});

test('despesa vazia comeca perguntando a descricao', () => {
  const pergunta = engine.nextQuestion(despesa(), catalogo());
  assert.equal(pergunta?.slot, 'description');
  assert.equal(pergunta?.question, 'Como você quer descrever esse lançamento?');
  assert.deepEqual(pergunta?.options, []);
  assert.equal(pergunta?.isConfirmation, false);
});

test('descricao preenchida vira confirmacao com o texto extraido', () => {
  const draft = despesa({ description: 'mercado' });

  // nextQuestion pula slot preenchido; a confirmacao vem por questionFor, que
  // e como buildStep a monta.
  assert.deepEqual(engine.pendingConfirmations(draft, []), ['description']);

  const pergunta = engine.questionFor('description', draft, catalogo());
  assert.equal(pergunta?.question, 'Entendi que é "mercado", certo?');
  assert.deepEqual(pergunta?.options, [{ label: 'Sim', value: 'sim' }, { label: 'Corrigir', value: 'corrigir' }]);
  assert.equal(pergunta?.isConfirmation, true);
});

test('categoria sugerida aparece como confirmacao', () => {
  const draft = despesa({ description: 'mercado', category: 'Mercado' });
  const pergunta = engine.questionFor('category', draft, catalogo());
  assert.equal(pergunta?.question, 'Categoria Mercado, certo? Foi assim nas outras vezes.');
  assert.deepEqual(pergunta?.options, [{ label: 'Sim', value: 'sim' }, { label: 'Trocar', value: 'corrigir' }]);
  assert.equal(pergunta?.isConfirmation, true);
});

test('categoria vazia lista as categorias da conta', () => {
  const pergunta = engine.nextQuestion(despesa({ description: 'x' }), catalogo());
  assert.equal(pergunta?.slot, 'category');
  assert.equal(pergunta?.question, 'E a categoria?');
  assert.deepEqual(pergunta?.options, [
    { label: 'Mercado', value: 'Mercado' },
    { label: 'Outros', value: 'Outros' },
  ]);
});

test('credito nao pergunta se ja foi paga', () => {
  const draft = despesaBase({ paymentMethod: 'credito', cardId: 10 });
  const noPaid = DEFAULT_FLOW_DEFINITION.nos.find((n) => n.slot === 'paid')!;
  assert.equal(engine.isNodeApplicable(noPaid, draft, catalogo()), false);

  // Vai direto ao vencimento: no credito paid fica nulo, e nulo !== true.
  assert.equal(engine.nextQuestion(draft, catalogo())?.slot, 'dueDate');
});

test('debito pergunta se ja foi paga', () => {
  const draft = despesaBase({ paymentMethod: 'debito', cardId: 11 });
  const pergunta = engine.nextQuestion(draft, catalogo());
  assert.equal(pergunta?.slot, 'paid');
  assert.equal(pergunta?.question, 'Já foi paga?');
  assert.deepEqual(pergunta?.options, [{ label: 'Sim', value: 'sim' }, { label: 'Não', value: 'nao' }]);
});

test('despesa paga pergunta o valor pago com o valor formatado no texto', () => {
  const pergunta = engine.nextQuestion(despesaBase({ paid: true }), catalogo());
  assert.equal(pergunta?.slot, 'amountPaid');
  // Montado com toLocaleString, e nao digitado: o separador entre "R$" e o
  // numero e espaco nao-quebravel (U+00A0), invisivel no editor.
  const moeda = (50).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  assert.equal(pergunta?.question, `Valor pago foram os mesmos ${moeda}?`);
  // O rotulo mostra moeda, mas o valor do chip volta cru: e ele que o parser le.
  assert.deepEqual(pergunta?.options, [{ label: 'Sim', value: '50' }, { label: 'Outro valor', value: 'corrigir' }]);
});

test('despesa nao paga pergunta o vencimento', () => {
  const pergunta = engine.nextQuestion(despesaBase({ paid: false }), catalogo());
  assert.equal(pergunta?.slot, 'dueDate');
  assert.equal(pergunta?.question, 'Para quando é o vencimento?');
});

test('parcelado pergunta em quantas vezes', () => {
  const draft = despesa({
    description: 'x', category: 'Outros', paymentMethod: 'credito',
    cardId: 10, billingType: 'parcelas',
  });
  assert.equal(engine.nextQuestion(draft, catalogo())?.question, 'Em quantas vezes?');
});

test('valor de parcela e de recorrencia tem textos proprios', () => {
  const parcelado = despesa({
    description: 'x', category: 'Outros', paymentMethod: 'credito',
    cardId: 10, billingType: 'parcelas', installments: 3, paidInstallments: 0,
  });
  assert.equal(engine.nextQuestion(parcelado, catalogo())?.question, 'Qual o valor da parcela?');

  const mensal = despesa({
    description: 'x', category: 'Outros', paymentMethod: 'pix', billingType: 'mensal',
  });
  assert.equal(engine.nextQuestion(mensal, catalogo())?.question, 'Qual o valor mensal?');

  const unica = despesa({
    description: 'x', category: 'Outros', paymentMethod: 'pix', billingType: 'nao',
  });
  assert.equal(engine.nextQuestion(unica, catalogo())?.question, 'Quanto foi?');
});

test('cartao unico e sugerido em vez de listado', () => {
  const cat = catalogo({ cards: [{ id: 10, name: 'Nubank', type: 'credito' }] });
  const draft = despesa({ description: 'x', category: 'Outros', paymentMethod: 'credito' });
  const pergunta = engine.nextQuestion(draft, cat);

  assert.equal(pergunta?.question, 'No cartão Nubank, certo?');
  assert.deepEqual(pergunta?.options, [{ label: 'Sim', value: '10' }, { label: 'Outro', value: 'corrigir' }]);
  assert.equal(pergunta?.isConfirmation, true);
});

test('varios cartoes elegiveis viram lista', () => {
  const cat = catalogo({
    cards: [
      { id: 10, name: 'Nubank', type: 'credito' },
      { id: 12, name: 'Itau', type: 'credito' },
    ],
  });
  const draft = despesa({ description: 'x', category: 'Outros', paymentMethod: 'credito' });
  const pergunta = engine.nextQuestion(draft, cat);

  assert.equal(pergunta?.question, 'Qual cartão?');
  assert.deepEqual(pergunta?.options, [
    { label: 'Nubank', value: '10' },
    { label: 'Itau', value: '12' },
  ]);
});

test('cartao de credito nao aparece em compra no debito', () => {
  const cat = catalogo({
    cards: [
      { id: 10, name: 'Nubank', type: 'credito' },
      { id: 11, name: 'Inter', type: 'debito' },
      { id: 12, name: 'Caixa', type: 'debito' },
    ],
  });
  const draft = despesa({ description: 'x', category: 'Outros', paymentMethod: 'debito' });
  const pergunta = engine.nextQuestion(draft, cat);

  // Dois cartoes de debito viram lista; o Nubank, de credito, fica de fora.
  assert.deepEqual(pergunta?.options, [
    { label: 'Inter', value: '11' },
    { label: 'Caixa', value: '12' },
  ]);
});

test('NF so aparece em conta empresa', () => {
  const draft = despesaBase({ paid: true, amountPaid: 50 });

  assert.equal(engine.nextQuestion(draft, catalogo({ isCompanyAccount: false })), null);

  const pergunta = engine.nextQuestion(draft, catalogo({ isCompanyAccount: true }));
  assert.equal(pergunta?.slot, 'invoiceNumber');
  assert.equal(pergunta?.skippable, true);
});

test('receita so pergunta descricao e valor', () => {
  const cat = catalogo();
  const vazia = createEmptySlotDraft('income');

  assert.equal(engine.nextQuestion(vazia, cat)?.slot, 'description');
  // Categoria e forma de pagamento nao entram: `receitas` nao tem essas colunas.
  assert.equal(engine.nextQuestion({ ...vazia, description: 'freela' }, cat)?.slot, 'amount');
  assert.equal(engine.nextQuestion({ ...vazia, description: 'freela', amount: 1200 }, cat), null);
});

test('slot pulado nao volta a ser perguntado', () => {
  const cat = catalogo({ isCompanyAccount: true });
  const draft = despesaBase({ paid: true, amountPaid: 50 });

  assert.equal(engine.nextQuestion(draft, cat)?.slot, 'invoiceNumber');
  assert.equal(engine.nextQuestion(draft, cat, ['invoiceNumber'])?.slot, 'invoiceDate');
  assert.equal(engine.nextQuestion(draft, cat, ['invoiceNumber', 'invoiceDate']), null);
});

test('descricao e categoria passam por confirmacao', () => {
  const draft = despesa({ description: 'mercado', category: 'Mercado' });
  assert.deepEqual(engine.pendingConfirmations(draft, []), ['description', 'category']);
  assert.deepEqual(engine.pendingConfirmations(draft, ['description']), ['category']);
  assert.deepEqual(engine.pendingConfirmations(draft, ['description', 'category']), []);
});

test('obrigatorios diferem entre receita e despesa', () => {
  assert.deepEqual(engine.missingRequiredSlots(despesa()), ['description', 'amount', 'paymentMethod']);
  assert.deepEqual(engine.missingRequiredSlots(createEmptySlotDraft('income')), ['description', 'amount']);
  assert.deepEqual(engine.missingRequiredSlots(despesaBase()), []);
});

test('rascunho completo encerra o fluxo', () => {
  const cat = catalogo();
  assert.equal(engine.isDraftComplete(despesa({ description: 'x' }), cat), false);
  assert.equal(engine.isDraftComplete(despesaBase({ paid: true, amountPaid: 50 }), cat), true);
});

test('dependentes de cada slot', () => {
  assert.deepEqual(engine.dependentsOf('paymentMethod'), ['cardId', 'paid', 'amountPaid', 'dueDate']);
  assert.deepEqual(engine.dependentsOf('billingType'), ['installments', 'paidInstallments']);
  assert.deepEqual(engine.dependentsOf('paid'), ['amountPaid', 'dueDate']);
  assert.deepEqual(engine.dependentsOf('amount'), ['amountPaid']);
  assert.deepEqual(engine.dependentsOf('description'), []);
});

test('definicao invalida e recusada em vez de virar fluxo vazio', () => {
  assert.throws(() => parseFlowDefinition(null), FlowDefinitionError);
  assert.throws(() => parseFlowDefinition({ versaoFormato: 99, nos: [], ordem: [] }), FlowDefinitionError);
  assert.throws(() => parseFlowDefinition({ versaoFormato: 1, nos: [], ordem: [] }), FlowDefinitionError);
});

test('no com slot desconhecido nao entra no fluxo', () => {
  const comLixo = {
    versaoFormato: 1,
    ordem: ['description', 'inventado'],
    obrigatorios: { income: ['description'], expense: ['description'] },
    nos: [
      { id: 'description', slot: 'description', variantes: [{ texto: 'oi' }] },
      { id: 'inventado', slot: 'rmRf', variantes: [{ texto: 'nao deveria existir' }] },
    ],
  };
  const parsed = parseFlowDefinition(comLixo);
  assert.equal(parsed.nos.length, 1);
  assert.deepEqual(parsed.ordem, ['description']);
});

test('fluxo editado muda a conversa sem tocar em codigo', () => {
  // O ponto da feature: trocar o texto e a ordem pelo dado, nao pelo deploy.
  const editado = parseFlowDefinition({
    versaoFormato: 1,
    ordem: ['amount', 'description'],
    obrigatorios: { income: ['description', 'amount'], expense: ['description', 'amount'] },
    nos: [
      { id: 'amount', slot: 'amount', variantes: [{ texto: 'Quanto custou?' }] },
      { id: 'description', slot: 'description', variantes: [{ texto: 'Com o que foi?' }] },
    ],
  });
  const custom = new AssistantFlowEngine(editado);

  // Valor agora vem primeiro, com o texto novo.
  assert.equal(custom.nextQuestion(despesa(), catalogo())?.question, 'Quanto custou?');
  assert.equal(custom.nextQuestion(despesa({ amount: 10 }), catalogo())?.question, 'Com o que foi?');
});

test('abertura preserva a posicao do canvas quando ela e valida', () => {
  const parsed = parseFlowDefinition({
    ...JSON.parse(JSON.stringify(DEFAULT_FLOW_DEFINITION)),
    abertura: {
      saudacao: 'Oi!',
      opcoes: [{ intent: 'register_expense', label: 'Despesa', abertura: 'Conta aí.' }],
      posicao: { x: 120, y: -260 },
    },
  });

  assert.deepEqual(parsed.abertura?.posicao, { x: 120, y: -260 });
});

test('posicao malformada e descartada sem derrubar a abertura', () => {
  // So a posicao e invalida: a saudacao e as opcoes seguem valendo, senao o
  // chat abriria sem botao por causa de um detalhe de desenho.
  const parsed = parseFlowDefinition({
    ...JSON.parse(JSON.stringify(DEFAULT_FLOW_DEFINITION)),
    abertura: {
      saudacao: 'Oi!',
      opcoes: [{ intent: 'register_expense', label: 'Despesa', abertura: 'Conta aí.' }],
      posicao: { x: 'esquerda', y: null },
    },
  });

  assert.equal(parsed.abertura?.posicao, undefined);
  assert.equal(parsed.abertura?.saudacao, 'Oi!');
  assert.equal(parsed.abertura?.opcoes.length, 1);
});

test('abertura sem posicao continua valida', () => {
  const parsed = parseFlowDefinition(JSON.parse(JSON.stringify(DEFAULT_FLOW_DEFINITION)));

  assert.equal(parsed.abertura?.posicao, undefined);
  assert.equal(parsed.abertura?.opcoes.length, 3);
});

test('fluxo gravado sem abertura recebe a padrao ao ser carregado', () => {
  // Fluxo da versao 1, anterior a abertura existir: o editor abria sem o no
  // de inicio e o canvas comecava no meio da conversa.
  const { abertura: _ignorado, ...semAbertura } = JSON.parse(
    JSON.stringify(DEFAULT_FLOW_DEFINITION),
  );

  const completado = comAberturaPadrao(semAbertura);

  assert.equal(completado.abertura?.opcoes.length, 3);
  assert.equal(completado.abertura?.saudacao, DEFAULT_FLOW_DEFINITION.abertura?.saudacao);
});

test('abertura propria nao e sobrescrita pela padrao', () => {
  const editada = {
    ...JSON.parse(JSON.stringify(DEFAULT_FLOW_DEFINITION)),
    abertura: {
      saudacao: 'E aí, o que manda?',
      opcoes: [{ intent: 'register_expense', label: 'Gastei', abertura: 'Conta aí.' }],
    },
  };

  const resultado = comAberturaPadrao(editada);

  assert.equal(resultado.abertura?.saudacao, 'E aí, o que manda?');
  assert.equal(resultado.abertura?.opcoes.length, 1);
});

test('completar a abertura nao altera nos, ordem nem obrigatorios', () => {
  const { abertura: _ignorado, ...semAbertura } = JSON.parse(
    JSON.stringify(DEFAULT_FLOW_DEFINITION),
  );

  const completado = comAberturaPadrao(semAbertura);

  assert.deepEqual(completado.ordem, DEFAULT_FLOW_DEFINITION.ordem);
  assert.deepEqual(completado.obrigatorios, DEFAULT_FLOW_DEFINITION.obrigatorios);
  assert.deepEqual(completado.nos, DEFAULT_FLOW_DEFINITION.nos);
});

test('fluxo v2 preserva as transicoes declaradas', () => {
  const parsed = parseFlowDefinition({
    versaoFormato: 2,
    ordem: ['paymentMethod', 'cardId', 'amount'],
    obrigatorios: { income: [], expense: [] },
    nos: [
      {
        id: 'paymentMethod',
        slot: 'paymentMethod',
        variantes: [{ texto: 'Como pagou?' }],
        transicoes: [
          { quando: 'credito', destino: 'cardId' },
          { quando: '*', destino: 'amount' },
        ],
      },
      { id: 'cardId', slot: 'cardId', variantes: [{ texto: 'Qual cartão?' }] },
      { id: 'amount', slot: 'amount', variantes: [{ texto: 'Quanto?' }] },
    ],
  });

  assert.equal(parsed.versaoFormato, 2);
  assert.deepEqual(parsed.nos[0]?.transicoes, [
    { quando: 'credito', destino: 'cardId' },
    { quando: '*', destino: 'amount' },
  ]);
});

test('transicao para no inexistente e descartada', () => {
  // Apontar para o vazio deixaria a conversa sem proxima pergunta.
  const parsed = parseFlowDefinition({
    versaoFormato: 2,
    ordem: ['amount'],
    obrigatorios: { income: [], expense: [] },
    nos: [
      {
        id: 'amount',
        slot: 'amount',
        variantes: [{ texto: 'Quanto?' }],
        transicoes: [
          { quando: 'x', destino: 'no-que-nao-existe' },
          { quando: 'y', destino: null },
        ],
      },
    ],
  });

  // Só a que aponta para null (encerrar) sobrevive.
  assert.deepEqual(parsed.nos[0]?.transicoes, [{ quando: 'y', destino: null }]);
});

test('versao de formato desconhecida continua sendo recusada', () => {
  assert.throws(
    () => parseFlowDefinition({ versaoFormato: 3, ordem: ['a'], nos: [] }),
    FlowDefinitionError,
  );
});
