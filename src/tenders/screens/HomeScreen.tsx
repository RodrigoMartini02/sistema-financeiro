import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookmarkPlus, ChevronRight, Clock, MapPin, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { getLocalTodayIso } from '../../utils/date';
import { CountBars } from '../components/CountBars';
import { CountdownBadge } from '../components/CountdownBadge';
import { DashboardCards } from '../components/DashboardCards';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { noticePlace } from '../components/NoticeCard';
import { Pill, TrackingStatusPill } from '../components/Pill';
import { fetchDashboard } from '../services/overviewService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { DashboardView } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { SEARCH_URL_PARAMS } from '../utils/searchFilters';

const linkClass = 'text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300';

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ClosingSoon({ notices }: { notices: DashboardView['closingSoon'] }) {
  if (notices.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Nenhum edital acompanhado com prazo aberto."
        description="Marque Analisar ou Vou participar nos editais da busca para acompanhar os prazos aqui."
        action={
          <Link to="/buscar" className={linkClass}>
            Buscar editais
          </Link>
        }
      />
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
      {notices.map((notice) => (
        <li key={notice.id} className="py-2.5 first:pt-0 last:pb-0">
          <Link to={`/editais/${notice.id}`} className="group block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
            <p className="line-clamp-2 text-sm font-semibold text-slate-800 group-hover:text-brand-700 group-hover:underline dark:text-slate-100 dark:group-hover:text-brand-300">
              {notice.procurementObject}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{noticePlace(notice)}</p>
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <CountdownBadge closesAt={notice.proposalClosesAt} />
            {notice.tracking && <TrackingStatusPill status={notice.tracking.status} />}
            <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{formatIsoDateTime(notice.proposalClosesAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SavedSearchesSummary({ searches }: { searches: DashboardView['savedSearches'] }) {
  if (searches.length === 0) {
    return (
      <EmptyState
        icon={BookmarkPlus}
        title="Nenhuma busca salva."
        action={
          <Link to="/buscas" className={linkClass}>
            Criar busca
          </Link>
        }
      />
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-1">
      {searches.map((search) => (
        <li key={search.id}>
          <Link
            to={`/buscar?${SEARCH_URL_PARAMS.savedSearch}=${search.id}`}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:bg-slate-700/50"
          >
            <span className={`min-w-0 flex-1 truncate font-semibold ${search.active ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
              {search.name}
            </span>
            {!search.active && <Pill tone="muted">Pausada</Pill>}
            <span className="tabular-nums text-xs font-semibold text-slate-600 dark:text-slate-300">
              {search.openCount.toLocaleString('pt-BR')} {search.openCount === 1 ? 'aberto' : 'abertos'}
            </span>
            <ChevronRight size={14} className="text-slate-400" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Início (escopo, seção 9.4): indicadores, prazos, editais por UF e buscas salvas. */
export function HomeScreen() {
  const dashboard = useQuery<DashboardView, TendersApiError>({ queryKey: tendersQueryKeys.dashboard, queryFn: fetchDashboard });

  if (dashboard.isPending) return <LoadingBlock label="Carregando o painel…" />;
  if (dashboard.isError) {
    return <LoadError title="Não foi possível carregar o painel" message={dashboard.error.message} onRetry={() => void dashboard.refetch()} retrying={dashboard.isFetching} />;
  }

  const view = dashboard.data;
  return (
    <section className="mx-auto grid grid-cols-1 max-w-[1400px] gap-4">
      <DashboardCards cards={view.cards} todayIso={getLocalTodayIso()} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Encerrando em breve">
            <ClosingSoon notices={view.closingSoon} />
          </Panel>
        </div>
        <div className="grid grid-cols-1 content-start gap-4">
          <Panel title="Editais abertos por UF">
            {view.openByState.length === 0 ? (
              <EmptyState icon={MapPin} title="Sem dados ainda." description="O gráfico usa os editais abertos das suas buscas salvas." />
            ) : (
              <CountBars label="Editais abertos por UF" items={view.openByState.map((item) => ({ key: item.state, label: item.state, count: item.count }))} />
            )}
          </Panel>
          <Panel
            title="Minhas buscas salvas"
            action={
              <Link to="/buscas" className={linkClass}>
                Ver todas
              </Link>
            }
          >
            <SavedSearchesSummary searches={view.savedSearches} />
          </Panel>
        </div>
      </div>

      <p
        className={`flex items-center gap-1.5 text-xs ${
          view.lastRunFailed ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {view.lastRunFailed && <TriangleAlert size={14} aria-hidden="true" />}
        Última atualização dos dados: {view.lastUpdateAt ? formatIsoDateTime(view.lastUpdateAt) : 'ainda não houve coleta'}
        {view.lastRunFailed && ' · a última coleta falhou, e os dados podem estar desatualizados.'}
      </p>
    </section>
  );
}
