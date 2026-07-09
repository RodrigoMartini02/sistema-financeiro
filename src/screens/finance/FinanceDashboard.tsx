import { useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Wallet, AlertTriangle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import type { Expense, ExpenseFormValues, Income, IncomeFormValues } from '../../types/finance';
import { MONTH_NAMES } from '../../types/finance';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { useAppContext } from '../../context/AppContext';
import { useQuery, useQueries } from '@tanstack/react-query';
import { apiRequest, getActiveProfileId } from '../../services/apiClient';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { ErrorState, EmptyState } from '../../ui/states';
import { MetricCard } from './MetricCard';
import { MonthSelector } from './MonthSelector';
import { IncomePanel } from './IncomePanel';
import { ExpensePanel } from './ExpensePanel';
import { IncomeDialog } from './IncomeDialog';
import { ExpenseDialog } from './ExpenseDialog';
import { formatCurrency } from './formatters';

// ── helpers ───────────────────────────────────────────────────────────────────

interface RawDespesa {
  valor_final: string | number; categoria_nome?: string | null;
  forma_pagamento?: string | null; pago?: boolean;
}
interface RawReceita { valor: string | number }

async function fetchDespesas(m: number, y: number): Promise<RawDespesa[]> {
  const pid = getActiveProfileId();
  const q = new URLSearchParams({ mes: String(m), ano: String(y) });
  if (pid) q.set('perfil_id', String(pid));
  return apiRequest<RawDespesa[]>(`/despesas?${q}`);
}
async function fetchReceitas(m: number, y: number): Promise<RawReceita[]> {
  const pid = getActiveProfileId();
  const q = new URLSearchParams({ mes: String(m), ano: String(y) });
  if (pid) q.set('perfil_id', String(pid));
  return apiRequest<RawReceita[]>(`/receitas?${q}`);
}

const CORES = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'];

const fmt = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
      ))}
    </div>
  );
};

// ── main component ────────────────────────────────────────────────────────────

