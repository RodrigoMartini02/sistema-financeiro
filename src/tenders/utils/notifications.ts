import type { TenderNotification } from '../types';
import { contractPath, isContractKey } from './contractKey';
import { TENDERS_APP_BASE } from './modulePaths';

// Notificações (escopo, seção 9.4): o clique marca como lida e abre o edital
// ou o contrato pelo link gravado, que é relativo ao início do app
// (/editais/123 ou /contratos/<chave codificada>).

/** Query de `GET /api/tenders/notifications` do painel do sino: as 10 mais recentes. */
export const NOTIFICATION_PANEL_QUERY = 'perPage=10';

const APP_PATH = /^\/(?!\/)\S*$/;

/**
 * Destino do clique, relativo à base do app: o link gravado quando é um
 * caminho do app (com a base, ela sai); sem link válido, o edital ou o
 * contrato; sem nenhum, null (a notificação só é marcada como lida).
 */
export function notificationTarget(
  notification: Pick<TenderNotification, 'link' | 'noticeId'> & Partial<Pick<TenderNotification, 'contractKey'>>,
): string | null {
  const link = notification.link.trim();
  const withoutBase = link === TENDERS_APP_BASE ? '/' : link.startsWith(`${TENDERS_APP_BASE}/`) ? link.slice(TENDERS_APP_BASE.length) : link;
  if (APP_PATH.test(withoutBase)) return withoutBase;
  if (notification.noticeId) return `/editais/${notification.noticeId}`;
  return isContractKey(notification.contractKey) ? contractPath(notification.contractKey) : null;
}
