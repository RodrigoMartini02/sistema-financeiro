import { Router } from 'express';
import { query } from 'express-validator';
import { validate } from '../../../middleware/validation';
import { TENDER_NOTIFICATION_TYPES } from '../domains';
import { tenderAccessOf } from '../middleware/tenderAccess';
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationInbox';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { readNotificationFilters } from './requestReaders';
import { idParam, paginationQuery } from './validators';

// Notificações da pessoa logada, na conta da requisição (escopo, seção 8.3).

export function notificationRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  const requesterOf = (req: Parameters<typeof tenderAccessOf>[0]) => {
    const access = tenderAccessOf(req);
    return { accountId: access.account.id, userId: access.userId };
  };

  // GET /api/tenders/notifications?unreadOnly=&type=&page=&perPage=
  router.get(
    '/',
    [
      query('unreadOnly').optional().isIn(['true', 'false', '1', '0']).withMessage('Use true ou false'),
      query('type').optional().isIn([...TENDER_NOTIFICATION_TYPES]).withMessage('Tipo de notificação inválido'),
      ...paginationQuery(),
      validate,
    ],
    tenderRoute('Tender notification list failed:', 'Não foi possível carregar as notificações agora.', async (req, res) => {
      const filters = readNotificationFilters(req.query as Record<string, unknown>);
      res.json({ success: true, data: await listNotifications(deps.db, requesterOf(req), filters) });
    }),
  );

  // GET /api/tenders/notifications/count → { unread }, consultado pelo sino a cada 60 s
  router.get(
    '/count',
    tenderRoute('Tender notification count failed:', 'Não foi possível contar as notificações agora.', async (req, res) => {
      res.json({ success: true, data: { unread: await countUnreadNotifications(deps.db, requesterOf(req)) } });
    }),
  );

  router.patch(
    '/:id/read',
    [idParam(), validate],
    tenderRoute('Tender notification read failed:', 'Não foi possível marcar a notificação agora.', async (req, res) => {
      await markNotificationRead(deps.db, requesterOf(req), Number(req.params['id']));
      res.json({ success: true, data: { id: Number(req.params['id']) } });
    }),
  );

  router.post(
    '/mark-all-read',
    tenderRoute('Tender notification mark-all failed:', 'Não foi possível marcar as notificações agora.', async (req, res) => {
      res.json({ success: true, data: { updated: await markAllNotificationsRead(deps.db, requesterOf(req)) } });
    }),
  );

  return router;
}
