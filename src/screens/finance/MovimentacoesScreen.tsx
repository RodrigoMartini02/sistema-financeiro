import { useEffect, useState } from 'react';
import { Calendar, List, Lock, LockOpen, PiggyBank, Plus, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useAppContext } from '../../context/AppContext';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { apiRequest, getActiveAccountId } from '../../services/apiClient';
import { fetchDashboardAnual } from '../../services/financeService';
import { fetchCardLimits } from '../../services/cardLimitsService';
import { queryKeys } from '../../services/queryKeys';
import { fetchReservas, movimentar } from '../../services/reservasService';
import type { MovimentacaoFormValues } from '../../types/reservas';
import { Button } from '../../ui/button';
import { ErrorState } from '../../ui/states';
import { DespesasScreen, type FilteredSummary } from '../despesas/DespesasScreen';
import { ReceitasScreen } from '../receitas/ReceitasScreen';
import { ReserveMovementDialog } from '../reservas/ReserveMovementDialog';
import { CalendarSubViewToggle, type CalendarSubView } from './calendar/CalendarSubViewToggle';
import { CalendarView } from './calendar/CalendarView';
import { MonthYearPicker } from './MonthYearPicker';
import { MovementMetricCard } from './MovementMetricCard';
import { CardLimitRow } from './CardLimitRow';
import { formatCurrency } from './formatters';
import { BudgetPanel } from './BudgetPanel';

type MovementTab = 'receitas' | 'despesas' | 'planejamento';
type ViewMode = 'lista' | 'calendario';

const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-slate-600 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => onChange('lista')}
        className={[
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
          mode === 'lista' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
        ].join(' ')}
      >
        <List size={13} /> Lista
      </button>
      <button
        type="button"
        onClick={() => onChange('calendario')}
        className={[
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
          mode === 'calendario' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
        ].join(' ')}
      >
        <Calendar size={13} /> Calendário
      </button>
    </div>
  );
}

interface MovimentacoesScreenProps {
  onManageReserves: () => void;
}

interface MovementTableToggleProps {
  activeTab: MovementTab;
  onChange: (tab: MovementTab) => void;
}

