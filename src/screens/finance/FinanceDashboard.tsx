import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, CreditCard, Settings } from 'lucide-react';
import { MONTH_NAMES } from '../../types/finance';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { useAppContext } from '../../context/AppContext';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../services/queryKeys';
import { fetchDashboardAnual, getContratosFaturamento, fetchParcelasFuturas } from '../../services/financeService';
import { Card } from '../../ui/card';
import { ErrorState } from '../../ui/states';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useBudgetOverview } from '../../hooks/useBudgetOverview';
import { formatCurrency } from './formatters';
import { IncomeBalanceGuide } from './IncomeBalanceGuide';
import { AnnualTrendChart } from './charts/AnnualTrendChart';
import { DonutChart } from './charts/DonutChart';
import { MonthWaterfallChart } from './charts/MonthWaterfallChart';
import { MonthCategoriesOverview } from './MonthCategoriesOverview';

const CORES = ['#0891b2', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6'];
const MONTH_SHORT = MONTH_NAMES.map((n) => n.slice(0, 3));

function deltaPct(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function useRelativeTime(timestamp: number | undefined): string {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!timestamp) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'agora mesmo';
  if (minutes === 1) return 'há 1 min';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? 'há 1 hora' : `há ${hours} horas`;
}

export function FinanceDashboard() {
  const { month, year } = useAppContext();
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

  const overviewQ = useBudgetOverview(month, year);
  const profileTypeLabel = overviewQ.data?.profileType === 'empresa' ? 'empresa' : 'pessoal';
  const lancamentosCount = (data?.incomes?.length ?? 0) + (data?.expenses?.length ?? 0);
  const updatedAgo = useRelativeTime(finance.dashboard.dataUpdatedAt);

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
  // Os degraus de despesa são normalizados para a mesma base de `despesas` usada no saldo
  // projetado (catData soma todas as despesas do período sem o rateio de parcelas que o
  // saldo aplica), garantindo que a soma dos degraus bata exatamente com o saldo final.
  const waterfallSteps = useMemo(() => {
    const catTotal = catData.reduce((s, c) => s + c.value, 0);
    const scale = catTotal > 0 ? despesas / catTotal : 0;
    const scaledCatData = catData.map((c) => ({ name: c.name, value: c.value * scale }));
    const topCategorias = scaledCatData.slice(0, 5);
    const outrasCategorias = scaledCatData.slice(5).reduce((s, c) => s + c.value, 0);
    const steps = [
      { label: 'Saldo anterior', value: saldoAnterior, kind: 'start' as const },
      { label: 'Receitas', value: receitas, kind: 'increase' as const },
      ...topCategorias.map((c) => ({ label: c.name, value: -c.value, kind: 'decrease' as const })),
      ...(outrasCategorias > 0 ? [{ label: `Outras ${catData.length - 5}`, value: -outrasCategorias, kind: 'decrease' as const }] : []),
      { label: 'Saldo final', value: saldoProjetado, kind: 'end' as const },
    ];
    return steps;
  }, [saldoAnterior, receitas, catData, despesas, saldoProjetado]);

  return (
    <div className="grid gap-[18px]">
      {/* Header */}
      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-[3px]">
          <h1 className="m-0 text-[24px] font-bold tracking-[-0.02em] text-[#0f2b38] dark:text-white">Painel financeiro</h1>
          <p className="m-0 text-[13px] text-[#7b93a1] dark:text-slate-400">
            {MONTH_NAMES[month]} de {year} · perfil {profileTypeLabel} · {lancamentosCount} lançamento{lancamentosCount === 1 ? '' : 's'} no período
          </p>
        </div>
        <div className="flex-1" />
        {updatedAgo && (
          <span className="text-[11.5px] text-[#5f7885] dark:text-slate-500">Atualizado {updatedAgo}</span>
        )}
        {guide.isVisible && hasNoMonthlyEntries && (
          <div className="relative">
            <FirstAccessGuideCard
              icon={Settings}
              description={firstAccessGuideMessages.painelMes}
              align="right"
              floating
              placement="top"
              className="absolute right-0 top-full z-[45] mt-3 w-[min(24rem,calc(100vw-2rem))]"
              onDismiss={guide.dismiss}
            />
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
      <Card className="overflow-hidden rounded-2xl p-0">
        <div className="flex flex-col lg:flex-row">
          <div className="flex-none border-b border-[#e6eef3] bg-gradient-to-b from-[#fbfdfe] to-white p-[22px] dark:border-slate-700 dark:bg-slate-900/40 lg:w-[336px] lg:border-b-0 lg:border-r">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Saldo projetado</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[13px] font-semibold text-[#6c8593] dark:text-slate-400">R$</span>
              <span className={`text-[40px] font-bold leading-none tracking-[-0.035em] tabular-nums ${saldoProjetado >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}`}>
                {Math.abs(saldoProjetado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="mt-[9px] text-[12px] text-[#7b93a1] dark:text-slate-400">
              {saldoProjetado >= 0 ? 'Sobra do mês depois de todas as despesas pagas.' : 'Despesas superam as receitas neste mês.'}
            </p>
          </div>

          <div className="grid flex-1 grid-cols-2 xl:grid-cols-4">
            <div className="relative p-5">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Saldo anterior</span>
              <p className="mt-[9px] text-[23px] font-bold tracking-[-0.02em] tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(saldoAnterior)}</p>
            </div>
            <div className="relative border-l border-[#eef4f7] p-5 dark:border-slate-700">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Receitas</span>
              <p className="mt-[9px] text-[23px] font-bold tracking-[-0.02em] tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(receitas)}</p>
              {deltaReceitas !== undefined && (
                <span className={`mt-[7px] inline-flex items-center gap-1 rounded-full px-[7px] py-0.5 text-[11px] font-bold ${deltaReceitas >= 0 ? 'bg-[#ecfdf3] text-[#067647]' : 'bg-[#fef3f2] text-[#b42318]'}`}>
                  {deltaReceitas >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {Math.abs(deltaReceitas).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="relative border-l border-[#eef4f7] p-5 dark:border-slate-700">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Despesas</span>
              <p className="mt-[9px] text-[23px] font-bold tracking-[-0.02em] tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(despesas)}</p>
              {deltaDespesas !== undefined && (
                <span className={`mt-[7px] inline-flex items-center gap-1 rounded-full px-[7px] py-0.5 text-[11px] font-bold ${deltaDespesas <= 0 ? 'bg-[#ecfdf3] text-[#067647]' : 'bg-[#fef3f2] text-[#b42318]'}`}>
                  {deltaDespesas <= 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                  {Math.abs(deltaDespesas).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="relative border-l border-[#eef4f7] p-5 dark:border-slate-700">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Comprometimento</span>
              <p className="mt-[9px] text-[23px] font-bold tracking-[-0.02em] tabular-nums text-[#067647] dark:text-emerald-300">
                {receitas > 0 ? `${txComprometimento.toFixed(0)}%` : '—'}
              </p>
              <div className="relative mt-3 flex h-1.5 gap-0.5">
                <div className="flex-[70] rounded-l bg-[#b7e4c7]" />
                <div className="flex-[20] bg-[#f0e0b0]" />
                <div className="flex-[10] rounded-r bg-[#fbd5d1]" />
                <span className="absolute -top-1 h-3.5 w-[3px] rounded bg-[#067647]" style={{ left: `${Math.min(100, txComprometimento)}%` }} />
              </div>
              <p className="mt-2 text-[11.5px] text-[#5f7885] dark:text-slate-400">da renda comprometida com despesas previstas</p>
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

        <div className="flex flex-col gap-4 border-t border-[#eef4f7] bg-[#fbfdfe] px-[22px] py-[15px] dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-end">
          <div className="flex-1">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="h-[7px] w-[7px] rounded-full bg-[#10b981]" />
              <span className="font-semibold text-[#0f2b38] dark:text-slate-100">Receitas</span>
              <span className="ml-auto font-bold tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(receitas)}</span>
            </div>
            <div className="mt-[7px] h-2 rounded bg-[#10b981]" />
          </div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="h-[7px] w-[7px] rounded-full bg-[#ef4444]" />
              <span className="font-semibold text-[#0f2b38] dark:text-slate-100">Despesas pagas</span>
              <span className="ml-auto font-bold tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(despesasPagas)}</span>
            </div>
            <div className="mt-[7px] h-2 rounded bg-[#f1f6f9] dark:bg-slate-700">
              <div className="h-2 rounded bg-[#ef4444]" style={{ width: `${Math.min(100, (despesasPagas / healthBase) * 100)}%` }} />
            </div>
          </div>
          <span className="shrink-0 pb-px text-[11.5px] text-[#5f7885] dark:text-slate-400">
            Você gastou <b className="text-[#0f2b38] dark:text-slate-100">{pctGasto.toFixed(1)}%</b> do que entrou
          </span>
        </div>
      </Card>

      {/* Contratos panel */}
      {contratos.length > 0 && (
        <Card className="rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">
              Carteira de contratos <span className="font-semibold text-[#6c8593] dark:text-slate-400">— {MONTH_NAMES[month]}</span>
            </h3>
            <span className="text-sm font-semibold text-[#5f7885] dark:text-slate-300">
              {formatCurrency(totalCarteira)}/mês
            </span>
          </div>
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-[#5f7885]">{Math.round(pctFaturado)}% recebido/faturado</span>
              <span className="text-[#5f7885]">{contratos.length} contrato(s)</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[#f5f9fb] overflow-hidden flex">
              <div
                className="h-full bg-[#10b981] transition-all"
                style={{ width: `${totalCarteira > 0 ? (totalRecebido / totalCarteira) * 100 : 0}%` }}
              />
              <div
                className="h-full bg-[#0891b2] transition-all"
                style={{ width: `${totalCarteira > 0 ? (totalFaturado / totalCarteira) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {totalRecebido > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-3 py-1 text-[#067647] font-semibold">
                ✓ Recebido {formatCurrency(totalRecebido)}
              </span>
            )}
            {totalFaturado > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#e6f7fa] px-3 py-1 text-[#0e7490] font-semibold">
                ⏱ Faturado {formatCurrency(totalFaturado)}
              </span>
            )}
            {totalPendente > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#f7fafb] px-3 py-1 text-[#6c8593] font-semibold">
                ○ Pendente {formatCurrency(totalPendente)}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Análise de despesas — 6 cards em 2 linhas de 3, igual ao mockup */}
      <div>
        <div className="mb-[11px] flex items-center gap-3">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] dark:text-slate-400">Análise de despesas</span>
          <div className="h-px flex-1 bg-[#e6eef3] dark:bg-slate-700" />
        </div>
        <div className="grid gap-3.5 xl:grid-cols-3">
          {/* Card 1: Juros × Descontos */}
          <Card className="flex flex-col rounded-2xl p-[18px_20px]">
            <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Juros × Descontos</h3>
            {juros === 0 && descontos === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-[9px] py-[26px] text-center">
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
                  <TrendingUp size={19} />
                </span>
                <span className="text-[12.5px] font-semibold text-[#0f2b38] dark:text-slate-100">Sem juros ou descontos neste mês</span>
                <span className="max-w-[200px] text-[11.5px] text-[#5f7885] dark:text-slate-400">Nenhuma despesa foi paga com acréscimo nem com abatimento em {MONTH_NAMES[month].toLowerCase()}.</span>
              </div>
            ) : (
              <div className="mt-[18px] flex flex-col gap-4">
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
          <Card className="flex flex-col rounded-2xl p-[18px_20px]">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Perfil das despesas</h3>
              <div className="flex-1" />
              <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">{formatCurrency(perfilDesp.total)} no mês</span>
            </div>
            {perfilDesp.total === 0 ? (
              <p className="flex-1 py-6 text-center text-sm text-slate-400">Sem despesas neste mês</p>
            ) : (
              <div className="mt-[18px] flex flex-1 flex-col gap-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#0f2b38] dark:text-white">
                    {perfilDesp.total > 0 ? Math.round((perfilDesp.variaveis / perfilDesp.total) * 100) : 0}%
                  </span>
                  <span className="text-[13px] font-semibold text-[#6c8593] dark:text-slate-400">variáveis</span>
                </div>
                <div className="flex gap-[3px] h-3">
                  <div className="rounded-l-md bg-[#6366f1]" style={{ width: `${perfilDesp.total > 0 ? (perfilDesp.fixas / perfilDesp.total) * 100 : 0}%` }} />
                  <div className="flex-1 rounded-r-md bg-[#c7d2fe]" />
                </div>
                <div className="flex items-baseline gap-2.5 text-[11.5px]">
                  <span className="inline-flex items-center gap-1.5 text-[#7b93a1]"><span className="h-2 w-2 rounded-sm bg-[#6366f1]" />Fixas <b className="text-[#0f2b38] dark:text-slate-100 tabular-nums">{formatCurrency(perfilDesp.fixas)}</b></span>
                  <div className="flex-1" />
                  <span className="inline-flex items-center gap-1.5 text-[#7b93a1]"><span className="h-2 w-2 rounded-sm bg-[#c7d2fe]" />Variáveis <b className="text-[#0f2b38] dark:text-slate-100 tabular-nums">{formatCurrency(perfilDesp.variaveis)}</b></span>
                </div>
                <div className="mt-auto flex flex-wrap gap-[7px] pt-4">
                  {perfilDesp.opex > 0 && (
                    <span className="rounded-full border border-[#b9e6ef] bg-[#e6f7fa] px-[11px] py-[5px] text-[11.5px] font-bold text-[#0e7490]">
                      OPEX <span className="tabular-nums">{formatCurrency(perfilDesp.opex)}</span>
                    </span>
                  )}
                  {perfilDesp.capex > 0 && (
                    <span className="rounded-full border border-[#e6eef3] bg-[#f7fafb] px-[11px] py-[5px] text-[11.5px] font-semibold text-[#6c8593]">
                      CAPEX {formatCurrency(perfilDesp.capex)}
                    </span>
                  )}
                  {perfilDesp.semClass > 0 && (
                    <span className="rounded-full border border-[#e6eef3] bg-[#f7fafb] px-[11px] py-[5px] text-[11.5px] font-semibold text-[#6c8593]">
                      Sem class. {formatCurrency(perfilDesp.semClass)}
                    </span>
                  )}
                </div>
                <p className="mt-4 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
                  {perfilDesp.variaveis / perfilDesp.total >= 0.7
                    ? 'Quase todo o seu gasto é flexível — dá para cortar sem mexer em compromissos fixos.'
                    : perfilDesp.fixas / perfilDesp.total >= 0.7
                      ? 'A maior parte do seu gasto é fixa — pouca margem para cortar sem rever compromissos.'
                      : 'Seu gasto está dividido entre despesas fixas e variáveis.'}
                </p>
              </div>
            )}
          </Card>

          {/* Card 3: Parcelas futuras */}
          <Card className="flex flex-col rounded-2xl p-[18px_20px]">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Parcelas futuras</h3>
              <div className="flex-1" />
              <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">próximos 3 meses</span>
            </div>
            {parcelasQ.isLoading ? (
              <div className="flex-1 py-6 text-center text-sm text-slate-400">Carregando...</div>
            ) : parcelasFuturas.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-[9px] py-[22px] text-center">
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
                  <CreditCard size={19} />
                </span>
                <span className="text-[12.5px] font-semibold text-[#0f2b38] dark:text-slate-100">Nenhuma parcela em aberto</span>
                <span className="max-w-[210px] text-[11.5px] text-[#5f7885] dark:text-slate-400">Os próximos meses estão livres. Nada comprometido à frente.</span>
              </div>
            ) : (
              <div className="mt-[18px] flex flex-1 flex-col gap-3">
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
                <div className="mt-auto flex items-center border-t border-[#eef4f7] pt-[13px] dark:border-slate-700">
                  <span className="text-[11.5px] text-[#7b93a1]">Total comprometido</span>
                  <div className="flex-1" />
                  <span className="text-[13px] font-bold tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(totalParcelasFuturas)}</span>
                </div>
              </div>
            )}
          </Card>

          {/* Card 4: Saúde financeira */}
          <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">
                Saúde financeira <span className="font-semibold text-[#6c8593] dark:text-slate-400">— {MONTH_NAMES[month]}</span>
              </h3>
            </div>
            <div className="mt-5 flex flex-1 flex-col gap-4">
              {([
                { label: 'Receitas recebidas', value: receitasRecebidas, color: '#10b981' },
                { label: 'Despesas pagas', value: despesasPagas, color: '#6366f1' },
                { label: 'Despesas pendentes', value: despesasPendentes, color: null },
              ] as const).map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-semibold text-[#0f2b38] dark:text-slate-100">{label}</span>
                    <div className="flex-1" />
                    <span className="text-[12.5px] font-bold tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(value)}</span>
                  </div>
                  <div className="mt-[7px] h-2.5 rounded-md bg-[#eef4f7] dark:bg-slate-700">
                    {color && <div className="h-2.5 rounded-md" style={{ width: `${Math.min(100, (value / healthBase) * 100)}%`, background: color }} />}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
              {despesasPendentes === 0
                ? `Nada em aberto: tudo que venceu em ${MONTH_NAMES[month].toLowerCase()} já foi pago.`
                : `Ainda há ${formatCurrency(despesasPendentes)} em despesas pendentes neste mês.`}
            </p>
          </Card>

          {/* Card 5: Receitas por origem */}
          <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Receitas por origem</h3>
              <div className="flex-1" />
              <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">de onde veio</span>
            </div>
            {origemData.length === 0 ? (
              <p className="flex-1 py-8 text-center text-sm text-slate-400">Sem receitas neste mês</p>
            ) : (
              <div className="mt-3 flex flex-1 flex-col items-center gap-3.5">
                <DonutChart data={origemData} centerLabel="TOTAL" centerValue={formatCurrency(receitas)} />
              </div>
            )}
            {origemData.length > 0 && (
              <p className="mt-4 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
                {origemData.every((d) => d.name === 'Avulsas')
                  ? 'Toda a renda depende de entradas avulsas, sem receita recorrente garantida.'
                  : origemData.every((d) => d.name === 'Contratos')
                    ? 'Toda a renda vem de contratos recorrentes.'
                    : 'A renda combina contratos recorrentes e entradas avulsas.'}
              </p>
            )}
          </Card>

          {/* Card 6: Forma de pagamento */}
          <Card className="flex flex-col rounded-2xl p-[18px_20px_20px]">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">Forma de pagamento</h3>
              <div className="flex-1" />
              <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">como saiu</span>
            </div>
            {formaData.length === 0 ? (
              <p className="flex-1 py-8 text-center text-sm text-slate-400">Sem dados</p>
            ) : (
              <div className="mt-3 flex flex-1 flex-col items-center gap-3.5">
                <DonutChart data={formaData} centerLabel="PAGO" centerValue={formatCurrency(despesas)} capitalizeLabels />
              </div>
            )}
            {formaData.length > 0 && (() => {
              const totalForma = formaData.reduce((s, d) => s + d.value, 0);
              const credito = formaData.find((d) => d.name.toLowerCase().includes('credito') || d.name.toLowerCase().includes('crédito'));
              const creditoShare = credito && totalForma > 0 ? credito.value / totalForma : 0;
              return (
                <p className="mt-4 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
                  {creditoShare > 0.5
                    ? 'Mais da metade saiu no crédito — o peso maior cai na fatura seguinte.'
                    : 'Suas despesas estão distribuídas entre diferentes formas de pagamento.'}
                </p>
              );
            })()}
          </Card>
        </div>
      </div>

      {/* Annual chart */}
      <Card className="rounded-2xl p-[20px_22px_16px]">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[15.5px] font-bold tracking-[-0.01em] text-[#0f2b38] dark:text-white">
              Receitas × Despesas × Saldo <span className="font-semibold text-[#6c8593] dark:text-slate-400">— {year}</span>
            </h2>
            <p className="mt-0.5 text-xs text-[#7b93a1] dark:text-slate-400">Barras mostram o movimento de cada mês; a linha acompanha o saldo acumulado do ano.</p>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3.5 text-[11.5px] font-semibold text-[#6c8593] dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#10b981]" />Receitas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#ef4444]" />Despesas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded bg-[#6366f1]" />Saldo acumulado</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0 w-3.5 border-t-2 border-dashed border-[#a9bcc6]" />Previsto</span>
          </div>
        </div>
        {anualQ.isLoading ? (
          <div className="h-72 flex items-center justify-center text-sm text-slate-400">Carregando...</div>
        ) : (
          <AnnualTrendChart data={chartData} activeIndex={month} />
        )}
        {anualHighlights && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-[#eef4f7] pt-3 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
            <span>Melhor mês <b className="text-[#0f2b38] dark:text-slate-100">{anualHighlights.melhorMesLabel} · {formatCurrency(anualHighlights.melhorMesValor)}</b></span>
            <span>Maior gasto <b className="text-[#0f2b38] dark:text-slate-100">{anualHighlights.maiorGastoLabel} · {formatCurrency(anualHighlights.maiorGastoValor)}</b></span>
            <span>Saldo acumulado até {MONTH_NAMES[month]} <b className={anualHighlights.saldoAcumulado >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}>{formatCurrency(anualHighlights.saldoAcumulado)}</b></span>
          </div>
        )}
      </Card>

      {/* Cascata do mês */}
      <Card className="rounded-2xl p-[20px_22px_16px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[15.5px] font-bold tracking-[-0.01em] text-[#0f2b38] dark:text-white">Cascata do mês</h2>
            <p className="mt-0.5 text-xs text-[#7b93a1] dark:text-slate-400">Do saldo que abriu {MONTH_NAMES[month].toLowerCase()} até o que sobrou, passando por cada corte.</p>
          </div>
          <div className="flex-1" />
          {receitas > 0 && (
            <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">
              Sobrou <b className={saldoProjetado >= 0 ? 'text-[#067647] dark:text-emerald-300' : 'text-[#b42318] dark:text-rose-300'}>{((saldoProjetado / receitas) * 100).toFixed(1)}%</b> do que entrou
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

      <IncomeBalanceGuide month={month} year={year} />
    </div>
  );
}
