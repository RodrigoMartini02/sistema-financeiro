import {
  assertValidRange,
  currentMonthRange,
  DateRangeError,
  resolveDateRange,
} from './assistantDateRange';
import {
  buscarLancamentos,
  comparativoPeriodos,
  comprometimentoFuturo,
  contasAPagar,
  contasAReceber,
  gastosPorCategoria,
  gastosPorFormaPagamento,
  maioresGastos,
  parcelamentosAbertos,
  posicaoParcelamento,
  progressoMeta,
  projecaoSaldo,
  recorrentesPrevistas,
  resumoPeriodo,
  saldoAtual,
  saudeFinanceira,
  simularNovaParcela,
  variacaoPorCategoria,
  type QueryScope,
  type StatusConta,
} from './assistantQueries';

// Catalogo das ferramentas de consulta. Parametros fechados e validados aqui:
// o modelo escolhe qual ferramenta chamar e com que filtros, nunca escreve SQL
// nem alcanca dado fora da conta ativa.

export class AssistantToolError extends Error {}

export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean';
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameterSchema>;
  required: string[];
}

type ToolArguments = Record<string, unknown>;

/**
 * Datas em ISO. Faltando, tenta ler o periodo da frase original do usuario e,
 * so entao, assume o mes corrente — como a spec manda.
 */
function readRange(args: ToolArguments, userMessage?: string): { inicio: string; fim: string } {
  const inicio = typeof args['inicio'] === 'string' ? args['inicio'] : null;
  const fim = typeof args['fim'] === 'string' ? args['fim'] : null;

  if (inicio && fim) {
    assertValidRange(inicio, fim);
    return { inicio, fim };
  }

  const fromMessage = userMessage ? resolveDateRange(userMessage) : null;
  const fallback = fromMessage ?? currentMonthRange();
  return { inicio: fallback.inicio, fim: fallback.fim };
}

function readText(args: ToolArguments, key: string, maxLength = 120): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AssistantToolError(`Parâmetro "${key}" ausente.`);
  }
  return value.trim().slice(0, maxLength);
}

function readOptionalText(args: ToolArguments, key: string, maxLength = 120): string | undefined {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().slice(0, maxLength);
}

/**
 * Numero dentro da faixa. Sem `fallback`, o parametro e obrigatorio e um valor
 * fora da faixa e recusado — clampar em silencio faria "0 parcelas" virar 1 e
 * responder uma pergunta que o usuario nao fez.
 */
function readNumber(args: ToolArguments, key: string, min: number, max: number, fallback?: number): number {
  const raw = args[key];
  const parsed = typeof raw === 'number' ? raw : Number(raw);

  if (!Number.isFinite(parsed)) {
    if (fallback !== undefined) return fallback;
    throw new AssistantToolError(`Parâmetro "${key}" inválido.`);
  }

  if (parsed < min || parsed > max) {
    if (fallback !== undefined) return Math.min(Math.max(parsed, min), max);
    throw new AssistantToolError(`Parâmetro "${key}" fora da faixa permitida.`);
  }

  return parsed;
}

function readStatus(args: ToolArguments): StatusConta {
  const value = args['status'];
  return value === 'vencido' || value === 'todos' ? value : 'aberto';
}

const RANGE_PARAMS: Record<string, ToolParameterSchema> = {
  inicio: { type: 'string', description: 'Data inicial em AAAA-MM-DD. Omita para o mês corrente.' },
  fim: { type: 'string', description: 'Data final em AAAA-MM-DD. Omita para o mês corrente.' },
};

