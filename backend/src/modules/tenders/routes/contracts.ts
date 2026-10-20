import { Router } from 'express';
import { validate } from '../../../middleware/validation';
import { RequestInputError } from '../../../utils/requestInput';
import { tenderAccessOf } from '../middleware/tenderAccess';
import { addContractFavorite, getContractDetail, parseContractKey, removeContractFavorite } from '../services/contractDetail';
import { contractSavedSearchCriteria, findOwnContractSavedSearch } from '../services/contractSavedSearches';
import { searchContracts } from '../services/contractSearch';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { readContractSearchRequest } from './requestReaders';
import { contractSearchValidators } from './validators';

// Contratos a vencer (planos .plans/licitacoes-contratos-a-vencer.md, Parte B,
// e .plans/licitacoes-contratos-no-r2.md, Parte R2): busca, detalhe e favoritos
// de cada pessoa. O contrato é identificado pelo número de controle do PNCP
// ("chave"), com a barra codificada na URL (%2F); fora do formato, 404. Os
// contratos vêm do armazém do R2; sem cópia pronta, 503 (tenderRoute).

export function contractRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  const requesterOf = (req: Parameters<typeof tenderAccessOf>[0]) => {
    const access = tenderAccessOf(req);
    return { accountId: access.account.id, userId: access.userId };
  };

  // GET /api/tenders/contracts?q=&termsMode=&state=&municipalityCode=&agencyCnpj=&category=&supplierCnpj=&minValue=
  //   &maxValue=&includeWithoutValue=&publishedFrom=&publishedTo=&expiryFrom=&expiryTo=&favoritesOnly=&number=
  //   &contractYear=&contractType=&includeClosed=&savedSearchId=&sort=&page=&perPage=
  // Sem `sort`: o vencimento mais próximo; com `includeClosed`, a publicação mais recente.
  router.get(
    '/',
    [...contractSearchValidators, validate],
    tenderRoute('Tender contract search failed:', 'Não foi possível buscar os contratos agora.', async (req, res) => {
      const requester = requesterOf(req);
      const { filters, savedSearchId } = readContractSearchRequest(req.query as Record<string, unknown>);
      const criteria =
        savedSearchId === null
          ? filters.criteria
          : contractSavedSearchCriteria(await findOwnContractSavedSearch(deps.db, requester, savedSearchId));
      if (filters.sort === 'relevance' && criteria.terms.length === 0) {
        throw new RequestInputError('Ordenar por relevância exige termos de busca.');
      }
      const result = await searchContracts(deps, requester, { ...filters, criteria });
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
    '/:chave',
    tenderRoute('Tender contract detail failed:', 'Não foi possível abrir o contrato agora.', async (req, res) => {
      res.json({ success: true, data: await getContractDetail(deps, requesterOf(req), parseContractKey(req.params['chave'])) });
    }),
  );

  // PUT /api/tenders/contracts/:chave/favorite: favorito de quem pede (cada pessoa tem os seus).
  router.put(
    '/:chave/favorite',
    tenderRoute('Tender contract favorite save failed:', 'Não foi possível favoritar o contrato agora.', async (req, res) => {
      res.json({ success: true, data: await addContractFavorite(deps, requesterOf(req), parseContractKey(req.params['chave'])) });
    }),
  );

  router.delete(
    '/:chave/favorite',
    tenderRoute('Tender contract favorite removal failed:', 'Não foi possível tirar o contrato dos favoritos agora.', async (req, res) => {
      res.json({ success: true, data: await removeContractFavorite(deps.db, requesterOf(req), parseContractKey(req.params['chave'])) });
    }),
  );

  return router;
}
