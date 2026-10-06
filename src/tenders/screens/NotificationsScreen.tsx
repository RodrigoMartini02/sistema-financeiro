import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BellOff, CheckCheck } from 'lucide-react';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/EmptyState';
import { Select, ToggleGroup } from '../../ui/form';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { NotificationItem } from '../components/NotificationItem';
import { Pagination } from '../components/Pagination';
import { useMarkAllNotificationsRead, useOpenNotification } from '../hooks/useNotificationActions';
import { useUnreadNotificationsCount } from '../hooks/useUnreadNotificationsCount';
import { fetchNotifications } from '../services/notificationsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import { TENDER_NOTIFICATION_TYPES, type Paginated, type TenderNotification, type TenderNotificationType } from '../types';
import { NOTIFICATION_TYPE_LABELS } from '../utils/labels';
import { notificationsQuery } from '../utils/notifications';
import { DEFAULT_PER_PAGE } from '../utils/searchFilters';

// Notificações (escopo, seção 9.4): lista paginada com filtro por tipo e por
// não lidas. O clique marca como lida e abre o edital.

const READ_FILTER_OPTIONS = [
  { value: 'todas', label: 'Todas' },
  { value: 'nao-lidas', label: 'Não lidas' },
];

export function NotificationsScreen() {
  const [type, setType] = useState<TenderNotificationType | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const apiQuery = notificationsQuery({ type, unreadOnly, page, perPage });
  const list = useQuery<Paginated<TenderNotification>, TendersApiError>({
    queryKey: tendersQueryKeys.notificationList(apiQuery),
    queryFn: () => fetchNotifications(apiQuery),
    placeholderData: keepPreviousData,
  });
  const unreadCount = useUnreadNotificationsCount(true).data ?? 0;
  const markAll = useMarkAllNotificationsRead();
  const openNotification = useOpenNotification();
  const filtered = type !== null || unreadOnly;

  const changeFilters = (changes: { type?: TenderNotificationType | null; unreadOnly?: boolean }) => {
    if (changes.type !== undefined) setType(changes.type);
    if (changes.unreadOnly !== undefined) setUnreadOnly(changes.unreadOnly);
    setPage(1);
  };

  let content;
  if (list.isPending) {
    content = <LoadingBlock label="Carregando as notificações…" />;
  } else if (list.isError) {
    content = <LoadError message={list.error.message} onRetry={() => void list.refetch()} retrying={list.isFetching} />;
  } else if (list.data.total === 0) {
    content = filtered ? (
      <EmptyState
        icon={BellOff}
        title="Nenhuma notificação com esses filtros."
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => changeFilters({ type: null, unreadOnly: false })}>
            Ver todas
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={BellOff}
        title="Você ainda não tem notificações."
        description="Elas chegam quando um edital novo bate com uma busca salva com Notificar ligado, quando um edital acompanhado muda no PNCP e quando o prazo de um edital em Vou participar se aproxima."
      />
    );
  } else {
    content = (
      <div className={`grid grid-cols-1 gap-4 transition-opacity ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {list.data.items.map((notification) => (
            <li key={notification.id}>
              <NotificationItem notification={notification} onOpen={openNotification} />
            </li>
          ))}
        </ul>
        <Pagination
          page={list.data.page}
          totalPages={list.data.totalPages}
          total={list.data.total}
          perPage={list.data.perPage}
          onPage={(nextPage) => {
            setPage(nextPage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onPerPage={(nextPerPage) => {
            setPerPage(nextPerPage);
            setPage(1);
          }}
        />
      </div>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Tipo
          <Select
            value={type ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              changeFilters({ type: TENDER_NOTIFICATION_TYPES.find((option) => option === value) ?? null });
            }}
            className="w-[190px]"
          >
            <option value="">Todos</option>
            {TENDER_NOTIFICATION_TYPES.map((option) => (
              <option key={option} value={option}>
                {NOTIFICATION_TYPE_LABELS[option]}
              </option>
            ))}
          </Select>
        </label>
        <ToggleGroup
          value={unreadOnly ? 'nao-lidas' : 'todas'}
          onChange={(value) => changeFilters({ unreadOnly: value === 'nao-lidas' })}
          options={READ_FILTER_OPTIONS}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={() => markAll.mutate()}
          disabled={unreadCount === 0 || markAll.isPending}
          icon={<CheckCheck size={15} aria-hidden="true" />}
        >
          Marcar todas como lidas
        </Button>
      </div>
      {markAll.error && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {markAll.error.message}
        </p>
      )}
      {content}
    </section>
  );
}
