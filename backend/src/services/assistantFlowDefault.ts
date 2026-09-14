import type { FlowDefinition } from './assistantFlowSchema';

/**
 * O fluxo que o assistente sempre teve, agora como dado.
 *
 * Tradução 1:1 do que estava em assistantSlotFilling.ts (SLOT_ORDER,
 * isSlotApplicable, buildQuestion, SLOT_DEPENDENTS, REQUIRED_SLOTS). Serve de
 * semente da tabela e de padrao para restaurar quando uma edicao der errado.
 *
 * Cuidados ao mexer aqui:
 * - `income` so pergunta descricao e valor porque a tabela `receitas` nao tem
 *   as demais colunas — nao e escolha de UX.
 * - No credito, "ja foi paga" e "valor pago" somem: quem paga e a fatura.
 * - As condicoes espelham o modal de despesa (ExpenseForm.tsx). Mudou la,
 *   mude aqui.
 */
export const DEFAULT_FLOW_DEFINITION: FlowDefinition = {
  versaoFormato: 1,
  // Textos que viviam fixos em FinancialAssistant.tsx. A escolha aqui decide
  // qual fluxo roda: despesa e receita seguem para o preenchimento guiado,
  // consulta sai para a via de perguntas livres.
  abertura: {
    saudacao: 'Olá! O que vamos fazer hoje?',
    opcoes: [
      { intent: 'register_expense', label: 'Lançar despesa', abertura: 'Beleza! Me conta o que você gastou.' },
      { intent: 'register_income', label: 'Lançar receita', abertura: 'Boa! Me conta o que você recebeu.' },
      { intent: 'ask', label: 'Consultar', abertura: 'Pode perguntar. O que você quer saber?' },
    ],
  },
  ordem: [
    'description', 'category', 'paymentMethod', 'cardId', 'billingType',
    'installments', 'paidInstallments', 'amount', 'paid', 'amountPaid',
    'dueDate', 'invoiceNumber', 'invoiceDate',
  ],
  obrigatorios: {
    income: ['description', 'amount'],
    expense: ['description', 'amount', 'paymentMethod'],
  },
  nos: [
    {
      id: 'description',
      slot: 'description',
      exigeConfirmacao: true,
      posicao: { x: 0, y: 0 },
      variantes: [
        {
          quando: [{ campo: 'description', operador: 'preenchido' }],
          texto: 'Entendi que é "{description}", certo?',
          opcoesSource: 'estatica',
          opcoes: [{ label: 'Sim', value: 'sim' }, { label: 'Corrigir', value: 'corrigir' }],
          isConfirmation: true,
        },
        { texto: 'Como você quer descrever esse lançamento?' },
      ],
    },
    {
      id: 'category',
      slot: 'category',
      exigeConfirmacao: true,
      aplicaQuando: [{ campo: 'kind', operador: 'igual', valor: 'expense' }],
      posicao: { x: 0, y: 190 },
      variantes: [
        {
          quando: [{ campo: 'category', operador: 'preenchido' }],
          texto: 'Categoria {category}, certo? Foi assim nas outras vezes.',
          opcoesSource: 'estatica',
          opcoes: [{ label: 'Sim', value: 'sim' }, { label: 'Trocar', value: 'corrigir' }],
          isConfirmation: true,
        },
        { texto: 'E a categoria?', opcoesSource: 'categorias' },
      ],
    },
    {
      id: 'paymentMethod',
      slot: 'paymentMethod',
      aplicaQuando: [{ campo: 'kind', operador: 'igual', valor: 'expense' }],
      limpaAoResponder: ['cardId', 'paid', 'amountPaid', 'dueDate'],
      posicao: { x: 0, y: 380 },
      variantes: [
        {
          texto: 'Como você pagou?',
          opcoesSource: 'estatica',
          opcoes: [
            { label: 'PIX', value: 'pix' },
            { label: 'Dinheiro', value: 'dinheiro' },
            { label: 'Débito', value: 'debito' },
            { label: 'Crédito', value: 'credito' },
          ],
        },
      ],
    },
    {
      id: 'cardId',
      slot: 'cardId',
      aplicaQuando: [
        { campo: 'kind', operador: 'igual', valor: 'expense' },
        { campo: 'paymentMethod', operador: 'em', valor: ['credito', 'debito'] },
      ],
      posicao: { x: 340, y: 570 },
      variantes: [
        {
          // Com um cartao so, listar seria pedir uma escolha que nao existe.
          quando: [{ campo: 'cartoesElegiveis', operador: 'igual', valor: 1 }],
          texto: 'No cartão {primeiroCartaoNome}, certo?',
          opcoesSource: 'estatica',
          opcoes: [{ label: 'Sim', value: '{primeiroCartaoId}' }, { label: 'Outro', value: 'corrigir' }],
          isConfirmation: true,
        },
        { texto: 'Qual cartão?', opcoesSource: 'cartoes' },
      ],
    },
    {
      id: 'billingType',
      slot: 'billingType',
      aplicaQuando: [{ campo: 'kind', operador: 'igual', valor: 'expense' }],
      limpaAoResponder: ['installments', 'paidInstallments'],
      posicao: { x: 0, y: 760 },
      variantes: [
        {
          texto: 'É uma cobrança única, parcelada ou recorrente?',
          opcoesSource: 'estatica',
          opcoes: [
            { label: 'Não repete', value: 'nao' },
            { label: 'Parcelado', value: 'parcelas' },
            { label: 'Recorrente', value: 'mensal' },
          ],
        },
      ],
    },
    {
      id: 'installments',
      slot: 'installments',
      aplicaQuando: [
        { campo: 'kind', operador: 'igual', valor: 'expense' },
        { campo: 'billingType', operador: 'igual', valor: 'parcelas' },
      ],
      posicao: { x: 340, y: 950 },
      variantes: [{ texto: 'Em quantas vezes?' }],
    },
    {
      id: 'paidInstallments',
      slot: 'paidInstallments',
      skippable: true,
      aplicaQuando: [
        { campo: 'kind', operador: 'igual', valor: 'expense' },
        { campo: 'billingType', operador: 'igual', valor: 'parcelas' },
      ],
      posicao: { x: 340, y: 1140 },
      variantes: [{ texto: 'Quantas parcelas você já pagou?' }],
    },
    {
      id: 'amount',
      slot: 'amount',
      limpaAoResponder: ['amountPaid'],
      posicao: { x: 0, y: 1330 },
      variantes: [
        { quando: [{ campo: 'billingType', operador: 'igual', valor: 'parcelas' }], texto: 'Qual o valor da parcela?' },
        { quando: [{ campo: 'billingType', operador: 'igual', valor: 'mensal' }], texto: 'Qual o valor mensal?' },
        { texto: 'Quanto foi?' },
      ],
    },
    {
      id: 'paid',
      slot: 'paid',
      // No credito quem paga e a fatura, entao a pergunta nao faz sentido.
      aplicaQuando: [
        { campo: 'kind', operador: 'igual', valor: 'expense' },
        { campo: 'paymentMethod', operador: 'diferente', valor: 'credito' },
      ],
      limpaAoResponder: ['amountPaid', 'dueDate'],
      posicao: { x: 0, y: 1520 },
      variantes: [
        {
          texto: 'Já foi paga?',
          opcoesSource: 'estatica',
          opcoes: [{ label: 'Sim', value: 'sim' }, { label: 'Não', value: 'nao' }],
        },
      ],
    },
    {
      id: 'amountPaid',
      slot: 'amountPaid',
      aplicaQuando: [
        { campo: 'kind', operador: 'igual', valor: 'expense' },
        { campo: 'paymentMethod', operador: 'diferente', valor: 'credito' },
        { campo: 'paid', operador: 'igual', valor: true },
      ],
      posicao: { x: 340, y: 1710 },
      variantes: [
        {
          quando: [{ campo: 'amount', operador: 'preenchido' }],
          texto: 'Valor pago foram os mesmos {amount}?',
          opcoesSource: 'estatica',
          // O valor do botao carrega o proprio valor da compra.
          opcoes: [{ label: 'Sim', value: '{amount}' }, { label: 'Outro valor', value: 'corrigir' }],
          isConfirmation: true,
        },
        { texto: 'Quanto você pagou?' },
      ],
    },
    {
      id: 'dueDate',
      slot: 'dueDate',
      // `diferente de true` e nao `igual a false`: no credito paid fica nulo e
      // o vencimento continua sendo perguntado.
      aplicaQuando: [
        { campo: 'kind', operador: 'igual', valor: 'expense' },
        { campo: 'paid', operador: 'diferente', valor: true },
      ],
      posicao: { x: 0, y: 1900 },
      variantes: [{ texto: 'Para quando é o vencimento?' }],
    },
    {
      id: 'invoiceNumber',
      slot: 'invoiceNumber',
      skippable: true,
      aplicaQuando: [
        { campo: 'kind', operador: 'igual', valor: 'expense' },
        { campo: 'isCompanyAccount', operador: 'igual', valor: true },
      ],
      posicao: { x: 0, y: 2090 },
      variantes: [{ texto: 'Tem número de nota fiscal?' }],
    },
    {
      id: 'invoiceDate',
      slot: 'invoiceDate',
      skippable: true,
      aplicaQuando: [
        { campo: 'kind', operador: 'igual', valor: 'expense' },
        { campo: 'isCompanyAccount', operador: 'igual', valor: true },
      ],
      posicao: { x: 0, y: 2280 },
      variantes: [{ texto: 'Qual a data de emissão da nota?' }],
    },
  ],
};
