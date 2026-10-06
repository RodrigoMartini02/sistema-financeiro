import type { NotificationFilters, TenderNotification } from '../types';
import { TENDERS_APP_BASE } from './modulePaths';

// Notificações (escopo, seção 9.4): o clique marca como lida e abre o edital
// pelo link gravado, que é relativo ao início do app (/editais/123).

/** Painel do sino: as 10 mais recentes. */
export const NOTIFICATION_PANEL_FILTERS: NotificationFilters = { unreadOnly: false, type: null, page: 1, perPage: 10 };

/** Query de `GET /api/tenders/notifications`. */
export function notificationsQuery(filters: NotificationFilters): string {
  const params = new URLSearchParams();
  if (filters.unreadOnly) params.set('unreadOnly', 'true');
  if (filters.type) params.set('type', filters.type);
  params.set('page', String(filters.page));
  params.set('perPage', String(filters.perPage));
  return params.toString();
}

const APP_PATH = /^\/(?!\/)\S*$/;

/**
 * Destino do clique, relativo à base do app: o link gravado quando é um
 * caminho do app (com a base, ela sai); sem link válido, o edital; sem os
 * dois, null (a notificação só é marcada como lida).
 */
export function notificationTarget(notification: Pick<TenderNotification, 'link' | 'noticeId'>): string | null {
  const link = notification.link.trim();
  const withoutBase = link === TENDERS_APP_BASE ? '/' : link.startsWith(`${TENDERS_APP_BASE}/`) ? link.slice(TENDERS_APP_BASE.length) : link;
  if (APP_PATH.test(withoutBase)) return withoutBase;
  return notification.noticeId ? `/editais/${notification.noticeId}` : null;
}
