import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Pencil, Plus, Target, Trash2, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BudgetOverviewItem, BudgetTargetMode } from '../../types/budget';
import { deleteBudgetTarget, fetchBudgetOverview, saveBudgetTarget } from '../../services/budgetService';
import { queryKeys } from '../../services/queryKeys';
import { Card } from '../../ui/card';
import { formatCurrency } from './formatters';

interface BudgetPanelProps {
  month: number;
  year: number;
  toolbarStart?: ReactNode;
}

function statusLabel(item: BudgetOverviewItem): string {
  if (!item.targetAmount) return 'Sem meta';
  const percentage = (item.projectedAmount / item.targetAmount) * 100;
  if (item.status === 'over') return `${percentage.toFixed(0)}% da meta`;
  if (item.status === 'attention') return `${percentage.toFixed(0)}% da meta`;
  return `${percentage.toFixed(0)}% da meta`;
}

function statusClass(item: BudgetOverviewItem): string {
  if (item.status === 'over') return 'bg-red-50 text-red-700 dark:bg-red-950/45 dark:text-red-300';
  if (item.status === 'attention') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/45 dark:text-amber-300';
  if (item.status === 'healthy') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

export function BudgetPanel({ month, year, toolbarStart }: BudgetPanelProps) {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: queryKeys.budgetOverview(month, year),
    queryFn: () => fetchBudgetOverview(month, year),
    staleTime: 30_000,
  });
  const overview = overviewQuery.data;
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [mode, setMode] = useState<BudgetTargetMode>('amount');
  const [targetValue, setTargetValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => overview?.items.find((item) => item.categoryId === editingCategoryId) ?? null,
    [editingCategoryId, overview?.items],
  );

  useEffect(() => {
    if (!selectedItem) return;
    setMode(selectedItem.mode ?? 'amount');
    setTargetValue(selectedItem.targetValue?.toString() ?? selectedItem.suggestedAmount?.toFixed(2) ?? '');
    setFormError(null);
  }, [selectedItem]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.budgetOverview(month, year) });
  const saveMutation = useMutation({
    mutationFn: saveBudgetTarget,
    onSuccess: async () => {
      await invalidate();
      setEditingCategoryId(null);
      setTargetValue('');
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'Não foi possível salvar a meta.'),
  });
  const removeMutation = useMutation({
    mutationFn: deleteBudgetTarget,
    onSuccess: invalidate,
  });

  if (overviewQuery.isLoading) {
    return (
      <Card className="p-5">
        {toolbarStart && <div className="mb-4">{toolbarStart}</div>}
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando planejamento...</p>
      </Card>
    );
  }
  if (overviewQuery.error || !overview) {
    return (
      <Card className="p-5">
        {toolbarStart && <div className="mb-4">{toolbarStart}</div>}
        <p className="text-sm text-rose-600 dark:text-rose-300">Não foi possível carregar o planejamento deste período.</p>
      </Card>
    );
  }
  if (overview.profileType === 'empresa') {
    return (
      <Card className="p-5">
        {toolbarStart && <div className="mb-4">{toolbarStart}</div>}
        <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"><Target size={17} /></span>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Planejamento pessoal</p>
            <p className="mt-1">Metas de orçamento por categoria ficam disponíveis apenas no perfil pessoal.</p>
          </div>
        </div>
      </Card>
    );
  }

  const alertItems = overview.items.filter((item) => item.status === 'attention' || item.status === 'over');

  const submitTarget = () => {
    if (!selectedItem) return;
    const parsedValue = Number(targetValue.replace(',', '.'));
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setFormError('Informe uma meta maior que zero.');
      return;
    }
    setFormError(null);
    saveMutation.mutate({ categoryId: selectedItem.categoryId, mode, targetValue: parsedValue });
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {toolbarStart && <div className="mb-3">{toolbarStart}</div>}
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Planejamento de orçamento</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Defina metas pessoais por categoria e acompanhe o lançado e projetado no período.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
          <p>Receitas: <strong className="text-slate-700 dark:text-slate-200">{formatCurrency(overview.incomeTotal)}</strong></p>
          <p className="mt-1">Despesas previstas: <strong className="text-slate-700 dark:text-slate-200">{formatCurrency(overview.projectedTotal)}</strong></p>
        </div>
      </div>

      {alertItems.length > 0 && (
        <div className="mt-4 grid gap-2">
          {alertItems.map((item) => (
            <div key={item.categoryId} className={[
              'flex items-center gap-2 border px-3 py-2 text-xs',
              item.status === 'over'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
            ].join(' ')}>
              <AlertTriangle size={15} className="shrink-0" />
              <span><strong>{item.categoryName}</strong> está em {statusLabel(item)}.</span>
            </div>
          ))}
        </div>
      )}

      {editingCategoryId !== null && (
        <div className="mt-4 border border-cyan-200 bg-cyan-50/50 p-3 dark:border-cyan-900 dark:bg-cyan-950/20">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Meta: {selectedItem?.categoryName}</p>
            <button
              type="button"
              onClick={() => setEditingCategoryId(null)}
              className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Cancelar edição da meta"
              title="Cancelar"
            >
              <X size={16} />
            </button>
          </div>
          {selectedItem?.suggestedAmount && !selectedItem.mode && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Sugestão pela média dos três meses anteriores: {formatCurrency(selectedItem.suggestedAmount)}.
            </p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as BudgetTargetMode)}
              className="h-10 border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="amount">Valor mensal (R$)</option>
              <option value="income_percent">Percentual da receita</option>
            </select>
            <input
              type="number"
              min="0"
              max={mode === 'income_percent' ? 100 : undefined}
              step="0.01"
              value={targetValue}
              onChange={(event) => setTargetValue(event.target.value)}
              placeholder={mode === 'income_percent' ? 'Ex.: 15' : 'Ex.: 800,00'}
              className="h-10 border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0C9EAF] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <button
              type="button"
              onClick={submitTarget}
              disabled={saveMutation.isPending}
              className="flex h-10 items-center justify-center gap-2 bg-[#0C9EAF] px-4 text-sm font-semibold text-white transition hover:bg-[#087B89] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Check size={16} /> {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          {formError && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-300">{formError}</p>}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:hidden">
        {overview.items.map((item) => (
          <div key={item.categoryId} className="border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{item.categoryName}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Projetado: {formatCurrency(item.projectedAmount)}</p>
              </div>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingCategoryId(item.categoryId)}
                  className="flex h-8 w-8 items-center justify-center text-slate-500 transition hover:bg-slate-100 hover:text-[#087B89] dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label={`${item.mode ? 'Editar' : 'Definir'} meta para ${item.categoryName}`}
                  title={item.mode ? 'Editar meta' : 'Definir meta'}
                >
                  {item.mode ? <Pencil size={15} /> : <Plus size={16} />}
                </button>
                {item.mode && (
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(item.categoryId)}
                    disabled={removeMutation.isPending}
                    className="flex h-8 w-8 items-center justify-center text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                    aria-label={`Remover meta de ${item.categoryName}`}
                    title="Remover meta"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {item.targetAmount ? (
                <span className={['inline-flex px-2 py-1 font-semibold', statusClass(item)].join(' ')}>
                  Meta: {formatCurrency(item.targetAmount)} · {statusLabel(item)}
                </span>
              ) : <span className="text-slate-400">Sem meta definida</span>}
              <span className="text-slate-500 dark:text-slate-400">
                {item.incomePercentage === null ? 'Sem receitas no período' : `${item.incomePercentage.toFixed(1)}% da receita`}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="min-w-[650px] w-full text-left text-xs">
          <thead className="border-y border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <tr>
              <th className="py-2 pr-3 font-semibold">Categoria</th>
              <th className="py-2 pr-3 font-semibold">Projetado</th>
              <th className="py-2 pr-3 font-semibold">Meta</th>
              <th className="py-2 pr-3 font-semibold">Receita</th>
              <th className="py-2 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {overview.items.map((item) => (
              <tr key={item.categoryId}>
                <td className="py-3 pr-3 font-semibold text-slate-800 dark:text-slate-100">{item.categoryName}</td>
                <td className="py-3 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(item.projectedAmount)}</td>
                <td className="py-3 pr-3">
                  {item.targetAmount ? (
                    <span className={['inline-flex px-2 py-1 font-semibold', statusClass(item)].join(' ')}>
                      {formatCurrency(item.targetAmount)} · {statusLabel(item)}
                    </span>
                  ) : <span className="text-slate-400">Sem meta</span>}
                </td>
                <td className="py-3 pr-3 text-slate-600 dark:text-slate-300">
                  {item.incomePercentage === null ? 'Sem receitas' : `${item.incomePercentage.toFixed(1)}%`}
                </td>
                <td className="py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingCategoryId(item.categoryId)}
                      className="flex h-8 w-8 items-center justify-center text-slate-500 transition hover:bg-slate-100 hover:text-[#087B89] dark:text-slate-400 dark:hover:bg-slate-800"
                      aria-label={`${item.mode ? 'Editar' : 'Definir'} meta para ${item.categoryName}`}
                      title={item.mode ? 'Editar meta' : 'Definir meta'}
                    >
                      {item.mode ? <Pencil size={15} /> : <Plus size={16} />}
                    </button>
                    {item.mode && (
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(item.categoryId)}
                        disabled={removeMutation.isPending}
                        className="flex h-8 w-8 items-center justify-center text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                        aria-label={`Remover meta de ${item.categoryName}`}
                        title="Remover meta"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
