import type { QueryClient } from '@tanstack/react-query';

export function invalidateFinanceQueries(qc: QueryClient, month: number, year: number) {
  qc.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) });
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'dashboard-anual' });
  qc.invalidateQueries({ queryKey: queryKeys.reservas });
}

export const queryKeys = {
  session: ['session'] as const,
  planStatus: ['plano-status'] as const,
  dashboard: (month: number, year: number) => ['dashboard', month, year] as const,
  reservas: ['reservas'] as const,
  movimentacoes: (reservaId: number) => ['movimentacoes', reservaId] as const,
  categorias: ['categorias'] as const,
  cartoes: ['cartoes'] as const,
  perfis: ['perfis'] as const,
  representantes: ['representantes'] as const,
  socios: ['socios'] as const,
  avaliacoes: ['avaliacoes'] as const,
  incomeTypes: ['income-types'] as const,
  mesStatus: (year: number, month: number) => ['mes-status', year, month] as const,
  clientes: ['clientes'] as const,
  contratos: (clienteId: number) => ['contratos', clienteId] as const,
  servicos: ['servicos'] as const,
  contratosServicos: (contratoId: number) => ['contratos-servicos', contratoId] as const,
  contratoAnexos: (contratoId: number) => ['contrato-anexos', contratoId] as const,
  contratosAtivos: ['contratos-ativos'] as const,
  contratosStatusFaturamento: (mes: number, ano: number) => ['contratos-status-faturamento', mes, ano] as const,
  dashboardAnual: (year: number) => ['dashboard-anual', year] as const,
  dashboardPanorama: (deMes?: number, deAno?: number, ateMes?: number, ateAno?: number) =>
    ['dashboard-panorama', deMes, deAno, ateMes, ateAno] as const,
  parcelasFuturas: (mes: number, ano: number, meses: number) => ['parcelas-futuras', mes, ano, meses] as const,
  expenseSuggestions: (descricao: string, categoriaId?: number) =>
    ['expense-suggestions', descricao, categoriaId] as const,
  incomeSuggestions: (descricao: string) => ['income-suggestions', descricao] as const,
  appointments: (month: number, year: number) => ['appointments', month, year] as const,
  budgetOverview: (month: number, year: number) => ['budget-overview', month, year] as const,
  budgetOverviewRange: (deMes?: number, deAno?: number, ateMes?: number, ateAno?: number) =>
    ['budget-overview-range', deMes, deAno, ateMes, ateAno] as const,
  copilotConversations: ['copilot-conversations'] as const,
  aiIntegrations: ['ai-integrations'] as const,
};
