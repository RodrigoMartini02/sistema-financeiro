import { CircleCheck, CircleX, ExternalLink, Eye, Loader2, type LucideIcon } from 'lucide-react';
import { useSaveTracking } from '../hooks/useNoticeTracking';
import { TRACKING_STATUSES, type NoticeListItem, type TrackingStatus } from '../types';
import { TRACKING_ACTION_LABELS } from '../utils/labels';

// Ações rápidas do edital na lista: Analisar, Vou participar, Descartar e
// Abrir no PNCP. O mesmo status de novo não muda nada; remover o
// acompanhamento fica no detalhe.

const ACTION_ICONS: Record<TrackingStatus, LucideIcon> = {
  ANALISAR: Eye,
  PARTICIPAR: CircleCheck,
  DESCARTADO: CircleX,
};

const ACTIVE_CLASSES: Record<TrackingStatus, string> = {
  ANALISAR: 'border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-600',
  PARTICIPAR: 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600',
  DESCARTADO: 'border-slate-500 bg-slate-500 text-white dark:border-slate-500 dark:bg-slate-600',
};

const BASE_CLASS =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 disabled:cursor-wait sm:h-8';
const IDLE_CLASS =
  'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-500/60 dark:hover:text-brand-300';

interface TrackingActionsProps {
  notice: Pick<NoticeListItem, 'id' | 'tracking' | 'pncpLink'>;
  /** Botões com texto (cards) ou só ícones (tabela). */
  variant?: 'buttons' | 'icons';
}

export function TrackingActions({ notice, variant = 'buttons' }: TrackingActionsProps) {
  const save = useSaveTracking();
  const current = notice.tracking?.status ?? null;
  const pendingStatus = save.isPending ? save.variables?.status : null;
  const iconsOnly = variant === 'icons';
  const sizeClass = iconsOnly ? 'w-9 sm:w-8' : 'px-2.5';

  const choose = (status: TrackingStatus) => {
    if (status === current || save.isPending) return;
    // Sem acompanhamento, não há observação a manter.
    save.mutate({ noticeId: notice.id, status, note: notice.tracking ? undefined : null });
  };

  return (
    <div className="flex flex-col gap-1">
      <div role="group" aria-label="Acompanhamento do edital" className="flex flex-wrap items-center gap-1.5">
        {TRACKING_STATUSES.map((status) => {
          const Icon = ACTION_ICONS[status];
          const active = status === current;
          const label = TRACKING_ACTION_LABELS[status];
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              aria-label={iconsOnly ? label : undefined}
              title={iconsOnly ? label : undefined}
              disabled={save.isPending}
              onClick={() => choose(status)}
              className={`${BASE_CLASS} ${sizeClass} ${active ? ACTIVE_CLASSES[status] : IDLE_CLASS}`}
            >
              {pendingStatus === status ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Icon size={14} aria-hidden="true" />
              )}
              {!iconsOnly && label}
            </button>
          );
        })}
        {notice.pncpLink && (
          <a
            href={notice.pncpLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir no PNCP (abre em nova aba)"
            title="Abrir no PNCP"
            className={`${BASE_CLASS} ${sizeClass} ${IDLE_CLASS}`}
          >
            <ExternalLink size={14} aria-hidden="true" />
            {!iconsOnly && 'PNCP'}
          </a>
        )}
      </div>
      {save.error && (
        <p role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
          {save.error.message}
        </p>
      )}
    </div>
  );
}
