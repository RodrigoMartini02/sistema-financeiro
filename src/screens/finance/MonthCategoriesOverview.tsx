import { Target } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { BudgetOverviewItem } from '../../types/budget';
import { fetchBudgetOverview } from '../../services/budgetService';
import { queryKeys } from '../../services/queryKeys';
import { Card } from '../../ui/card';
import { formatCurrency } from './formatters';

interface MonthCategoriesOverviewProps {
  month: number;
  year: number;
}

function statusColor(item: BudgetOverviewItem): string {
  if (item.status === 'over') return '#ef4444';
  if (item.status === 'attention') return '#f59e0b';
  return '#0891b2';
}

function statusLabel(item: BudgetOverviewItem): string {
  if (!item.targetAmount) return 'sem meta';
  const percentage = (item.projectedAmount / item.targetAmount) * 100;
  return `${percentage.toFixed(0)}% de ${formatCurrency(item.targetAmount)}`;
}

export function MonthCategoriesOverview({ month, year }: MonthCategoriesOverviewProps) {
  const overviewQuery = useQuery({
    queryKey: queryKeys.budgetOverview(month, year),
    queryFn: () => fetchBudgetOverview(month, year),
    staleTime: 30_000,
  });
  const overview = overviewQuery.data;

  if (overviewQuery.isLoading || overviewQuery.error || !overview || overview.profileType === 'empresa') return null;

  const items = overview.items.filter((item) => item.projectedAmount > 0).sort((a, b) => b.projectedAmount - a.projectedAmount);
  if (items.length === 0) return null;

  const total = items.reduce((s, item) => s + item.projectedAmount, 0);
  const acimaCount = items.filter((item) => item.status === 'over' || item.status === 'attention').length;
  const semMetaCount = items.filter((item) => !item.targetAmount).length;
  const noLimiteCount = items.filter((item) => item.status === 'attention').length;
  const max = Math.max(1, ...items.map((item) => Math.max(item.projectedAmount, item.targetAmount ?? 0)));

  return (
    <Card className="overflow-hidden rounded-2xl p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-5 dark:border-slate-700">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-100 bg-cyan-50 text-[#0891b2] dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300">
          <Target size={18} />
        </span>
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Categorias do mês</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Quanto cada categoria consumiu e como isso se compara ao limite que você definiu.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {acimaCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />{acimaCount} acima do limite
            </span>
          )}
          {noLimiteCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{noLimiteCount} no limite
            </span>
          )}
          {semMetaCount > 0 && (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              {semMetaCount} sem meta
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="mb-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>{formatCurrency(total)} em {items.length} categorias</span>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[#0891b2]" />gasto no mês</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-0.5 rounded bg-slate-800 dark:bg-slate-200" />seu limite</span>
          </div>
        </div>

        <div className="grid">
          {items.map((item) => {
            const barWidth = Math.min(100, (item.projectedAmount / max) * 100);
            const targetPosition = item.targetAmount ? Math.min(100, (item.targetAmount / max) * 100) : null;
            return (
              <div key={item.categoryId} className="flex items-center gap-3.5 border-t border-slate-100 py-2.5 first:border-t-0 dark:border-slate-700">
                <span className="w-28 shrink-0 truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={item.categoryName}>{item.categoryName}</span>
                <div className="relative h-6 flex-1 rounded-md bg-slate-50 dark:bg-slate-800">
                  <div className="h-6 rounded-md" style={{ width: `${barWidth}%`, background: statusColor(item) }} />
                  {targetPosition !== null && (
                    <span className="absolute -inset-y-1 w-0.5 rounded bg-slate-800 dark:bg-slate-200" style={{ left: `${targetPosition}%` }} />
                  )}
                </div>
                <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(item.projectedAmount)}</span>
                <span className={`w-36 shrink-0 text-right text-[11.5px] font-bold tabular-nums ${item.status === 'over' ? 'text-rose-600 dark:text-rose-300' : item.status === 'attention' ? 'text-amber-600 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {statusLabel(item)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
