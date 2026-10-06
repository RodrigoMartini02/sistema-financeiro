import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { useNow } from '../hooks/useNow';
import { TRACKING_STATUSES, type NoticeListItem, type TrackingStatus } from '../types';
import { countdownFor } from '../utils/countdown';
import { formatIsoDateTime } from '../utils/dates';
import { TRACKING_STATUS_LABELS } from '../utils/labels';
import { formatMoneyValue } from '../utils/money';
import type { BoardColumns } from '../utils/trackingBoard';
import { CountdownBadge } from './CountdownBadge';
import { MoveMenu } from './MoveMenu';
import { noticePlace } from './NoticeCard';

// Quadro de Acompanhamento: uma coluna por status, com arrastar e soltar
// nativo (desktop) e o menu "Mover para…" em cada card (teclado e celular).

const DRAG_TYPE = 'text/plain';

const COLUMN_ACCENTS: Record<TrackingStatus, string> = {
  ANALISAR: 'bg-brand-500',
  PARTICIPAR: 'bg-emerald-500',
  DESCARTADO: 'bg-slate-400',
};

const EMPTY_COLUMN_HINTS: Record<TrackingStatus, string> = {
  ANALISAR: 'Editais marcados como Analisar aparecem aqui.',
  PARTICIPAR: 'Editais em que a conta vai participar aparecem aqui.',
  DESCARTADO: 'Editais descartados aparecem aqui.',
};

/** Borda do card pelo prazo: vermelho com menos de 2 dias, âmbar com menos de 7. */
const DEADLINE_BORDERS = {
  danger: 'border-l-red-500',
  warning: 'border-l-amber-400',
  closed: 'border-l-slate-300 dark:border-l-slate-600',
  normal: 'border-l-transparent',
  none: 'border-l-transparent',
} as const;

interface BoardCardProps {
  notice: NoticeListItem;
  status: TrackingStatus;
  moving: boolean;
  onMove: (status: TrackingStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function BoardCard({ notice, status, moving, onMove, onDragStart, onDragEnd }: BoardCardProps) {
  const now = useNow();
  const tone = countdownFor(notice.proposalClosesAt, now).tone;
  return (
    <article
      draggable={!moving}
      onDragStart={(event: DragEvent<HTMLElement>) => {
        event.dataTransfer.setData(DRAG_TYPE, String(notice.id));
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      data-notice-id={notice.id}
      className={`rounded-xl border border-l-4 border-slate-200 bg-white p-3 shadow-sm transition dark:border-slate-700 dark:bg-slate-800 ${DEADLINE_BORDERS[tone]} ${
        moving ? 'opacity-60' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <CountdownBadge closesAt={notice.proposalClosesAt} />
        <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatMoneyValue(notice.estimatedTotalValue)}</span>
      </div>
      <Link
        to={`/editais/${notice.id}`}
        draggable={false}
        title={notice.procurementObject}
        className="mt-1.5 line-clamp-3 rounded text-sm font-semibold leading-snug text-slate-900 hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-100 dark:hover:text-brand-300"
      >
        {notice.procurementObject}
      </Link>
      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{noticePlace(notice) || 'Órgão não informado'}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{formatIsoDateTime(notice.proposalClosesAt)}</span>
        <MoveMenu current={status} onMove={onMove} noticeLabel={notice.procurementObject.slice(0, 80)} disabled={moving} />
      </div>
    </article>
  );
}

interface TrackingBoardProps {
  columns: BoardColumns;
  /** Total da coluna na API; maior que o mostrado quando passa do limite de uma página. */
  totals: Record<TrackingStatus, number | null>;
  movingIds: ReadonlySet<number>;
  onMove: (notice: NoticeListItem, status: TrackingStatus) => void;
}

export function TrackingBoard({ columns, totals, movingIds, onMove }: TrackingBoardProps) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<TrackingStatus | null>(null);

  const findNotice = (id: number) => TRACKING_STATUSES.flatMap((status) => columns[status]).find((notice) => notice.id === id);

  const handleDrop = (event: DragEvent<HTMLElement>, status: TrackingStatus) => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData(DRAG_TYPE)) || draggedId;
    setDraggedId(null);
    setDropTarget(null);
    const notice = id ? findNotice(id) : undefined;
    if (notice && notice.tracking?.status !== status) {
      onMove(notice, status);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {TRACKING_STATUSES.map((status) => {
        const notices = columns[status];
        const total = totals[status];
        const highlighted = dropTarget === status && draggedId !== null;
        return (
          <section
            key={status}
            aria-label={TRACKING_STATUS_LABELS[status]}
            onDragOver={(event) => {
              if (draggedId === null) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (dropTarget !== status) setDropTarget(status);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
            }}
            onDrop={(event) => handleDrop(event, status)}
            className={`flex min-w-0 flex-col rounded-2xl border bg-slate-100/70 p-3 transition dark:bg-slate-800/40 ${
              highlighted ? 'border-brand-400 ring-2 ring-brand-300 dark:ring-brand-500/50' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-slate-900 dark:text-slate-100">
              <span className={`h-2.5 w-2.5 rounded-full ${COLUMN_ACCENTS[status]}`} aria-hidden="true" />
              {TRACKING_STATUS_LABELS[status]}
              <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                {notices.length}
              </span>
            </h2>
            {total !== null && total > notices.length && (
              <p className="mt-1 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                Mostrando {notices.length} de {total.toLocaleString('pt-BR')}.
              </p>
            )}
            {notices.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
                {EMPTY_COLUMN_HINTS[status]}
              </p>
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-2">
                {notices.map((notice) => (
                  <li key={notice.id}>
                    <BoardCard
                      notice={notice}
                      status={status}
                      moving={movingIds.has(notice.id)}
                      onMove={(target) => onMove(notice, target)}
                      onDragStart={() => setDraggedId(notice.id)}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDropTarget(null);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
