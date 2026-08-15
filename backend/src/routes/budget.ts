import { Request, Response, Router } from 'express';
import { authenticate } from '../middleware/auth';
import { BudgetInputError, deleteBudgetTarget, getBudgetOverview, saveBudgetTarget } from '../services/budgetService';

const router = Router();

function parseProfileId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePeriod(value: unknown): number {
  return Number(value);
}

router.get('/resumo', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    const result = await getBudgetOverview({
      userId: req.user!.id,
      profileId: parseProfileId(query['perfil_id']),
      month: parsePeriod(query['mes']),
      year: parsePeriod(query['ano']),
    });
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof BudgetInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Budget overview failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Nao foi possivel carregar o orcamento.' });
  }
});

router.put('/metas', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    await saveBudgetTarget({
      userId: req.user!.id,
      profileId: parseProfileId(body['perfil_id']),
      categoryId: body['categoria_id'],
      mode: body['modo'],
      targetValue: body['valor_meta'],
    });
    res.json({ success: true, message: 'Meta atualizada.' });
  } catch (error) {
    if (error instanceof BudgetInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Save budget target failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Nao foi possivel salvar a meta.' });
  }
});

router.delete('/metas/:categoryId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = Number(req.params['categoryId']);
    if (!Number.isInteger(categoryId) || categoryId <= 0) throw new BudgetInputError('Categoria invalida.');
    const query = req.query as Record<string, unknown>;
    await deleteBudgetTarget({ userId: req.user!.id, profileId: parseProfileId(query['perfil_id']), categoryId });
    res.json({ success: true, message: 'Meta removida.' });
  } catch (error) {
    if (error instanceof BudgetInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Delete budget target failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Nao foi possivel remover a meta.' });
  }
});

export default router;
