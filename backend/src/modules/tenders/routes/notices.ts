import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../../middleware/validation';
import { RequestInputError } from '../../../utils/requestInput';
import { TRACKING_STATUSES } from '../domains';
import { tenderAccessOf } from '../middleware/tenderAccess';
import {
  addFavorite,
  getNoticeDetail,
  listTrackingHistory,
  MAX_TRACKING_NOTE_LENGTH,
  removeFavorite,
  removeTracking,
  saveTracking,
} from '../services/noticeDetail';
import { searchNotices } from '../services/noticeSearch';
import { getNoticeFiles, getNoticeItems } from '../services/pncpDetails';
import { findOwnSavedSearch, savedSearchCriteria } from '../services/savedSearches';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { readNoticeSearchRequest } from './requestReaders';
import { idParam, noticeSearchValidators } from './validators';

// Editais (escopo, seção 8.1): busca, detalhe, itens e arquivos do PNCP,
// acompanhamento da conta e histórico. A exportação saiu do módulo (plano da Fase 2).

export function noticeRoutes(deps: TendersApiDeps): Router {
  const router = Router();

  // GET /api/tenders/notices?q=&termsMode=&state=&municipalityCode=&agencyCnpj=&modality=&minValue=&maxValue=
  //   &includeWithoutValue=&publishedFrom=&publishedTo=&closingFrom=&closingTo=&openOnly=&trackingStatus=
  //   &hideDiscarded=&favoritesOnly=&savedSearchId=&sort=&page=&perPage=
  router.get(
    '/',
    [...noticeSearchValidators, validate],
    tenderRoute('Tender notice search failed:', 'Não foi possível buscar os editais agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      const { filters, savedSearchId } = readNoticeSearchRequest(req.query as Record<string, unknown>);
      const criteria =
        savedSearchId === null
          ? filters.criteria
          : savedSearchCriteria(
              await findOwnSavedSearch(deps.db, { accountId: access.account.id, userId: access.userId }, savedSearchId),
            );
      if (filters.sort === 'relevance' && criteria.terms.length === 0) {
        throw new RequestInputError('Ordenar por relevância exige termos de busca.');
      }
      const result = await searchNotices(deps.db, { accountId: access.account.id, userId: access.userId }, { ...filters, criteria });
      res.json({
        success: true,
        data: {
          ...result,
          parsedQuery: { terms: criteria.terms, excludedTerms: criteria.excludedTerms, termsMode: criteria.termsMode },
        },
      });
    }),
  );

  router.get(
    '/:id',
    [idParam(), validate],
    tenderRoute('Tender notice detail failed:', 'Não foi possível abrir o edital agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      const detail = await getNoticeDetail(deps.db, { accountId: access.account.id, userId: access.userId }, Number(req.params['id']));
      res.json({ success: true, data: detail });
    }),
  );

  router.get(
    '/:id/items',
    [idParam(), validate],
    tenderRoute('Tender notice items failed:', 'Não foi possível carregar os itens agora.', async (req, res) => {
      res.json({ success: true, data: await getNoticeItems(deps.db, deps.pncpDetails, Number(req.params['id'])) });
    }),
  );

  router.get(
    '/:id/files',
    [idParam(), validate],
    tenderRoute('Tender notice files failed:', 'Não foi possível carregar os arquivos agora.', async (req, res) => {
      res.json({ success: true, data: await getNoticeFiles(deps.db, deps.pncpDetails, Number(req.params['id'])) });
    }),
  );

  // PUT /api/tenders/notices/:id/tracking { status, note }
  router.put(
    '/:id/tracking',
    [
      idParam(),
      body('status').isIn([...TRACKING_STATUSES]).withMessage('Status: ANALISAR, PARTICIPAR ou DESCARTADO'),
      body('note')
        .optional({ values: 'null' })
        .isString()
        .isLength({ max: MAX_TRACKING_NOTE_LENGTH })
        .withMessage(`Observação com até ${MAX_TRACKING_NOTE_LENGTH} caracteres`),
      validate,
    ],
    tenderRoute('Tender tracking save failed:', 'Não foi possível salvar o acompanhamento agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      const tracking = await saveTracking(
        deps.db,
        { accountId: access.account.id, userId: access.userId },
        Number(req.params['id']),
        { status: req.body.status, note: typeof req.body.note === 'string' ? req.body.note : null },
      );
      res.json({ success: true, data: tracking });
    }),
  );

  router.delete(
    '/:id/tracking',
    [idParam(), validate],
    tenderRoute('Tender tracking removal failed:', 'Não foi possível remover o acompanhamento agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      await removeTracking(deps.db, { accountId: access.account.id, userId: access.userId }, Number(req.params['id']));
      res.json({ success: true, data: { noticeId: Number(req.params['id']) } });
    }),
  );

  // PUT /api/tenders/notices/:id/favorite: favorito de quem pede (cada pessoa tem os seus).
  router.put(
    '/:id/favorite',
    [idParam(), validate],
    tenderRoute('Tender favorite save failed:', 'Não foi possível favoritar o edital agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      const favorite = await addFavorite(deps.db, { accountId: access.account.id, userId: access.userId }, Number(req.params['id']));
      res.json({ success: true, data: favorite });
    }),
  );

  router.delete(
    '/:id/favorite',
    [idParam(), validate],
    tenderRoute('Tender favorite removal failed:', 'Não foi possível tirar o edital dos favoritos agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      const favorite = await removeFavorite(deps.db, { accountId: access.account.id, userId: access.userId }, Number(req.params['id']));
      res.json({ success: true, data: favorite });
    }),
  );

  router.get(
    '/:id/history',
    [idParam(), validate],
    tenderRoute('Tender tracking history failed:', 'Não foi possível carregar o histórico agora.', async (req, res) => {
      const access = tenderAccessOf(req);
      res.json({ success: true, data: await listTrackingHistory(deps.db, access.account.id, Number(req.params['id'])) });
    }),
  );

  return router;
}