export const ASSISTANT_TOOLS: ToolDefinition[] = [
  {
    name: 'resumo_periodo',
    description: 'Entradas, saídas e saldo de um período.',
    parameters: RANGE_PARAMS,
    required: [],
  },
  {
    name: 'saldo_atual',
    description: 'Saldo consolidado até hoje, contando apenas o que já foi pago ou recebido.',
    parameters: {},
    required: [],
  },
  {
    name: 'saude_financeira',
    description: 'Indicadores: receita e despesa médias, sobra, comprometimento com parcelas.',
    parameters: { meses: { type: 'number', description: 'Janela em meses (1 a 24). Padrão 3.' } },
    required: [],
  },
  {
    name: 'gastos_por_categoria',
    description: 'Total gasto por categoria no período.',
    parameters: {
      ...RANGE_PARAMS,
      categoria: { type: 'string', description: 'Filtra uma categoria específica. Opcional.' },
    },
    required: [],
  },
  {
    name: 'maiores_gastos',
    description: 'Maiores despesas do período, da maior para a menor.',
    parameters: {
      ...RANGE_PARAMS,
      limite: { type: 'number', description: 'Quantas devolver (1 a 50). Padrão 5.' },
    },
    required: [],
  },
  {
    name: 'buscar_lancamentos',
    description: 'Procura lançamentos pela descrição.',
    parameters: {
      ...RANGE_PARAMS,
      texto: { type: 'string', description: 'Trecho da descrição procurada.' },
      tipo: { type: 'string', description: 'Restringe a despesa ou receita.', enum: ['despesa', 'receita'] },
    },
    required: ['texto'],
  },
  {
    name: 'gastos_por_forma_pagamento',
    description: 'Total gasto por forma de pagamento e por cartão no período.',
    parameters: RANGE_PARAMS,
    required: [],
  },
  {
    name: 'comparativo_periodos',
    description: 'Compara as saídas de dois períodos.',
    parameters: {
      inicio_a: { type: 'string', description: 'Início do primeiro período, AAAA-MM-DD.' },
      fim_a: { type: 'string', description: 'Fim do primeiro período, AAAA-MM-DD.' },
      inicio_b: { type: 'string', description: 'Início do segundo período, AAAA-MM-DD.' },
      fim_b: { type: 'string', description: 'Fim do segundo período, AAAA-MM-DD.' },
    },
    required: ['inicio_a', 'fim_a', 'inicio_b', 'fim_b'],
  },
  {
    name: 'contas_a_pagar',
    description: 'Despesas do período por situação: em aberto, vencidas ou todas.',
    parameters: {
      ...RANGE_PARAMS,
      status: { type: 'string', description: 'Situação desejada.', enum: ['aberto', 'vencido', 'todos'] },
    },
    required: [],
  },
  {
    name: 'contas_a_receber',
    description: 'Receitas previstas ou já recebidas no período.',
    parameters: {
      ...RANGE_PARAMS,
      status: { type: 'string', description: 'Situação desejada.', enum: ['aberto', 'vencido', 'todos'] },
    },
    required: [],
  },
  {
    name: 'recorrentes_previstas',
    description: 'Despesas marcadas como recorrentes no período. Só lista o que já foi lançado.',
    parameters: RANGE_PARAMS,
    required: [],
  },
  {
    name: 'parcelamentos_abertos',
    description: 'Parcelamentos com parcelas ainda em aberto.',
    parameters: {},
    required: [],
  },
  {
    name: 'posicao_parcelamento',
    description: 'Quantas parcelas faltam de um parcelamento e quando termina.',
    parameters: { referencia: { type: 'string', description: 'Trecho da descrição do parcelamento.' } },
    required: ['referencia'],
  },
  {
    name: 'comprometimento_futuro',
    description: 'Quanto de parcela já contratada cai em cada mês daqui pra frente.',
    parameters: { meses: { type: 'number', description: 'Quantos meses à frente (1 a 24). Padrão 6.' } },
    required: [],
  },
  {
    name: 'projecao_saldo',
    description: 'Saldo projetado mês a mês, separando o que já foi pago do que está em aberto.',
    parameters: { meses: { type: 'number', description: 'Quantos meses projetar (1 a 24). Padrão 3.' } },
    required: [],
  },
  {
    name: 'simular_nova_parcela',
    description: 'Impacto de assumir um novo parcelamento sobre o comprometimento e a sobra mensal.',
    parameters: {
      valor_parcela: { type: 'number', description: 'Valor de cada parcela, em reais.' },
      num_parcelas: { type: 'number', description: 'Número de parcelas (1 a 360).' },
    },
    required: ['valor_parcela', 'num_parcelas'],
  },
  {
    name: 'progresso_meta',
    description: 'Progresso das metas de orçamento por categoria no mês corrente.',
    parameters: { meta: { type: 'string', description: 'Filtra uma categoria específica. Opcional.' } },
    required: [],
  },
  {
    name: 'variacao_por_categoria',
    description: 'Categorias cujo gasto do mês está fora do padrão dos meses anteriores.',
    parameters: { meses: { type: 'number', description: 'Janela em meses (2 a 24). Padrão 3.' } },
    required: [],
  },
];

