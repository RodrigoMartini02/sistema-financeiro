import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, Globe2, LogIn, RefreshCw, UserPlus, Users } from 'lucide-react';
import { fetchAnalyticsOverview } from '../../services/analyticsService';
import { Button } from '../../ui/button';
import { ErrorState } from '../../ui/states';

const PERIOD_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
];

function numberFormat(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString('pt-BR');
}

function dateFormat(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function labelForDay(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

export function AcessosTab() {
  const [days, setDays] = useState(30);

  const overviewQuery = useQuery({
    queryKey: ['analytics-overview', days],
    queryFn: () => fetchAnalyticsOverview(days),
    staleTime: 60_000,
  });

  const overview = overviewQuery.data;
  const daily = overview?.daily ?? [];
  const maxDailyValue = useMemo(() => {
    return Math.max(1, ...daily.flatMap((item) => [Number(item.page_views), Number(item.logins), Number(item.accounts)]));
  }, [daily]);

  if (overviewQuery.isError) {
    return (
      <ErrorState
        title="Nao foi possivel carregar os acessos"
        description={overviewQuery.error.message}
      />
    );
  }

  const summary = overview?.summary;

  const cards = [
    {
      label: 'Acessos na pagina',
      value: summary?.page_views_in_period,
      total: summary?.page_views_total,
      icon: Globe2,
      color: 'text-cyan-600 bg-cyan-50 border-cyan-100',
    },
    {
      label: 'Logins',
      value: summary?.logins_in_period,
      total: summary?.logins_total,
      icon: LogIn,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    },
    {
      label: 'Contas criadas',
      value: summary?.accounts_in_period,
      total: summary?.total_accounts,
      icon: UserPlus,
      color: 'text-blue-600 bg-blue-50 border-blue-100',
    },
    {
      label: 'Usuarios ativos',
      value: summary?.active_accounts,
      total: summary?.total_accounts,
      icon: Users,
      color: 'text-slate-600 bg-slate-50 border-slate-100',
    },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Resumo dos ultimos {days} dias</p>
          <p className="mt-1 text-xs text-slate-400">Acessos publicos, logins e novas contas do sistema.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDays(option.value)}
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                  days === option.value
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            icon={<RefreshCw size={14} className={overviewQuery.isFetching ? 'animate-spin' : ''} />}
            onClick={() => overviewQuery.refetch()}
          >
            Atualizar
          </Button>
        </div>
      </div>

      {overview && !overview.eventsAvailable && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Captura de acessos ainda nao ativa</p>
            <p className="mt-1 text-xs text-amber-700">Aplique a migration backend/drizzle/0013_analytics_events.sql para gravar acessos e logins. As contas criadas ja aparecem pela tabela de usuarios.</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{numberFormat(card.value)}</p>
                  <p className="mt-1 text-xs text-slate-400">Total historico: {numberFormat(card.total)}</p>
                </div>
                <div className={[card.color, 'flex h-10 w-10 items-center justify-center rounded-lg border'].join(' ')}>
                  <Icon size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Movimento diario</p>
              <p className="mt-1 text-xs text-slate-400">Comparativo de acessos, logins e contas criadas.</p>
            </div>
            <Activity size={18} className="text-brand-600" />
          </div>

          {overviewQuery.isLoading ? (
            <p className="py-12 text-center text-sm text-slate-400">Carregando dados...</p>
          ) : daily.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Sem eventos registrados no periodo.</p>
          ) : (
            <div className="flex h-72 items-end gap-2 overflow-x-auto pb-2">
              {daily.map((item) => (
                <div key={item.date} className="flex min-w-[34px] flex-1 flex-col items-center gap-2">
                  <div className="flex h-56 w-full items-end justify-center gap-1 rounded-lg bg-slate-50 px-1.5 py-2">
                    <span
                      title={`${numberFormat(item.page_views)} acessos`}
                      className="w-2 rounded-t bg-cyan-500"
                      style={{ height: `${Math.max(4, (Number(item.page_views) / maxDailyValue) * 100)}%` }}
                    />
                    <span
                      title={`${numberFormat(item.logins)} logins`}
                      className="w-2 rounded-t bg-emerald-500"
                      style={{ height: `${Math.max(4, (Number(item.logins) / maxDailyValue) * 100)}%` }}
                    />
                    <span
                      title={`${numberFormat(item.accounts)} contas`}
                      className="w-2 rounded-t bg-blue-500"
                      style={{ height: `${Math.max(4, (Number(item.accounts) / maxDailyValue) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">{labelForDay(item.date)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-cyan-500" /> Acessos</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Logins</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Contas</span>
          </div>
        </div>

        <div className="grid gap-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">Paginas mais acessadas</p>
            <div className="mt-4 grid gap-3">
              {(overview?.topPages ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Sem acessos registrados.</p>
              ) : (
                overview!.topPages.map((page) => (
                  <div key={page.path ?? 'sem-path'} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{page.path ?? '/'}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-cyan-500"
                          style={{ width: `${Math.max(6, (Number(page.views) / Math.max(1, Number(summary?.page_views_in_period))) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{numberFormat(page.views)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">Ultimas contas criadas</p>
            <div className="mt-4 divide-y divide-slate-100">
              {(overview?.recentAccounts ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Nenhuma conta encontrada.</p>
              ) : (
                overview!.recentAccounts.map((account) => (
                  <div key={account.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                      {account.nome.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{account.nome}</p>
                      <p className="truncate text-xs text-slate-400">{account.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase text-slate-500">{account.tipo}</p>
                      <p className="text-xs text-slate-400">{dateFormat(account.data_cadastro)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}