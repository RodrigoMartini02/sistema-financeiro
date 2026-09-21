import { useEffect, useState } from 'react';
import { Calendar, List, Plus, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useAppContext } from '../../context/AppContext';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { fetchCardLimits } from '../../services/cardLimitsService';
import { fetchCategorias } from '../../services/configService';
import { fetchMembros } from '../../services/membrosService';
import { fetchMe } from '../../services/usuariosService';
import { queryKeys } from '../../services/queryKeys';
import { getActiveAccountId } from '../../services/apiClient';
import { ErrorState } from '../../ui/states';
import { MultiFilterPanel, type FilterGroup } from '../../ui/MultiFilterPanel';
import { dangerButtonStyle, successOutlineButtonStyle, neutralOutlineButtonStyle, neutralOutlineButtonOffStyle } from '../../ui/dialogFormTokens';
import { groupSelectableCategories } from '../../utils/categorySuggestions';
import type { Expense, Income } from '../../types/finance';
import { CalendarSubViewToggle, type CalendarSubView } from './calendar/CalendarSubViewToggle';
import { CalendarView } from './calendar/CalendarView';
import { MonthYearPicker } from './MonthYearPicker';
import { MovementMetricCard } from './MovementMetricCard';
import { CardLimitRow } from './CardLimitRow';
import { formatCurrency } from './formatters';
import { BudgetPanel } from './BudgetPanel';
import {
  LancamentosTable, OrdenarChip, getFormaLabel,
  type TipoLancamento, type FiltroStatus, type FiltroDataPag, type Ordenar,
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
  const novaReceitaGuide = useFirstAccessGuide('receitas:novo-v1', { enabled: isLista });
  const novaDespesaGuide = useFirstAccessGuide('despesas:novo-v1', { enabled: isLista });

  // Altura total: cabecalho, filtros e cards de resumo ficam fixos e so o
  // corpo da tabela rola. Planejamento fica de fora — nao foi readequado
  // para rolar por dentro e, sem isso, travar a altura cortaria conteudo.
  const preencherViewport = isCalendario || (isLista && activeTab === 'lancamentos');

  useEffect(() => {
    setFillViewport(preencherViewport);
    return () => setFillViewport(false);
  }, [preencherViewport, setFillViewport]);

  // Filtro de Membros elevado para o pai: antes era estado duplicado e
  // independente em DespesasScreen e ReceitasScreen, com escopoFamilia
  // podendo divergir entre as duas telas. Agora e uma unica fonte, que
  // tambem controla a faixa de limite de cartoes e a tabela combinada.
  const [filtroMembros, setFiltroMembros] = useState<Set<string>>(new Set());
  const meQ = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe, staleTime: 5 * 60_000 });
  const activeAccountId = getActiveAccountId();
  const membrosQ = useQuery({
    queryKey: queryKeys.membros(activeAccountId),
    queryFn: () => fetchMembros(activeAccountId ?? undefined),
    staleTime: 5 * 60_000,
  });
  const categoriasQ = useQuery({
    queryKey: queryKeys.categorias(activeAccountId),
    queryFn: () => fetchCategorias(activeAccountId),
    staleTime: 5 * 60_000,
  });
  const meIdStr = meQ.data ? String(meQ.data.id) : null;
  useEffect(() => {
    if (!meIdStr) return;
    setFiltroMembros((prev) => (prev.size === 0 ? new Set([meIdStr]) : prev));
  }, [meIdStr]);
  const temMembros = (membrosQ.data?.length ?? 0) > 0;
  const outrosMembros = (membrosQ.data ?? []).filter((m) => m.usuario_id !== meQ.data?.id);
  const escopoFamilia = [...filtroMembros].some((id) => id !== meIdStr);
  const nomesVisiveis = new Set(
    [...filtroMembros]
      .map((id) => (id === meIdStr ? (meQ.data?.nomeExibicao ?? meQ.data?.nome) : outrosMembros.find((m) => String(m.usuario_id) === id)?.nome))
      .filter(Boolean) as string[],
  );

  const cardLimits = useQuery({
    queryKey: queryKeys.cardLimits(activeAccountId, escopoFamilia ? 'familia' : undefined),
    queryFn: () => fetchCardLimits(escopoFamilia ? 'familia' : undefined),
    staleTime: 60_000,
  });

  // Filtro de Tipo: substitui as antigas abas Receitas/Despesas por um grupo
  // de filtro multi-selecao dentro do mesmo painel — default ambos marcados.
  const [filtroTipo, setFiltroTipo] = useState<Set<TipoLancamento>>(new Set(['receita', 'despesa']));
  const [filtroStatus, setFiltroStatus] = useState<Set<FiltroStatus>>(new Set());
  const [filtroCategoria, setFiltroCategoria] = useState<Set<string>>(new Set());
  const [filtroFormaPag, setFiltroFormaPag] = useState<Set<string>>(new Set());
  const [filtroCartao, setFiltroCartao] = useState<Set<string>>(new Set());
  const [filtroDataPag, setFiltroDataPag] = useState<Set<FiltroDataPag>>(new Set());
  const [ordenar, setOrdenar] = useState<Ordenar>('cadastro_desc');

  const [tableData, setTableData] = useState<{ expenses: Expense[]; incomes: Income[]; formas: string[]; cartoes: [string, string][] }>({
    expenses: [], incomes: [], formas: [], cartoes: [],
  });
  const [despesasSummary, setDespesasSummary] = useState<{ total: number; count: number; active: boolean } | null>(null);

  const categoriaOptions = groupSelectableCategories(categoriasQ.data ?? [])
    .flatMap((group) => group.parent
      ? [
          { value: group.parent.nome, label: group.parent.nome },
          ...group.items.map((c) => ({ value: c.nome, label: c.nome, parentValue: group.parent!.nome })),
        ]
      : group.items.map((c) => ({ value: c.nome, label: c.nome })))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  const membrosEhEstadoBase = meIdStr != null && filtroMembros.size === 1 && filtroMembros.has(meIdStr);
  const hasFilterDespesa =
    filtroStatus.size > 0 || filtroCategoria.size > 0 || filtroFormaPag.size > 0
    || filtroCartao.size > 0 || filtroDataPag.size > 0;
  const hasFilter = hasFilterDespesa || !membrosEhEstadoBase || filtroTipo.size !== 2;

  const filterGroups: FilterGroup[] = [
    {
      id: 'tipo',
      label: 'Tipo',
      options: [
        { value: 'receita', label: 'Receita' },
        { value: 'despesa', label: 'Despesa' },
      ],
      selected: filtroTipo,
      onChange: (next) => setFiltroTipo(next as Set<TipoLancamento>),
    },
    // Grupos de despesa so aparecem quando "Despesa" esta marcado no filtro
    // de Tipo — nao fazem sentido isolados para receita.
    ...(filtroTipo.has('despesa') ? [
      {
        id: 'status',
        label: 'Status',
        options: [
          { value: 'pago', label: 'Pago' },
          { value: 'em_dia', label: 'Em dia' },
          { value: 'atrasada', label: 'Atrasada' },
        ],
        selected: filtroStatus,
        onChange: (next: Set<string>) => setFiltroStatus(next as Set<FiltroStatus>),
      },
      {
        id: 'categoria',
        label: 'Categoria',
        options: categoriaOptions,
        selected: filtroCategoria,
        onChange: setFiltroCategoria,
      },
      {
        id: 'forma-pagamento',
        label: 'Forma de pagamento',
        options: tableData.formas.map((f) => ({ value: f, label: getFormaLabel(f) })),
        selected: filtroFormaPag,
        onChange: setFiltroFormaPag,
      },
      ...(tableData.cartoes.length > 0 ? [{
        id: 'cartao',
        label: 'Cartão',
        options: tableData.cartoes.map(([id, nome]) => ({ value: id, label: nome })),
        selected: filtroCartao,
        onChange: setFiltroCartao,
      }] : []),
      {
        id: 'data-pagamento',
        label: 'Data de pagamento',
        options: [
          { value: 'hoje', label: 'Pago hoje' },
          { value: 'semana', label: 'Esta semana' },
          { value: 'mes', label: 'Este mês' },
        ],
        selected: filtroDataPag,
        onChange: (next: Set<string>) => setFiltroDataPag(next as Set<FiltroDataPag>),
      },
    ] : []),
    // Membros sempre visivel e compartilhado — nao muda entre estados do
    // filtro de Tipo.
    ...(temMembros && meQ.data ? [{
      id: 'membros',
      label: 'Membros',
      options: [
        { value: meIdStr!, label: `${meQ.data.nomeExibicao ?? meQ.data.nome} (você)` },
        ...outrosMembros.map((m) => ({ value: String(m.usuario_id), label: m.nome })),
      ],
      selected: filtroMembros,
      onChange: setFiltroMembros,
    }] : []),
  ];

  const handleClearFilters = () => {
    setFiltroTipo(new Set(['receita', 'despesa']));
    setFiltroStatus(new Set());
    setFiltroCategoria(new Set());
    setFiltroFormaPag(new Set());
    setFiltroCartao(new Set());
    setFiltroDataPag(new Set());
    if (meIdStr) setFiltroMembros(new Set([meIdStr]));
  };

  const finance = useFinanceDashboard(month, year, true, escopoFamilia ? 'familia' : undefined);

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

  return (
    <>
      <div className={preencherViewport ? 'flex h-full min-h-0 flex-col gap-3' : 'grid gap-5'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />

            <div className="flex flex-wrap items-center gap-2">
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
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isCalendario && <CalendarSubViewToggle value={subView} onChange={setSubView} />}
            {!isPlanning && <ViewModeToggle mode={viewMode} onChange={setViewMode} />}
            <MovementSectionToggle activeTab={activeTab} onChange={handleTabChange} />
            <OrdenarChip options={ORDENAR_OPTIONS} value={ordenar} onChange={(v) => setOrdenar(v as Ordenar)} />
            <MultiFilterPanel groups={filterGroups} hasActiveFilters={hasFilter} onClear={handleClearFilters} />
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
                    filtroTipo={filtroTipo}
                    filtroStatus={filtroStatus}
                    filtroCategoria={filtroCategoria}
                    filtroFormaPag={filtroFormaPag}
                    filtroCartao={filtroCartao}
                    filtroDataPag={filtroDataPag}
                    ordenar={ordenar}
                    hasFilter={hasFilter}
                    onDataLoaded={setTableData}
                    onFilteredSummaryChange={setDespesasSummary}
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
