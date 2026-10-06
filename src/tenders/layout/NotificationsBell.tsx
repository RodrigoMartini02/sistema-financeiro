import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, Clock, RefreshCw, Sparkles, X, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Z_SYSTEM_OVERLAY } from '../../ui/zIndex';
import { LoadError } from '../components/LoadStates';
import { useMarkAllNotificationsRead, useOpenNotification } from '../hooks/useNotificationActions';
import { fetchNotifications } from '../services/notificationsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { Paginated, TenderNotification, TenderNotificationType } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { NOTIFICATION_TYPE_LABELS } from '../utils/labels';
import { NOTIFICATION_PANEL_FILTERS, notificationsQuery } from '../utils/notifications';

// Sino da barra superior (escopo, seção 9.4): painel lateral à direita com as
// 10 mais recentes, no visual do painel de notificações do app de finanças
// (AppShell). O clique marca como lida e abre o edital; no rodapé, "Marcar
// todas como lidas" e "Ver todas". O painel vai para o body: a barra superior
// tem desfoque, que prenderia o `fixed` dentro dela.

const PANEL_QUERY = notificationsQuery(NOTIFICATION_PANEL_FILTERS);
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const AMBER_CIRCLE = 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900';
const TYPE_STYLES: Record<TenderNotificationType, { icon: LucideIcon; circle: string }> = {
  NOVO_EDITAL: { icon: Sparkles, circle: 'bg-cyan-50 text-cyan-600 ring-cyan-100 dark:bg-cyan-950 dark:text-cyan-300 dark:ring-cyan-900' },
  EDITAL_ALTERADO: { icon: RefreshCw, circle: AMBER_CIRCLE },
  PRAZO_3D: { icon: Clock, circle: AMBER_CIRCLE },
  PRAZO_1D: { icon: AlertTriangle, circle: 'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900' },
};

const linkClass =
  'rounded font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-brand-300';

function PanelNotification({ notification, onOpen }: { notification: TenderNotification; onOpen: (notification: TenderNotification) => void }) {
  const unread = !notification.readAt;
  const { icon: Icon, circle } = TYPE_STYLES[notification.type];
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={[
        'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600',
        unread
          ? 'border-cyan-200 bg-cyan-50/60 hover:bg-cyan-50 dark:border-cyan-900 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/30'
          : 'border-slate-100 bg-white opacity-70 hover:border-cyan-200 hover:opacity-100 dark:border-slate-800 dark:bg-slate-900',
      ].join(' ')}
    >
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${circle}`} aria-hidden="true">
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{notification.title}</span>
        {notification.message && (
          <span className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{notification.message}</span>
        )}
        <span className="mt-1 block text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          {NOTIFICATION_TYPE_LABELS[notification.type]} · {formatIsoDateTime(notification.createdAt)}
          {unread && <span className="sr-only"> Não lida.</span>}
        </span>
      </span>
      {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-500" aria-hidden="true" />}
    </button>
  );
}

interface NotificationsBellProps {
  unreadCount: number;
  buttonClassName: string;
}

export function NotificationsBell({ unreadCount, buttonClassName }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  // Abrir uma notificação ou "Ver todas" navega: o foco fica na página nova.
  const close = useCallback(() => setOpen(false), []);
  // Esc, X e clique fora: o foco volta para o sino.
  const dismiss = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);
  const openNotification = useOpenNotification(close);
  const markAll = useMarkAllNotificationsRead();
  const list = useQuery<Paginated<TenderNotification>, TendersApiError>({
    queryKey: tendersQueryKeys.notificationList(PANEL_QUERY),
    queryFn: () => fetchNotifications(PANEL_QUERY),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, dismiss]);

  const unreadLabel = unreadCount > 9 ? '9+' : String(unreadCount);
  const items = list.data?.items ?? [];

  let body;
  if (list.isPending) {
    body = (
      <div
        role="status"
        className="rounded-2xl border border-slate-100 bg-slate-50 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
      >
        Carregando notificações…
      </div>
    );
  } else if (list.isError) {
    body = <LoadError message={list.error.message} onRetry={() => void list.refetch()} retrying={list.isFetching} />;
  } else if (items.length === 0) {
    body = (
      <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-10 text-center text-sm text-slate-600 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100">
        <Bell size={30} className="mx-auto mb-3 text-cyan-500" aria-hidden="true" />
        <p className="font-semibold">Nenhuma notificação.</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-cyan-100/70">
          Elas aparecem quando um edital novo bate com uma busca salva com Notificar ligado.
        </p>
      </div>
    );
  } else {
    body = (
      <ul className="grid gap-2">
        {items.map((notification) => (
          <li key={notification.id}>
            <PanelNotification notification={notification} onOpen={openNotification} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : 'Notificações'}
        className={buttonClassName}
      >
        <span className="relative inline-flex">
          <Bell size={16} aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="pointer-events-none absolute -right-2 -top-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-[#0D2E3C]">
              {unreadLabel}
            </span>
          )}
        </span>
      </button>

      {open &&
        createPortal(
          <>
            <div className={`fixed inset-0 bg-slate-950/15 backdrop-blur-[1px] ${Z_SYSTEM_OVERLAY}`} onClick={dismiss} aria-hidden="true" />
            <aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={`fixed inset-y-0 right-0 flex w-[min(100vw,410px)] flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/25 dark:border-slate-800 dark:bg-slate-950 ${Z_SYSTEM_OVERLAY}`}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 dark:border-slate-800">
                <div>
                  <p id={titleId} className="text-base font-bold text-slate-950 dark:text-white">
                    Notificações
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Editais novos, alterados e prazos</p>
                </div>
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="Fechar notificações"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{body}</div>

              {markAll.error && (
                <p role="alert" className="px-5 pb-2 text-xs font-medium text-red-600 dark:text-red-400">
                  {markAll.error.message}
                </p>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={unreadCount === 0 || markAll.isPending}
                  className={`${linkClass} text-xs disabled:pointer-events-none disabled:opacity-40`}
                >
                  Marcar todas como lidas
                </button>
                <Link to="/notificacoes" onClick={close} className={`${linkClass} text-sm`}>
                  Ver todas
                </Link>
              </div>
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
