import type { Paginated, TenderNotification } from '../types';
import { tendersRequest } from './tendersApi';

// Notificações da pessoa logada, na conta (o contador do sino fica em useUnreadNotificationsCount).

/** `apiQuery`: parâmetros já montados (utils/notifications → `notificationsQuery`). */
export function fetchNotifications(apiQuery: string): Promise<Paginated<TenderNotification>> {
  return tendersRequest<Paginated<TenderNotification>>(`/notifications?${apiQuery}`);
}

export function markNotificationRead(id: number): Promise<{ id: number }> {
  return tendersRequest<{ id: number }>(`/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return tendersRequest<{ updated: number }>('/notifications/mark-all-read', { method: 'POST' });
}
