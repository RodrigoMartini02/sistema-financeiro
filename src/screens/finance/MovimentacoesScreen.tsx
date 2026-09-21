import { useEffect, useState } from 'react';
import { Calendar, List, Plus, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useAppContext } from '../../context/AppContext';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { fetchCardLimits } from '../../services/cardLimitsService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { ErrorState } from '../../ui/states';
import { DespesasScreen, type FilteredSummary } from '../despesas/DespesasScreen';
import { ReceitasScreen } from '../receitas/ReceitasScreen';
import { CalendarSubViewToggle, type CalendarSubView } from './calendar/CalendarSubViewToggle';
import { CalendarView } from './calendar/CalendarView';
import { MonthYearPicker } from './MonthYearPicker';
import { MovementMetricCard } from './MovementMetricCard';
import { CardLimitRow } from './CardLimitRow';
import { formatCurrency } from './formatters';
import { BudgetPanel } from './BudgetPanel';

type MovementTab = 'receitas' | 'despesas' | 'planejamento';
type ViewMode = 'lista' | 'calendario';

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

export function MovimentacoesScreen() {
  const { setQuickAction, setFillViewport } = useAppContext();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<MovementTab>('receitas');
  const [viewMode, setViewMode] = useState<ViewMode>('lista');
  const [subView, setSubView] = useState<CalendarSubView>('mes');
  const isPlanning = activeTab === 'planejamento';
  const isCalendario = viewMode === 'calendario' && !isPlanning;
  const isLista = !isCalendario;
  const novaReceitaGuide = useFirstAccessGuide('receitas:novo-v1', { enabled: isLista });
  const novaDespesaGuide = useFirstAccessGuide('despesas:novo-v1', { enabled: isLista });

  // Altura total tambem na lista de despesas: cabecalho, filtros e cards de
  // resumo ficam fixos e so o corpo da tabela rola. Receitas e Planejamento
  // ficam de fora — nao foram readequadas para rolar por dentro e, sem isso,
  // travar a altura cortaria conteudo em vez de organizar.
  const preencherViewport = isCalendario || (isLista && activeTab === 'despesas');

  useEffect(() => {
    setFillViewport(preencherViewport);
    return () => setFillViewport(false);
  }, [preencherViewport, setFillViewport]);
  const finance = useFinanceDashboard(month, year);
  const cardLimits = useQuery({ queryKey: queryKeys.cardLimits, queryFn: fetchCardLimits, staleTime: 60_000 });

  const [despesasSummary, setDespesasSummary] = useState<FilteredSummary | null>(null);

  const dashboard = finance.dashboard.data;
  const saldoAnterior = dashboard?.balance.saldoAnterior ?? 0;
  const receitasMes = dashboard?.balance.receitas ?? 0;
  const despesasLancadasMes = dashboard?.balance.despesas ?? 0;
  const despesasMes = despesasSummary?.active ? despesasSummary.total : despesasLancadasMes;
  const resultadoMes = receitasMes - despesasMes;
  const saldoAtual = saldoAnterior + receitasMes - (dashboard?.balance.despesasPagas ?? 0);

  const handleTabChange = (tab: MovementTab) => {
    setActiveTab(tab);
    if (tab === 'planejamento') setViewMode('lista');
  };
  const movementTabs = <MovementTableToggle activeTab={activeTab} onChange={handleTabChange} />;

  return (
    <>
      <div className={preencherViewport ? 'flex h-full min-h-0 flex-col gap-3' : 'grid gap-5'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
            {isCalendario && <CalendarSubViewToggle value={subView} onChange={setSubView} />}

            {!isPlanning && (
              <div className="flex items-center gap-2 border-l border-slate-200 pl-2 dark:border-slate-700">
                <ViewModeToggle mode={viewMode} onChange={setViewMode} />
              </div>
            )}
          </div>

          {!isCalendario && !isPlanning && (
            <div className="flex flex-wrap items-center gap-2">
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
                    onSilenceAll={novaReceitaGuide.silenceAll}
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
                    onSilenceAll={novaDespesaGuide.silenceAll}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {finance.dashboard.error && (
          <ErrorState title="Não foi possível carregar as movimentações" description={finance.dashboard.error.message} />
        )}

        {!isCalendario && (
          <div className="grid shrink-0 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MovementMetricCard
              label="Saldo anterior"
              value={formatCurrency(saldoAnterior)}
              tone={saldoAnterior >= 0 ? 'income' : 'expense'}
            />
            <MovementMetricCard
              label="Receita do mês"
              value={formatCurrency(receitasMes)}
              tone="income"
              note={`${finance.dashboard.data?.incomes.length ?? 0} lançamento(s)`}
            />
            <MovementMetricCard
              label="Despesa do mês"
              value={formatCurrency(despesasMes)}
              tone="expense"
              note={despesasSummary?.active ? `${despesasSummary.count} lançamento(s) filtrado(s)` : `${finance.dashboard.data?.expenses.length ?? 0} lançamento(s)`}
            />
            <MovementMetricCard
              label="Resultado do mês"
              value={formatCurrency(resultadoMes)}
              tone={resultadoMes >= 0 ? 'income' : 'expense'}
              note="Receita − despesa lançada no mês"
            />
            <MovementMetricCard
              label="Saldo atual"
              value={formatCurrency(saldoAtual)}
              tone={saldoAtual >= 0 ? 'income' : 'expense'}
              note={`Saldo anterior ${formatCurrency(saldoAnterior)} + Receitas ${formatCurrency(receitasMes)} − Despesas pagas ${formatCurrency(dashboard?.balance.despesasPagas ?? 0)}`}
            />
          </div>
        )}

        {/* Grid em vez de flex-wrap: antes o rótulo era irmão dos cartões e
            disputava a linha com eles, então dois cartões ocupavam uma fração
            da largura. Agora a faixa inteira é dos cartões, que se redistribuem
            conforme a quantidade. */}
        {!isCalendario && (cardLimits.data?.length ?? 0) > 0 && (
          <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
            <div className="grid gap-x-5 gap-y-1.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              {cardLimits.data!.map((card) => (
                <CardLimitRow key={card.id} nome={card.nome} usado={card.usado} limite={card.limite} />
              ))}
            </div>
          </div>
        )}

        {isLista
          ? (activeTab === 'receitas'
              ? <ReceitasScreen month={month} year={year} toolbarStart={movementTabs} />
              : activeTab === 'despesas'
                // Despesas e a unica que ocupa a altura restante: a tabela rola
                // por dentro. As demais seguem com a pagina rolavel.
                ? <div className="flex min-h-0 flex-1 flex-col">
                    <DespesasScreen month={month} year={year} toolbarStart={movementTabs} onFilteredSummaryChange={setDespesasSummary} />
                  </div>
                : <BudgetPanel month={month} year={year} toolbarStart={movementTabs} />)
          : (
            <div className="min-h-0 flex-1">
              <CalendarView month={month} year={year} subView={subView} />
            </div>
          )}
      </div>
    </>
  );
}
