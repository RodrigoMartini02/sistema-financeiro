import { useMemo } from 'react';
import { RefreshCw, AlertTriangle, TrendingDown, TrendingUp, CreditCard } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend, ReferenceLine,
} from 'recharts';
import { MONTH_NAMES } from '../../types/finance';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { useAppContext } from '../../context/AppContext';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../services/queryKeys';
import { fetchDashboardAnual, getContratosFaturamento, fetchParcelasFuturas } from '../../services/financeService';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { ErrorState } from '../../ui/states';
import { MetricCard } from './MetricCard';
import { MonthSelector } from './MonthSelector';
import { formatCurrency } from './formatters';

const CORES = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'];
const MONTH_SHORT = MONTH_NAMES.map((n) => n.slice(0, 3));

const fmtK = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`;

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; color: string; value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
      ))}
    </div>
  );
};

function deltaPct(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

export function FinanceDashboard() {
  const { month, year, setMonth, setYear } = useAppContext();
  const finance = useFinanceDashboard(month, year);
  const data = finance.dashboard.data;

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
  const deltaReceitas = deltaPct(receitas, mesAnterior?.receitas);
  const deltaDespesas = deltaPct(despesas, mesAnterior?.despesas);

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
    Receitas: anualData[m]?.receitas ?? 0,
    Despesas: anualData[m]?.despesas ?? 0,
    Saldo: anualData[m]?.saldo_final ?? 0,
  }));

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
      { name: 'Contratos', value: ct },
      { name: 'Avulsas', value: av },
    ].filter((d) => d.value > 0);
  }, [data]);

  // Payment method
  const formaData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of data?.expenses ?? []) {
      const k = d.formaPagamento ?? 'dinheiro';
      map[k] = (map[k] ?? 0) + d.valorFinal;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
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
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          <MonthSelector month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
        </div>
      </div>

      {saldoProjetado < 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            Despesas superam receitas em <strong>{formatCurrency(Math.abs(saldoProjetado))}</strong> neste mês.
          </span>
        </div>
      )}

      {(finance.dashboard.error ?? anualQ.error) && (
        <ErrorState
          title="Não foi possível carregar o painel"
          description={(finance.dashboard.error ?? anualQ.error)?.message}
        />
      )}

      {/* 5 KPI cards */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Saldo anterior" value={formatCurrency(saldoAnterior)} tone="slate" />
        <MetricCard
          label="Receitas"
          value={formatCurrency(receitas)}
          tone="income"
          delta={deltaReceitas}
        />
        <MetricCard
          label="Despesas"
          value={formatCurrency(despesas)}
          tone="expense"
          delta={deltaDespesas !== undefined ? -deltaDespesas : undefined}
        />
        <MetricCard
          label="Saldo projetado"
          value={formatCurrency(saldoProjetado)}
          tone={saldoProjetado >= 0 ? 'income' : 'expense'}
        />
        <MetricCard
          label="Comprometimento"
          value={receitas > 0 ? `${txComprometimento.toFixed(0)}%` : '—'}
          tone={txComprometimento > 90 ? 'expense' : txComprometimento > 70 ? 'warning' : 'income'}
        />
      </div>

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

      {/* Annual area chart */}
      <Card className="p-5">
        <h3 className="mb-4 font-bold text-slate-900 dark:text-white">
          Receitas × Despesas × Saldo — {year}
        </h3>
        {anualQ.isLoading ? (
          <div className="h-72 flex items-center justify-center text-sm text-slate-400">Carregando...</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="gradRec" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDesp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <ReferenceLine x={MONTH_SHORT[month]} stroke="#6366f1" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: MONTH_SHORT[month], position: 'insideTopRight', fontSize: 10, fill: '#6366f1' }} />
              <Area type="monotone" dataKey="Receitas" stroke="#10b981" strokeWidth={2} fill="url(#gradRec)" dot={{ r: 3, fill: '#10b981' }} />
              <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} fill="url(#gradDesp)" dot={{ r: 3, fill: '#ef4444' }} />
              <Area type="monotone" dataKey="Saldo" stroke="#6366f1" strokeWidth={2} fill="url(#gradSaldo)" dot={{ r: 3, fill: '#6366f1' }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Análise de despesas — 3 cards */}
      <div className="grid gap-5 xl:grid-cols-3">
        {/* Card 1: Juros × Descontos */}
        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Juros × Descontos</h3>
          {juros === 0 && descontos === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Sem juros ou descontos neste mês</p>
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
            <p className="py-6 text-center text-sm text-slate-400">Nenhuma parcela em aberto nos próximos meses</p>
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

      {/* 2-col: categories + origens */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Despesas por categoria</h3>
          {catData.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sem despesas neste mês</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Valor" radius={[0, 6, 6, 0]}>
                  {catData.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Receitas por origem</h3>
          {origemData.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sem receitas neste mês</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={origemData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                    <Cell fill="#10b981" />
                    <Cell fill="#6366f1" />
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-3 text-xs">
                {origemData.map((item, i) => (
                  <li key={item.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: i === 0 ? '#10b981' : '#6366f1' }} />
                      <span className="text-slate-700 dark:text-slate-300">{item.name}</span>
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(item.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
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
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={formaData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                    {formaData.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-2 text-xs">
                {formaData.map((item, i) => (
                  <li key={item.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CORES[i % CORES.length] }} />
                      <span className="text-slate-700 dark:text-slate-300 capitalize">{item.name}</span>
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(item.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
