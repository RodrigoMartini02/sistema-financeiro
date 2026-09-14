import type { SlotId, SlotOption } from './assistantSlotFilling';

/**
 * Formato do fluxo de conversa desenhado na tela.
 *
 * O fluxo salvo e executado pelo motor, entao ele e codigo do ponto de vista
 * do assistente: `parseFlowDefinition` existe para que uma definicao vinda do
 * banco ou da rede nunca consiga preencher um slot desconhecido nem produzir
 * uma pergunta sem saida. Vale a mesma regra de parseSlotSessionState.
 */

/** Slots validos — espelha a union SlotId, checavel em runtime. */
export const KNOWN_SLOTS: readonly SlotId[] = [
  'description', 'category', 'paymentMethod', 'cardId', 'billingType',
  'installments', 'paidInstallments', 'amount', 'paid', 'amountPaid',
  'purchaseDate', 'dueDate', 'invoiceNumber', 'invoiceDate',
] as const;

export function isKnownSlot(value: unknown): value is SlotId {
  return typeof value === 'string' && (KNOWN_SLOTS as readonly string[]).includes(value);
}

/**
 * Origem das opcoes de um no.
 *
 * `estatica` cobre chips fixos (PIX/Dinheiro/...); `categorias` e `cartoes`
 * sao resolvidas no momento da pergunta a partir do catalogo da conta — sem
 * isso o fluxo teria de listar as categorias do usuario em disco, e mudaria a
 * cada cadastro novo.
 */
export type FlowOptionSource = 'estatica' | 'categorias' | 'cartoes';

/**
 * Condicao de aplicabilidade de um no, avaliada contra o rascunho.
 *
 * Deliberadamente restrita a comparacoes sobre campos do rascunho e duas
 * flags do contexto: um mini-interpretador de expressoes livres seria uma
 * porta aberta para o fluxo executar o que quisesse.
 */
export interface FlowCondition {
  /**
   * Campo do rascunho, 'kind' / 'isCompanyAccount' do contexto, ou
   * 'cartoesElegiveis' — a contagem de cartoes que servem para a forma de
   * pagamento escolhida. Esta ultima existe porque a pergunta de cartao muda
   * quando ha um so ("No cartao X, certo?" em vez de listar), e isso depende
   * do catalogo da conta, nao do rascunho.
   */
  campo: string;
  operador: 'igual' | 'diferente' | 'em' | 'preenchido' | 'vazio';
  valor?: string | number | boolean | Array<string | number | boolean>;
}

export interface FlowQuestionVariant {
  /** Aplicada quando todas as condicoes batem; a primeira que bater vence. */
  quando?: FlowCondition[];
  /** Texto com variaveis no formato {campo} — ver renderTemplate. */
  texto: string;
  opcoesSource?: FlowOptionSource;
  opcoes?: SlotOption[];
  isConfirmation?: boolean;
}

export interface FlowNode {
  id: string;
  slot: SlotId;
  /**
   * Variantes de pergunta do mesmo slot. Cobre "Entendi que e X, certo?" vs
   * "Como voce quer descrever?", que hoje sao um if dentro de buildQuestion.
   */
  variantes: FlowQuestionVariant[];
  /** Todas precisam bater para o no entrar no fluxo. Vazio = sempre aplica. */
  aplicaQuando?: FlowCondition[];
  skippable?: boolean;
  /** Slots zerados quando este e respondido (limpeza em cascata). */
  limpaAoResponder?: SlotId[];
  /** Passa pelo "certo?" antes de valer. */
  exigeConfirmacao?: boolean;
  /** Posicao no canvas; so o editor usa. */
  posicao?: { x: number; y: number };
}

/** Intencoes que a abertura oferece. Espelha FinancialCopilotIntentHint. */
export const FLOW_INTENTS = ['register_expense', 'register_income', 'ask'] as const;
export type FlowIntent = typeof FLOW_INTENTS[number];

export function isFlowIntent(value: unknown): value is FlowIntent {
  return typeof value === 'string' && (FLOW_INTENTS as readonly string[]).includes(value);
}

