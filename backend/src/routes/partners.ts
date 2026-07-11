import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/partners
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { perfil_id } = req.query as Record<string, string | undefined>;

    const result = await pool.query(
      `SELECT * FROM socios
       WHERE usuario_id = $1 AND ativo = true
         AND ($2::int IS NULL OR perfil_id = $2)
       ORDER BY nome ASC`,
      [req.user!.id, perfil_id ? parseInt(perfil_id) : null],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List partners error:', error);
    res.status(500).json({ success: false, message: 'Failed to list partners' });
  }
});

// POST /api/partners
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, percentual, perfil_id } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const pct = parseFloat(String(percentual));
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      res.status(400).json({ success: false, message: 'Percentage must be between 0.01 and 100' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO socios (usuario_id, perfil_id, nome, percentual)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user!.id, perfil_id ? parseInt(String(perfil_id)) : null, String(nome).trim(), pct],
    );

    res.status(201).json({ success: true, message: 'Partner created', data: result.rows[0] });
  } catch (error) {
    console.error('Create partner error:', error);
    res.status(500).json({ success: false, message: 'Failed to create partner' });
  }
});

// PUT /api/partners/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nome, percentual } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const pct = parseFloat(String(percentual));
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      res.status(400).json({ success: false, message: 'Invalid percentage' });
      return;
    }

    const result = await pool.query(
      `UPDATE socios SET nome = $1, percentual = $2
       WHERE id = $3 AND usuario_id = $4 RETURNING *`,
      [String(nome).trim(), pct, id, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Partner not found' });
      return;
    }

    res.json({ success: true, message: 'Partner updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update partner error:', error);
    res.status(500).json({ success: false, message: 'Failed to update partner' });
  }
});

// DELETE /api/partners/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE socios SET ativo = false WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [id, req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Partner not found' });
      return;
    }
    res.json({ success: true, message: 'Partner removed' });
  } catch (error) {
    console.error('Remove partner error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove partner' });
  }
});

export default router;
