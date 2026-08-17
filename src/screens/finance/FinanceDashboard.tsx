import { useMemo } from 'react';
import { RefreshCw, AlertTriangle, TrendingDown, TrendingUp, CreditCard, Settings } from 'lucide-react';
import { MONTH_NAMES } from '../../types/finance';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { useAppContext } from '../../context/AppContext';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../services/queryKeys';
import { fetchDashboardAnual, getContratosFaturamento, fetchParcelasFuturas } from '../../services/financeService';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { ErrorState } from '../../ui/states';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { MonthSelector } from './MonthSelector';
import { formatCurrency } from './formatters';
import { IncomeBalanceGuide } from './IncomeBalanceGuide';
import { AnnualTrendChart } from './charts/AnnualTrendChart';
import { CategoryBarChart } from './charts/CategoryBarChart';
import { DonutChart } from './charts/DonutChart';
import { MonthWaterfallChart } from './charts/MonthWaterfallChart';
import { MonthCategoriesOverview } from './MonthCategoriesOverview';

const CORES = ['#0891b2', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6'];
const MONTH_SHORT = MONTH_NAMES.map((n) => n.slice(0, 3));

function deltaPct(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

interface FinanceDashboardProps {
  showMonthlySummary?: boolean;
}

export function FinanceDashboard({ showMonthlySummary = false }: FinanceDashboardProps) {
  const { month, year, setMonth, setYear } = useAppContext();
  const finance = useFinanceDashboard(month, year);
  const data = finance.dashboard.data;
  const guide = useFirstAccessGuide('painel:mes-v1');
  const comprometimentoGuide = useFirstAccessGuide('painel:comprometimento-v1');

  const anualQ = useQuery({
    queryKey: queryKeys.dashboardAnual(year),
    queryFn: () => fetchDashboardAnual(year),
    staleTime: 60_000,
  });
  const anualData = anualQ.data ?? [];
  const mesAtual = anualData[month];
  const mesAnterior = month > 0 ? anualData[month - 1] : undefined;

  const contratosQ = useQuery({
    queryKey: queryKeys.contratosStatusFaturamento(month, year),
    queryFn: () => getContratosFaturamento(month + 1, year),
    staleTime: 60_000,
  });
  const contratos = contratosQ.data ?? [];

  const parcelasQ = useQuery({
    queryKey: queryKeys.parcelasFuturas(month, year, 3),
    queryFn: () => fetchParcelasFuturas(month, year, 3),
    staleTime: 60_000,
  });

  // KPIs — prefer aggregated annual data, fallback to balance
  const receitas = mesAtual?.receitas ?? data?.balance.receitas ?? 0;
  const despesas = mesAtual?.despesas ?? data?.balance.despesas ?? 0;
  const saldoAnterior = data?.balance.saldoAnterior ?? 0;
  const saldoProjetado = saldoAnterior + receitas - despesas;
  const txComprometimento = receitas > 0 ? (despesas / receitas) * 100 : 0;
  const hasNoMonthlyEntries = !finance.dashboard.isLoading && !!data && (data.incomes?.length ?? 0) === 0 && (data.expenses?.length ?? 0) === 0;
  const deltaReceitas = deltaPct(receitas, mesAnterior?.receitas);
  const deltaDespesas = deltaPct(despesas, mesAnterior?.despesas);
  const pctGasto = receitas > 0 ? Math.min(100, (despesas / receitas) * 100) : 0;

  // Contratos summary
  const totalCarteira = contratos.reduce((s, c) => s + c.valorMensal, 0);
  const totalRecebido = contratos
    .filter((c) => c.receitaStatus === 'ativa')
    .reduce((s, c) => s + c.valorMensal, 0);
  const totalFaturado = contratos
    .filter((c) => c.receitaStatus === 'faturada')
    .reduce((s, c) => s + c.valorMensal, 0);
  const totalPendente = contratos
    .filter((c) => !c.receitaStatus || c.receitaStatus === 'prevista')
    .reduce((s, c) => s + c.valorMensal, 0);
  const pctFaturado = totalCarteira > 0 ? ((totalRecebido + totalFaturado) / totalCarteira) * 100 : 0;

  // Annual chart data
  const chartData = MONTH_SHORT.map((name, m) => ({
    name,
    receitas: anualData[m]?.receitas ?? 0,
    despesas: anualData[m]?.despesas ?? 0,
    saldo: anualData[m]?.saldo_final ?? 0,
  }));

  const anualHighlights = useMemo(() => {
    const withData = anualData.map((m, i) => ({ ...m, index: i })).filter((m) => m.receitas > 0 || m.despesas > 0);
    if (withData.length === 0) return null;
    const melhorMes = withData.reduce((best, m) => (m.receitas > best.receitas ? m : best));
    const maiorGasto = withData.reduce((worst, m) => (m.despesas > worst.despesas ? m : worst));
    return {
      melhorMesLabel: MONTH_NAMES[melhorMes.index],
      melhorMesValor: melhorMes.receitas,
      maiorGastoLabel: MONTH_NAMES[maiorGasto.index],
      maiorGastoValor: maiorGasto.despesas,
      saldoAcumulado: anualData[month]?.saldo_final ?? 0,
    };
  }, [anualData, month]);

  // Category chart
  const catData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of data?.expenses ?? []) {
      const k = d.categoria ?? 'Sem categoria';
      map[k] = (map[k] ?? 0) + d.valorFinal;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [data]);

  // Receitas by origin (contratos vs avulsas)
  const origemData = useMemo(() => {
    let ct = 0, av = 0;
    for (const r of data?.incomes ?? []) {
      if (r.status === 'ativa') {
        if (r.contratoId) ct += r.valor;
        else av += r.valor;
      }
    }
    return [
      { name: 'Contratos', value: ct, color: '#6366f1' },
      { name: 'Avulsas', value: av, color: '#10b981' },
    ].filter((d) => d.value > 0);
  }, [data]);

  // Payment method
  const formaData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of data?.expenses ?? []) {
      const k = d.formaPagamento ?? 'dinheiro';
      map[k] = (map[k] ?? 0) + d.valorFinal;
    }
    return Object.entries(map).map(([name, value], i) => ({ name, value, color: CORES[i % CORES.length] }));
  }, [data]);

  // Health bars
  const receitasRecebidas = (data?.incomes ?? [])
    .filter((r) => r.status === 'ativa')
    .reduce((s, r) => s + r.valor, 0);
  const despesasPagas = (data?.expenses ?? [])
    .filter((e) => e.pago)
    .reduce((s, e) => s + e.valorFinal, 0);
  const despesasPendentes = (data?.expenses ?? [])
    .filter((e) => !e.pago)
    .reduce((s, e) => s + e.valorFinal, 0);
  const healthBase = Math.max(receitas, despesas, 1);

  // Juros e descontos
  const { juros, descontos } = useMemo(() => {
    let j = 0, d = 0;
    for (const e of data?.expenses ?? []) {
      if (e.valorOriginal == null) continue;
      const diff = e.valorFinal - e.valorOriginal;
      if (diff > 0) j += diff;
      else if (diff < 0) d += Math.abs(diff);
    }
    return { juros: j, descontos: d };
  }, [data]);

  // Perfil das despesas
  const perfilDesp = useMemo(() => {
    const expenses = data?.expenses ?? [];
    const total = expenses.reduce((s, e) => s + e.valorFinal, 0);
    const fixas = expenses.filter((e) => e.recorrente).reduce((s, e) => s + e.valorFinal, 0);
    const opex = expenses.filter((e) => e.tipoDespesa === 'opex').reduce((s, e) => s + e.valorFinal, 0);
    const capex = expenses.filter((e) => e.tipoDespesa === 'capex').reduce((s, e) => s + e.valorFinal, 0);
    return { total, fixas, variaveis: total - fixas, opex, capex, semClass: total - opex - capex };
  }, [data]);

  // Parcelas futuras
  const parcelasFuturas = parcelasQ.data ?? [];
  const totalParcelasFuturas = parcelasFuturas.reduce((s, p) => s + p.total, 0);

  // Cascata do mês: saldo anterior -> receitas -> maiores despesas por categoria -> saldo final
  const waterfallSteps = useMemo(() => {
    const topCategorias = catData.slice(0, 5);
    const outrasCategorias = catData.slice(5).reduce((s, c) => s + c.value, 0);
    const steps = [
      { label: 'Saldo anterior', value: saldoAnterior, kind: 'start' as const },
      { label: 'Receitas', value: receitas, kind: 'increase' as const },
      ...topCategorias.map((c) => ({ label: c.name, value: -c.value, kind: 'decrease' as const })),
      ...(outrasCategorias > 0 ? [{ label: `Outras ${catData.length - 5}`, value: -outrasCategorias, kind: 'decrease' as const }] : []),
      { label: 'Saldo final', value: saldoProjetado, kind: 'end' as const },
    ];
    return steps;
  }, [saldoAnterior, receitas, catData, saldoProjetado]);

  const handleRefresh = () => {
    finance.dashboard.refetch();
    void anualQ.refetch();
    void contratosQ.refetch();
    void parcelasQ.refetch();
  };

  return (
    <div className="grid gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-950 dark:text-white">Painel financeiro</h2>
          <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={handleRefresh}>
            Atualizar
          </Button>
        </div>
        {showMonthlySummary && (
        <div className="relative rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          <MonthSelector month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
          {guide.isVisible && hasNoMonthlyEntries && (
            <FirstAccessGuideCard
              icon={Settings}
              description={firstAccessGuideMessages.painelMes}
              align="right"
              floating
              placement="top"
              className="absolute right-0 top-full z-[45] mt-3 w-[min(24rem,calc(100vw-2rem))]"
              onDismiss={guide.dismiss}
            />
          )}
        </div>
        )}
      </div>

      {(finance.dashboard.error ?? anualQ.error) && (
        <ErrorState
          title="Não foi possível carregar o painel"
          description={(finance.dashboard.error ?? anualQ.error)?.message}
        />
      )}

      {/* Resumo consolidado */}
      {showMonthlySummary && (
        <Card className="overflow-hidden rounded-2xl p-0">
          <div className="flex flex-col lg:flex-row">
            <div className="flex-none border-b border-slate-100 bg-slate-50/60 p-5 dark:border-slate-700 dark:bg-slate-900/40 lg:w-72 lg:border-b-0 lg:border-r">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Saldo projetado</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">R$</span>
                <span className={`text-4xl font-bold tracking-tight tabular-nums ${saldoProjetado >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>
                  {Math.abs(saldoProjetado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {saldoProjetado >= 0 ? 'Sobra do mês depois de todas as despesas.' : 'Despesas superam as receitas neste mês.'}
              </p>
            </div>

            <div className="grid flex-1 grid-cols-2 xl:grid-cols-4">
              <div className="relative border-b border-slate-100 p-5 dark:border-slate-700 xl:border-b-0">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Saldo anterior</span>
                <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(saldoAnterior)}</p>
              </div>
              <div className="relative border-b border-l border-slate-100 p-5 dark:border-slate-700 xl:border-b-0">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Receitas</span>
                <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(receitas)}</p>
                {deltaReceitas !== undefined && (
                  <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${deltaReceitas >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                    {deltaReceitas >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {Math.abs(deltaReceitas).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="relative border-l border-slate-100 p-5 dark:border-slate-700">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Despesas</span>
                <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(despesas)}</p>
                {deltaDespesas !== undefined && (
                  <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${deltaDespesas <= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                    {deltaDespesas <= 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                    {Math.abs(deltaDespesas).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="relative border-l border-slate-100 p-5 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Comprometimento</span>
                </div>
                <p className={`mt-2 text-xl font-bold tabular-nums ${txComprometimento > 90 ? 'text-rose-600 dark:text-rose-300' : txComprometimento > 70 ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                  {receitas > 0 ? `${txComprometimento.toFixed(0)}%` : '—'}
                </p>
                <div className="relative mt-2.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full ${txComprometimento > 90 ? 'bg-rose-500' : txComprometimento > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pctGasto}%` }}
                  />
                </div>
                {comprometimentoGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="top"
                    align="right"
                    className="absolute right-0 top-full z-[45] mt-3 w-[min(25rem,calc(100vw-2rem))]"
                    icon={AlertTriangle}
                    description={firstAccessGuideMessages.painelComprometimento}
                    onDismiss={comprometimentoGuide.dismiss}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-end">
            <div className="flex-1">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-slate-800 dark:text-slate-100">Receitas</span>
                <span className="ml-auto font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(receitas)}</span>
              </div>
              <div className="mt-1.5 h-2 rounded bg-emerald-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                <span className="font-semibold text-slate-800 dark:text-slate-100">Despesas pagas</span>
                <span className="ml-auto font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(despesasPagas)}</span>
              </div>
              <div className="mt-1.5 h-2 rounded bg-slate-200 dark:bg-slate-700">
                <div className="h-2 rounded bg-rose-500" style={{ width: `${Math.min(100, (despesasPagas / healthBase) * 100)}%` }} />
              </div>
            </div>
            <span className="shrink-0 pb-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
              Você gastou <b className="text-slate-800 dark:text-slate-100">{pctGasto.toFixed(1)}%</b> do que entrou
            </span>
          </div>
        </Card>
      )}

      {/* Contratos panel */}
      {contratos.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white">
              Carteira de contratos — {MONTH_NAMES[month]}
            </h3>
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {formatCurrency(totalCarteira)}/mês
            </span>
          </div>
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-500">{Math.round(pctFaturado)}% recebido/faturado</span>
              <span className="text-slate-500">{contratos.length} contrato(s)</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${totalCarteira > 0 ? (totalRecebido / totalCarteira) * 100 : 0}%` }}
              />
              <div
                className="h-full bg-blue-400 transition-all"
                style={{ width: `${totalCarteira > 0 ? (totalFaturado / totalCarteira) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {totalRecebido > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-green-700 font-semibold">
                ✓ Recebido {formatCurrency(totalRecebido)}
              </span>
            )}
            {totalFaturado > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-blue-700 font-semibold">
                ⏱ Faturado {formatCurrency(totalFaturado)}
              </span>
            )}
            {totalPendente > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-600 font-semibold">
                ○ Pendente {formatCurrency(totalPendente)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Annual chart */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold text-slate-900 dark:text-white">
            Receitas × Despesas × Saldo — {year}
          </h3>
          <div className="flex items-center gap-4 text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Receitas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />Despesas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-0.5 rounded bg-indigo-500" />Saldo acumulado</span>
          </div>
        </div>
        {anualQ.isLoading ? (
          <div className="h-72 flex items-center justify-center text-sm text-slate-400">Carregando...</div>
        ) : (
          <AnnualTrendChart data={chartData} activeIndex={month} />
        )}
        {anualHighlights && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-slate-100 pt-3 text-[11.5px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <span>Melhor mês <b className="text-slate-800 dark:text-slate-100">{anualHighlights.melhorMesLabel} · {formatCurrency(anualHighlights.melhorMesValor)}</b></span>
            <span>Maior gasto <b className="text-slate-800 dark:text-slate-100">{anualHighlights.maiorGastoLabel} · {formatCurrency(anualHighlights.maiorGastoValor)}</b></span>
            <span>Saldo acumulado até {MONTH_NAMES[month]} <b className={anualHighlights.saldoAcumulado >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>{formatCurrency(anualHighlights.saldoAcumulado)}</b></span>
          </div>
        )}
      </Card>

      {/* Cascata do mês */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Cascata do mês</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Do saldo que abriu o mês até o que sobrou, passando por cada corte.</p>
          </div>
          {receitas > 0 && (
            <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
              Sobrou <b className={saldoProjetado >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>{((saldoProjetado / receitas) * 100).toFixed(1)}%</b> do que entrou
            </span>
          )}
        </div>
        {finance.dashboard.isLoading ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">Carregando...</div>
        ) : (
          <MonthWaterfallChart steps={waterfallSteps} />
        )}
      </Card>

      <MonthCategoriesOverview month={month} year={year} />

      {/* Análise de despesas — 3 cards */}
      <div className="grid gap-5 xl:grid-cols-3">
        {/* Card 1: Juros × Descontos */}
        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Juros × Descontos</h3>
          {juros === 0 && descontos === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <TrendingUp size={17} />
              </span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sem juros ou descontos neste mês</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50">
                    <TrendingDown size={14} className="text-red-600" />
                  </span>
                  Juros pagos
                </span>
                <span className="font-bold text-red-600">{formatCurrency(juros)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50">
                    <TrendingUp size={14} className="text-green-600" />
                  </span>
                  Descontos obtidos
                </span>
                <span className="font-bold text-green-600">{formatCurrency(descontos)}</span>
              </div>
              {juros > 0 && descontos > 0 && (
                <div className="mt-1 border-t border-slate-100 pt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Saldo financeiro</span>
                  <span className={descontos >= juros ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                    {descontos >= juros ? '+' : '-'}{formatCurrency(Math.abs(descontos - juros))}
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Card 2: Perfil das despesas */}
        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Perfil das despesas</h3>
          {perfilDesp.total === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Sem despesas neste mês</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500">Fixas vs Variáveis</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {perfilDesp.total > 0 ? Math.round((perfilDesp.fixas / perfilDesp.total) * 100) : 0}% fixas
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                  <div
                    className="h-full bg-indigo-500 transition-all"
                    style={{ width: `${perfilDesp.total > 0 ? (perfilDesp.fixas / perfilDesp.total) * 100 : 0}%` }}
                  />
                  <div
                    className="h-full bg-violet-300 transition-all"
                    style={{ width: `${perfilDesp.total > 0 ? (perfilDesp.variaveis / perfilDesp.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1 text-slate-400">
                  <span>Fixas {formatCurrency(perfilDesp.fixas)}</span>
                  <span>Variáveis {formatCurrency(perfilDesp.variaveis)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {perfilDesp.opex > 0 && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    OPEX {formatCurrency(perfilDesp.opex)}
                  </span>
                )}
                {perfilDesp.capex > 0 && (
                  <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                    CAPEX {formatCurrency(perfilDesp.capex)}
                  </span>
                )}
                {perfilDesp.semClass > 0 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                    Sem class. {formatCurrency(perfilDesp.semClass)}
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Card 3: Parcelas futuras */}
        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Parcelas futuras</h3>
          {parcelasQ.isLoading ? (
            <div className="py-6 text-center text-sm text-slate-400">Carregando...</div>
          ) : parcelasFuturas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CreditCard size={17} />
              </span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhuma parcela em aberto</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {parcelasFuturas.map((p) => (
                <div key={`${p.ano}-${p.mes}`} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
                      <CreditCard size={13} className="text-amber-600" />
                    </span>
                    {MONTH_NAMES[p.mes]} {p.ano !== year ? p.ano : ''}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(p.total)}</span>
                </div>
              ))}
              <div className="mt-2 border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">Total comprometido</span>
                <span className="font-bold text-amber-700">{formatCurrency(totalParcelasFuturas)}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 2-col: saúde + parcelas futuras já cobertas acima; aqui categorias + origem */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Despesas por categoria</h3>
          {catData.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sem despesas neste mês</p>
          ) : (
            <CategoryBarChart data={catData} colors={CORES} />
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Receitas por origem</h3>
          {origemData.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sem receitas neste mês</p>
          ) : (
            <DonutChart data={origemData} centerLabel="TOTAL" centerValue={formatCurrency(receitas)} />
          )}
        </Card>
      </div>

      {/* 2-col: health + payment method */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">
            Saúde financeira — {MONTH_NAMES[month]}
          </h3>
          <div className="flex flex-col gap-4">
            {([
              { label: 'Receitas recebidas', value: receitasRecebidas, color: 'bg-green-500' },
              { label: 'Despesas pagas', value: despesasPagas, color: 'bg-blue-500' },
              { label: 'Despesas pendentes', value: despesasPendentes, color: 'bg-amber-400' },
            ] as const).map(({ label, value, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(value)}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={['h-full rounded-full transition-all', color].join(' ')}
                    style={{ width: `${Math.min(100, (value / healthBase) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Forma de pagamento</h3>
          {formaData.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sem dados</p>
          ) : (
            <DonutChart data={formaData} centerLabel="PAGO" centerValue={formatCurrency(despesas)} capitalizeLabels />
          )}
        </Card>
      </div>

      <IncomeBalanceGuide month={month} year={year} />
    </div>
  );
}
