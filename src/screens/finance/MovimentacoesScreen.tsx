import { useEffect, useState } from 'react';
import { Calendar, List, Plus, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useAppContext } from '../../context/AppContext';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { useOwnPermissions } from '../../hooks/useOwnPermissions';
import { fetchCardLimits } from '../../services/cardLimitsService';
import { queryKeys } from '../../services/queryKeys';
import { getActiveAccountId } from '../../services/apiClient';
import { ErrorState } from '../../ui/states';
import { MultiFilterPanel } from '../../ui/MultiFilterPanel';
import { dangerButtonStyle, successOutlineButtonStyle, neutralOutlineButtonStyle, neutralOutlineButtonOffStyle } from '../../ui/dialogFormTokens';
import { filterExpenses } from '../../utils/expenseFilters';
import { effectiveExpenseValue } from '../../utils/expenseValue';
import { canReadCatalogList, movementControls } from '../../utils/screenAccess';
import { CalendarSubViewToggle, type CalendarSubView } from './calendar/CalendarSubViewToggle';
import { CalendarView } from './calendar/CalendarView';
import { MonthYearPicker } from './MonthYearPicker';
import { MovementMetricCard } from './MovementMetricCard';
import { CardLimitRow } from './CardLimitRow';
import { formatCurrency } from './formatters';
import { useEntryFilters } from './useEntryFilters';
import { BudgetPanel } from './BudgetPanel';
import {
  LancamentosTable, OrdenarChip, type Ordenar,
} from './LancamentosTable';

type MovementTab = 'lancamentos' | 'planejamento';
type ViewMode = 'lista' | 'calendario';

function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onChange('lista')} style={mode === 'lista' ? neutralOutlineButtonStyle : neutralOutlineButtonOffStyle}>
        <List size={13} /> Lista
      </button>
      <button type="button" onClick={() => onChange('calendario')} style={mode === 'calendario' ? neutralOutlineButtonStyle : neutralOutlineButtonOffStyle}>
        <Calendar size={13} /> Calendário
      </button>
    </div>
  );
}

function MovementSectionToggle({ activeTab, onChange }: { activeTab: MovementTab; onChange: (tab: MovementTab) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="tablist" aria-label="Conteúdo de movimentações">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'lancamentos'}
        onClick={() => onChange('lancamentos')}
        style={activeTab === 'lancamentos' ? neutralOutlineButtonStyle : neutralOutlineButtonOffStyle}
      >
        <List size={13} /> Lançamentos
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'planejamento'}
        onClick={() => onChange('planejamento')}
        style={activeTab === 'planejamento' ? neutralOutlineButtonStyle : neutralOutlineButtonOffStyle}
      >
        <Target size={13} /> Planejamento
      </button>
    </div>
  );
}

const ORDENAR_OPTIONS = [
  { value: 'cadastro_desc', label: 'Mais recentes' },
  { value: 'data_desc', label: 'Data (mais recente)' },
  { value: 'data_asc', label: 'Data (mais antiga)' },
  { value: 'valor_desc', label: 'Maior valor' },
  { value: 'valor_asc', label: 'Menor valor' },
  { value: 'descricao', label: 'Descrição (A-Z)' },
];

