import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../services/queryKeys';
import { fetchBudgetOverview, fetchBudgetOverviewRange, type BudgetOverviewRangeQuery } from '../services/budgetService';

export function useBudgetOverview(month: number, year: number) {
  return useQuery({
    queryKey: queryKeys.budgetOverview(month, year),
    queryFn: () => fetchBudgetOverview(month, year),
    staleTime: 30_000,
  });
}

export function useBudgetOverviewRange(query: BudgetOverviewRangeQuery) {
  return useQuery({
    queryKey: queryKeys.budgetOverviewRange(query.deMes, query.deAno, query.ateMes, query.ateAno),
    queryFn: () => fetchBudgetOverviewRange(query),
    staleTime: 30_000,
  });
}
