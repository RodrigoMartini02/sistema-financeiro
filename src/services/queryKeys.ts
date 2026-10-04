import type { QueryClient } from '@tanstack/react-query';
import type { ReportQuery } from '../types/reports';
import type { DashboardEntries } from './financeService';
import type { AccountNameCatalogKind } from './accountNameCatalogService';
import type { ExpenseDuplicateQuery, ExpenseSuggestionsQuery } from './expenseSuggestionsService';
import type { IncomeDuplicateQuery, IncomeSuggestionsQuery } from './incomeSuggestionsService';
import type { ClientFilters } from './clientsService';
import type { ContractPreviewTarget, ContractRequest } from './contractsService';

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
  'reports', 'expense-group', 'expense-suggestions', 'expense-duplicate', 'despesas-em-aberto',
]);

export function invalidateExpenseQueries(qc: QueryClient) {
  qc.invalidateQueries({ predicate: (q) => EXPENSE_DEPENDENT_QUERIES.has(q.queryKey[0]) });
}

// Uma receita gravada pode cair em vários meses (Repetir até), baixar o estoque,
// descontar horas de contrato e gerar a despesa de comissão. Contrato e
// cliente gravados mexem nas receitas: as telas deles usam a mesma invalidação.
const INCOME_DEPENDENT_QUERIES = new Set<unknown>([
  'dashboard', 'painel', 'accounts-overview', 'budget-overview', 'budget-overview-range', 'reports',
  'contratos-ativos', 'contratos-status-faturamento', 'catalogo-produtos', 'income-suggestions', 'income-duplicate',
  'clients', 'clients-summary', 'client', 'client-incomes', 'contracts', 'contract', 'contract-portfolio',
  'contracts-with-hours',
]);

export function invalidateIncomeQueries(qc: QueryClient) {
  qc.invalidateQueries({ predicate: (q) => INCOME_DEPENDENT_QUERIES.has(q.queryKey[0]) });
}

export const queryKeys = {
  session: ['session'] as const,
  planStatus: ['plano-status'] as const,
  ownPermissions: ['own-permissions'] as const,
  // Sem escopo, chave estavel identica a antes: invalidateFinanceQueries
  // (que so passa month/year) continua casando por prefixo com as duas
  // variantes de escopo, invalidando as duas de uma vez. Quem só pode ver
  // receitas ou só despesas busca um lado só, e a chave diz qual.
  dashboard: (month: number, year: number, escopo?: 'familia', entries: DashboardEntries = 'all') =>
    ['dashboard', month, year, ...(escopo ? [escopo] : []), ...(entries !== 'all' ? [entries] : [])] as const,
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
  // Sócios de uma conta PJ (modal da conta): sempre de uma conta específica.
  partners: (accountId: number) => ['partners', accountId] as const,
  avaliacoes: ['avaliacoes'] as const,
  clientes: ['clientes'] as const,
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
  // Prefixo de todas as listas de membros (qualquer conta): a linha mostra cargo e setor pelo nome.
  membrosAll: ['membros'] as const,
  // Setores e cargos de uma conta PJ (ativos e desativados); o prefixo por tipo invalida todas as contas.
  accountNames: (kind: AccountNameCatalogKind, accountId: number | null) => ['account-names', kind, accountId ?? 'nenhuma'] as const,
  accountNamesOfKind: (kind: AccountNameCatalogKind) => ['account-names', kind] as const,
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
  assistantUltimosLancamentos: (accountId?: number | null) => ['assistant-ultimos-lancamentos', accountId ?? 'ativa'] as const,
  despesasEmAberto: (accountId?: number | null) => ['despesas-em-aberto', accountId ?? 'ativa'] as const,
  // escopo na chave: mesmo padrao de `cartoes` — 'familia' e o default ('so
  // eu') pedem dados diferentes do servidor e nao podem compartilhar cache.
  cardLimits: (accountId?: number | null, escopo?: 'familia') =>
    ['card-limits', accountId ?? 'ativa', escopo ?? 'eu'] as const,
  notificacoes: (accountId?: number | null) => ['notificacoes', accountId ?? 'ativa'] as const,
  // Produtos de uma conta PJ; o prefixo 'catalogo-produtos' (em INCOME_DEPENDENT_QUERIES)
  // invalida todas as contas de uma vez.
  catalogoProdutos: (accountId: number | null) => ['catalogo-produtos', accountId ?? 'nenhuma'] as const,
  storefrontConfig: (accountId: number | null) => ['storefront-config', accountId ?? 'nenhuma'] as const,
  publicStorefront: (storefront: string) => ['public-storefront', storefront] as const,
  publicOrder: (storefront: string, orderId: string) => ['public-order', storefront, orderId] as const,
  mercadoPagoStatus: (accountId: number | null) => ['mercado-pago-status', accountId ?? 'nenhuma'] as const,
  // Pedidos da vitrine de uma conta PJ; o prefixo invalida todos os filtros de situação.
  storefrontOrders: (accountId: number | null, status: string | null) => ['storefront-orders', accountId ?? 'nenhuma', status ?? 'todos'] as const,
  storefrontOrdersAll: ['storefront-orders'] as const,
  storefrontOrder: (orderId: string) => ['storefront-order', orderId] as const,
  movimentacoesEstoque: (produtoId: string) => ['movimentacoes-estoque', produtoId] as const,
  // Clientes, contratos e catálogo de serviços de uma conta PJ.
  clients: (accountId: number | null, filters: ClientFilters) => ['clients', accountId ?? 'nenhuma', filters] as const,
  clientsSummary: (accountId: number | null) => ['clients-summary', accountId ?? 'nenhuma'] as const,
  client: (id: number) => ['client', id] as const,
  clientIncomes: (id: number) => ['client-incomes', id] as const,
  contracts: (accountId: number | null, clientId: number) => ['contracts', accountId ?? 'nenhuma', clientId] as const,
  contract: (id: number) => ['contract', id] as const,
  // A prévia depende de tudo o que foi digitado: cada combinação é uma prévia.
  contractPreview: (target: ContractPreviewTarget, body: ContractRequest) => ['contract-preview', target, body] as const,
  // O prefixo invalida as duas listas (com e sem os desativados).
  serviceCatalog: (accountId: number | null, includeInactive: boolean) =>
    ['service-catalog', accountId ?? 'nenhuma', includeInactive] as const,
  serviceCatalogAll: ['service-catalog'] as const,
  contractPortfolio: (accountId: number | null, month: number, year: number) =>
    ['contract-portfolio', accountId ?? 'nenhuma', month, year] as const,
  contractsWithHours: (accountId: number | null) => ['contracts-with-hours', accountId ?? 'nenhuma'] as const,
};
