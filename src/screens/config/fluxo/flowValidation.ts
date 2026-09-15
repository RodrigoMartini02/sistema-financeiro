import type { FlowDefinition, FlowNode } from '../../../services/assistantFlowService';
import { primeiroNoParaKind, ABERTURA_NODE_ID } from './flowBranches';

/**
 * Erros que o desenho nao revela sozinho.
 *
 * Ligar dois nos garante que o caminho existe, nao que a conversa funcione:
 * um chip cujo valor o parser nao entende fica bonito na tela e trava o
 * usuario no meio do fluxo. Estas checagens existem para aparecer no momento
 * em que se desenha, nao na primeira conversa real.
 */

export type FlowIssueSeverity = 'erro' | 'aviso';

export interface FlowIssue {
  nodeId: string | null;
  severity: FlowIssueSeverity;
  message: string;
}

/**
 * Valores que o parser reconhece por slot. Fora desta lista, o chip devolve
 * algo que `applySlotAnswer` nao sabe interpretar e a conversa responde
 * "Não peguei essa parte".
 *
 * Espelha os conjuntos de assistantSlotParser.ts. Slot ausente aqui aceita
 * texto livre e nao e checado.
 */
const VALORES_ACEITOS: Record<string, string[]> = {
  paymentMethod: ['pix', 'dinheiro', 'debito', 'credito', 'boleto'],
  billingType: ['nao', 'parcelas', 'mensal'],
  paid: ['sim', 'nao'],
};

/** Aceitos em qualquer slot: confirmacao, correcao e pulo. */
const VALORES_UNIVERSAIS = new Set([
  'sim', 's', 'isso', 'certo', 'correto', 'ok', 'confirmo', 'exato', 'positivo', 'pode',
  'nao', 'n', 'negativo', 'errado', 'incorreto',
  'corrigir', 'trocar', 'outro', 'outra', 'outro valor', 'mudar', 'alterar',
  'pular', 'nao sei', 'sem', 'nenhum', 'nenhuma', 'depois', 'deixa', 'skip',
  'criar',
]);

/** Sem estes o lancamento nao grava. */
const OBRIGATORIOS_POR_TIPO: Record<string, string[]> = {
  income: ['description', 'amount'],
  expense: ['description', 'amount', 'paymentMethod'],
};

function isTemplate(valor: string): boolean {
  return valor.includes('{') && valor.includes('}');
}

function validarChips(node: FlowNode): FlowIssue[] {
  const aceitos = VALORES_ACEITOS[node.slot];
  if (!aceitos) return [];

  const issues: FlowIssue[] = [];
  for (const variante of node.variantes) {
    for (const opcao of variante.opcoes ?? []) {
      // Template resolve em runtime (ex: {amount}); nao da para checar aqui.
      if (isTemplate(opcao.value)) continue;
      if (aceitos.includes(opcao.value)) continue;
      if (VALORES_UNIVERSAIS.has(opcao.value)) continue;

      issues.push({
        nodeId: node.id,
        severity: 'erro',
        message: `O chip "${opcao.label}" envia "${opcao.value}", que o assistente não reconhece neste campo. Aceitos: ${aceitos.join(', ')}.`,
      });
    }
  }
  return issues;
}

function validarVariantes(node: FlowNode): FlowIssue[] {
  const issues: FlowIssue[] = [];

  if (node.variantes.length === 0) {
    issues.push({ nodeId: node.id, severity: 'erro', message: 'Pergunta sem texto: o assistente não teria o que dizer.' });
    return issues;
  }

  // A ultima variante e o padrao; se ela tiver condicao, existe combinacao de
  // respostas em que nenhuma variante serve.
  const ultima = node.variantes[node.variantes.length - 1]!;
  if (ultima.quando && ultima.quando.length > 0) {
    issues.push({
      nodeId: node.id,
      severity: 'aviso',
      message: 'Todas as variantes têm condição. Deixe a última sem condição para servir de padrão.',
    });
  }

  for (const variante of node.variantes) {
    if (!variante.texto.trim()) {
      issues.push({ nodeId: node.id, severity: 'erro', message: 'Variante com texto vazio.' });
    }
  }

  return issues;
}

/**
 * Campo que depende de outro precisa ser perguntado depois dele. Cartao antes
 * da forma de pagamento fica valido no desenho e vazio na conversa: a lista de
 * cartoes sai da forma escolhida.
 */
function validarDependencias(definition: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const posicaoNaOrdem = new Map(definition.ordem.map((id, index) => [id, index]));
  const nodePorSlot = new Map(definition.nos.map((no) => [no.slot, no]));

  for (const node of definition.nos) {
    for (const condicao of node.aplicaQuando ?? []) {
      const nodeDoCampo = nodePorSlot.get(condicao.campo);
      if (!nodeDoCampo) continue;

      const posicaoAtual = posicaoNaOrdem.get(node.id);
      const posicaoDependencia = posicaoNaOrdem.get(nodeDoCampo.id);
      if (posicaoAtual === undefined || posicaoDependencia === undefined) continue;

      if (posicaoDependencia > posicaoAtual) {
        issues.push({
          nodeId: node.id,
          severity: 'erro',
          message: `Depende de "${condicao.campo}", que só é perguntado depois. Mova este campo para baixo.`,
        });
      }
    }
  }

  return issues;
}

