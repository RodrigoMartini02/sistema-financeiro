import { Router, Request, Response } from 'express';
import { decideRenewals, listPendingRenewals } from '../services/seriesRenewalService';
import { readSeriesRenewalDecisions } from '../services/seriesRenewalInput';
import { readQueryId, sendRequestError } from '../utils/requestInput';

// Renovação das séries mensais (plano .plans/recorrente-ano-e-contagem.md).
// Montada em server.ts com authenticate, requireActivePlan e
// requireScreenAccess('accessExpenses'), antes de /api/expenses. O serviço
// mexe só nas séries do próprio usuário.
const router = Router();

// GET /api/expenses/series-renewals?conta_id= — séries pendentes de renovação
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = readQueryId((req.query as Record<string, unknown>)['conta_id'], 'Conta inválida');
    res.json({ success: true, data: await listPendingRenewals(req.user!.id, accountId) });
  } catch (error) {
    sendRequestError(res, error, 'List series renewals error:', req.user?.id, 'Não foi possível carregar as séries para renovar');
  }
});

// POST /api/expenses/series-renewals — grava as decisões (renovar ou não)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const decisions = readSeriesRenewalDecisions(req.body);
    res.json({ success: true, data: await decideRenewals(req.user!.id, decisions) });
  } catch (error) {
    sendRequestError(res, error, 'Decide series renewals error:', req.user?.id, 'Não foi possível salvar a renovação. Tente novamente.');
  }
});

export default router;
