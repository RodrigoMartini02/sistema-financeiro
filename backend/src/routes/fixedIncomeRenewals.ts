import { Router, Request, Response } from 'express';
import { decideFixedIncomeRenewals, listPendingFixedIncomeRenewals } from '../services/fixedIncomeRenewalService';
import { readFixedIncomeRenewalDecisions } from '../services/fixedIncomeRenewalInput';
import { readQueryId, sendRequestError } from '../utils/requestInput';

// Renovação das receitas fixas (plano .plans/receita-fixa-ano-previsto.md).
// Montada em server.ts com authenticate, requireActivePlan e
// requireScreenAccess('accessIncomes'), antes de /api/incomes. O serviço mexe
// só nas fixas da própria pessoa.
const router = Router();

// GET /api/incomes/fixed-renewals?conta_id= — fixas pendentes de renovação
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = readQueryId((req.query as Record<string, unknown>)['conta_id'], 'Conta inválida');
    res.json({ success: true, data: await listPendingFixedIncomeRenewals(req.user!.id, accountId) });
  } catch (error) {
    sendRequestError(res, error, 'List fixed income renewals error:', req.user?.id, 'Não foi possível carregar as receitas fixas para renovar');
  }
});

// POST /api/incomes/fixed-renewals — grava as decisões (continuar ou não)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const decisions = readFixedIncomeRenewalDecisions(req.body);
    res.json({ success: true, data: await decideFixedIncomeRenewals(req.user!.id, decisions) });
  } catch (error) {
    sendRequestError(res, error, 'Decide fixed income renewals error:', req.user?.id, 'Não foi possível salvar a renovação. Tente novamente.');
  }
});

export default router;
