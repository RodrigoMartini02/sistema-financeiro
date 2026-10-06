import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { Select } from '../../ui/form';
import { useNow } from '../hooks/useNow';
import { TRACKING_STATUSES, type NoticeListItem, type TrackingStatus } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { TRACKING_STATUS_LABELS } from '../utils/labels';
import { formatMoneyValue } from '../utils/money';
import { CountdownBadge } from './CountdownBadge';
import { MoveMenu } from './MoveMenu';
import { noticePlace } from './NoticeCard';
import { TrackingStatusPill } from './Pill';

// Acompanhamento em tabela: filtro por status e por prazo aberto, ordem por prazo.

type StatusFilter = TrackingStatus | 'TODOS';
type SortDirection = 'asc' | 'desc';

const TH_CLASS = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

function closesAtMs(notice: NoticeListItem): number | null {
  const time = notice.proposalClosesAt ? new Date(notice.proposalClosesAt).getTime() : Number.NaN;
  return Number.isNaN(time) ? null : time;
}

interface TrackingTableProps {
  notices: NoticeListItem[];
  movingIds: ReadonlySet<number>;
  onMove: (notice: NoticeListItem, status: TrackingStatus) => void;
}

export function TrackingTable({ notices, movingIds, onMove }: TrackingTableProps) {
  const now = useNow();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS');
  const [openOnly, setOpenOnly] = useState(false);
  const [direction, setDirection] = useState<SortDirection>('asc');

  const rows = useMemo(() => {
    const nowMs = now.getTime();
    return notices
      .filter((notice) => statusFilter === 'TODOS' || notice.tracking?.status === statusFilter)
      .filter((notice) => {
        const closesAt = closesAtMs(notice);
        return !openOnly || (closesAt !== null && closesAt > nowMs);
      })
      .sort((a, b) => {
        const aClosesAt = closesAtMs(a);
        const bClosesAt = closesAtMs(b);
        if (aClosesAt === null || bClosesAt === null) return (aClosesAt === null ? 1 : 0) - (bClosesAt === null ? 1 : 0);
        return direction === 'asc' ? aClosesAt - bClosesAt : bClosesAt - aClosesAt;
      });
  }, [notices, statusFilter, openOnly, direction, now]);

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Status
          <Select
            value={statusFilter}
            onChange={(event) => {
              const value = event.target.value;
              setStatusFilter(TRACKING_STATUSES.find((status) => status === value) ?? 'TODOS');
            }}
            className="w-[170px]"
          >
            <option value="TODOS">Todos</option>
            {TRACKING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TRACKING_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(event) => setOpenOnly(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-[#0891b2] dark:[color-scheme:dark]"
          />
          Só com prazo aberto
        </label>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {rows.length} {rows.length === 1 ? 'edital' : 'editais'}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum edital acompanhado com esses filtros." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-36" />
              <col className="w-44" />
              <col className="w-32" />
              <col className="w-[150px]" />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
              <tr>
                <th scope="col" className={TH_CLASS}>Objeto</th>
                <th scope="col" className={TH_CLASS}>Status</th>
                <th scope="col" className={TH_CLASS} aria-sort={direction === 'asc' ? 'ascending' : 'descending'}>
                  <button
                    type="button"
                    onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
                    className="inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:text-slate-200"
                  >
                    Encerramento
                    {direction === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
                    <span className="sr-only">{direction === 'asc' ? '(mais próximo primeiro)' : '(mais distante primeiro)'}</span>
                  </button>
                </th>
                <th scope="col" className={`${TH_CLASS} text-right`}>Valor estimado</th>
                <th scope="col" className={TH_CLASS}>
                  <span className="sr-only">Mover para</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {rows.map((notice) => {
                const status = notice.tracking?.status ?? 'ANALISAR';
                return (
                  <tr key={notice.id} className={`align-top ${movingIds.has(notice.id) ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-3">
                      <Link
                        to={`/editais/${notice.id}`}
                        title={notice.procurementObject}
                        className="line-clamp-2 rounded font-semibold text-slate-900 hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-100 dark:hover:text-brand-300"
                      >
                        {notice.procurementObject}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{noticePlace(notice) || 'Órgão não informado'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <TrackingStatusPill status={status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-xs tabular-nums text-slate-700 dark:text-slate-200">{formatIsoDateTime(notice.proposalClosesAt)}</span>
                        <CountdownBadge closesAt={notice.proposalClosesAt} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                      {formatMoneyValue(notice.estimatedTotalValue)}
                    </td>
                    <td className="px-3 py-3">
                      <MoveMenu
                        current={status}
                        onMove={(target) => onMove(notice, target)}
                        noticeLabel={notice.procurementObject.slice(0, 80)}
                        disabled={movingIds.has(notice.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
