import { apiRequest, getActiveAccountId } from './apiClient';

export interface NotificationItem {
  id: number;
  alertType: 'vencendo_hoje' | 'vencida';
  status: 'pending' | 'sent';
  dueDate: string;
  readAt: string | null;
  createdAt: string;
  description: string;
  amount: string | null;
}

export async function fetchNotifications(accountId?: number | null): Promise<NotificationItem[]> {
  const id = accountId ?? getActiveAccountId();
  const q = id ? `?conta_id=${id}` : '';
  return apiRequest<NotificationItem[]>(`/notificacoes${q}`);
}

export async function markNotificationAsRead(id: number): Promise<void> {
  await apiRequest(`/notificacoes/${id}/ler`, { method: 'PUT' });
}
