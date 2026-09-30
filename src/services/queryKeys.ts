import type { QueryClient } from '@tanstack/react-query';
import type { ReportQuery } from '../types/reports';
import type { ExpenseDuplicateQuery, ExpenseSuggestionsQuery } from './expenseSuggestionsService';
import type { IncomeDuplicateQuery, IncomeSuggestionsQuery } from './incomeSuggestionsService';

// undefined ("so eu"), null ("familia") e uma lista (combinacao especifica de
// membros, filtro sanduiche do Painel) sao escopos diferentes. A lista e
// ordenada e serializada em string para que a mesma combinacao, pedida em
// qualquer ordem, produza sempre a mesma chave.
function membroIdKeyPart(membroId: number | number[] | null | undefined): string | number {
  if (membroId === undefined) return 'eu';
  if (membroId === null) return 'familia';
  if (Array.isArray(membroId)) return [...membroId].sort((a, b) => a - b).join(',');
  return membroId;
}

export function invalidateFinanceQueries(qc: QueryClient, month: number, year: number) {
  qc.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) });
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'painel' });
}

// Uma despesa gravada pode cair em qualquer mês (parcelas, recorrência, fatura)
// e mexe no limite do cartão, no planejamento e nos relatórios.
const EXPENSE_DEPENDENT_QUERIES = new Set<unknown>([
  'dashboard', 'painel', 'accounts-overview', 'card-limits', 'budget-overview', 'budget-overview-range',
  'reports', 'expense-group', 'expense-suggestions', 'expense-duplicate',
]);

export function invalidateExpenseQueries(qc: QueryClient) {
  qc.invalidateQueries({ predicate: (q) => EXPENSE_DEPENDENT_QUERIES.has(q.queryKey[0]) });
}

// Uma receita gravada pode cair em vários meses (Repetir até), baixar o estoque,
// descontar horas de contrato e gerar a despesa de comissão.
const INCOME_DEPENDENT_QUERIES = new Set<unknown>([
  'dashboard', 'painel', 'accounts-overview', 'budget-overview', 'budget-overview-range', 'reports',
  'contratos-ativos', 'contratos-status-faturamento', 'catalogo-produtos', 'income-suggestions', 'income-duplicate',
]);

export function invalidateIncomeQueries(qc: QueryClient) {
  qc.invalidateQueries({ predicate: (q) => INCOME_DEPENDENT_QUERIES.has(q.queryKey[0]) });
}