export function MovimentacoesScreen() {
  const { setQuickAction, setFillViewport } = useAppContext();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<MovementTab>('lancamentos');
  const [viewMode, setViewMode] = useState<ViewMode>('lista');
  const [subView, setSubView] = useState<CalendarSubView>('mes');
  const isPlanning = activeTab === 'planejamento';
  const isCalendario = viewMode === 'calendario' && !isPlanning;
  const isLista = !isCalendario;
  const isEmpresa = localStorage.getItem('contaAtivaTipo') === 'empresa';
  // Cada botão e cada modo só aparece com a permissão correspondente; enquanto
  // as permissões carregam, nenhum aparece.
  const permissions = useOwnPermissions() ?? {};
  const controls = movementControls(permissions);
  const novaReceitaGuide = useFirstAccessGuide('receitas:novo-v1', { enabled: isLista && controls.newIncome });
  const novaDespesaGuide = useFirstAccessGuide('despesas:novo-v1', { enabled: isLista && controls.newExpense });

  // Altura total: cabecalho, filtros e cards de resumo ficam fixos e so o
  // corpo da tabela rola. Planejamento fica de fora — nao foi readequado
  // para rolar por dentro e, sem isso, travar a altura cortaria conteudo.
  const preencherViewport = isCalendario || (isLista && activeTab === 'lancamentos');

  useEffect(() => {
    setFillViewport(preencherViewport);
    return () => setFillViewport(false);
  }, [preencherViewport, setFillViewport]);

  const [ordenar, setOrdenar] = useState<Ordenar>('cadastro_desc');
  const [tableData, setTableData] = useState<{ formas: string[]; cartoes: [string, string][] }>({ formas: [], cartoes: [] });

  // Botão de filtros (mesmo de Relatórios): estado único que também controla
  // a faixa de limite de cartões e a tabela combinada.
  const filters = useEntryFilters({ paymentMethods: tableData.formas, cards: tableData.cartoes });
  const { meId: meIdStr, familyScope: escopoFamilia, visibleNames: nomesVisiveis } = filters;

  const activeAccountId = getActiveAccountId();
  const cardLimits = useQuery({
    queryKey: queryKeys.cardLimits(activeAccountId, escopoFamilia ? 'familia' : undefined),
    queryFn: () => fetchCardLimits(escopoFamilia ? 'familia' : undefined),
    enabled: canReadCatalogList(permissions, 'cards'),
    staleTime: 60_000,
  });

  const finance = useFinanceDashboard(month, year, true, escopoFamilia ? 'familia' : undefined);

  const dashboard = finance.dashboard.data;
  const saldoAnterior = dashboard?.balance.saldoAnterior ?? 0;
  const receitasMes = dashboard?.balance.receitas ?? 0;
  const despesasLancadasMes = dashboard?.balance.despesas ?? 0;
  // Com filtro ativo, o total de despesas segue a mesma regra da tabela
  // (filterExpenses), calculado aqui: a tabela não precisa avisar a tela.
  const filteredExpenses = filters.hasActiveFilters
    ? filterExpenses(dashboard?.expenses ?? [], filters.state, { meId: meIdStr, visibleNames: nomesVisiveis }, month, year)
    : null;
  // Só a "Despesa do mês" segue o filtro, pelo valor efetivo (o pago, quando
  // paga). Resultado e saldo atual são sempre do mês inteiro, como saldo
  // anterior e receita, para nenhum card misturar filtrado com não filtrado.
  const despesasMes = filteredExpenses ? filteredExpenses.reduce((sum, item) => sum + effectiveExpenseValue(item), 0) : despesasLancadasMes;
  const resultadoMes = receitasMes - despesasLancadasMes;
  const saldoAtual = saldoAnterior + receitasMes - (dashboard?.balance.despesasPagas ?? 0);

  const handleTabChange = (tab: MovementTab) => {
    setActiveTab(tab);
    if (tab === 'planejamento') setViewMode('lista');
  };

  return (
    <>
      <div className={preencherViewport ? 'flex h-full min-h-0 flex-col gap-3' : 'grid gap-5'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />

            <div className="flex flex-wrap items-center gap-2">
              {controls.newIncome && (
                <div className="relative">
                  <button type="button" style={successOutlineButtonStyle} onClick={() => setQuickAction('nova-receita')}>
                    <Plus size={15} /> Nova receita
                  </button>
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
              )}
              {controls.newExpense && (
                <div className="relative">
                  <button type="button" style={dangerButtonStyle} onClick={() => setQuickAction('nova-despesa')}>
                    <Plus size={15} /> Nova despesa
                  </button>
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
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isCalendario && <CalendarSubViewToggle value={subView} onChange={setSubView} />}
            {!isPlanning && controls.calendar && <ViewModeToggle mode={viewMode} onChange={setViewMode} />}
            {controls.planning && <MovementSectionToggle activeTab={activeTab} onChange={handleTabChange} />}
            <OrdenarChip options={ORDENAR_OPTIONS} value={ordenar} onChange={(v) => setOrdenar(v as Ordenar)} />
            <MultiFilterPanel groups={filters.groups} hasActiveFilters={filters.hasActiveFilters} onClear={filters.clear} />
          </div>
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
              note={filteredExpenses ? `${filteredExpenses.length} lançamento(s) filtrado(s)` : `${finance.dashboard.data?.expenses.length ?? 0} lançamento(s)`}
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
              note="Saldo anterior + Receitas − Despesas pagas"
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
                <CardLimitRow key={card.id} nome={card.nome} usado={card.usado} limite={card.limite} disponivel={card.disponivel} />
              ))}
            </div>
          </div>
        )}

        {isLista
          ? (activeTab === 'lancamentos'
              ? <div className="flex min-h-0 flex-1 flex-col">
                  <LancamentosTable
                    month={month}
                    year={year}
                    isEmpresa={isEmpresa}
                    escopoFamilia={escopoFamilia}
                    meIdStr={meIdStr}
                    nomesVisiveis={nomesVisiveis}
                    filtroTipo={filters.state.types}
                    filtroStatus={filters.state.statuses}
                    filtroCategoria={filters.state.categoryIds}
                    filtroFormaPag={filters.state.paymentMethods}
                    filtroCartao={filters.state.cardIds}
                    filtroDataPag={filters.state.paymentDates}
                    ordenar={ordenar}
                    hasFilter={filters.hasActiveFilters}
                    onDataLoaded={setTableData}
                  />
                </div>
              : <BudgetPanel month={month} year={year} />)
          : (
            <div className="min-h-0 flex-1">
              <CalendarView month={month} year={year} subView={subView} />
            </div>
          )}
      </div>
    </>
  );
}
