import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../../middleware/validation';
import { createRequireTenderAccess } from '../middleware/tenderAccess';
import { listAccountsForTenders, setAccountEnabled } from '../services/team';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { noticeRoutes } from './notices';
import { notificationRoutes } from './notifications';
import { overviewRoutes } from './overview';
import { savedSearchRoutes } from './savedSearches';
import { idParam } from './validators';

export { tendersApiDepsFromPool, type TendersApiDeps } from './deps';

/**
 * Rotas do módulo de Licitações. O server.ts monta:
 * - `adminRoutes` em /api/tenders/admin, com authenticate + requireAdmin;
 * - `routes` em /api/tenders, com authenticate; a trava do módulo
 *   (conta habilitada + acesso por pessoa) roda aqui dentro.
 * Nenhuma das duas usa requireActivePlan: o módulo tem regra de acesso própria.
 */
export function createTendersRoutes(deps: TendersApiDeps): { routes: Router; adminRoutes: Router } {
  const routes = Router();
  routes.use(createRequireTenderAccess(deps.db));
  routes.use('/notices', noticeRoutes(deps));
  routes.use('/saved-searches', savedSearchRoutes(deps));
  routes.use('/notifications', notificationRoutes(deps));
  routes.use(overviewRoutes(deps));

  const adminRoutes = Router();
  // GET /api/tenders/admin/accounts: contas ativas da plataforma e a habilitação de cada uma.
  adminRoutes.get(
    '/accounts',
    tenderRoute('Tender accounts list failed:', 'Não foi possível carregar as contas agora.', async (_req, res) => {
      res.json({ success: true, data: await listAccountsForTenders(deps.db) });
    }),
  );

  // PUT /api/tenders/admin/accounts/:accountId { active }: habilita ou desabilita o módulo numa conta.
  adminRoutes.put(
    '/accounts/:accountId',
    [idParam('accountId'), body('active').isBoolean({ strict: true }).withMessage('Use true ou false'), validate],
    tenderRoute('Tender account enable failed:', 'Não foi possível alterar a habilitação agora.', async (req, res) => {
      const result = await setAccountEnabled(deps.db, req.user!.id, Number(req.params['accountId']), req.body.active === true);
      res.json({ success: true, data: result });
    }),
  );

  return { routes, adminRoutes };
}
