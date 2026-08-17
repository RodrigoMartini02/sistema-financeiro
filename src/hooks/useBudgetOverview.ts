import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../services/queryKeys';
import { fetchBudgetOverview } from '../services/budgetService';

export function useBudgetOverview(month: number, year: number) {
  return useQuery({
    queryKey: queryKeys.budgetOverview(month, year),
    queryFn: () => fetchBudgetOverview(month, year),
    staleTime: 30_000,
  });
}
