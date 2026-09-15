import type { FlowAbertura } from '../../services/assistantFlowService';

/**
 * Escolhe a saudação conforme o tempo desde a última conversa.
 *
 * Repetir a mesma frase a cada abertura soa robótico; uma saudação longa
 * atrasa quem quer só lançar e sair. A variação reconhece o retorno em uma
 * linha, sem cerimônia.
 *
 * Função pura, separada do componente, para ser verificável sem renderizar.
 */

/** Abaixo disto é a mesma sessão: o usuário mal saiu. */
const LIMITE_SESSAO_MS = 60 * 60 * 1000;

/** Volta no mesmo dia; acima disto, o retorno é "longo". */
const LIMITE_DIA_MS = 24 * 60 * 60 * 1000;

export function escolherSaudacao(
  abertura: FlowAbertura,
  /** `updatedAt` da conversa mais recente; ausente na primeira vez. */
  ultimaConversaEm: string | null | undefined,
  agora: Date = new Date(),
): string {
  // Sem conversa anterior é a primeira vez — nada a reconhecer.
  if (!ultimaConversaEm) return abertura.saudacao;

  const ultima = new Date(ultimaConversaEm).getTime();
  // Data inválida vinda da API não pode quebrar a abertura do chat.
  if (Number.isNaN(ultima)) return abertura.saudacao;

  const decorrido = agora.getTime() - ultima;

  // Relógio do dispositivo atrasado deixaria o cálculo negativo; trata como
  // sessão em andamento, que é o caso mais provável.
  if (decorrido < LIMITE_SESSAO_MS) return 'Voltou! O que mais?';

  if (decorrido < LIMITE_DIA_MS) {
    return abertura.saudacaoRetorno ?? abertura.saudacao;
  }

  return abertura.saudacaoRetornoLongo ?? abertura.saudacaoRetorno ?? abertura.saudacao;
}
