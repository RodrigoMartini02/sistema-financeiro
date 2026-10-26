import { useState } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/EmptyState';
import { Select, ToggleGroup } from '../../ui/form';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { NotificationItem } from '../components/NotificationItem';
import { VirtualCardList } from '../components/VirtualCardList';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { useMarkAllNotificationsRead, useOpenNotification } from '../hooks/useNotificationActions';
import { useUnreadNotificationsCount } from '../hooks/useUnreadNotificationsCount';
import { fetchNotifications } from '../services/notificationsService';
import { tendersQueryKeys } from '../services/queryKeys';
import { TENDER_NOTIFICATION_TYPES, type Paginated, type TenderNotification, type TenderNotificationType } from '../types';
import { LIST_PAGE_SIZE } from '../utils/infiniteList';
import { NOTIFICATION_TYPE_LABELS } from '../utils/labels';
import { notificationsQuery } from '../utils/notifications';

// Notificações (escopo, seção 9.4): cards com rolagem infinita, com filtro por
// tipo e por não lidas. O clique marca como lida e abre o edital ou o contrato.

const READ_FILTER_OPTIONS = [
  { value: 'todas', label: 'Todas' },
  { value: 'nao-lidas', label: 'Não lidas' },
];

/** Identifica a notificação na lista. */
const notificationKey = (notification: TenderNotification) => notification.id;

export function NotificationsScreen() {
  const [type, setType] = useState<TenderNotificationType | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  // A consulta da primeira página identifica a lista; as seguintes só mudam a página.
  const listQuery = notificationsQuery({ type, unreadOnly, page: 1, perPage: LIST_PAGE_SIZE });
  const list = useInfiniteList<TenderNotification, Paginated<TenderNotification>>({
    queryKey: tendersQueryKeys.notificationInfiniteList(listQuery),
    fetchPage: (page) => fetchNotifications(notificationsQuery({ type, unreadOnly, page, perPage: LIST_PAGE_SIZE })),
    getKey: notificationKey,
  });
  const unreadCount = useUnreadNotificationsCount(true).data ?? 0;
  const markAll = useMarkAllNotificationsRead();
  const openNotification = useOpenNotification();
  const filtered = type !== null || unreadOnly;

  const changeFilters = (changes: { type?: TenderNotificationType | null; unreadOnly?: boolean }) => {
    if (changes.type !== undefined) setType(changes.type);
    if (changes.unreadOnly !== undefined) setUnreadOnly(changes.unreadOnly);
  };

  let content;
  if (list.isPending) {
    content = <LoadingBlock label="Carregando as notificações…" />;
  } else if (list.error) {
    content = <LoadError message={list.error.message} onRetry={list.reload} retrying={list.isFetching} />;
  } else if (list.total === 0) {
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
        description="Elas chegam quando um edital novo bate com uma busca salva com Notificar ligado, quando um edital acompanhado muda, quando o prazo de um edital em Vou participar se aproxima e 90 e 30 dias antes do vencimento dos contratos favoritos ou das buscas salvas de contratos."
      />
    );
  } else {
    content = (
      <div className={`transition-opacity ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
        <VirtualCardList
          items={list.items}
          getKey={notificationKey}
          renderItem={(notification) => <NotificationItem notification={notification} onOpen={openNotification} />}
          total={list.total}
          hasNextPage={list.hasNextPage}
          isFetchingNextPage={list.isFetchingNextPage}
          onLoadMore={list.loadMore}
          nextPageError={list.nextPageError}
          resetKey={listQuery}
          label="Notificações"
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
            className="w-[230px]"
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