export const queryKeys = {
  session: ['session'] as const,
  planStatus: ['plano-status'] as const,
  // Sem escopo, chave estavel identica a antes: invalidateFinanceQueries
  // (que so passa month/year) continua casando por prefixo com as duas
  // variantes de escopo, invalidando as duas de uma vez.
  dashboard: (month: number, year: number, escopo?: 'familia') =>
    ['dashboard', month, year, ...(escopo ? [escopo] : [])] as const,
  // Parametrizado por conta: sem argumento, chave estavel identica a antes
  // (['categorias', 'ativa']) — os call sites que nao lidam com troca de
  // conta continuam funcionando sem qualquer ajuste alem de virar chamada.
  categorias: (accountId?: number | null) => ['categorias', accountId ?? 'ativa'] as const,
  classificacoesReceita: (accountId?: number | null) => ['classificacoes-receita', accountId ?? 'ativa'] as const,
  // escopo na chave: 'familia' e o default ('so eu') pedem dados diferentes
  // do servidor e nao podem compartilhar cache.
  cartoes: (accountId?: number | null, escopo?: 'familia') => ['cartoes', accountId ?? 'ativa', escopo ?? 'eu'] as const,
  contas: ['contas'] as const,
  representantes: ['representantes'] as const,
  socios: ['socios'] as const,
  avaliacoes: ['avaliacoes'] as const,
  clientes: ['clientes'] as const,
  contratos: (clienteId: number) => ['contratos', clienteId] as const,
  servicos: ['servicos'] as const,
  contratosServicos: (contratoId: number) => ['contratos-servicos', contratoId] as const,
  contratoAnexos: (contratoId: number) => ['contrato-anexos', contratoId] as const,
  contratosAtivos: ['contratos-ativos'] as const,
  contratosStatusFaturamento: (mes: number, ano: number) => ['contratos-status-faturamento', mes, ano] as const,
  // A conta e as pessoas fazem parte da chave: sem isso o React Query serviria
  // os numeros do escopo anterior ao trocar de conta ou de membro no filtro.
  // undefined ("so eu"), null (todas as pessoas) e uma lista (combinacao
  // especifica) sao escopos diferentes e nao podem colapsar na mesma chave —
  // por isso o sentinela distingue os tres, e a lista e ordenada antes de
  // virar string para nao criar chaves distintas pra mesma combinacao.
  painel: (accountId: number | null, de: string, ate: string, membroId?: number[] | null) =>
    ['painel', accountId ?? 'ativa', de, ate, membroIdKeyPart(membroId)] as const,
  accountsOverview: (de: string, ate: string) => ['accounts-overview', de, ate] as const,
  // A consulta inteira (período, filtros e pessoas) entra na chave: cada combinação é um relatório diferente.
  reports: (accountId: number | null, query: ReportQuery) => ['reports', accountId ?? 'ativa', query] as const,
  // Mesmo padrao de categorias/cartoes: sem accountId, chave estavel identica
  // a antes (['membros', 'ativa']).
  membros: (accountId?: number | null) => ['membros', accountId ?? 'ativa'] as const,
  expenseGroup: (grupoId: number) => ['expense-group', grupoId] as const,
  expenseSuggestions: (accountId: number | null, query: ExpenseSuggestionsQuery) =>
    ['expense-suggestions', accountId ?? 'ativa', query] as const,
  expenseDuplicate: (accountId: number | null, query: ExpenseDuplicateQuery | null) =>
    ['expense-duplicate', accountId ?? 'ativa', query] as const,
  incomeSuggestions: (accountId: number | null, query: IncomeSuggestionsQuery) =>
    ['income-suggestions', accountId ?? 'ativa', query] as const,
  incomeDuplicate: (accountId: number | null, query: IncomeDuplicateQuery | null) =>
    ['income-duplicate', accountId ?? 'ativa', query] as const,
  appointments: (month: number, year: number) => ['appointments', month, year] as const,
  budgetOverview: (month: number, year: number, escopo?: 'familia') =>
    ['budget-overview', month, year, ...(escopo ? [escopo] : [])] as const,
  budgetOverviewRange: (deMes?: number, deAno?: number, ateMes?: number, ateAno?: number) =>
    ['budget-overview-range', deMes, deAno, ateMes, ateAno] as const,
  copilotConversations: ['copilot-conversations'] as const,
  aiIntegrations: ['ai-integrations'] as const,
  assistantFlow: ['assistant-flow'] as const,
  assistantAbertura: ['assistant-abertura'] as const,
  assistantUltimosLancamentos: (accountId?: number | null) => ['assistant-ultimos-lancamentos', accountId ?? 'ativa'] as const,
  // escopo na chave: mesmo padrao de `cartoes` — 'familia' e o default ('so
  // eu') pedem dados diferentes do servidor e nao podem compartilhar cache.
  cardLimits: (accountId?: number | null, escopo?: 'familia') =>
    ['card-limits', accountId ?? 'ativa', escopo ?? 'eu'] as const,
  notificacoes: (accountId?: number | null) => ['notificacoes', accountId ?? 'ativa'] as const,
  catalogoProdutos: ['catalogo-produtos'] as const,
  catalogoConta: ['catalogo-conta'] as const,
  movimentacoesEstoque: (produtoId: string) => ['movimentacoes-estoque', produtoId] as const,
};
