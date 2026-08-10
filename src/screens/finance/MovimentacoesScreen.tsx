import { useState } from 'react';
import { Lock, LockOpen, PiggyBank, Plus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../../context/AppContext';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { apiRequest, getActiveProfileId } from '../../services/apiClient';
import { fetchDashboardAnual } from '../../services/financeService';
import { queryKeys } from '../../services/queryKeys';
import { fetchReservas, movimentar } from '../../services/reservasService';
import type { MovimentacaoFormValues } from '../../types/reservas';
import { Button } from '../../ui/button';
import { ErrorState } from '../../ui/states';
import { DespesasScreen } from '../despesas/DespesasScreen';
import { ReceitasScreen } from '../receitas/ReceitasScreen';
import { ReserveMovementDialog } from '../reservas/ReserveMovementDialog';
import { MetricCard } from './MetricCard';
import { MonthSelector } from './MonthSelector';
import { formatCurrency } from './formatters';

type MovementTab = 'receitas' | 'despesas';

interface MovimentacoesScreenProps {
  onManageReserves: () => void;
}

interface MovementTableToggleProps {
  activeTab: MovementTab;
  onChange: (tab: MovementTab) => void;
}

function MovementTableToggle({ activeTab, onChange }: MovementTableToggleProps) {
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="Tipo de movimentação">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'receitas'}
        onClick={() => onChange('receitas')}
        className={[
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
          activeTab === 'receitas'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
        ].join(' ')}
      >
        <TrendingUp size={15} /> Receitas
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'despesas'}
        onClick={() => onChange('despesas')}
        className={[
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
          activeTab === 'despesas'
            ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
        ].join(' ')}
      >
        <TrendingDown size={15} /> Despesas
      </button>
    </div>
  );
}

function getDefaultMovementDate(month: number, year: number): string {
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const day = isCurrentMonth ? today.getDate() : 1;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function MovimentacoesScreen({ onManageReserves }: MovimentacoesScreenProps) {
  const { month, year, setMonth, setYear, setQuickAction } = useAppContext();
  const [activeTab, setActiveTab] = useState<MovementTab>('receitas');
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const qc = useQueryClient();
  const finance = useFinanceDashboard(month, year);
  const annual = useQuery({
    queryKey: queryKeys.dashboardAnual(year),
    queryFn: () => fetchDashboardAnual(year),
    staleTime: 60_000,
  });
  const reservas = useQuery({ queryKey: queryKeys.reservas, queryFn: fetchReservas });

  const mesStatusQuery = useQuery({
    queryKey: queryKeys.mesStatus(year, month),
    queryFn: async () => {
      const profileId = getActiveProfileId();
      const query = profileId ? `?perfil_id=${profileId}` : '';
      const months = await apiRequest<{ ano: number; mes: number; fechado: boolean }[]>(`/meses${query}`);
      return months.find((item) => item.ano === year && item.mes === month)?.fechado ?? false;
    },
  });
  const mesFechado = mesStatusQuery.data === true;

  const fecharMut = useMutation({
    mutationFn: async () => {
      const profileId = getActiveProfileId();
      await apiRequest<void>(`/meses/${year}/${month}/fechar`, {
        method: 'POST',
        body: JSON.stringify(profileId ? { perfil_id: profileId } : {}),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mesStatus(year, month) }),
  });
  const reabrirMut = useMutation({
    mutationFn: async () => {
      const profileId = getActiveProfileId();
      await apiRequest<void>(`/meses/${year}/${month}/reabrir`, {
        method: 'POST',
        body: JSON.stringify(profileId ? { perfil_id: profileId } : {}),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mesStatus(year, month) }),
  });
  const moveReserveMut = useMutation({
    mutationFn: ({ reserveId, values }: { reserveId: number; values: MovimentacaoFormValues }) => movimentar(reserveId, values),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.reservas });
      setReserveDialogOpen(false);
    },
  });

  const dashboard = finance.dashboard.data;
  const annualMonth = annual.data?.[month];
  const receitas = annualMonth?.receitas ?? dashboard?.balance.receitas ?? 0;
  const despesas = annualMonth?.despesas ?? dashboard?.balance.despesas ?? 0;
  const saldoAnterior = dashboard?.balance.saldoAnterior ?? 0;
  const saldoProjetado = saldoAnterior + receitas - despesas;
  const comprometimento = receitas > 0 ? (despesas / receitas) * 100 : 0;

  const handleRefresh = () => {
    void finance.dashboard.refetch();
    void annual.refetch();
    void reservas.refetch();
  };
  const movementTabs = <MovementTableToggle activeTab={activeTab} onChange={setActiveTab} />;

  return (
    <>
      <div className="grid gap-5">
        <div className="grid gap-3">
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">Movimentações</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={handleRefresh}>Atualizar</Button>
              <Button
                variant="secondary"
                icon={mesFechado ? <LockOpen size={15} /> : <Lock size={15} />}
                onClick={() => mesFechado ? reabrirMut.mutate() : fecharMut.mutate()}
                disabled={fecharMut.isPending || reabrirMut.isPending}
              >
                {mesFechado ? 'Reabrir mês' : 'Fechar mês'}
              </Button>
              <Button className="!bg-emerald-600 hover:!bg-emerald-700 focus:!ring-emerald-200" icon={<Plus size={15} />} onClick={() => setQuickAction('nova-receita')}>Nova receita</Button>
              <Button variant="danger" icon={<Plus size={15} />} onClick={() => setQuickAction('nova-despesa')}>Nova despesa</Button>
              <Button variant="secondary" icon={<PiggyBank size={15} />} onClick={() => setReserveDialogOpen(true)}>Movimentar reserva</Button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
            <MonthSelector month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
          </div>
        </div>

        {saldoProjetado < 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            Despesas superam receitas em <strong>{formatCurrency(Math.abs(saldoProjetado))}</strong> neste mês.
          </div>
        )}

        {(finance.dashboard.error ?? annual.error) && (
          <ErrorState title="Não foi possível carregar as movimentações" description={(finance.dashboard.error ?? annual.error)?.message} />
        )}

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard label="Saldo anterior" value={formatCurrency(saldoAnterior)} tone="slate" />
          <MetricCard label="Receitas" value={formatCurrency(receitas)} tone="income" />
          <MetricCard label="Despesas" value={formatCurrency(despesas)} tone="expense" />
          <MetricCard label="Saldo projetado" value={formatCurrency(saldoProjetado)} tone={saldoProjetado >= 0 ? 'income' : 'expense'} />
          <MetricCard
            label="Comprometimento"
            value={receitas > 0 ? `${comprometimento.toFixed(0)}%` : '-'}
            tone={comprometimento > 90 ? 'expense' : comprometimento > 70 ? 'warning' : 'income'}
          />
        </div>

        {activeTab === 'receitas'
          ? <ReceitasScreen embedded toolbarStart={movementTabs} />
          : <DespesasScreen embedded toolbarStart={movementTabs} />}
      </div>

      <ReserveMovementDialog
        open={reserveDialogOpen}
        reservas={reservas.data ?? []}
        defaultDate={getDefaultMovementDate(month, year)}
        isSaving={moveReserveMut.isPending}
        error={moveReserveMut.error?.message}
        onClose={() => setReserveDialogOpen(false)}
        onManageReserves={() => {
          setReserveDialogOpen(false);
          onManageReserves();
        }}
        onSubmit={(reserveId, values) => moveReserveMut.mutate({ reserveId, values })}
      />
    </>
  );
}
