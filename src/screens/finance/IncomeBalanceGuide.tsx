import { AlertTriangle, BarChart3, CheckCircle2, CircleDashed, Info, Landmark } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { BudgetReferenceStatus } from '../../types/budget';
import { fetchBudgetOverview } from '../../services/budgetService';
import { queryKeys } from '../../services/queryKeys';
import { Card } from '../../ui/card';
import { formatCurrency } from './formatters';

interface IncomeBalanceGuideProps {
  month: number;
  year: number;
}

const CHART_COLORS = ['#0C9EAF', '#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316', '#64748b'];

const STATUS_STYLES: Record<BudgetReferenceStatus, {
  label: string;
  surface: string;
  text: string;
  bar: string;
  icon: typeof CheckCircle2;
}> = {
  without_reference: {
    label: 'Sem referência',
    surface: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    bar: 'bg-slate-400',
    icon: CircleDashed,
  },
  without_classified_expenses: {
    label: 'Sem dados suficientes',
    surface: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    bar: 'bg-slate-400',
    icon: CircleDashed,
  },
  below_reference: {
    label: 'Abaixo da referência',
    surface: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    bar: 'bg-slate-500',
    icon: CircleDashed,
  },
  within_reference: {
    label: 'Dentro da faixa',
    surface: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  attention: {
    label: 'Atenção',
    surface: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
    icon: AlertTriangle,
  },
  risk: {
    label: 'Risco',
    surface: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
    icon: AlertTriangle,
  },
};

function percentage(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(1)}%`;
}

export function IncomeBalanceGuide({ month, year }: IncomeBalanceGuideProps) {
  const overviewQuery = useQuery({
    queryKey: queryKeys.budgetOverview(month, year),
    queryFn: () => fetchBudgetOverview(month, year),
    staleTime: 30_000,
  });
  const overview = overviewQuery.data;

  if (overviewQuery.isLoading) {
    return <Card className="p-5"><p className="text-sm text-slate-500 dark:text-slate-400">Carregando leitura de equilíbrio...</p></Card>;
  }

  if (overviewQuery.error || !overview) return null;

  if (overview.profileType === 'empresa') {
    return (
      <Card className="border-slate-200 p-5 dark:border-slate-700">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            <Landmark size={18} />
          </span>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Guia de equilíbrio da renda</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Esta leitura de consumo é disponível apenas no perfil pessoal.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const classifiedTotal = overview.referenceGroups.reduce((total, group) => total + group.projectedAmount, 0);
  const totalTracked = classifiedTotal + overview.unclassifiedProjectedTotal;
  const coverage = totalTracked > 0 ? (classifiedTotal / totalTracked) * 100 : 0;
  const activeGroups = overview.referenceGroups.filter((group) => group.projectedAmount > 0);
  const chartData = [
    ...activeGroups.map((group, index) => ({
      name: group.label,
      value: group.projectedAmount,
      color: CHART_COLORS[index % CHART_COLORS.length],
    })),
    ...(overview.unclassifiedProjectedTotal > 0 ? [{
      name: 'Sem referência',
      value: overview.unclassifiedProjectedTotal,
      color: '#94a3b8',
    }] : []),
  ];
  const attentionCount = activeGroups.filter((group) => group.status === 'attention').length;
  const riskCount = activeGroups.filter((group) => group.status === 'risk').length;

  return (
    <Card className="border-slate-200 p-5 dark:border-slate-700">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-[#087B89] dark:bg-cyan-950/40 dark:text-cyan-300">
            <BarChart3 size={20} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Guia de equilíbrio da renda</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Como suas despesas de consumo se distribuem no período.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {riskCount > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{riskCount} em risco</span>}
          {attentionCount > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{attentionCount} em atenção</span>}
          {riskCount === 0 && attentionCount === 0 && activeGroups.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Sem alertas na leitura</span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="border-l-2 border-cyan-500 pl-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Receita do período</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(overview.incomeTotal)}</p>
        </div>
        <div className="border-l-2 border-emerald-500 pl-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Despesas classificadas</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(classifiedTotal)}</p>
        </div>
        <div className="border-l-2 border-slate-400 pl-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Cobertura de categorias</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{coverage.toFixed(0)}%</p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="mt-6 border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Ainda não há despesas classificadas neste período.</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registre despesas com categoria para acompanhar a distribuição do consumo.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)] xl:items-center">
          <div className="min-w-0">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={57} outerRadius={88} paddingAngle={2}>
                  {chartData.map((item) => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="-mt-2 text-center">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Despesas acompanhadas</p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(totalTracked)}</p>
            </div>
          </div>

          <div className="grid gap-3">
            {activeGroups.map((group) => {
              const style = STATUS_STYLES[group.status];
              const StatusIcon = style.icon;
              const scale = Math.max(50, group.referencePercentage * 2);
              const actualPosition = Math.min(100, ((group.shareOfClassifiedExpenses ?? 0) / scale) * 100);
              const referencePosition = Math.min(100, (group.referencePercentage / scale) * 100);

              return (
                <div key={group.key} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex items-center gap-2">
                      <span className={['flex h-6 w-6 items-center justify-center rounded-full', style.surface, style.text].join(' ')}>
                        <StatusIcon size={13} />
                      </span>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{group.label}</p>
                    </div>
                    <span className={['text-xs font-semibold', style.text].join(' ')}>{style.label}</span>
                  </div>
                  <div className="mt-2.5">
                    <div className="relative h-2 overflow-visible bg-slate-100 dark:bg-slate-700">
                      <div className={['h-full transition-all', style.bar].join(' ')} style={{ width: `${actualPosition}%` }} />
                      <span
                        className="absolute top-[-4px] h-4 w-0.5 bg-slate-800 dark:bg-white"
                        style={{ left: `${referencePosition}%` }}
                        title={`Referência estatística: ${percentage(group.referencePercentage)}`}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Sua participação: <strong className="text-slate-700 dark:text-slate-200">{percentage(group.shareOfClassifiedExpenses)}</strong></span>
                      <span>Referência: {percentage(group.referencePercentage)}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(group.projectedAmount)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {overview.unclassifiedProjectedTotal > 0 && (
              <div className="border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
                <strong>{formatCurrency(overview.unclassifiedProjectedTotal)}</strong> em despesas sem referência estatística. Categorize esses lançamentos para ampliar a leitura.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>Referência estatística da POF/IBGE 2017-2018 sobre a composição das despesas de consumo. Ela apoia a leitura do mês, mas não substitui suas metas pessoais.</p>
      </div>
    </Card>
  );
}
