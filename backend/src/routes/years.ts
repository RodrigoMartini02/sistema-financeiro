import { Router, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { expenses, incomes, years } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { returnStockOfYear } from '../services/incomeService';

const router = Router();

// GET /api/years
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT ano FROM anos WHERE usuario_id = $1 ORDER BY ano DESC',
      [req.user!.id],
    );
    res.json({ success: true, data: result.rows.map((r: { ano: string }) => parseInt(r.ano)) });
  } catch (error) {
    console.error('List years error:', error);
    res.status(500).json({ success: false, message: 'Failed to list years' });
  }
});

// POST /api/years
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { ano } = req.body as { ano: unknown };
    const year = parseInt(String(ano));

    if (!year || year < 2000 || year > 2100) {
      res.status(400).json({ success: false, message: 'Invalid year' });
      return;
    }

    const existing = await pool.query(
      'SELECT id FROM anos WHERE usuario_id = $1 AND ano = $2',
      [req.user!.id, year],
    );
    if (existing.rows.length > 0) {
      res.status(400).json({ success: false, message: 'Year already exists' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO anos (usuario_id, ano) VALUES ($1, $2) RETURNING *',
      [req.user!.id, year],
    );

    res.status(201).json({ success: true, message: 'Year created', data: result.rows[0] });
  } catch (error) {
    console.error('Create year error:', error);
    res.status(500).json({ success: false, message: 'Failed to create year' });
  }
});

// DELETE /api/years/:year
router.delete('/:year', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['year']!);

    if (!year || year < 2000 || year > 2100) {
      res.status(400).json({ success: false, message: 'Invalid year' });
      return;
    }

    // Tudo numa transação: as vendas do ano voltam ao estoque antes de as
    // receitas sumirem, e nada fica pela metade se uma etapa falhar.
    const userId = req.user!.id;
    await db.transaction(async (transaction) => {
      await returnStockOfYear(transaction, userId, year);
      await transaction.delete(incomes).where(and(eq(incomes.userId, userId), eq(incomes.year, year)));
      await transaction.delete(expenses).where(and(eq(expenses.userId, userId), eq(expenses.year, year)));
      await transaction.delete(years).where(and(eq(years.userId, userId), eq(years.year, year)));
    });

    res.json({ success: true, message: 'Year deleted' });
  } catch (error) {
    console.error('Delete year error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete year' });
  }
});

export default router;
