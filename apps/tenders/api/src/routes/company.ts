import { Router } from 'express';
import { requireTenderTitular, tenderAccessOf } from '../middleware/tenderAccess';
import { userRateLimiter } from '../middleware/userRateLimiter';
import { readCompanyUpdateInput } from '../services/companyInput';
import { applyCompanyLookup, readCompanyProfile, updateCompanyProfile } from '../services/companyProfile';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';

// Perfil da empresa (só o titular): ver, editar e consultar o CNPJ. A empresa é sempre a conta resolvida pela trava
// do módulo, nunca um identificador vindo do cliente; a consulta usa só o CNPJ gravado nessa conta.

/** Consultas ao CNPJ por usuário: 5 a cada 10 minutos (em memória, vale por instância do servidor). */
export const COMPANY_LOOKUP_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

export function companyRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  router.use(requireTenderTitular);
  const lookupLimiter = userRateLimiter({
    ...COMPANY_LOOKUP_RATE_LIMIT,
    message: 'Muitas consultas seguidas. Espere alguns minutos e tente de novo.',
  });

  // GET /api/tenders/company
  router.get(
    '/',
    tenderRoute('Tender company read failed:', 'Não foi possível carregar o perfil da empresa agora.', async (req, res) => {
      res.json({ success: true, data: { company: await readCompanyProfile(deps.db, tenderAccessOf(req).account.id) } });
    }),
  );

  // PATCH /api/tenders/company: campo ausente mantém; vazio limpa o que pode ficar vazio.
  router.patch(
    '/',
    tenderRoute('Tender company update failed:', 'Não foi possível salvar o perfil da empresa agora.', async (req, res) => {
      const company = await updateCompanyProfile(deps.db, tenderAccessOf(req).account.id, readCompanyUpdateInput(req.body));
      res.json({ success: true, data: { company } });
    }),
  );

  // POST /api/tenders/company/lookup, sem corpo: consulta o CNPJ da conta e grava o resultado.
  router.post(
    '/lookup',
    lookupLimiter,
    tenderRoute('Tender company lookup failed:', 'Não foi possível consultar o CNPJ agora.', async (req, res) => {
      const company = await applyCompanyLookup(deps.db, tenderAccessOf(req).account.id, deps.companyLookup, deps.now());
      res.json({ success: true, data: { company } });
    }),
  );

  return router;
}