export const ASSISTANT_TOOL_NAMES = new Set(ASSISTANT_TOOLS.map((tool) => tool.name));

/**
 * Executa a ferramenta pedida pelo modelo. Nome desconhecido ou parametro
 * invalido vira erro tratado, nunca consulta solta — e o escopo (usuario e
 * conta) vem de quem chama, jamais do modelo.
 */
export async function runAssistantTool(
  scope: QueryScope,
  name: string,
  args: ToolArguments,
  userMessage?: string,
): Promise<unknown> {
  if (!ASSISTANT_TOOL_NAMES.has(name)) {
    throw new AssistantToolError('Consulta não reconhecida.');
  }

  try {
    switch (name) {
      case 'resumo_periodo': {
        const { inicio, fim } = readRange(args, userMessage);
        return await resumoPeriodo(scope, inicio, fim);
      }
      case 'saldo_atual':
        return await saldoAtual(scope);
      case 'saude_financeira':
        return await saudeFinanceira(scope, readNumber(args, 'meses', 1, 24, 3));
      case 'gastos_por_categoria': {
        const { inicio, fim } = readRange(args, userMessage);
        return await gastosPorCategoria(scope, inicio, fim, readOptionalText(args, 'categoria'));
      }
      case 'maiores_gastos': {
        const { inicio, fim } = readRange(args, userMessage);
        return await maioresGastos(scope, inicio, fim, readNumber(args, 'limite', 1, 50, 5));
      }
      case 'buscar_lancamentos': {
        const { inicio, fim } = readRange(args, userMessage);
        const tipo = args['tipo'] === 'despesa' || args['tipo'] === 'receita' ? args['tipo'] : undefined;
        return await buscarLancamentos(scope, readText(args, 'texto'), inicio, fim, tipo);
      }
      case 'gastos_por_forma_pagamento': {
        const { inicio, fim } = readRange(args, userMessage);
        return await gastosPorFormaPagamento(scope, inicio, fim);
      }
      case 'comparativo_periodos': {
        const inicioA = readText(args, 'inicio_a', 10);
        const fimA = readText(args, 'fim_a', 10);
        const inicioB = readText(args, 'inicio_b', 10);
        const fimB = readText(args, 'fim_b', 10);
        assertValidRange(inicioA, fimA);
        assertValidRange(inicioB, fimB);
        return await comparativoPeriodos(scope, inicioA, fimA, inicioB, fimB);
      }
      case 'contas_a_pagar': {
        const { inicio, fim } = readRange(args, userMessage);
        return await contasAPagar(scope, inicio, fim, readStatus(args));
      }
      case 'contas_a_receber': {
        const { inicio, fim } = readRange(args, userMessage);
        return await contasAReceber(scope, inicio, fim, readStatus(args));
      }
      case 'recorrentes_previstas': {
        const { inicio, fim } = readRange(args, userMessage);
        return await recorrentesPrevistas(scope, inicio, fim);
      }
      case 'parcelamentos_abertos':
        return await parcelamentosAbertos(scope);
      case 'posicao_parcelamento':
        return await posicaoParcelamento(scope, readText(args, 'referencia'));
      case 'comprometimento_futuro':
        return await comprometimentoFuturo(scope, readNumber(args, 'meses', 1, 24, 6));
      case 'projecao_saldo':
        return await projecaoSaldo(scope, readNumber(args, 'meses', 1, 24, 3));
      case 'simular_nova_parcela':
        return await simularNovaParcela(
          scope,
          readNumber(args, 'valor_parcela', 0.01, 1_000_000),
          readNumber(args, 'num_parcelas', 1, 360),
        );
      case 'progresso_meta':
        return await progressoMeta(scope, readOptionalText(args, 'meta'));
      case 'variacao_por_categoria':
        return await variacaoPorCategoria(scope, readNumber(args, 'meses', 2, 24, 3));
      default:
        throw new AssistantToolError('Consulta não reconhecida.');
    }
  } catch (error) {
    // Erro de parametro vira mensagem para o modelo se corrigir; qualquer outro
    // sobe, para nao mascarar falha real de banco.
    if (error instanceof DateRangeError || error instanceof AssistantToolError) {
      throw new AssistantToolError(error.message);
    }
    throw error;
  }
}