export interface FlowIntentOption {
  intent: FlowIntent;
  /** Texto do chip. */
  label: string;
  /** Fala do assistente logo apos a escolha, para a conversa nao ficar muda. */
  abertura: string;
}

/**
 * Primeira tela da conversa. Nao e um `FlowNode` porque nao preenche slot
 * nenhum nem consome resposta do parser: e a escolha que decide QUAL fluxo
 * vai rodar. Vivia no frontend como texto fixo, fora do alcance do editor.
 */
export interface FlowAbertura {
  saudacao: string;
  opcoes: FlowIntentOption[];
  /** Posicao no canvas; so o editor usa, igual a de FlowNode. */
  posicao?: { x: number; y: number };
}

export interface FlowDefinition {
  versaoFormato: 1;
  /** Ordem de avaliacao dos nos. As arestas do canvas derivam daqui. */
  ordem: string[];
  nos: FlowNode[];
  /** Sem estes o lancamento nao grava, por tipo de lancamento. */
  obrigatorios: { income: SlotId[]; expense: SlotId[] };
  /** Ausente nos fluxos gravados antes da abertura entrar no editor. */
  abertura?: FlowAbertura;
}

export class FlowDefinitionError extends Error {}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseCondition(raw: unknown): FlowCondition | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const campo = obj['campo'];
  const operador = obj['operador'];
  if (typeof campo !== 'string' || campo.length === 0) return null;
  if (operador !== 'igual' && operador !== 'diferente' && operador !== 'em'
    && operador !== 'preenchido' && operador !== 'vazio') return null;

  const condition: FlowCondition = { campo, operador };
  if ('valor' in obj) condition.valor = obj['valor'] as FlowCondition['valor'];
  return condition;
}

function parseOption(raw: unknown): SlotOption | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const label = obj['label'];
  const value = obj['value'];
  if (typeof label !== 'string' || typeof value !== 'string') return null;
  return { label: label.slice(0, 120), value: value.slice(0, 120) };
}

function parseVariant(raw: unknown): FlowQuestionVariant | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const texto = obj['texto'];
  if (typeof texto !== 'string' || texto.trim().length === 0) return null;

  const variant: FlowQuestionVariant = { texto: texto.slice(0, 500) };

  const quando = asArray(obj['quando']).map(parseCondition).filter((c): c is FlowCondition => c !== null);
  if (quando.length > 0) variant.quando = quando;

  const source = obj['opcoesSource'];
  if (source === 'estatica' || source === 'categorias' || source === 'cartoes') {
    variant.opcoesSource = source;
  }

  const opcoes = asArray(obj['opcoes']).map(parseOption).filter((o): o is SlotOption => o !== null);
  if (opcoes.length > 0) variant.opcoes = opcoes;

  if (obj['isConfirmation'] === true) variant.isConfirmation = true;

  return variant;
}

function parseNode(raw: unknown): FlowNode | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const id = obj['id'];
  const slot = obj['slot'];
  if (typeof id !== 'string' || id.length === 0) return null;
  // Slot fora da union nunca entra: o motor nao saberia o que preencher.
  if (!isKnownSlot(slot)) return null;

  const variantes = asArray(obj['variantes'])
    .map(parseVariant)
    .filter((v): v is FlowQuestionVariant => v !== null);
  if (variantes.length === 0) return null;

  const node: FlowNode = { id, slot, variantes };

  const aplicaQuando = asArray(obj['aplicaQuando'])
    .map(parseCondition)
    .filter((c): c is FlowCondition => c !== null);
  if (aplicaQuando.length > 0) node.aplicaQuando = aplicaQuando;

  if (obj['skippable'] === true) node.skippable = true;
  if (obj['exigeConfirmacao'] === true) node.exigeConfirmacao = true;

  const limpa = asArray(obj['limpaAoResponder']).filter(isKnownSlot);
  if (limpa.length > 0) node.limpaAoResponder = limpa;

  const posicao = obj['posicao'];
  if (typeof posicao === 'object' && posicao !== null) {
    const p = posicao as Record<string, unknown>;
    if (typeof p['x'] === 'number' && typeof p['y'] === 'number') {
      node.posicao = { x: p['x'], y: p['y'] };
    }
  }

  return node;
}

