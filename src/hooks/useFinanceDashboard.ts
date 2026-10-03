import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateExpenseQueries, invalidateFinanceQueries, invalidateIncomeQueries } from '../services/queryKeys';
import { fetchFinanceDashboard, deleteIncome, deleteExpense } from '../services/financeService';
import { dashboardEntries } from '../utils/screenAccess';
import { useOwnPermissions } from './useOwnPermissions';

/**
 * Lançamentos do mês que a pessoa pode ver: receitas, despesas ou os dois,
 * conforme as permissões. Espera as permissões chegarem e não busca nada para
 * quem não pode ver nenhum dos dois.
 */
export function useDashboardQuery(month: number, year: number, options: { enabled?: boolean; escopo?: 'familia' } = {}) {
  const permissions = useOwnPermissions();
  const entries = permissions ? dashboardEntries(permissions) : null;

  return useQuery({
    queryKey: queryKeys.dashboard(month, year, options.escopo, entries ?? 'all'),
    queryFn: () => fetchFinanceDashboard(month, year, options.escopo, entries ?? 'all'),
    enabled: (options.enabled ?? true) && entries !== null,
    staleTime: 30_000,
  });
}

export function useFinanceDashboard(month: number, year: number, enabled = true, escopo?: 'familia') {
  const qc = useQueryClient();
  const dashboard = useDashboardQuery(month, year, { enabled, escopo });

  const invalidate = () => invalidateFinanceQueries(qc, month, year);

  // Excluir a receita devolve o estoque vendido e cancela a comissão não paga.
  const deleteIncomeMut = useMutation({
    mutationFn: deleteIncome,
    onSuccess: () => {
      invalidate();
      invalidateIncomeQueries(qc);
      invalidateExpenseQueries(qc);
    },
  });

  const deleteExpenseMut = useMutation({
    mutationFn: ({ id, deleteGroup, ids }: { id: number; deleteGroup?: boolean; ids?: number[] }) =>
      deleteExpense(id, { deleteGroup, ids }),
    onSuccess: invalidate,
  });

  return {
    dashboard,
    deleteIncome: deleteIncomeMut,
    deleteExpense: deleteExpenseMut,
  };
}
