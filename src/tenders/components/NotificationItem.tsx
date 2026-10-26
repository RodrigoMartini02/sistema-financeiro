import type { TenderNotification } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { NOTIFICATION_TYPE_LABELS } from '../utils/labels';
import { ListCard, ListCardLine } from './ListCard';

interface NotificationItemProps {
  notification: TenderNotification;
  onOpen: (notification: TenderNotification) => void;
}

/**
 * Uma notificação: as não lidas em destaque; o clique em qualquer ponto do cartão (o título cobre o cartão todo)
 * marca como lida e abre o edital ou o contrato.
 */
export function NotificationItem({ notification, onOpen }: NotificationItemProps) {
  const unread = !notification.readAt;
  return (
    <ListCard
      highlighted={unread}
      badges={
        <>
          {unread && (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
              <span className="sr-only">Não lida.</span>
            </>
          )}
          <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
            {NOTIFICATION_TYPE_LABELS[notification.type]}
          </span>
          <span className="text-[11px] tabular-nums text-slate-400">{formatIsoDateTime(notification.createdAt)}</span>
        </>
      }
      title={
        <button
          type="button"
          onClick={() => onOpen(notification)}
          className={`rounded text-left after:absolute after:inset-0 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:text-brand-300 ${
            unread ? 'font-bold' : 'font-medium'
          }`}
        >
          {notification.title}
        </button>
      }
      context={notification.message ? <ListCardLine lines={3}>{notification.message}</ListCardLine> : undefined}
    />
  );
}
