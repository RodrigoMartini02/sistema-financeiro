import { Router, type RequestHandler } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';
import { createRequireTenderAccess } from '../middleware/tenderAccess';
import { listAccountsForTenders, setAccountCourtesy } from '../services/team';
import { billingRoutes, createBillingWebhook } from './billing';
import { cnpjRoutes } from './cnpj';
import { companyRoutes } from './company';
import { contractRoutes } from './contracts';
import { contractSearchRoutes } from './contractSearches';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { noticeRoutes } from './notices';
import { notificationRoutes } from './notifications';
import { overviewRoutes } from './overview';
import { profileRoutes } from './profile';
import { savedSearchRoutes } from './savedSearches';
import { teamRoutes } from './team';
import { idParam } from './validators';

export { createTendersAuth } from './auth';
export { tendersApiDepsFromPool, tendersAuthDepsFromEnv, type TendersApiDeps, type TendersAuthDeps } from './deps';

/**
 * Rotas do módulo de Licitações. O server.ts monta:
 * - `billingWebhook` em POST /api/tenders/billing/webhook, público e antes dos
 *   demais (aviso do Mercado Pago);
 * - `adminRoutes` em /api/tenders/admin, com authenticate + requireAdmin;
 * - `routes` em /api/tenders, com authenticate. A cobrança vem antes da trava do
 *   módulo (a conta pode estar vencida); o resto passa pela trava (acesso
 *   valendo + acesso por pessoa).
 * O login, o cadastro e a recuperação de senha são do `createTendersAuth`
 * (./auth.ts), montado em /api/tenders/auth antes de tudo isso.
 * Nenhuma usa requireActivePlan: o módulo tem assinatura própria.
 */
export function createTendersRoutes(deps: TendersApiDeps): {
  routes: Router;
  adminRoutes: Router;
  billingWebhook: RequestHandler;
} {
  const routes = Router();
  routes.use('/billing', billingRoutes(deps));
  routes.use(createRequireTenderAccess(deps.db));
  routes.use('/notices', noticeRoutes(deps));
  routes.use('/saved-searches', savedSearchRoutes(deps));
  routes.use('/contracts', contractRoutes(deps));
  routes.use('/contract-searches', contractSearchRoutes(deps));
  routes.use('/cnpj', cnpjRoutes(deps));
  routes.use('/notifications', notificationRoutes(deps));
  routes.use('/team', teamRoutes(deps));
  routes.use('/profile', profileRoutes(deps));
  routes.use('/company', companyRoutes(deps));
  routes.use(overviewRoutes(deps));

  const adminRoutes = Router();
  // GET /api/tenders/admin/accounts: contas ativas da plataforma e a situação de cada uma no módulo.
  adminRoutes.get(
    '/accounts',
    tenderRoute('Tender accounts list failed:', 'Não foi possível carregar as contas agora.', async (_req, res) => {
      res.json({ success: true, data: await listAccountsForTenders(deps.db, deps.now()) });
    }),
  );

  // PUT /api/tenders/admin/accounts/:accountId { courtesy }: liga ou desliga a cortesia do módulo na conta.
  adminRoutes.put(
    '/accounts/:accountId',
    [idParam('accountId'), body('courtesy').isBoolean({ strict: true }).withMessage('Use true ou false'), validate],
    tenderRoute('Tender account courtesy failed:', 'Não foi possível alterar a cortesia agora.', async (req, res) => {
      const result = await setAccountCourtesy(
        deps.db,
        req.tendersUser!.id,
        Number(req.params['accountId']),
        req.body.courtesy === true,
        deps.now(),
      );
      res.json({ success: true, data: result });
    }),
  );

  return { routes, adminRoutes, billingWebhook: createBillingWebhook(deps) };
}
