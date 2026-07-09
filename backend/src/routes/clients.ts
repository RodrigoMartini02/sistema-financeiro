import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/clientes
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT c.*,
         COUNT(ct.id) AS total_contratos,
         COUNT(ct.id) FILTER (WHERE ct.status = 'ativo') AS contratos_ativos
       FROM clientes c
       LEFT JOIN contratos ct ON ct.cliente_id = c.id AND ct.usuario_id = c.usuario_id
       WHERE c.usuario_id = $1
       GROUP BY c.id
       ORDER BY c.nome ASC`,
      [req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List clients error:', error);
    res.status(500).json({ success: false, message: 'Failed to list clients' });
  }
});

// GET /api/clientes/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT * FROM clientes WHERE id = $1 AND usuario_id = $2',
      [req.params['id'], req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Client not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ success: false, message: 'Failed to get client' });
  }
});

// POST /api/clientes
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, codigo, tipo_empresa, cnpj } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      return;
    }

    // Gera código sequencial automaticamente
    const nextCodeResult = await pool.query(
      `SELECT COALESCE(MAX(codigo::int), 0) + 1 AS proximo
       FROM clientes WHERE usuario_id = $1 AND codigo ~ '^[0-9]+$'`,
      [req.user!.id],
    );
    const codigoGerado = String((nextCodeResult.rows[0] as { proximo: number }).proximo);

    const result = await pool.query(
      `INSERT INTO clientes (usuario_id, nome, codigo, tipo_empresa, cnpj)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user!.id, String(nome).trim(), codigoGerado, tipo_empresa ?? null, cnpj ?? null],
    );
    res.status(201).json({ success: true, message: 'Client created', data: result.rows[0] });
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ success: false, message: 'Failed to create client' });
  }
});

// PUT /api/clientes/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, codigo, tipo_empresa, cnpj } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      return;
    }

    const result = await pool.query(
      `UPDATE clientes SET nome = $1, codigo = $2, tipo_empresa = $3, cnpj = $4
       WHERE id = $5 AND usuario_id = $6 RETURNING *`,
      [String(nome).trim(), codigo ?? null, tipo_empresa ?? null, cnpj ?? null, req.params['id'], req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Client not found' });
      return;
    }
    res.json({ success: true, message: 'Client updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ success: false, message: 'Failed to update client' });
  }
});

// DELETE /api/clientes/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'DELETE FROM clientes WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params['id'], req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Client not found' });
      return;
    }
    res.json({ success: true, message: 'Client deleted' });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete client' });
  }
});

export default router;