function parseRequiredSlots(raw: unknown): SlotId[] {
  return asArray(raw).filter(isKnownSlot);
}

function parseIntentOption(raw: unknown): FlowIntentOption | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  // Intencao fora da lista nunca entra: o backend nao saberia que fluxo rodar.
  if (!isFlowIntent(obj['intent'])) return null;

  const label = obj['label'];
  const abertura = obj['abertura'];
  if (typeof label !== 'string' || label.trim().length === 0) return null;
  if (typeof abertura !== 'string' || abertura.trim().length === 0) return null;

  return {
    intent: obj['intent'],
    label: label.slice(0, 60),
    abertura: abertura.slice(0, 300),
  };
}

/**
 * Abertura gravada. Ausente ou invalida devolve `undefined` — quem chama cai
 * na abertura padrao, em vez de o chat abrir sem saudacao nem botoes.
 */
function parseAbertura(raw: unknown): FlowAbertura | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;

  const saudacao = obj['saudacao'];
  if (typeof saudacao !== 'string' || saudacao.trim().length === 0) return undefined;

  const opcoes = asArray(obj['opcoes'])
    .map(parseIntentOption)
    .filter((o): o is FlowIntentOption => o !== null);
  if (opcoes.length === 0) return undefined;

  const abertura: FlowAbertura = { saudacao: saudacao.slice(0, 300), opcoes };

  // Mesma checagem de parseNode: posicao malformada e descartada em vez de
  // derrubar a abertura inteira — o canvas cai no fallback de layout.
  const posicao = obj['posicao'];
  if (typeof posicao === 'object' && posicao !== null) {
    const pos = posicao as Record<string, unknown>;
    if (typeof pos['x'] === 'number' && typeof pos['y'] === 'number') {
      abertura.posicao = { x: pos['x'], y: pos['y'] };
    }
  }

  return abertura;
}

/**
 * Valida e normaliza uma definicao vinda do banco ou da rede.
 *
 * Lanca em vez de devolver null: uma definicao corrompida precisa aparecer no
 * log com a razao, nao virar um fluxo silenciosamente vazio.
 */
export function parseFlowDefinition(raw: unknown): FlowDefinition {
  if (typeof raw !== 'object' || raw === null) {
    throw new FlowDefinitionError('Definição de fluxo ausente ou inválida.');
  }
  const obj = raw as Record<string, unknown>;

  if (obj['versaoFormato'] !== 1) {
    throw new FlowDefinitionError('Versão de formato de fluxo não suportada.');
  }

  const nos = asArray(obj['nos']).map(parseNode).filter((n): n is FlowNode => n !== null);
  if (nos.length === 0) {
    throw new FlowDefinitionError('Fluxo sem nós válidos.');
  }

  const idsVistos = new Set<string>();
  for (const no of nos) {
    if (idsVistos.has(no.id)) {
      throw new FlowDefinitionError(`Nó duplicado no fluxo: ${no.id}`);
    }
    idsVistos.add(no.id);
  }

  // Ordem so pode citar no existente; no fora da ordem nunca seria perguntado.
  const ordem = asArray(obj['ordem']).filter((id): id is string => typeof id === 'string' && idsVistos.has(id));
  if (ordem.length === 0) {
    throw new FlowDefinitionError('Fluxo sem ordem de execução válida.');
  }

  const obrigatoriosRaw = obj['obrigatorios'];
  const obrigatoriosObj = typeof obrigatoriosRaw === 'object' && obrigatoriosRaw !== null
    ? obrigatoriosRaw as Record<string, unknown>
    : {};

  const abertura = parseAbertura(obj['abertura']);

  return {
    versaoFormato: 1,
    ordem,
    nos,
    obrigatorios: {
      income: parseRequiredSlots(obrigatoriosObj['income']),
      expense: parseRequiredSlots(obrigatoriosObj['expense']),
    },
    ...(abertura ? { abertura } : {}),
  };
}
