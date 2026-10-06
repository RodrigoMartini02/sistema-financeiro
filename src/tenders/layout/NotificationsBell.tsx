import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Z_DROPDOWN } from '../../ui/zIndex';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { NotificationItem } from '../components/NotificationItem';
import { useMarkAllNotificationsRead, useOpenNotification } from '../hooks/useNotificationActions';
import { fetchNotifications } from '../services/notificationsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { Paginated, TenderNotification } from '../types';
import { NOTIFICATION_PANEL_FILTERS, notificationsQuery } from '../utils/notifications';

// Sino da barra superior (escopo, seção 9.4): painel com as 10 mais recentes,
// "Marcar todas como lidas" e "Ver todas".

const PANEL_QUERY = notificationsQuery(NOTIFICATION_PANEL_FILTERS);

interface NotificationsBellProps {
  unreadCount: number;
  buttonClassName: string;
}

export function NotificationsBell({ unreadCount, buttonClassName }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const openNotification = useOpenNotification(close);
  const markAll = useMarkAllNotificationsRead();
  const list = useQuery<Paginated<TenderNotification>, TendersApiError>({
    queryKey: tendersQueryKeys.notificationList(PANEL_QUERY),
    queryFn: () => fetchNotifications(PANEL_QUERY),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const unreadLabel = unreadCount > 9 ? '9+' : String(unreadCount);
  const items = list.data?.items ?? [];

  let body;
  if (list.isPending) {
    body = <LoadingBlock label="Carregando…" />;
  } else if (list.isError) {
    body = (
      <div className="p-3">
        <LoadError message={list.error.message} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-slate-500 dark:text-slate-400">
        <BellOff size={22} strokeWidth={1.5} aria-hidden="true" />
        <p className="text-sm font-semibold">Nenhuma notificação.</p>
        <p className="text-xs">Elas aparecem quando um edital novo bate com uma busca salva com Notificar ligado.</p>
      </div>
    );
  } else {
    body = (
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((notification) => (
          <li key={notification.id}>
            <NotificationItem notification={notification} onOpen={openNotification} compact />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div ref={containerRef} className="relative">
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

      {open && (
        <div
          role="dialog"
          aria-label="Notificações recentes"
          className={`fixed inset-x-2 top-[68px] flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] ${Z_DROPDOWN}`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Notificações</p>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={unreadCount === 0 || markAll.isPending}
              className="rounded text-xs font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-40 dark:text-brand-300"
            >
              Marcar todas como lidas
            </button>
          </div>
          {markAll.error && (
            <p role="alert" className="px-4 pt-2 text-xs font-medium text-red-600 dark:text-red-400">
              {markAll.error.message}
            </p>
          )}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{body}</div>
          <div className="border-t border-slate-100 px-4 py-2.5 text-center dark:border-slate-800">
            <Link
              to="/notificacoes"
              onClick={close}
              className="rounded text-sm font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-brand-300"
            >
              Ver todas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
