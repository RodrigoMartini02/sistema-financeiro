import type { TenderNotification } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { NOTIFICATION_TYPE_LABELS } from '../utils/labels';

interface NotificationItemProps {
  notification: TenderNotification;
  onOpen: (notification: TenderNotification) => void;
  /** Mensagem em 2 linhas (painel do sino) ou 3 (página). */
  compact?: boolean;
}

/** Uma notificação: as não lidas em destaque; o clique marca como lida e abre o edital. */
export function NotificationItem({ notification, onOpen, compact = false }: NotificationItemProps) {
  const unread = !notification.readAt;
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-slate-800/70 dark:focus-visible:bg-slate-800/70 ${
        unread ? 'bg-brand-50/70 dark:bg-brand-500/10' : ''
      }`}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-brand-500' : 'bg-transparent'}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
            {NOTIFICATION_TYPE_LABELS[notification.type]}
          </span>
          <span className="text-[11px] tabular-nums text-slate-400">{formatIsoDateTime(notification.createdAt)}</span>
          {unread && <span className="sr-only">Não lida.</span>}
        </span>
        <span className={`mt-0.5 block text-sm ${unread ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-200'}`}>
          {notification.title}
        </span>
        {notification.message && (
          <span className={`mt-0.5 text-xs text-slate-500 dark:text-slate-400 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>
            {notification.message}
          </span>
        )}
      </span>
    </button>
  );
}
