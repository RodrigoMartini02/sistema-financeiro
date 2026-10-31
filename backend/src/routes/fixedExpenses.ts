import { Router, type Request, type Response } from 'express';
import { readQueryId, sendRequestError } from '../utils/requestInput';
import { readFixedDeferral, readFixedExpenseInput, readFixedMonth } from '../services/fixedExpenseInput';
import { createFixedExpense, deferFixedExpenses, listPendingFixedExpenses } from '../services/fixedExpenseService';

const router = Router();

router.get('/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = readQueryId(req.query['accountId'], 'Conta inválida');
    const month = readFixedMonth(req.query['month']);
    res.json({ success: true, data: await listPendingFixedExpenses(req.user!.id, accountId, month) });
  } catch (error) {
    sendRequestError(res, error, 'List fixed occurrences:', req.user?.id, 'Não foi possível buscar as previsões');
  }
});

router.patch('/defer', async (req: Request, res: Response): Promise<void> => {
  try {
    const input = readFixedDeferral(req.body);
    res.json({ success: true, data: await deferFixedExpenses(req.user!.id, input.accountId, input.ids, input.deferred) });
  } catch (error) {
    sendRequestError(res, error, 'Defer fixed occurrences:', req.user?.id, 'Não foi possível alterar o adiamento');
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const source = await createFixedExpense(req.user!.id, readFixedExpenseInput(req.body));
    res.status(201).json({ success: true, data: source });
  } catch (error) {
    sendRequestError(res, error, 'Create fixed expense:', req.user?.id, 'Não foi possível salvar a despesa fixa');
  }
});

export default router;
