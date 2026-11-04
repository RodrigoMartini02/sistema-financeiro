import { useQuery } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import { tendersRequest } from '../services/tendersApi';

const POLL_INTERVAL_MS = 60 * 1000;

/** Contador do sino: a cada 60 s e quando a aba volta ao foco (escopo, seção 9.4). */
export function useUnreadNotificationsCount(enabled: boolean) {
  return useQuery({
    queryKey: tendersQueryKeys.unreadNotificationsCount,
    queryFn: () => tendersRequest<{ unread: number }>('/notifications/count'),
    select: (data) => data.unread,
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}
