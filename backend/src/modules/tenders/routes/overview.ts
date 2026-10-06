import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../../middleware/validation';
import { requireTenderTitular, requireTenderTitularOrAdmin, tenderAccessOf } from '../middleware/tenderAccess';
import { listCollectionRuns, readCollectionOverview } from '../services/collectionOverview';
import { readDashboard } from '../services/dashboard';
import { createDomainListsReader } from '../services/domainLists';
import { listTeam, setTeamMemberAccess } from '../services/team';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { readPagination } from './requestReaders';
import { idParam, paginationQuery } from './validators';

// Painel, listas de apoio, coleta, acesso e equipe (escopo, seção 8.4).

export function overviewRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  const readDomainLists = createDomainListsReader(deps.db);

  router.get(
    '/dashboard',
    tenderRoute('Tender dashboard failed:', 'Não foi possível carregar o painel agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      res.json({ success: true, data: await readDashboard(deps.db, { accountId: access.account.id, userId: access.userId }) });
    }),
  );

  router.get(
    '/domains',
    tenderRoute('Tender domains failed:', 'Não foi possível carregar as listas agora.', async (_req, res) => {
      res.json({ success: true, data: await readDomainLists() });
    }),
  );

  router.get(
    '/collection/status',
    tenderRoute('Tender collection status failed:', 'Não foi possível carregar o status da coleta agora.', async (_req, res) => {
      res.json({ success: true, data: await readCollectionOverview(deps.db, deps.now()) });
    }),
  );

  router.get(
    '/collection/runs',
    requireTenderTitularOrAdmin,
    [...paginationQuery(), validate],
    tenderRoute('Tender collection runs failed:', 'Não foi possível carregar o histórico da coleta agora.', async (req, res) => {
      const { page, perPage } = readPagination(req.query as Record<string, unknown>);
      res.json({ success: true, data: await listCollectionRuns(deps.db, page, perPage) });
    }),
  );

  // GET /api/tenders/access: o que a pessoa pode fazer no módulo (o app monta o menu com isso).
  router.get(
    '/access',
    tenderRoute('Tender access read failed:', 'Não foi possível carregar o acesso agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      res.json({
        success: true,
        data: {
          account: access.account,
          role: access.role,
          isPlatformAdmin: access.isPlatformAdmin,
          permissions: {
            manageTeam: access.role === 'TITULAR',
            viewCollectionRuns: access.role === 'TITULAR' || access.isPlatformAdmin,
            // Tela "Contas habilitadas": só o admin da plataforma (as rotas de admin conferem de novo).
            manageEnabledAccounts: access.isPlatformAdmin,
          },
          accounts: access.availableAccounts,
        },
      });
    }),
  );

  router.get(
    '/team',
    requireTenderTitular,
    tenderRoute('Tender team list failed:', 'Não foi possível carregar a equipe agora.', async (req, res) => {
      res.json({ success: true, data: await listTeam(deps.db, tenderAccessOf(req).account.id) });
    }),
  );

  // PUT /api/tenders/team/:userId { hasAccess }
  router.put(
    '/team/:userId',
    requireTenderTitular,
    [idParam('userId'), body('hasAccess').isBoolean({ strict: true }).withMessage('Use true ou false'), validate],
    tenderRoute('Tender team access failed:', 'Não foi possível alterar o acesso agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      const member = await setTeamMemberAccess(
        deps.db,
        access.account.id,
        access.userId,
        Number(req.params['userId']),
        req.body.hasAccess === true,
      );
      res.json({ success: true, data: member });
    }),
  );

  return router;
}
