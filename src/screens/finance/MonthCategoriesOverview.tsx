import { Target } from 'lucide-react';
import type { BudgetOverview, BudgetOverviewItem } from '../../types/budget';
import { Card } from '../../ui/card';
import { formatCurrency } from './formatters';

interface MonthCategoriesOverviewProps {
  overview: BudgetOverview | undefined;
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

export function MonthCategoriesOverview({ overview }: MonthCategoriesOverviewProps) {
  if (!overview || overview.profileType === 'empresa') return null;

  const items = overview.items.filter((item) => item.projectedAmount > 0).sort((a, b) => b.projectedAmount - a.projectedAmount);
  if (items.length === 0) return null;

  const total = items.reduce((s, item) => s + item.projectedAmount, 0);
  const acimaCount = items.filter((item) => item.status === 'over' || item.status === 'attention').length;
  const semMetaCount = items.filter((item) => !item.targetAmount).length;
  const noLimiteCount = items.filter((item) => item.status === 'attention').length;
  const max = Math.max(1, ...items.map((item) => Math.max(item.projectedAmount, item.targetAmount ?? 0)));

  return (
    <Card className="overflow-hidden rounded-2xl p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e6eef3] px-[22px] py-5 dark:border-slate-700">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[#b9e6ef] bg-[#e6f7fa] text-[#0891b2] dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300">
          <Target size={18} />
        </span>
        <div>
          <h2 className="text-[15.5px] font-bold tracking-[-0.01em] text-[#0f2b38] dark:text-white">Categorias do mês</h2>
          <p className="mt-0.5 text-xs text-[#7b93a1] dark:text-slate-400">Quanto cada categoria consumiu e como isso se compara ao limite que você definiu.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {acimaCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fbd5d1] bg-[#fef3f2] px-2.5 py-1 text-[11.5px] font-bold text-[#b42318] dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />{acimaCount} acima do limite
            </span>
          )}
          {noLimiteCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f0e0b0] bg-[#fdf6e3] px-2.5 py-1 text-[11.5px] font-bold text-[#8a6d1f] dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />{noLimiteCount} no limite
            </span>
          )}
          {semMetaCount > 0 && (
            <span className="inline-flex items-center rounded-full border border-[#dcebf1] bg-[#f2f9fb] px-2.5 py-1 text-[11.5px] font-bold text-[#5f7885] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              {semMetaCount} sem meta
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="mb-3 flex items-center justify-between text-[11px] text-[#5f7885] dark:text-slate-400">
          <span>{formatCurrency(total)} em {items.length} categorias</span>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[#0891b2]" />gasto no mês</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-0.5 rounded bg-[#0f2b38] dark:bg-slate-200" />seu limite</span>
          </div>
        </div>

        <div className="grid">
          {items.map((item) => {
            const barWidth = Math.min(100, (item.projectedAmount / max) * 100);
            const targetPosition = item.targetAmount ? Math.min(100, (item.targetAmount / max) * 100) : null;
            return (
              <div key={item.categoryId} className="flex items-center gap-3.5 border-t border-[#eef4f7] py-[11px] first:border-t-0 dark:border-slate-700">
                <span className="w-28 shrink-0 truncate text-[12.5px] font-semibold text-[#0f2b38] dark:text-slate-100" title={item.categoryName}>{item.categoryName}</span>
                <div className="relative h-6 flex-1 rounded-md bg-[#f5f9fb] dark:bg-slate-800">
                  <div className="h-6 rounded-md" style={{ width: `${barWidth}%`, background: statusColor(item) }} />
                  {targetPosition !== null && (
                    <span className="absolute -inset-y-1 w-0.5 rounded bg-[#0f2b38] dark:bg-slate-200" style={{ left: `${targetPosition}%` }} />
                  )}
                </div>
                <span className="w-24 shrink-0 text-right text-[12.5px] font-bold tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(item.projectedAmount)}</span>
                <span className={`w-[152px] shrink-0 text-right text-[11.5px] font-bold tabular-nums ${item.status === 'over' ? 'text-[#b42318] dark:text-rose-300' : item.status === 'attention' ? 'text-[#8a6d1f] dark:text-amber-300' : 'text-[#7b93a1] dark:text-slate-400'}`}>
                  {statusLabel(item)}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-3.5 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
          Ordenadas por valor gasto. Os limites são definidos em Configurações › Metas.
        </p>
      </div>
    </Card>
  );
}