export function FinanceDashboard() {
  const { month, year, setMonth, setYear } = useAppContext();
  const [tab, setTab] = useState<'lancamentos' | 'analise'>('lancamentos');
  const [incomeDialog, setIncomeDialog] = useState<{ open: boolean; item?: Income }>({ open: false });
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; item?: Expense }>({ open: false });
  const finance = useFinanceDashboard(month, year);
  const data = finance.dashboard.data;

  // ── analysis data ─────────────────────────────────────────────────
  const despQuery = useQuery({
    queryKey: ['dash-desp', month, year],
    queryFn: () => fetchDespesas(month, year),
    enabled: tab === 'analise',
  });

  // Annual data for trend chart — useQueries (safe, same count every render)
  const anualDespQueries = useQueries({
    queries: Array.from({ length: 12 }, (_, m) => ({
      queryKey: ['dash-desp', m, year],
      queryFn: () => fetchDespesas(m, year),
      enabled: tab === 'analise',
    })),
  });
  const anualRecQueries = useQueries({
    queries: Array.from({ length: 12 }, (_, m) => ({
      queryKey: ['dash-rec', m, year],
      queryFn: () => fetchReceitas(m, year),
      enabled: tab === 'analise',
    })),
  });
  const anualData = Array.from({ length: 12 }, (_, m) => ({
    name: MONTH_NAMES[m].slice(0, 3),
    Receitas: (anualRecQueries[m].data ?? []).reduce((s, r) => s + Number(r.valor), 0),
    Despesas: (anualDespQueries[m].data ?? []).reduce((s, d) => s + Number(d.valor_final), 0),
  }));

  // Category chart
  const catData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of despQuery.data ?? []) {
      const k = d.categoria_nome ?? 'Sem categoria';
      map[k] = (map[k] ?? 0) + Number(d.valor_final);
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [despQuery.data]);

  // Payment method pie
  const formaData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of despQuery.data ?? []) {
      const k = d.forma_pagamento ?? 'dinheiro';
      map[k] = (map[k] ?? 0) + Number(d.valor_final);
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [despQuery.data]);

  // KPIs
  const projectedBalance = useMemo(() => {
    if (!data) return 0;
    return data.balance.saldoAnterior + data.balance.receitas - data.balance.despesas;
  }, [data]);

  const txComprometimento = data?.balance.receitas
    ? (data.balance.despesas / data.balance.receitas) * 100
    : 0;

  const totalPendente = useMemo(
    () => (data?.expenses ?? []).filter((e) => !e.pago).reduce((s, e) => s + e.valorFinal, 0),
    [data]
  );

  const handleSaveIncome = async (values: IncomeFormValues) => {
    await finance.saveIncome.mutateAsync({ values, id: incomeDialog.item?.id });
    setIncomeDialog({ open: false });
  };

  const handleSaveExpense = async (items: ExpenseFormValues[]) => {
    for (const v of items) {
      await finance.saveExpense.mutateAsync({ values: v, id: items.length === 1 ? expenseDialog.item?.id : undefined });
    }
    setExpenseDialog({ open: false });
  };

  return (
    <>
      <div className="grid gap-4">
        {/* Header + Month selector */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">Painel financeiro</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => finance.dashboard.refetch()}>
                Atualizar
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
            <MonthSelector month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
          </div>
        </div>

        {finance.dashboard.error && (
          <ErrorState title="Não foi possível carregar o painel" description={finance.dashboard.error.message} />
        )}

        {/* KPI cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Saldo anterior" value={formatCurrency(data?.balance.saldoAnterior ?? 0)} tone="slate" />
          <MetricCard label="Receitas" value={formatCurrency(data?.balance.receitas ?? 0)} tone="income" />
          <MetricCard label="Despesas" value={formatCurrency(data?.balance.despesas ?? 0)} tone="expense" />
          <MetricCard label="Saldo projetado" value={formatCurrency(projectedBalance)} tone={projectedBalance >= 0 ? 'income' : 'expense'} />
        </div>

        {/* Tab bar */}
        <div className="flex gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
          {([['lancamentos', 'Lançamentos'], ['analise', 'Análise']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={['px-5 py-2 rounded-lg text-sm font-semibold transition', tab === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'].join(' ')}>
              {label}
            </button>
          ))}
        </div>

        {/* ── LANÇAMENTOS TAB ───────────────────────────────────────── */}
        {tab === 'lancamentos' && (
          <>
            {finance.dashboard.isLoading ? (
              <EmptyState title="Carregando lançamentos" description="Buscando receitas e despesas do mês." />
            ) : (
              <div className="grid gap-5 xl:grid-cols-2">
                <IncomePanel
                  items={data?.incomes ?? []}
                  onAdd={() => setIncomeDialog({ open: true })}
                  onEdit={(item) => setIncomeDialog({ open: true, item })}
                  onDelete={(item) => finance.deleteIncome.mutate(item.id)}
                  isDeleting={finance.deleteIncome.isPending}
                />
                <ExpensePanel
                  items={data?.expenses ?? []}
                  onAdd={() => setExpenseDialog({ open: true })}
                  onEdit={(item) => setExpenseDialog({ open: true, item })}
                  onDelete={(item) => finance.deleteExpense.mutate(item.id)}
                  isDeleting={finance.deleteExpense.isPending}
                />
              </div>
            )}
          </>
        )}

        {/* ── ANÁLISE TAB ───────────────────────────────────────────── */}
        {tab === 'analise' && (
          <div className="grid gap-5">
            {/* Health KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                    <TrendingUp size={15} className="text-green-600" />
                  </div>
                  <span className="text-xs font-semibold uppercase text-slate-500">Saúde financeira</span>
                </div>
                <p className={['text-2xl font-bold', txComprometimento < 70 ? 'text-green-700' : txComprometimento < 90 ? 'text-amber-700' : 'text-red-700'].join(' ')}>
                  {txComprometimento.toFixed(0)}%
                </p>
                <p className="text-xs text-slate-400 mt-0.5">comprometimento da renda</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                    <AlertTriangle size={15} className="text-amber-600" />
                  </div>
                  <span className="text-xs font-semibold uppercase text-slate-500">Pendente</span>
                </div>
                <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalPendente)}</p>
                <p className="text-xs text-slate-400 mt-0.5">despesas a vencer</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                    <Wallet size={15} className="text-blue-600" />
                  </div>
                  <span className="text-xs font-semibold uppercase text-slate-500">Disponível</span>
                </div>
                <p className={['text-2xl font-bold', projectedBalance >= 0 ? 'text-brand-700' : 'text-red-700'].join(' ')}>
                  {formatCurrency(projectedBalance)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">saldo projetado do mês</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                    <TrendingDown size={15} className="text-red-600" />
                  </div>
                  <span className="text-xs font-semibold uppercase text-slate-500">Total despesas</span>
                </div>
                <p className="text-2xl font-bold text-red-700">{formatCurrency(data?.balance.despesas ?? 0)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{data?.expenses.length ?? 0} lançamento(s)</p>
              </div>
            </div>

            {/* Category bar chart */}
            <Card className="p-5">
              <h3 className="mb-4 font-bold text-slate-900">Onde vai o dinheiro — Despesas por categoria</h3>
              {catData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Sem despesas neste mês</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Valor" radius={[0, 6, 6, 0]}>
                      {catData.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Payment form pie + bar side by side */}
            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-4 font-bold text-slate-900">Forma de pagamento</h3>
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
                            <span className="text-slate-700 capitalize">{item.name}</span>
                          </span>
                          <span className="font-semibold text-slate-900">{formatCurrency(item.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              {/* Fluxo de caixa month */}
              <Card className="p-5">
                <h3 className="mb-4 font-bold text-slate-900">Fluxo de caixa — {MONTH_NAMES[month]}</h3>
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Receitas</span>
                      <span className="font-semibold text-green-700">{formatCurrency(data?.balance.receitas ?? 0)}</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Despesas</span>
                      <span className="font-semibold text-red-700">{formatCurrency(data?.balance.despesas ?? 0)}</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-3 rounded-full bg-red-500 transition-all" style={{
                        width: `${data?.balance.receitas ? Math.min(100, (data.balance.despesas / data.balance.receitas) * 100) : 0}%`
                      }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Pendentes</span>
                      <span className="font-semibold text-amber-700">{formatCurrency(totalPendente)}</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-3 rounded-full bg-amber-400 transition-all" style={{
                        width: `${data?.balance.receitas ? Math.min(100, (totalPendente / data.balance.receitas) * 100) : 0}%`
                      }} />
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Annual trend */}
            <Card className="p-5">
              <h3 className="mb-4 font-bold text-slate-900">Desempenho anual — Receitas × Despesas {year}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={anualData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradRec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradDesp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="Receitas" stroke="#10b981" strokeWidth={2} fill="url(#gradRec)" dot={{ r: 3, fill: '#10b981' }} />
                  <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} fill="url(#gradDesp)" dot={{ r: 3, fill: '#ef4444' }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}
      </div>

      <IncomeDialog
        open={incomeDialog.open} income={incomeDialog.item}
        month={month} year={year}
        isSaving={finance.saveIncome.isPending} error={finance.saveIncome.error?.message}
        onClose={() => setIncomeDialog({ open: false })} onSave={handleSaveIncome}
      />
      <ExpenseDialog
        open={expenseDialog.open} expense={expenseDialog.item}
        month={month} year={year}
        isSaving={finance.saveExpense.isPending} error={finance.saveExpense.error?.message}
        onClose={() => setExpenseDialog({ open: false })} onSave={handleSaveExpense}
      />
    </>
  );
}
