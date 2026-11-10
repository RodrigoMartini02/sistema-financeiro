import { Router } from 'express';
import { validate } from '../middleware/validation';
import { requireTenderTitularOrAdmin, tenderAccessOf } from '../middleware/tenderAccess';
import { listCollectionRuns, readCollectionOverview } from '../services/collectionOverview';
import { readDashboard } from '../services/dashboard';
import { readExpiringContracts } from '../services/dashboardContracts';
import { createDomainListsReader } from '../services/domainLists';
import { readSubscription } from '../services/subscription';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { readPagination } from './requestReaders';
import { paginationQuery } from './validators';

// Painel, listas de apoio, coleta e acesso (escopo, seção 8.4). A equipe e o perfil do titular ficam em team.ts e profile.ts.

export function overviewRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  const readDomainLists = createDomainListsReader(deps.db);

  router.get(
    '/dashboard',
    tenderRoute('Tender dashboard failed:', 'Não foi possível carregar o painel agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      res.json({ success: true, data: await readDashboard(deps.db, { accountId: access.account.id, userId: access.userId }, deps.now()) });
    }),
  );

  // GET /api/tenders/dashboard/contracts: contratos que vencem em 30, 60 e 90 dias (lê o armazém do R2; sem cópia pronta, 503).
  router.get(
    '/dashboard/contracts',
    tenderRoute('Tender dashboard contracts failed:', 'Não foi possível carregar os contratos a vencer agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      res.json({ success: true, data: await readExpiringContracts(deps, { accountId: access.account.id, userId: access.userId }) });
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
      res.json({ success: true, data: await readCollectionOverview(deps.db, deps.contractStore, deps.now()) });
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
            // Assinatura (pagar e cancelar): só o titular (as rotas de cobrança conferem de novo).
            manageBilling: access.role === 'TITULAR',
            viewCollectionRuns: access.role === 'TITULAR' || access.isPlatformAdmin,
            // Tela "Contas habilitadas": só o admin da plataforma (as rotas de admin conferem de novo).
            manageEnabledAccounts: access.isPlatformAdmin,
          },
          accounts: access.availableAccounts,
          subscription: await readSubscription(deps.db, access.account.id, deps.now()),
        },
      });
    }),
  );

  return router;
}
