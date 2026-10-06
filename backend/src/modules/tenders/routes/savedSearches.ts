import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../../middleware/validation';
import { tenderAccessOf } from '../middleware/tenderAccess';
import { userRateLimiter } from '../middleware/userRateLimiter';
import {
  createSavedSearch,
  deleteSavedSearch,
  duplicateSavedSearch,
  listSavedSearches,
  patchSavedSearch,
  previewSavedSearch,
  updateSavedSearch,
} from '../services/savedSearches';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { readSavedSearchCriteria, readSavedSearchInput } from './requestReaders';
import { idParam, savedSearchBodyValidators, savedSearchCriteriaValidators } from './validators';

// Buscas salvas do usuário na conta (escopo, seção 8.2).

/** Prévia do formulário (debounce de 500 ms na tela): até 60 por minuto por usuário. */
export const PREVIEW_RATE_LIMIT = { max: 60, windowMs: 60 * 1000 };

export function savedSearchRoutes(deps: TendersApiDeps): Router {
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
    tenderRoute('Tender saved search list failed:', 'Não foi possível carregar as buscas salvas agora.', async (req, res) => {
      res.json({ success: true, data: await listSavedSearches(deps.db, requesterOf(req)) });
    }),
  );

  // POST /api/tenders/saved-searches/preview { critérios } → { count, items }
  router.post(
    '/preview',
    previewLimiter,
    [...savedSearchCriteriaValidators, validate],
    tenderRoute('Tender saved search preview failed:', 'Não foi possível calcular a prévia agora.', async (req, res) => {
      const preview = await previewSavedSearch(deps.db, requesterOf(req).accountId, readSavedSearchCriteria(req.body));
      res.json({ success: true, data: preview });
    }),
  );

  router.post(
    '/',
    [...savedSearchBodyValidators, validate],
    tenderRoute('Tender saved search create failed:', 'Não foi possível salvar a busca agora.', async (req, res) => {
      const saved = await createSavedSearch(deps.db, requesterOf(req), readSavedSearchInput(req.body));
      res.status(201).json({ success: true, data: saved });
    }),
  );

  router.put(
    '/:id',
    [idParam(), ...savedSearchBodyValidators, validate],
    tenderRoute('Tender saved search update failed:', 'Não foi possível alterar a busca agora.', async (req, res) => {
      const saved = await updateSavedSearch(deps.db, requesterOf(req), Number(req.params['id']), readSavedSearchInput(req.body));
      res.json({ success: true, data: saved });
    }),
  );

  // PATCH /api/tenders/saved-searches/:id { active } e/ou { notify }
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
    tenderRoute('Tender saved search patch failed:', 'Não foi possível alterar a busca agora.', async (req, res) => {
      const saved = await patchSavedSearch(deps.db, requesterOf(req), Number(req.params['id']), {
        ...(typeof req.body.active === 'boolean' ? { active: req.body.active } : {}),
        ...(typeof req.body.notify === 'boolean' ? { notify: req.body.notify } : {}),
      });
      res.json({ success: true, data: saved });
    }),
  );

  router.delete(
    '/:id',
    [idParam(), validate],
    tenderRoute('Tender saved search delete failed:', 'Não foi possível excluir a busca agora.', async (req, res) => {
      await deleteSavedSearch(deps.db, requesterOf(req), Number(req.params['id']));
      res.json({ success: true, data: { id: Number(req.params['id']) } });
    }),
  );

  router.post(
    '/:id/duplicate',
    [idParam(), validate],
    tenderRoute('Tender saved search duplicate failed:', 'Não foi possível duplicar a busca agora.', async (req, res) => {
      const copy = await duplicateSavedSearch(deps.db, requesterOf(req), Number(req.params['id']));
      res.status(201).json({ success: true, data: copy });
    }),
  );

  return router;
}
