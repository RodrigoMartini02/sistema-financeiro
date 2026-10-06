import { Link, type To } from 'react-router-dom';
import type { NoticeListItem } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { formatMoneyValue } from '../utils/money';
import { CountdownBadge } from './CountdownBadge';
import { HighlightedText } from './HighlightedText';
import { NoticeBadges } from './NoticeBadges';
import { TrackingStatusPill } from './Pill';
import { TrackingActions } from './TrackingActions';

/** Órgão · Município/UF, com o que houver. */
export function noticePlace(notice: Pick<NoticeListItem, 'agencyName' | 'cityName' | 'state'>): string {
  const city = [notice.cityName, notice.state].filter(Boolean).join('/');
  return [notice.agencyName, city].filter(Boolean).join(' · ');
}

interface NoticeCardProps {
  notice: NoticeListItem;
  /** Onde o objeto leva: o painel lateral (Buscar) ou a página do edital. */
  detailLink: To;
  detailLinkState?: unknown;
}

/** Card do resultado da busca (escopo, seção 9.4). */
export function NoticeCard({ notice, detailLink, detailLinkState }: NoticeCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-500/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <NoticeBadges notice={notice} />
        {notice.tracking && <TrackingStatusPill status={notice.tracking.status} />}
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
        <Link
          to={detailLink}
          state={detailLinkState}
          title={notice.procurementObject}
          className="line-clamp-2 rounded hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:text-brand-300"
        >
          {notice.highlightedExcerpt ? <HighlightedText text={notice.highlightedExcerpt} /> : notice.procurementObject}
        </Link>
      </h3>
      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{noticePlace(notice) || 'Órgão não informado'}</p>

      <dl className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Valor estimado</dt>
          <dd className="font-semibold text-slate-800 dark:text-slate-100">{formatMoneyValue(notice.estimatedTotalValue)}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Encerramento</dt>
          <dd className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
            {notice.proposalClosesAt && <span>{formatIsoDateTime(notice.proposalClosesAt)}</span>}
            <CountdownBadge closesAt={notice.proposalClosesAt} />
          </dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">
        <TrackingActions notice={notice} />
      </div>
    </article>
  );
}
