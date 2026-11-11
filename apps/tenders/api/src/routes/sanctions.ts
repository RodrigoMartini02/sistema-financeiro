import { Router, type Request } from 'express';
import { tenderAccessOf } from '../middleware/tenderAccess';
import { userRateLimiter } from '../middleware/userRateLimiter';
import { readSanctionCheckInput } from '../services/sanctionInput';
import { checkSanctions, readSanctions, type SanctionActor, type SanctionsDeps } from '../services/sanctions';
import type { TendersApiDeps } from './deps';
import { tenderRoute } from './handler';

// Sanções (plano .plans/licitacoes-6-sancoes.md): a consulta de CEIS, CNEP e CEPIM da empresa e das pessoas do cofre. A conta e o
// papel vêm sempre da trava do módulo, nunca do pedido. A empresa é de todos com acesso ao módulo; as pessoas são dado pessoal
// de terceiros e só o titular as vê e consulta (o colaborador não as recebe na lista e leva 403 ao pedir uma). O documento nunca
// vem do pedido. Sem a chave do portal, a leitura diz `available: false` e a consulta responde 503.

/** Consultas por usuário: 30 a cada 10 minutos (em memória, vale por instância do servidor). */
export const SANCTION_CHECK_RATE_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 };

export function sanctionRoutes(deps: TendersApiDeps): Router {
  const router = Router();
  const checkLimiter = userRateLimiter({
    ...SANCTION_CHECK_RATE_LIMIT,
    message: 'Muitas consultas seguidas. Espere alguns minutos e tente de novo.',
  });
  const sanctionDeps = (): SanctionsDeps => ({ db: deps.db, source: deps.sanctions, now: deps.now });
  const actorOf = (req: Request): SanctionActor => {
    const access = tenderAccessOf(req);
    return { accountId: access.account.id, userId: access.userId, role: access.role };
  };

  // GET /api/tenders/sanctions → { available, referenceDate, reuseMinutes, staleDays, company, people }; people só vem para o
  // titular. Nada aqui chama o portal: lê o que já foi consultado.
  router.get(
    '/',
    tenderRoute('Tender sanctions read failed:', 'Não foi possível carregar as consultas de sanções agora.', async (req, res) => {
      res.json({ success: true, data: await readSanctions(sanctionDeps(), actorOf(req)) });
    }),
  );

  // POST /api/tenders/sanctions/check { personId? } → { company, person, failed }: sem personId, a empresa; com ele, a pessoa
  // (só o titular). Reaproveita a consulta de menos de 15 minutos; as bases que falharem voltam em `failed`.
  router.post(
    '/check',
    checkLimiter,
    tenderRoute('Tender sanctions check failed:', 'Não foi possível consultar as sanções agora.', async (req, res) => {
      const input = readSanctionCheckInput(req.body);
      res.json({ success: true, data: await checkSanctions(sanctionDeps(), actorOf(req), input) });
    }),
  );

  return router;
}
