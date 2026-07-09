import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/servicos
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { ativo } = req.query as Record<string, string | undefined>;

    let where = 'WHERE usuario_id = $1';
    const params: unknown[] = [req.user!.id];

    if (ativo === 'true') {
      where += ' AND ativo = true';
    }

    const result = await pool.query(
      `SELECT * FROM servicos ${where} ORDER BY nome ASC`,
      params,
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List services error:', error);
    res.status(500).json({ success: false, message: 'Failed to list services' });
  }
});

// POST /api/servicos
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, valor_mensal_padrao } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO servicos (usuario_id, nome, valor_mensal_padrao)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user!.id, String(nome).trim(), valor_mensal_padrao ? parseFloat(String(valor_mensal_padrao)) : 0],
    );
    res.status(201).json({ success: true, message: 'Service created', data: result.rows[0] });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ success: false, message: 'Failed to create service' });
  }
});

// PUT /api/servicos/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, valor_mensal_padrao } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      return;
    }

    const result = await pool.query(
      `UPDATE servicos SET nome = $1, valor_mensal_padrao = $2
       WHERE id = $3 AND usuario_id = $4 RETURNING *`,
      [String(nome).trim(), valor_mensal_padrao ? parseFloat(String(valor_mensal_padrao)) : 0, req.params['id'], req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Service not found' });
      return;
    }
    res.json({ success: true, message: 'Service updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ success: false, message: 'Failed to update service' });
  }
});

// DELETE /api/servicos/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar se tem vínculos ativos antes de deletar
    const vinculos = await pool.query(
      'SELECT id FROM contratos_servicos WHERE servico_id = $1 LIMIT 1',
      [req.params['id']],
    );

    if (vinculos.rows.length > 0) {
      // Desativar em vez de deletar quando há vínculos
      const result = await pool.query(
        'UPDATE servicos SET ativo = false WHERE id = $1 AND usuario_id = $2 RETURNING *',
        [req.params['id'], req.user!.id],
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Service not found' });
        return;
      }
      res.json({ success: true, message: 'Service deactivated (has active links)', data: result.rows[0] });
      return;
    }

    const result = await pool.query(
      'DELETE FROM servicos WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params['id'], req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Service not found' });
      return;
    }
    res.json({ success: true, message: 'Service deleted' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete service' });
  }
});

export default router;
