import { Link, type To } from 'react-router-dom';
import type { NoticeListItem } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { formatMoneyValue } from '../utils/money';
import { CountdownBadge } from './CountdownBadge';
import { FavoriteButton } from './FavoriteButton';
import { HighlightedText } from './HighlightedText';
import { NoticeBadges } from './NoticeBadges';
import { noticePlace } from './NoticeCard';
import { TrackingStatusPill } from './Pill';
import { TrackingActions } from './TrackingActions';

interface NoticeTableProps {
  notices: NoticeListItem[];
  /** Linhas mais baixas: objeto numa linha e sem os selos. */
  compact: boolean;
  detailLinkFor: (id: number) => To;
  detailLinkState?: unknown;
}

const TH_CLASS = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

/** Resultados em tabela (desktop); no celular a tela mostra os cards. */
export function NoticeTable({ notices, compact, detailLinkFor, detailLinkState }: NoticeTableProps) {
  const cellPadding = compact ? 'px-3 py-1.5' : 'px-3 py-3';
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <table className="w-full min-w-[720px] table-fixed text-sm">
        <colgroup>
          <col className="w-12" />
          <col />
          <col className="w-32" />
          <col className="w-[150px]" />
          <col className="w-[172px]" />
        </colgroup>
        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
          <tr>
            <th scope="col" className={TH_CLASS}>
              <span className="sr-only">Favorito</span>
            </th>
            <th scope="col" className={TH_CLASS}>Objeto</th>
            <th scope="col" className={`${TH_CLASS} text-right`}>Valor estimado</th>
            <th scope="col" className={TH_CLASS}>Encerramento</th>
            <th scope="col" className={TH_CLASS}>Acompanhamento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {notices.map((notice) => (
            <tr key={notice.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-700/30">
              <td className={compact ? 'py-1 pl-2' : 'py-2.5 pl-2'}>
                <FavoriteButton notice={notice} />
              </td>
              <td className={cellPadding}>
                <Link
                  to={detailLinkFor(notice.id)}
                  state={detailLinkState}
                  title={notice.procurementObject}
                  className={`${compact ? 'line-clamp-1' : 'line-clamp-2'} rounded font-semibold text-slate-900 hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-100 dark:hover:text-brand-300`}
                >
                  {notice.highlightedExcerpt ? <HighlightedText text={notice.highlightedExcerpt} /> : notice.procurementObject}
                </Link>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{noticePlace(notice) || 'Órgão não informado'}</p>
                {!compact && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <NoticeBadges notice={notice} />
                    {notice.tracking && <TrackingStatusPill status={notice.tracking.status} />}
                  </div>
                )}
              </td>
              <td className={`${cellPadding} text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100`}>
                {formatMoneyValue(notice.estimatedTotalValue)}
              </td>
              <td className={cellPadding}>
                <div className={`flex ${compact ? 'flex-row flex-wrap items-center' : 'flex-col items-start'} gap-1`}>
                  {notice.proposalClosesAt && (
                    <span className="text-xs tabular-nums text-slate-700 dark:text-slate-200">{formatIsoDateTime(notice.proposalClosesAt)}</span>
                  )}
                  <CountdownBadge closesAt={notice.proposalClosesAt} />
                </div>
              </td>
              <td className={cellPadding}>
                <TrackingActions notice={notice} variant="icons" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
