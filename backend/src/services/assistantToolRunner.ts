import { getTodayIsoInTimezone } from '../utils/date';
import { AiProviderError, type AiProviderConfig } from './aiProvider';
import { runToolTurn, type ToolMessage } from './aiToolCalling';
import { AssistantToolError, runAssistantTool } from './assistantTools';
import type { QueryScope } from './assistantQueries';
import type { SlotCatalog } from './assistantSlotFilling';

// Loop de tool use: o modelo pede ferramenta, o backend executa e devolve o
// resultado, ate o modelo responder em texto. O teto de iteracoes existe para
// que um modelo em loop nao consuma a cota do usuario.

const DEFAULT_MAX_ITERATIONS = 4;

function maxIterations(): number {
  const raw = Number(process.env['AI_TOOL_MAX_ITERATIONS']);
  return Number.isInteger(raw) && raw >= 1 && raw <= 8 ? raw : DEFAULT_MAX_ITERATIONS;
}

const PAYMENT_METHOD_LABELS = 'pix, dinheiro, debito, credito';

/**
 * System prompt com as listas reais do banco. A spec e explicita: o modelo so
 * pode usar valores presentes aqui, e nunca inventa categoria ou forma.
 */
export function buildQuerySystemPrompt(input: {
  catalog: SlotCatalog;
  voiceMode: boolean;
}): string {
  const categorias = input.catalog.categories.map((category) => category.name).join(', ') || 'nenhuma cadastrada';
  const cartoes = input.catalog.cards.map((card) => card.name).join(', ') || 'nenhum cadastrado';

  const base = [
    'Voce e o assistente financeiro do e-conomia. Responde em portugues do Brasil,',
    'curto e direto, sobre os dados financeiros do proprio usuario.',
    '',
    `Data de hoje: ${getTodayIsoInTimezone()} (fuso America/Sao_Paulo).`,
    `Categorias existentes: ${categorias}.`,
    `Formas de pagamento: ${PAYMENT_METHOD_LABELS}.`,
    `Cartoes cadastrados: ${cartoes}.`,
    '',
    'Use SOMENTE valores dessas listas. Nunca invente categoria, forma de pagamento',
    'ou cartao. Se nao encontrar correspondencia, pergunte ao usuario.',
    '',
    'Consulte os dados apenas pelas ferramentas disponiveis. Converta periodos',
    'relativos ("esse mes", "mes passado", "ultimos 3 meses") em datas absolutas',
    'AAAA-MM-DD antes de chamar a ferramenta, usando a data de hoje acima.',
    'Se o periodo nao estiver claro, use o mes corrente e diga isso na resposta.',
    '',
    'Diga o numero primeiro e o detalhe depois. Informe o periodo usado, para o',
    'usuario poder corrigir. Nao repita a pergunta. Nunca mostre nome de',
    'ferramenta nem identificador interno. Se o resultado vier vazio, diga isso',
    'claramente em vez de inventar. Nunca estime ou arredonde dado que pode ser',
    'consultado. Separe o que ja foi lancado do que e previsao. Nao de conselho',
    'de investimento nem julgamento sobre os gastos.',
  ];

  if (!input.voiceMode) return base.join('\n');

  return [
    ...base,
    '',
    'MODO VOZ — a resposta sera lida em voz alta e o usuario nao tem tela:',
    '- No maximo duas frases. Nao cabendo, de o numero principal e pergunte se',
    '  ele quer o detalhe.',
    '- Numeros por extenso: "seiscentos e quarenta reais", nunca "R$ 640,00".',
    '- Datas faladas: "dia tres", "no fim do mes". Nunca "03/09/2026".',
    '- Percentual por extenso: "trinta e dois por cento".',
    '- Proibido: tabela, lista, marcador, negrito, markdown, emoji, sigla.',
    '- Nunca diga "veja abaixo", "conforme a tabela" ou "na tela".',
    '- Lista longa: diga so os tres maiores e pergunte se quer o resto.',
    '- Uma pergunta por vez, fechada, com as opcoes ditas.',
  ].join('\n');
}

export interface ToolRunResult {
  reply: string;
  inputTokens: number;
  outputTokens: number;
  /** Ferramentas efetivamente executadas, para depuracao e auditoria. */
  toolsUsed: string[];
}

/**
 * Conduz a conversa ate o modelo responder em texto.
 *
 * Erro de parametro volta ao modelo como resultado da ferramenta, para ele
 * corrigir a chamada; erro de banco sobe. Nada aqui escreve no banco.
 */
export async function runAssistantQuery(input: {
  config: AiProviderConfig;
  scope: QueryScope;
  system: string;
  history: ToolMessage[];
  message: string;
}): Promise<ToolRunResult> {
  const messages: ToolMessage[] = [...input.history, { role: 'user', content: input.message }];
  const toolsUsed: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let iteration = 0; iteration < maxIterations(); iteration += 1) {
    const turn = await runToolTurn(input.config, input.system, messages);
    inputTokens += turn.inputTokens;
    outputTokens += turn.outputTokens;

    if (turn.toolCalls.length === 0) {
      if (!turn.text) throw new AiProviderError('A IA nao devolveu uma resposta.');
      return { reply: turn.text, inputTokens, outputTokens, toolsUsed };
    }

    messages.push({ role: 'assistant', text: turn.text, toolCalls: turn.toolCalls });

    for (const call of turn.toolCalls) {
      toolsUsed.push(call.name);
      let content: string;
      try {
        const result = await runAssistantTool(input.scope, call.name, call.arguments, input.message);
        content = JSON.stringify(result);
      } catch (error) {
        if (!(error instanceof AssistantToolError)) throw error;
        content = JSON.stringify({ erro: error.message });
      }
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content });
    }
  }

  // Teto atingido: o modelo ficou pedindo ferramenta sem concluir.
  throw new AiProviderError('Nao foi possivel concluir a consulta.');
}
