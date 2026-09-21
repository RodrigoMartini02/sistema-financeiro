import type { QueryClient } from '@tanstack/react-query';

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
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'dashboard-anual' });
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
  // escopo na chave: 'familia' e o default ('so eu') pedem dados diferentes
  // do servidor e nao podem compartilhar cache.
  cartoes: (accountId?: number | null, escopo?: 'familia') => ['cartoes', accountId ?? 'ativa', escopo ?? 'eu'] as const,
  contas: ['contas'] as const,
  representantes: ['representantes'] as const,
  socios: ['socios'] as const,
  avaliacoes: ['avaliacoes'] as const,
  incomeTypes: ['income-types'] as const,
  clientes: ['clientes'] as const,
  contratos: (clienteId: number) => ['contratos', clienteId] as const,
  servicos: ['servicos'] as const,
  contratosServicos: (contratoId: number) => ['contratos-servicos', contratoId] as const,
  contratoAnexos: (contratoId: number) => ['contrato-anexos', contratoId] as const,
  contratosAtivos: ['contratos-ativos'] as const,
  contratosStatusFaturamento: (mes: number, ano: number) => ['contratos-status-faturamento', mes, ano] as const,
  dashboardAnual: (year: number) => ['dashboard-anual', year] as const,
  // O membro faz parte da chave: sem isso o React Query serviria os numeros do
  // escopo anterior ao trocar de membro no seletor. undefined ("so eu"),
  // null ("familia") e uma lista (combinacao especifica) sao escopos
  // diferentes e nao podem colapsar na mesma chave — por isso o sentinela
  // distingue os tres em vez de usar `?? null`, e a lista e ordenada antes de
  // virar string para nao criar chaves distintas pra mesma combinacao.
  dashboardPanorama: (deMes?: number, deAno?: number, ateMes?: number, ateAno?: number, membroId?: number | number[] | null) =>
    ['dashboard-panorama', deMes, deAno, ateMes, ateAno, membroIdKeyPart(membroId)] as const,
  accountSummary: (deMes?: number, deAno?: number, ateMes?: number, ateAno?: number, familia?: boolean) =>
    ['account-summary', deMes, deAno, ateMes, ateAno, familia ?? false] as const,
  accountsOverview: (deMes?: number, deAno?: number, ateMes?: number, ateAno?: number) =>
    ['accounts-overview', deMes, deAno, ateMes, ateAno] as const,
  // Mesmo padrao de categorias/cartoes: sem accountId, chave estavel identica
  // a antes (['membros', 'ativa']).
  membros: (accountId?: number | null) => ['membros', accountId ?? 'ativa'] as const,
  parcelasFuturas: (ano: number, membroId?: number | number[] | null) =>
    ['parcelas-futuras', ano, membroIdKeyPart(membroId)] as const,
  expenseGroup: (grupoId: number) => ['expense-group', grupoId] as const,
  expenseSuggestions: (descricao: string, categoriaId?: number) =>
    ['expense-suggestions', descricao, categoriaId] as const,
  incomeSuggestions: (descricao: string) => ['income-suggestions', descricao] as const,
  appointments: (month: number, year: number) => ['appointments', month, year] as const,
  budgetOverview: (month: number, year: number, escopo?: 'familia') =>
    ['budget-overview', month, year, ...(escopo ? [escopo] : [])] as const,
  budgetOverviewRange: (deMes?: number, deAno?: number, ateMes?: number, ateAno?: number) =>
    ['budget-overview-range', deMes, deAno, ateMes, ateAno] as const,
  copilotConversations: ['copilot-conversations'] as const,
  aiIntegrations: ['ai-integrations'] as const,
  assistantFlow: ['assistant-flow'] as const,
  assistantAbertura: ['assistant-abertura'] as const,
  // escopo na chave: mesmo padrao de `cartoes` — 'familia' e o default ('so
  // eu') pedem dados diferentes do servidor e nao podem compartilhar cache.
  cardLimits: (accountId?: number | null, escopo?: 'familia') =>
    ['card-limits', accountId ?? 'ativa', escopo ?? 'eu'] as const,
  catalogoProdutos: ['catalogo-produtos'] as const,
  catalogoConta: ['catalogo-conta'] as const,
  movimentacoesEstoque: (produtoId: string) => ['movimentacoes-estoque', produtoId] as const,
};
