import { AlertTriangle, BarChart3, CheckCircle2, CircleDashed, Landmark, Target, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { BudgetOverviewItem, BudgetReferenceStatus } from '../../types/budget';
import { fetchBudgetOverview } from '../../services/budgetService';
import { queryKeys } from '../../services/queryKeys';
import { Card } from '../../ui/card';
import { formatCurrency } from './formatters';

interface IncomeBalanceGuideProps {
  month: number;
  year: number;
}

const STATUS_STYLES: Record<BudgetReferenceStatus, {
  label: string;
  surface: string;
  text: string;
  bar: string;
  icon: typeof CheckCircle2;
}> = {
  without_reference: {
    label: 'Sem faixa definida',
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
    label: 'Abaixo da faixa',
    surface: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    bar: 'bg-slate-500',
    icon: TrendingUp,
  },
  within_reference: {
    label: 'Dentro da faixa',
    surface: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  attention: {
    label: 'Acima da faixa',
    surface: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
    icon: AlertTriangle,
  },
  risk: {
    label: 'Bem acima da faixa',
    surface: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
    icon: AlertTriangle,
  },
};

const GOAL_STYLES = {
  healthy: {
    label: 'No ritmo da meta',
    text: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  attention: {
    label: 'Próximo do limite',
    text: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  over: {
    label: 'Meta ultrapassada',
    text: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
  },
} as const;

function getGoalStatus(status: BudgetOverviewItem['status']) {
  if (status === 'over') return 'over';
  if (status === 'attention') return 'attention';
  return 'healthy';
}

function formatPercentage(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(1)}%`;
}

function getCommitmentLabel(incomeTotal: number, projectedTotal: number): string {
  if (incomeTotal <= 0) return 'Sem receita registrada';
  return `${((projectedTotal / incomeTotal) * 100).toFixed(0)}% da renda`;
}

export function IncomeBalanceGuide({ month, year }: IncomeBalanceGuideProps) {
  const overviewQuery = useQuery({
    queryKey: queryKeys.budgetOverview(month, year),
    queryFn: () => fetchBudgetOverview(month, year),
    staleTime: 30_000,
  });
  const overview = overviewQuery.data;

  if (overviewQuery.isLoading) {
    return <Card className="p-5"><p className="text-sm text-slate-500 dark:text-slate-400">Carregando leitura das despesas...</p></Card>;
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
            <h3 className="font-bold text-slate-900 dark:text-white">Leitura das despesas</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Esta visão de orçamento está disponível no perfil pessoal.</p>
          </div>
        </div>
      </Card>
    );
  }

  const activeGroups = overview.referenceGroups.filter((group) => group.projectedAmount > 0);
  const classifiedTotal = activeGroups.reduce((total, group) => total + group.projectedAmount, 0);
  const incomeCommitment = overview.incomeTotal > 0 ? (overview.projectedTotal / overview.incomeTotal) * 100 : null;
  const alertCount = activeGroups.filter((group) => group.status === 'attention' || group.status === 'risk').length;
  const goalItems = overview.items.filter(
    (item): item is BudgetOverviewItem & { targetAmount: number } =>
      item.targetAmount !== null && item.targetAmount > 0,
  );

  return (
    <Card className="border-slate-200 p-0 dark:border-slate-700">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-[#087B89] dark:bg-cyan-950/40 dark:text-cyan-300">
            <BarChart3 size={20} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Leitura das despesas</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acompanhe o peso de cada categoria no seu orçamento.</p>
          </div>
        </div>
        {alertCount > 0 && (
          <span className="self-start rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {alertCount} categoria{alertCount > 1 ? 's' : ''} acima da faixa
          </span>
        )}
      </div>

      <div className="grid gap-3 px-5 pt-5 sm:grid-cols-3">
        <div className="border-l-2 border-cyan-500 pl-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Renda do período</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(overview.incomeTotal)}</p>
        </div>
        <div className="border-l-2 border-rose-500 pl-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Despesas previstas</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(overview.projectedTotal)}</p>
        </div>
        <div className="border-l-2 border-emerald-500 pl-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Comprometimento</p>
          <p className={[
            'mt-1 text-lg font-bold',
            incomeCommitment === null ? 'text-slate-900 dark:text-white' : incomeCommitment > 90 ? 'text-rose-600 dark:text-rose-300' : incomeCommitment > 70 ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300',
          ].join(' ')}>
            {getCommitmentLabel(overview.incomeTotal, overview.projectedTotal)}
          </p>
        </div>
      </div>

      {activeGroups.length === 0 ? (
        <div className="mx-5 my-5 flex items-start gap-3 border border-dashed border-slate-300 px-4 py-4 text-sm dark:border-slate-600">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"><CircleDashed size={17} /></span>
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">Ainda não há categorias comparáveis neste período.</p>
            <p className="mt-1 text-slate-500 dark:text-slate-400">Organize os lançamentos nas categorias do seu orçamento para visualizar as faixas.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-slate-900 dark:text-white">Comparação por categoria</h4>
              <span className="text-xs text-slate-500 dark:text-slate-400">{formatCurrency(classifiedTotal)} em despesas comparáveis</span>
            </div>
            <div className="grid gap-5">
              {activeGroups.map((group) => {
                const style = STATUS_STYLES[group.status];
                const StatusIcon = style.icon;
                const actual = group.shareOfClassifiedExpenses ?? 0;
                const lowerBound = group.referencePercentage * 0.8;
                const upperBound = group.referencePercentage * 1.2;
                const scale = Math.max(35, upperBound * 1.35, actual * 1.1);
                const actualWidth = Math.min(100, (actual / scale) * 100);
                const rangeStart = Math.min(100, (lowerBound / scale) * 100);
                const rangeWidth = Math.min(100 - rangeStart, ((upperBound - lowerBound) / scale) * 100);

                return (
                  <div key={group.key}>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <div className="flex items-center gap-2">
                        <span className={['flex h-6 w-6 items-center justify-center rounded-full', style.surface, style.text].join(' ')}><StatusIcon size={13} /></span>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{group.label}</p>
                      </div>
                      <span className={['text-xs font-semibold', style.text].join(' ')}>{style.label}</span>
                    </div>
                    <div className="relative mt-2.5 h-3 bg-slate-100 dark:bg-slate-700">
                      <span className="absolute inset-y-0 bg-emerald-100 dark:bg-emerald-900/45" style={{ left: `${rangeStart}%`, width: `${rangeWidth}%` }} />
                      <span className={['absolute inset-y-0 left-0', style.bar].join(' ')} style={{ width: `${actualWidth}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Você: <strong className="text-slate-700 dark:text-slate-200">{formatPercentage(group.shareOfClassifiedExpenses)}</strong></span>
                      <span>Faixa esperada: {formatPercentage(lowerBound)} a {formatPercentage(upperBound)}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(group.projectedAmount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-l border-slate-100 pl-5 dark:border-slate-700 xl:py-1">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Resumo do período</p>
            <div className="mt-4 grid gap-3 text-sm">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Dentro da faixa</p>
                <p className="mt-1 font-bold text-emerald-600 dark:text-emerald-300">{activeGroups.filter((group) => group.status === 'within_reference').length} categoria{activeGroups.filter((group) => group.status === 'within_reference').length !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Acima da faixa</p>
                <p className="mt-1 font-bold text-amber-600 dark:text-amber-300">{alertCount} categoria{alertCount !== 1 ? 's' : ''}</p>
              </div>
              {overview.unclassifiedProjectedTotal > 0 && (
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Outros lançamentos</p>
                  <p className="mt-1 font-bold text-slate-700 dark:text-slate-200">{formatCurrency(overview.unclassifiedProjectedTotal)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {goalItems.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-5 dark:border-slate-700">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Target size={18} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Suas metas do mês</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Acompanhe o uso de cada limite que você definiu.</p>
              </div>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {goalItems.length} {goalItems.length === 1 ? 'meta ativa' : 'metas ativas'}
            </span>
          </div>

          <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
            {goalItems.map((item) => {
              const progress = (item.projectedAmount / item.targetAmount) * 100;
              const remainingAmount = item.targetAmount - item.projectedAmount;
              const goalStyle = GOAL_STYLES[getGoalStatus(item.status)];

              return (
                <div key={item.categoryId} className="border-l-2 border-slate-200 pl-3 dark:border-slate-600">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{item.categoryName}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatCurrency(item.projectedAmount)} de {formatCurrency(item.targetAmount)}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold ${goalStyle.text}`}>{goalStyle.label}</span>
                  </div>

                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full transition-all ${goalStyle.bar}`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.round(progress)}% utilizado</span>
                    <span className={remainingAmount < 0 ? 'font-medium text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}>
                      {remainingAmount < 0
                        ? `${formatCurrency(Math.abs(remainingAmount))} acima da meta`
                        : `Restam ${formatCurrency(remainingAmount)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
