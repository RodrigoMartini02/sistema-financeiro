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

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Aceita ou mes/ano (mês único, usado pela tela de cadastro de metas) ou
// de_mes/de_ano/ate_mes/ate_ano (intervalo, usado pelo painel financeiro) —
// mesmo padrão de parâmetros opcionais de /financial/panorama.
router.get('/resumo', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    const hasSingleMonth = query['mes'] !== undefined && query['ano'] !== undefined;
    const period = hasSingleMonth
      ? { month: parsePeriod(query['mes']), year: parsePeriod(query['ano']) }
      : {
          deMes: parseOptionalInt(query['de_mes']),
          deAno: parseOptionalInt(query['de_ano']),
          ateMes: parseOptionalInt(query['ate_mes']),
          ateAno: parseOptionalInt(query['ate_ano']),
        };
    const result = await getBudgetOverview({
      userId: req.user!.id,
      profileId: parseProfileId(query['perfil_id']),
      ...period,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof BudgetInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Budget overview failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível carregar o orçamento.' });
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
    res.status(500).json({ success: false, message: 'Não foi possível salvar a meta.' });
  }
});

router.delete('/metas/:categoryId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = Number(req.params['categoryId']);
    if (!Number.isInteger(categoryId) || categoryId <= 0) throw new BudgetInputError('Categoria inválida.');
    const query = req.query as Record<string, unknown>;
    await deleteBudgetTarget({ userId: req.user!.id, profileId: parseProfileId(query['perfil_id']), categoryId });
    res.json({ success: true, message: 'Meta removida.' });
  } catch (error) {
    if (error instanceof BudgetInputError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error('Delete budget target failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Não foi possível remover a meta.' });
  }
});

export default router;
