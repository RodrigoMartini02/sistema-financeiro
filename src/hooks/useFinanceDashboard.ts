import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateFinanceQueries } from '../services/queryKeys';
import { fetchFinanceDashboard, deleteIncome, deleteExpense } from '../services/financeService';

export function useFinanceDashboard(month: number, year: number, enabled = true, escopo?: 'familia') {
  const qc = useQueryClient();
  const key = queryKeys.dashboard(month, year, escopo);

  const dashboard = useQuery({
    queryKey: key,
    queryFn: () => fetchFinanceDashboard(month, year, escopo),
    enabled,
    staleTime: 30_000,
  });

  const invalidate = () => invalidateFinanceQueries(qc, month, year);

  const deleteIncomeMut = useMutation({
    mutationFn: deleteIncome,
    onSuccess: invalidate,
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
