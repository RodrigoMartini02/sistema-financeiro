import { Router } from 'express';
import { validate } from '../../../middleware/validation';
import { userRateLimiter } from '../middleware/userRateLimiter';
import { getCnpjSummary, listCnpjWinners } from '../services/cnpjPage';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { readPagination } from './requestReaders';
import { DEFAULT_CNPJ_WINNERS_PER_PAGE, MAX_CNPJ_WINNERS_PER_PAGE, cnpjParam, paginationQuery } from './validators';

// A página do CNPJ (plano .plans/licitacoes-pagina-cnpj.md): o resumo do que o CNPJ é nos dados e a lista das
// licitações que ele venceu. Dados públicos e iguais para todas as contas; a trava do módulo (acesso valendo) vem antes,
// no index. Cada visita faz várias consultas no armazém, então há um limite por pessoa. Sem cópia pronta do armazém, 503;
// consulta que passou do limite de tempo, 504 (tenderRoute).

/** Pedidos por pessoa: a página faz 2 a 3 por visita (o resumo e, ao paginar, as vitórias). */
export const CNPJ_RATE_LIMIT = { max: 60, windowMs: 60_000 } as const;

export function cnpjRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  router.use(userRateLimiter({ ...CNPJ_RATE_LIMIT, message: 'Muitas consultas seguidas. Espere um instante e tente de novo.' }));

  // GET /api/tenders/cnpj/:cnpj → { cnpj, name, supplier, agency, coverage }; o :cnpj tem 14 dígitos, sem máscara.
  router.get(
    '/:cnpj',
    [cnpjParam(), validate],
    tenderRoute('Tender CNPJ summary failed:', 'Não foi possível carregar o CNPJ agora.', async (req, res) => {
      res.json({ success: true, data: await getCnpjSummary(deps, String(req.params['cnpj'])) });
    }),
  );

  // GET /api/tenders/cnpj/:cnpj/winners?page=&perPage= → licitações vencidas (10 por página, no máximo 50).
  router.get(
    '/:cnpj/winners',
    [cnpjParam(), ...paginationQuery(MAX_CNPJ_WINNERS_PER_PAGE), validate],
    tenderRoute('Tender CNPJ winners failed:', 'Não foi possível carregar as licitações vencidas agora.', async (req, res) => {
      const { page, perPage } = readPagination(req.query as Record<string, unknown>, DEFAULT_CNPJ_WINNERS_PER_PAGE);
      res.json({ success: true, data: await listCnpjWinners(deps, String(req.params['cnpj']), page, perPage) });
    }),
  );

  return router;
}