/** Campo obrigatorio fora da ordem nunca seria perguntado. */
function validarObrigatorios(definition: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const slotsNaOrdem = new Set(
    definition.ordem
      .map((id) => definition.nos.find((no) => no.id === id)?.slot)
      .filter((slot): slot is string => slot !== undefined),
  );

  for (const [tipo, obrigatorios] of Object.entries(OBRIGATORIOS_POR_TIPO)) {
    for (const slot of obrigatorios) {
      if (!slotsNaOrdem.has(slot)) {
        issues.push({
          nodeId: null,
          severity: 'erro',
          message: `"${slot}" é obrigatório para ${tipo === 'income' ? 'receita' : 'despesa'}, mas não está no fluxo.`,
        });
      }
    }
  }

  return issues;
}

/** No fora da ordem existe no desenho mas nunca e alcancado. */
function validarOrfaos(definition: FlowDefinition): FlowIssue[] {
  const naOrdem = new Set(definition.ordem);
  return definition.nos
    .filter((no) => !naOrdem.has(no.id))
    .map((no) => ({
      nodeId: no.id,
      severity: 'aviso' as const,
      message: 'Fora do fluxo: nunca será perguntado.',
    }));
}

/** Id repetido faz a ordem apontar para o no errado. */
function validarIdsDuplicados(definition: FlowDefinition): FlowIssue[] {
  const vistos = new Set<string>();
  const issues: FlowIssue[] = [];

  for (const no of definition.nos) {
    if (vistos.has(no.id)) {
      issues.push({ nodeId: no.id, severity: 'erro', message: `Id repetido: ${no.id}` });
    }
    vistos.add(no.id);
  }

  return issues;
}

/**
 * Abertura: avisos, nunca erros.
 *
 * Fluxo sem abertura continua rodando — o backend cai na abertura padrao e o
 * chat abre normalmente. Marcar como erro travaria o botao Salvar por algo
 * que nao quebra a conversa.
 */
function validarAbertura(definition: FlowDefinition): FlowIssue[] {
  if (!definition.abertura) {
    return [{
      nodeId: null,
      severity: 'aviso',
      message: 'O fluxo não define a abertura; o chat vai abrir com a saudação padrão.',
    }];
  }

  const issues: FlowIssue[] = [];

  for (const opcao of definition.abertura.opcoes) {
    // A consulta sai do preenchimento guiado de proposito: nao ter destino
    // aqui e o comportamento correto, nao um caminho quebrado.
    if (opcao.intent === 'ask') continue;

    const kind = opcao.intent === 'register_expense' ? 'expense' : 'income';
    const destino = primeiroNoParaKind(definition, kind);
    if (!destino) {
      issues.push({
        nodeId: ABERTURA_NODE_ID,
        severity: 'aviso',
        message: `"${opcao.label}" não leva a nenhuma pergunta: nenhum nó se aplica a ${kind}.`,
      });
    }
  }

  return issues;
}

/**
 * O parser entende este valor para este slot?
 *
 * Usada enquanto se digita no painel: valor que o parser nao reconhece deixa
 * a conversa respondendo "Nao peguei essa parte" quando o usuario clica no
 * chip — erro que so aparece conversando, e e tarde.
 *
 * Template (`{amount}`) resolve em runtime e nao da para checar aqui.
 */
export function valorDeChipAceito(slot: string, valor: string): boolean {
  const aceitos = VALORES_ACEITOS[slot];
  if (!aceitos) return true;
  if (isTemplate(valor)) return true;

  const normalizado = valor.trim().toLowerCase();
  return aceitos.includes(normalizado) || VALORES_UNIVERSAIS.has(normalizado);
}

/** Valores que o parser entende para o slot, para sugerir no painel. */
export function valoresAceitosDoSlot(slot: string): string[] {
  return VALORES_ACEITOS[slot] ?? [];
}

/**
 * Transicoes desenhadas no canvas.
 *
 * Destino inexistente e ERRO: a conversa ficaria sem proxima pergunta. Ciclo
 * e AVISO, nao erro — `A -> B -> A` so trava se os dois nos continuarem
 * aplicaveis, e o motor ainda pula no ja preenchido.
 */
function validarTransicoes(definition: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const ids = new Set(definition.nos.map((no) => no.id));

  for (const no of definition.nos) {
    for (const transicao of no.transicoes ?? []) {
      if (transicao.destino !== null && !ids.has(transicao.destino)) {
        issues.push({
          nodeId: no.id,
          severity: 'erro',
          message: `A resposta "${transicao.quando}" aponta para um bloco que não existe.`,
        });
      }

      if (transicao.destino === no.id) {
        issues.push({
          nodeId: no.id,
          severity: 'aviso',
          message: `A resposta "${transicao.quando}" volta para a própria pergunta.`,
        });
      }
    }
  }

  return issues;
}

export function validateFlow(definition: FlowDefinition): FlowIssue[] {
  return [
    ...validarAbertura(definition),
    ...validarTransicoes(definition),
    ...validarIdsDuplicados(definition),
    ...validarObrigatorios(definition),
    ...validarOrfaos(definition),
    ...validarDependencias(definition),
    ...definition.nos.flatMap(validarVariantes),
    ...definition.nos.flatMap(validarChips),
  ];
}

export function issuesByNode(issues: FlowIssue[]): Map<string, FlowIssue[]> {
  const mapa = new Map<string, FlowIssue[]>();
  for (const issue of issues) {
    if (!issue.nodeId) continue;
    const lista = mapa.get(issue.nodeId) ?? [];
    lista.push(issue);
    mapa.set(issue.nodeId, lista);
  }
  return mapa;
}