function MovementTableToggle({ activeTab, onChange }: MovementTableToggleProps) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Conteúdo de movimentações">
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
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'planejamento'}
        onClick={() => onChange('planejamento')}
        className={[
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
          activeTab === 'planejamento'
            ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
        ].join(' ')}
      >
        <Target size={15} /> Planejamento
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
  const { setQuickAction, setFillViewport } = useAppContext();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<MovementTab>('receitas');
  const [viewMode, setViewMode] = useState<ViewMode>('lista');
  const [subView, setSubView] = useState<CalendarSubView>('mes');
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const isPlanning = activeTab === 'planejamento';
  const isCalendario = viewMode === 'calendario' && !isPlanning;
  const isLista = !isCalendario;
  const novaReceitaGuide = useFirstAccessGuide('receitas:novo-v1', { enabled: isLista });
  const novaDespesaGuide = useFirstAccessGuide('despesas:novo-v1', { enabled: isLista });
  const fecharMesGuide = useFirstAccessGuide('despesas:fechar-mes-v1');
  const reservaGuide = useFirstAccessGuide('reservas:movimentar-v1', { enabled: isLista });

  useEffect(() => {
    setFillViewport(isCalendario);
    return () => setFillViewport(false);
  }, [isCalendario, setFillViewport]);
  const qc = useQueryClient();
  const finance = useFinanceDashboard(month, year);
  const annual = useQuery({
    queryKey: queryKeys.dashboardAnual(year),
    queryFn: () => fetchDashboardAnual(year),
    staleTime: 60_000,
  });
  const reservas = useQuery({ queryKey: queryKeys.reservas, queryFn: fetchReservas });
  const cardLimits = useQuery({ queryKey: queryKeys.cardLimits, queryFn: fetchCardLimits, staleTime: 60_000 });

  const mesStatusQuery = useQuery({
    queryKey: queryKeys.mesStatus(year, month),
    queryFn: async () => {
      const accountId = getActiveAccountId();
      const query = accountId ? `?conta_id=${accountId}` : '';
      const months = await apiRequest<{ ano: number; mes: number; fechado: boolean }[]>(`/meses${query}`);
      return months.find((item) => item.ano === year && item.mes === month)?.fechado ?? false;
    },
  });
  const mesFechado = mesStatusQuery.data === true;

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const mesAnteriorStatusQuery = useQuery({
    queryKey: queryKeys.mesStatus(prevYear, prevMonth),
    queryFn: async () => {
      const accountId = getActiveAccountId();
      const query = accountId ? `?conta_id=${accountId}` : '';
      const months = await apiRequest<{ ano: number; mes: number; fechado: boolean }[]>(`/meses${query}`);
      return months.find((item) => item.ano === prevYear && item.mes === prevMonth)?.fechado ?? false;
    },
  });
  const mesAnteriorFechado = mesAnteriorStatusQuery.data === true;

  const [despesasSummary, setDespesasSummary] = useState<FilteredSummary | null>(null);

  const [mesActionError, setMesActionError] = useState('');

  const fecharMut = useMutation({
    mutationFn: async () => {
      const accountId = getActiveAccountId();
      await apiRequest<void>(`/meses/${year}/${month}/fechar`, {
        method: 'POST',
        body: JSON.stringify(accountId ? { conta_id: accountId } : {}),
      });
    },
    onSuccess: () => {
      setMesActionError('');
      qc.invalidateQueries({ queryKey: queryKeys.mesStatus(year, month) });
    },
    onError: (error: Error) => setMesActionError(error.message),
  });
  const reabrirMut = useMutation({
    mutationFn: async () => {
      const accountId = getActiveAccountId();
      await apiRequest<void>(`/meses/${year}/${month}/reabrir`, {
        method: 'POST',
        body: JSON.stringify(accountId ? { conta_id: accountId } : {}),
      });
    },
    onSuccess: () => {
      setMesActionError('');
      qc.invalidateQueries({ queryKey: queryKeys.mesStatus(year, month) });
    },
    onError: (error: Error) => setMesActionError(error.message),
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
  const receitasMes = annualMonth?.receitas ?? dashboard?.balance.receitas ?? 0;
  const despesasMes = annualMonth?.despesas ?? dashboard?.balance.despesas ?? 0;
  const despesas = despesasSummary?.active ? despesasSummary.total : despesasMes;
  const saldoAnterior = dashboard?.balance.saldoAnterior ?? 0;
  const saldoAtual = mesAnteriorFechado ? saldoAnterior + receitasMes : receitasMes;
  const saldoProjetado = saldoAtual - despesasMes;
  const comprometimento = saldoAtual > 0 ? (despesas / saldoAtual) * 100 : 0;

  const handleTabChange = (tab: MovementTab) => {
    setActiveTab(tab);
    if (tab === 'planejamento') setViewMode('lista');
  };
  const movementTabs = <MovementTableToggle activeTab={activeTab} onChange={handleTabChange} />;

  return (
    <>
      <div className={isCalendario ? 'flex h-full flex-col gap-3' : 'grid gap-5'}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Button
              variant="secondary"
              icon={mesFechado ? <LockOpen size={15} /> : <Lock size={15} />}
              onClick={() => mesFechado ? reabrirMut.mutate() : fecharMut.mutate()}
              disabled={fecharMut.isPending || reabrirMut.isPending}
              className={mesFechado ? '!bg-slate-200 !text-slate-600 hover:!bg-slate-300 dark:!bg-slate-700 dark:!text-slate-300' : ''}
            >
              {mesFechado ? 'Reabrir mês' : 'Fechar mês'}
            </Button>
            {fecharMesGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="top"
                align="right"
                className="w-[min(24rem,calc(100vw-2rem))]"
                icon={mesFechado ? LockOpen : Lock}
                description={firstAccessGuideMessages.despesasFecharMes}
                onDismiss={fecharMesGuide.dismiss}
              />
            )}
            {mesActionError && (
              <p className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap text-xs font-medium text-red-600 dark:text-red-400">
                {mesActionError}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 border-l border-slate-200 pl-2 dark:border-slate-700">
            <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
            {isCalendario && <CalendarSubViewToggle value={subView} onChange={setSubView} />}
          </div>

          {!isPlanning && (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2 dark:border-slate-700">
              <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            </div>
          )}

          {!isCalendario && !isPlanning && (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2 dark:border-slate-700">
              <div className="relative">
                <Button className="!bg-emerald-600 hover:!bg-emerald-700 focus:!ring-emerald-200" icon={<Plus size={15} />} onClick={() => setQuickAction('nova-receita')}>Nova receita</Button>
                {novaReceitaGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="top"
                    align="right"
                    className="w-[min(25rem,calc(100vw-2rem))]"
                    icon={TrendingUp}
                    description={firstAccessGuideMessages.receitasNova}
                    onDismiss={novaReceitaGuide.dismiss}
                  />
                )}
              </div>
              <div className="relative">
                <Button variant="danger" icon={<Plus size={15} />} onClick={() => setQuickAction('nova-despesa')}>Nova despesa</Button>
                {novaDespesaGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="top"
                    align="right"
                    className="w-[min(25rem,calc(100vw-2rem))]"
                    icon={TrendingDown}
                    description={firstAccessGuideMessages.despesasNova}
                    onDismiss={novaDespesaGuide.dismiss}
                  />
                )}
              </div>
              <div className="relative">
                <Button variant="secondary" icon={<PiggyBank size={15} />} onClick={() => setReserveDialogOpen(true)}>Movimentar reserva</Button>
                {reservaGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="top"
                    align="right"
                    className="w-[min(24rem,calc(100vw-2rem))]"
                    icon={PiggyBank}
                    description={firstAccessGuideMessages.reservasMovimentar}
                    onDismiss={reservaGuide.dismiss}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {(finance.dashboard.error ?? annual.error) && (
          <ErrorState title="Não foi possível carregar as movimentações" description={(finance.dashboard.error ?? annual.error)?.message} />
        )}

        {!isCalendario && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MovementMetricCard
              label="Saldo atual"
              value={formatCurrency(saldoAtual)}
              tone="income"
              note={mesAnteriorFechado
                ? `Saldo anterior ${formatCurrency(saldoAnterior)} + Receitas ${formatCurrency(receitasMes)}`
                : `${MONTH_NAMES_SHORT[prevMonth]}/${prevYear} ainda está aberto`}
            />
            <MovementMetricCard
              label="Despesas"
              value={formatCurrency(despesas)}
              tone="expense"
              progressPct={comprometimento}
              note={despesasSummary?.active ? `${despesasSummary.count} lançamento(s) filtrado(s)` : `${finance.dashboard.data?.expenses.length ?? 0} lançamento(s)`}
            />
            <MovementMetricCard label="Saldo projetado" value={formatCurrency(saldoProjetado)} tone={saldoProjetado >= 0 ? 'income' : 'expense'} note="Se tudo for pago em dia" />
            <MovementMetricCard
              label="Comprometimento"
              value={saldoAtual > 0 ? `${comprometimento.toFixed(0)}%` : '-'}
              tone={comprometimento > 90 ? 'expense' : comprometimento > 70 ? 'warning' : 'income'}
              progressPct={comprometimento}
              note={comprometimento > 85 ? 'Acima do limite de 85%' : 'Dentro do limite saudável'}
            />
          </div>
        )}

        {!isCalendario && (cardLimits.data?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Limite de crédito</span>
            {cardLimits.data!.map((card) => (
              <div key={card.id} className="flex min-w-[140px] flex-1 items-center gap-2">
                <CardLimitRow nome={card.nome} usado={card.usado} limite={card.limite} />
              </div>
            ))}
          </div>
        )}

        {isLista
          ? (activeTab === 'receitas'
              ? <ReceitasScreen month={month} year={year} toolbarStart={movementTabs} />
              : activeTab === 'despesas'
                ? <DespesasScreen month={month} year={year} toolbarStart={movementTabs} onFilteredSummaryChange={setDespesasSummary} />
                : <BudgetPanel month={month} year={year} toolbarStart={movementTabs} />)
          : (
            <div className="min-h-0 flex-1">
              <CalendarView month={month} year={year} subView={subView} />
            </div>
          )}
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
