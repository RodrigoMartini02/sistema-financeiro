import type { FlowNode, FlowOption, FlowQuestionVariant } from '../../../services/assistantFlowService';

/**
 * Posição dos blocos de resposta quando o fluxo ainda não foi arrastado.
 *
 * Um fluxo nunca editado precisa abrir legível: são 13 perguntas e ~20
 * respostas, e empilhar tudo numa coluna transformaria o desenho no emaranhado
 * que esta tela existe para evitar.
 *
 * As respostas ficam em leque abaixo do card, centradas nele, para o olho
 * seguir a divisão do caminho.
 */

/** Distância vertical entre o card da pergunta e seus blocos de resposta. */
const DESLOCAMENTO_VERTICAL = 120;

/** Distância horizontal entre blocos vizinhos. */
const ESPACO_HORIZONTAL = 190;

/** Largura aproximada do card da pergunta, para centrar o leque. */
const LARGURA_CARD = 256;

/** Largura aproximada de um bloco de resposta. */
const LARGURA_RESPOSTA = 160;

export interface PosicaoBloco {
  x: number;
  y: number;
}

/**
 * Onde cada resposta cai por padrão.
 *
 * `indice` é a posição da resposta na lista; `total` é quantas existem, para o
 * leque ficar centrado no card em vez de crescer só para a direita.
 */
export function posicaoPadraoDaResposta(
  posicaoDoNo: PosicaoBloco,
  indice: number,
  total: number,
): PosicaoBloco {
  const larguraTotal = (total - 1) * ESPACO_HORIZONTAL;
  const centroDoCard = posicaoDoNo.x + LARGURA_CARD / 2;
  const inicio = centroDoCard - larguraTotal / 2 - LARGURA_RESPOSTA / 2;

  return {
    x: inicio + indice * ESPACO_HORIZONTAL,
    y: posicaoDoNo.y + DESLOCAMENTO_VERTICAL,
  };
}

/**
 * Variante cujas opções viram blocos no canvas.
 *
 * A primeira variante com opções é a que aparece com mais frequência; as
 * demais são casos condicionais do mesmo campo e desenhá-las todas duplicaria
 * blocos que nunca aparecem juntos na conversa.
 */
export function varianteComOpcoes(node: FlowNode): FlowQuestionVariant | undefined {
  return node.variantes.find((variante) => (variante.opcoes?.length ?? 0) > 0)
    ?? node.variantes.find((variante) => variante.opcoesSource === 'categorias' || variante.opcoesSource === 'cartoes');
}

export interface RespostaDesenhavel {
  valor: string;
  label: string;
  /** Lista vinda do catálogo da conta: um bloco só, não um por item. */
  dinamica: boolean;
  posicao?: FlowOption['posicao'];
}

/**
 * Respostas que viram bloco para este nó.
 *
 * Opções de catálogo (`categorias`, `cartoes`) devolvem um único bloco
 * marcado como dinâmico: a lista muda por usuário e a cada cadastro, e todo
 * item leva ao mesmo destino — desenhar um por cartão fingiria que "Nubank"
 * faz parte do fluxo, quando o que faz parte é "escolher um cartão".
 */
export function respostasDesenhaveis(node: FlowNode): RespostaDesenhavel[] {
  const variante = varianteComOpcoes(node);
  if (!variante) return [];

  if (variante.opcoesSource === 'categorias' || variante.opcoesSource === 'cartoes') {
    return [{
      valor: variante.opcoesSource,
      label: variante.opcoesSource === 'categorias'
        ? 'Categorias da conta'
        : 'Cartões da conta',
      dinamica: true,
    }];
  }

  return (variante.opcoes ?? []).map((opcao) => ({
    valor: opcao.value,
    label: opcao.label,
    dinamica: false,
    posicao: opcao.posicao,
  }));
}
