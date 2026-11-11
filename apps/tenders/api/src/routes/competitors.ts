import { Router } from 'express';
import { validate } from '../middleware/validation';
import { tenderAccessOf } from '../middleware/tenderAccess';
import { userRateLimiter } from '../middleware/userRateLimiter';
import { addCompetitor, listCompetitors, readCompetitorSummaries, removeCompetitor, updateCompetitor } from '../services/competitors';
import { CNPJ_RATE_LIMIT } from './cnpj';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';
import { readCompetitorChanges, readCompetitorInput } from './requestReaders';
import { cnpjParam, competitorBodyValidators, competitorPatchValidators } from './validators';

// Concorrentes monitorados da pessoa na conta (plano .plans/licitacoes-4-concorrentes-monitorados.md): o CNPJ do
// fornecedor que ela acompanha, com apelido e o aviso de contrato novo. A lista é só do Postgres e nunca espera o
// armazém; os números de cada concorrente (`/summary`) vêm do armazém de contratos: sem cópia pronta, 503, e consulta que
// passou do limite de tempo, 504 (tenderRoute). Conta e pessoa vêm sempre da sessão.

export function competitorRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  // O resumo consulta o armazém: o mesmo limite por pessoa da página do CNPJ.
  const summaryLimiter = userRateLimiter({ ...CNPJ_RATE_LIMIT, message: 'Muitas consultas seguidas. Espere um instante e tente de novo.' });
  const requesterOf = (req: Parameters<typeof tenderAccessOf>[0]) => {
    const access = tenderAccessOf(req);
    return { accountId: access.account.id, userId: access.userId };
  };

  // GET /api/tenders/competitors → { items: [{ cnpj, nickname, notify, createdAt }], limit }
  router.get(
    '/',
    tenderRoute('Tender competitors list failed:', 'Não foi possível carregar os concorrentes agora.', async (req, res) => {
      res.json({ success: true, data: await listCompetitors(deps.db, requesterOf(req)) });
    }),
  );

  // GET /api/tenders/competitors/summary → { items: [{ cnpj, name, total, active, last30Days, lastPublishedAt }] }
  router.get(
    '/summary',
    summaryLimiter,
    tenderRoute('Tender competitors summary failed:', 'Não foi possível carregar os números dos concorrentes agora.', async (req, res) => {
      res.json({ success: true, data: await readCompetitorSummaries(deps, requesterOf(req)) });
    }),
  );

  // POST /api/tenders/competitors { cnpj, nickname? } → 201 (criado) ou 200 (já acompanhava, nada muda)
  router.post(
    '/',
    [...competitorBodyValidators, validate],
    tenderRoute('Tender competitor create failed:', 'Não foi possível salvar o concorrente agora.', async (req, res) => {
      const { competitor, created } = await addCompetitor(deps.db, requesterOf(req), readCompetitorInput(req.body));
      res.status(created ? 201 : 200).json({ success: true, data: competitor });
    }),
  );

  // PATCH /api/tenders/competitors/:cnpj { nickname? } e/ou { notify? }
  router.patch(
    '/:cnpj',
    [cnpjParam(), ...competitorPatchValidators, validate],
    tenderRoute('Tender competitor patch failed:', 'Não foi possível alterar o concorrente agora.', async (req, res) => {
      const competitor = await updateCompetitor(deps.db, requesterOf(req), String(req.params['cnpj']), readCompetitorChanges(req.body));
      res.json({ success: true, data: competitor });
    }),
  );

  // DELETE /api/tenders/competitors/:cnpj: idempotente
  router.delete(
    '/:cnpj',
    [cnpjParam(), validate],
    tenderRoute('Tender competitor delete failed:', 'Não foi possível remover o concorrente agora.', async (req, res) => {
      await removeCompetitor(deps.db, requesterOf(req), String(req.params['cnpj']));
      res.json({ success: true, data: { cnpj: String(req.params['cnpj']) } });
    }),
  );

  return router;
}
