import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { markAllNotificationsRead, markNotificationRead } from '../services/notificationsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { TenderNotification } from '../types';
import { notificationTarget } from '../utils/notifications';

// Marcar como lida (uma ou todas). Depois de marcar: listas e contador do sino.

function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tendersQueryKeys.notifications });
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation<{ id: number }, TendersApiError, number>({
    mutationFn: markNotificationRead,
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation<{ updated: number }, TendersApiError, void>({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  });
}

/** Clique na notificação: marca como lida (se ainda não lida) e abre o destino do link. */
export function useOpenNotification(onOpen?: () => void) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  return (notification: TenderNotification) => {
    if (!notification.readAt) {
      markRead.mutate(notification.id);
    }
    onOpen?.();
    const target = notificationTarget(notification);
    if (target) {
      navigate(target);
    }
  };
}
