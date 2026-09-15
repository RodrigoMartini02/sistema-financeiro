import type { FlowCondition, FlowDefinition, FlowNode } from '../../../services/assistantFlowService';

/**
 * Descobre para onde cada resposta leva, simulando o rascunho.
 *
 * As condicoes de aplicabilidade ja estao no fluxo (`aplicaQuando`), mas o
 * canvas as reduzia a um "se aplicavel" entre nos empilhados — sem dizer se
 * aplicavel quando o que. Aqui elas viram ramo desenhavel: para cada valor de
 * chip, simula-se o rascunho com aquele valor e procura-se o primeiro no que
 * passaria a valer.
 *
 * E a mesma logica que o motor executa em runtime (AssistantFlowEngine.
 * nextQuestion), so que rodada para todos os valores de uma vez, em vez de
 * para o valor que o usuario respondeu.
 */

/** Id reservado do no sintetico da abertura. Nao existe em `definicao.nos`. */
export const ABERTURA_NODE_ID = '__abertura__';

/** Id do no terminal da consulta livre, fora do preenchimento guiado. */
export const CONSULTA_NODE_ID = '__consulta__';

export interface FlowBranch {
  /** Valor do chip que leva a este destino. */
  valor: string;
  /** Rotulo exibido na aresta. */
  label: string;
  /** Id do no de destino, ou null quando a resposta encerra o fluxo. */
  destinoId: string | null;
}

/** Rascunho simulado: so os campos que as condicoes consultam. */
type RascunhoSimulado = Record<string, unknown>;

/**
 * Converte o valor do chip para o tipo que o rascunho guarda.
 *
 * `paid` e o caso que importa: o chip envia "sim"/"nao", mas o rascunho
 * guarda booleano, e a condicao de vencimento compara com `true`. Sem essa
 * conversao, "ja foi paga? Sim" nao pularia o vencimento no desenho — mas
 * pula na conversa real.
 */
function valorTipado(slot: string, valor: string): unknown {
  if (slot === 'paid') {
    if (valor === 'sim') return true;
    if (valor === 'nao') return false;
  }
  return valor;
}

function valorDoCampo(rascunho: RascunhoSimulado, campo: string): unknown {
  return rascunho[campo];
}

function condicaoBate(condicao: FlowCondition, rascunho: RascunhoSimulado): boolean {
  const atual = valorDoCampo(rascunho, condicao.campo);

  switch (condicao.operador) {
    case 'preenchido': return atual !== null && atual !== undefined;
    case 'vazio': return atual === null || atual === undefined;
    case 'igual': return atual === condicao.valor;
    case 'diferente': return atual !== condicao.valor;
    case 'em': return Array.isArray(condicao.valor) && condicao.valor.includes(atual as never);
    default: return false;
  }
}

function todasBatem(condicoes: FlowCondition[] | undefined, rascunho: RascunhoSimulado): boolean {
  if (!condicoes || condicoes.length === 0) return true;
  return condicoes.every((c) => condicaoBate(c, rascunho));
}

/**
 * Campos que uma resposta preenche, alem do slot do proprio no.
 *
 * `cartoesElegiveis` e companhia saem do catalogo da conta, que o editor nao
 * conhece — ficam indefinidos na simulacao, e condicoes sobre eles nao
 * decidem ramo. E aceitavel: elas escolhem a VARIANTE do texto, nao o
 * proximo no.
 */
function rascunhoApos(
  node: FlowNode,
  valor: string,
  base: RascunhoSimulado,
): RascunhoSimulado {
  const proximo: RascunhoSimulado = { ...base, [node.slot]: valorTipado(node.slot, valor) };

  // Responder um campo limpa os que dependem dele — o mesmo que
  // clearDependentSlots faz no motor.
  for (const dependente of node.limpaAoResponder ?? []) {
    proximo[dependente] = undefined;
  }

  return proximo;
}

/**
 * Primeiro no que passaria a valer depois desta resposta.
 *
 * Percorre a ordem a partir do no seguinte ao atual, pulando os que nao se
 * aplicam ao rascunho simulado — exatamente o que nextQuestion faz.
 */
