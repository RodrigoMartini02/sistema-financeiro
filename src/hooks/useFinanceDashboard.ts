import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../services/queryKeys';
import {
  fetchFinanceDashboard, saveIncome, deleteIncome,
  saveExpense, deleteExpense,
} from '../services/financeService';
import type { IncomeFormValues, ExpenseFormValues } from '../types/finance';

export function useFinanceDashboard(month: number, year: number) {
  const qc = useQueryClient();
  const key = queryKeys.dashboard(month, year);

  const dashboard = useQuery({
    queryKey: key,
    queryFn: () => fetchFinanceDashboard(month, year),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const saveIncomeMut = useMutation({
    mutationFn: ({ values, id }: { values: IncomeFormValues; id?: number }) =>
      saveIncome(month, year, values, id),
    onSuccess: invalidate,
  });

  const deleteIncomeMut = useMutation({
    mutationFn: deleteIncome,
    onSuccess: invalidate,
  });

  const saveExpenseMut = useMutation({
    mutationFn: ({ values, id }: { values: ExpenseFormValues; id?: number }) =>
      saveExpense(month, year, values, id),
    onSuccess: invalidate,
  });

  const deleteExpenseMut = useMutation({
    mutationFn: deleteExpense,
    onSuccess: invalidate,
  });

  return {
    dashboard,
    saveIncome: saveIncomeMut,
    deleteIncome: deleteIncomeMut,
    saveExpense: saveExpenseMut,
    deleteExpense: deleteExpenseMut,
  };
}
