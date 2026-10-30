import { Router, type Request, type Response } from 'express';
import { getTodayIsoInTimezone } from '../utils/date';
import { readQueryId, readRequiredId, sendRequestError } from '../utils/requestInput';
import { readFixedExpenseInput, readFixedExpenseUpdateInput, readFixedMonth, readFixedRenewalYear } from '../services/fixedExpenseInput';
import { createFixedExpense, deactivateFixedExpense, listFixedExpenses, listPendingFixedExpenses, renewFixedExpense, updateFixedExpense } from '../services/fixedExpenseService';

const router = Router();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = readQueryId(req.query['accountId'], 'Conta inválida');
    res.json({ success: true, data: await listFixedExpenses(req.user!.id, accountId) });
  } catch (error) {
    sendRequestError(res, error, 'List fixed expenses:', req.user?.id, 'Não foi possível buscar as despesas fixas');
  }
});

router.get('/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = readQueryId(req.query['accountId'], 'Conta inválida');
    const month = readFixedMonth(req.query['month']);
    res.json({ success: true, data: await listPendingFixedExpenses(req.user!.id, accountId, month) });
  } catch (error) {
    sendRequestError(res, error, 'List fixed occurrences:', req.user?.id, 'Não foi possível buscar as previsões');
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

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = readRequiredId(req.params['id'], 'Despesa fixa inválida');
    const source = await updateFixedExpense(req.user!.id, id, readFixedExpenseUpdateInput(req.body), getTodayIsoInTimezone());
    res.json({ success: true, data: source });
  } catch (error) {
    sendRequestError(res, error, 'Update fixed expense:', req.user?.id, 'Não foi possível atualizar a despesa fixa');
  }
});

router.post('/:id/deactivate', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = readRequiredId(req.params['id'], 'Despesa fixa inválida');
    await deactivateFixedExpense(req.user!.id, id, getTodayIsoInTimezone());
    res.json({ success: true, data: null });
  } catch (error) {
    sendRequestError(res, error, 'Deactivate fixed expense:', req.user?.id, 'Não foi possível desativar a despesa fixa');
  }
});

router.post('/:id/renew', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = readRequiredId(req.params['id'], 'Despesa fixa inválida');
    res.json({ success: true, data: await renewFixedExpense(req.user!.id, id, readFixedRenewalYear(req.body)) });
  } catch (error) {
    sendRequestError(res, error, 'Renew fixed expense:', req.user?.id, 'Não foi possível renovar a despesa fixa');
  }
});

export default router;