function primeiroNoAplicavel(
  definition: FlowDefinition,
  aPartirDe: number,
  rascunho: RascunhoSimulado,
): string | null {
  for (let i = aPartirDe; i < definition.ordem.length; i += 1) {
    const id = definition.ordem[i];
    if (!id) continue;
    const node = definition.nos.find((n) => n.id === id);
    if (!node) continue;
    if (todasBatem(node.aplicaQuando, rascunho)) return node.id;
  }
  return null;
}

/**
 * Rascunho de partida para simular este no: assume respondidos os campos dos
 * nos anteriores, para que as condicoes de `kind` e afins nao derrubem tudo.
 *
 * `kind` vale 'expense' porque e o caminho com ramificacao — receita so tem
 * descricao e valor, e seria uma linha reta de qualquer forma.
 */
function rascunhoBase(definition: FlowDefinition, ateIndice: number): RascunhoSimulado {
  const rascunho: RascunhoSimulado = { kind: 'expense', isCompanyAccount: true };

  for (let i = 0; i < ateIndice; i += 1) {
    const id = definition.ordem[i];
    if (!id) continue;
    const node = definition.nos.find((n) => n.id === id);
    if (!node) continue;
    if (rascunho[node.slot] !== undefined) continue;

    // O conteudo so importa onde alguma condicao o compara. `paid` entra
    // como false porque a condicao do vencimento testa `diferente de true`:
    // com uma string generica ali, o vencimento pareceria sempre aplicavel.
    rascunho[node.slot] = node.slot === 'paid' ? false : '__respondido__';
  }

  return rascunho;
}

/**
 * Ramos de um no: um por valor de chip, quando os destinos divergem.
 *
 * Devolve lista vazia so quando o no nao tem chip estatico. Respostas que
 * levam ao mesmo lugar continuam na lista: cada uma tem seu proprio ponto de
 * saida no canvas, e omitir uma deixaria aquele chip sem seta.
 */
export function branchesForNode(definition: FlowDefinition, nodeId: string): FlowBranch[] {
  const indice = definition.ordem.indexOf(nodeId);
  if (indice < 0) return [];

  const node = definition.nos.find((n) => n.id === nodeId);
  if (!node) return [];

  // Opcoes vindas do catalogo (categorias, cartoes) mudam sem editar o fluxo
  // e levam todas ao mesmo destino — nao viram ramo.
  const variante = node.variantes.find((v) => (v.opcoes?.length ?? 0) > 0 && v.opcoesSource !== 'categorias' && v.opcoesSource !== 'cartoes');
  const opcoes = variante?.opcoes ?? [];
  if (opcoes.length === 0) return [];

  const base = rascunhoBase(definition, indice);

  const ramos = opcoes.map((opcao) => ({
    valor: opcao.value,
    label: opcao.label,
    destinoId: primeiroNoAplicavel(definition, indice + 1, rascunhoApos(node, opcao.value, base)),
  }));

  // Antes, respostas com o mesmo destino eram suprimidas: as setas eram
  // agrupadas e N linhas identicas so poluiriam. Agora cada resposta tem seu
  // proprio ponto de saida, e suprimir deixaria o chip sem seta nenhuma.
  return ramos;
}

/** Destino unico do no, quando ele nao ramifica. */
export function defaultTargetForNode(definition: FlowDefinition, nodeId: string): string | null {
  const indice = definition.ordem.indexOf(nodeId);
  if (indice < 0) return null;
  return primeiroNoAplicavel(definition, indice + 1, rascunhoBase(definition, indice + 1));
}

/**
 * Primeiro no que o assistente pergunta para uma intencao da abertura.
 *
 * Recebe so o `kind`, que e o que a escolha da abertura define — dai as
 * condicoes do fluxo decidem o resto. E por isso que receita cai direto em
 * descricao: `category` e `paymentMethod` exigem `kind = expense`.
 */
export function primeiroNoParaKind(definition: FlowDefinition, kind: 'expense' | 'income'): string | null {
  return primeiroNoAplicavel(definition, 0, { kind, isCompanyAccount: true });
}
