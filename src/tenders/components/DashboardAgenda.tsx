import { Clock, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { useNow } from '../hooks/useNow';
import type { NoticeListItem } from '../types';
import { closesWithin24Hours, groupAgenda } from '../utils/dashboard';
import { formatIsoDateTime } from '../utils/dates';
import { CountdownBadge } from './CountdownBadge';
import { panelLinkClass } from './DashboardPanel';
import { noticePlace } from './NoticeCard';
import { TrackingStatusPill } from './Pill';

/** Um edital do Início: objeto e local como link, prazo, abertura das propostas e o acompanhamento da conta. */
function NoticeRow({ notice, urgent }: { notice: NoticeListItem; urgent: boolean }) {
  return (
    <li className={`py-2.5 first:pt-0 last:pb-0 ${urgent ? 'border-l-2 border-red-400 pl-2.5 dark:border-red-400/70' : ''}`}>
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
        {notice.proposalOpensAt && (
          <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">Abertura: {formatIsoDateTime(notice.proposalOpensAt)}</span>
        )}
      </div>
    </li>
  );
}

/** Agenda dos prazos dos acompanhados: por dia (hoje, amanhã, esta semana, depois), com o que acaba em 24 h em destaque. */
export function AgendaList({ notices, todayIso }: { notices: NoticeListItem[]; todayIso: string }) {
  const now = useNow();
  if (notices.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Nenhum edital acompanhado com prazo aberto."
        description="Marque Analisar ou Vou participar nos editais da busca para acompanhar os prazos aqui."
        action={
          <Link to="/buscar" className={panelLinkClass}>
            Buscar editais
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4">
      {groupAgenda(notices, todayIso).map((group) => (
        <div key={group.key}>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group.label}</h3>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {group.items.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} urgent={closesWithin24Hours(notice.proposalClosesAt, now)} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Favoritos que ainda têm prazo aberto, os que encerram primeiro. */
export function FavoritesList({ notices }: { notices: NoticeListItem[] }) {
  const now = useNow();
  if (notices.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="Nenhum favorito com prazo aberto."
        description="Favorite editais na busca para vê-los aqui enquanto o prazo estiver aberto."
      />
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
      {notices.map((notice) => (
        <NoticeRow key={notice.id} notice={notice} urgent={closesWithin24Hours(notice.proposalClosesAt, now)} />
      ))}
    </ul>
  );
}
