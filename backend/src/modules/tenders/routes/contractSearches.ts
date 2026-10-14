import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../../middleware/validation';
import { tenderAccessOf } from '../middleware/tenderAccess';
import { userRateLimiter } from '../middleware/userRateLimiter';
import {
  createContractSavedSearch,
  deleteContractSavedSearch,
  duplicateContractSavedSearch,
  listContractSavedSearches,
  patchContractSavedSearch,
  previewContractSavedSearch,
  updateContractSavedSearch,
} from '../services/contractSavedSearches';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { readContractSavedSearchCriteria, readContractSavedSearchInput } from './requestReaders';
import { PREVIEW_RATE_LIMIT } from './savedSearches';
import { contractSavedSearchBodyValidators, contractSavedSearchCriteriaValidators, idParam } from './validators';

// Buscas salvas de contratos da pessoa na conta (plano
// .plans/licitacoes-contratos-a-vencer.md, Parte B), com as mesmas rotas das de editais.

export function contractSearchRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  const previewLimiter = userRateLimiter({
    ...PREVIEW_RATE_LIMIT,
    message: 'Muitas prévias seguidas. Espere um instante e tente de novo.',
  });
  const requesterOf = (req: Parameters<typeof tenderAccessOf>[0]) => {
    const access = tenderAccessOf(req);
    return { accountId: access.account.id, userId: access.userId };
  };

  router.get(
    '/',
    tenderRoute('Tender contract search list failed:', 'Não foi possível carregar as buscas salvas agora.', async (req, res) => {
      res.json({ success: true, data: await listContractSavedSearches(deps.db, requesterOf(req)) });
    }),
  );

  // POST /api/tenders/contract-searches/preview { critérios } → { count, items }
  router.post(
    '/preview',
    previewLimiter,
    [...contractSavedSearchCriteriaValidators, validate],
    tenderRoute('Tender contract search preview failed:', 'Não foi possível calcular a prévia agora.', async (req, res) => {
      const preview = await previewContractSavedSearch(deps.db, requesterOf(req), readContractSavedSearchCriteria(req.body));
      res.json({ success: true, data: preview });
    }),
  );

  router.post(
    '/',
    [...contractSavedSearchBodyValidators, validate],
    tenderRoute('Tender contract search create failed:', 'Não foi possível salvar a busca agora.', async (req, res) => {
      const saved = await createContractSavedSearch(deps.db, requesterOf(req), readContractSavedSearchInput(req.body));
      res.status(201).json({ success: true, data: saved });
    }),
  );

  router.put(
    '/:id',
    [idParam(), ...contractSavedSearchBodyValidators, validate],
    tenderRoute('Tender contract search update failed:', 'Não foi possível alterar a busca agora.', async (req, res) => {
      const saved = await updateContractSavedSearch(deps.db, requesterOf(req), Number(req.params['id']), readContractSavedSearchInput(req.body));
      res.json({ success: true, data: saved });
    }),
  );

  // PATCH /api/tenders/contract-searches/:id { active } e/ou { notify }
  router.patch(
    '/:id',
    [
      idParam(),
      body('active').optional().isBoolean({ strict: true }).withMessage('Use true ou false'),
      body('notify').optional().isBoolean({ strict: true }).withMessage('Use true ou false'),
      body().custom((value: Record<string, unknown>) => typeof value?.['active'] === 'boolean' || typeof value?.['notify'] === 'boolean')
        .withMessage('Informe active ou notify'),
      validate,
    ],
    tenderRoute('Tender contract search patch failed:', 'Não foi possível alterar a busca agora.', async (req, res) => {
      const saved = await patchContractSavedSearch(deps.db, requesterOf(req), Number(req.params['id']), {
        ...(typeof req.body.active === 'boolean' ? { active: req.body.active } : {}),
        ...(typeof req.body.notify === 'boolean' ? { notify: req.body.notify } : {}),
      });
      res.json({ success: true, data: saved });
    }),
  );

  router.delete(
    '/:id',
    [idParam(), validate],
    tenderRoute('Tender contract search delete failed:', 'Não foi possível excluir a busca agora.', async (req, res) => {
      await deleteContractSavedSearch(deps.db, requesterOf(req), Number(req.params['id']));
      res.json({ success: true, data: { id: Number(req.params['id']) } });
    }),
  );

  router.post(
    '/:id/duplicate',
    [idParam(), validate],
    tenderRoute('Tender contract search duplicate failed:', 'Não foi possível duplicar a busca agora.', async (req, res) => {
      const copy = await duplicateContractSavedSearch(deps.db, requesterOf(req), Number(req.params['id']));
      res.status(201).json({ success: true, data: copy });
    }),
  );

  return router;
}
