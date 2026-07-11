import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/modulos-contrato?contrato_id=X
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { contrato_id } = req.query as Record<string, string | undefined>;

    if (!contrato_id) {
      res.status(400).json({ success: false, message: 'contrato_id é obrigatório' });
      return;
    }

    const result = await pool.query(
      `SELECT m.* FROM modulos_contrato m
       JOIN contratos ct ON ct.id = m.contrato_id
       WHERE m.contrato_id = $1 AND m.usuario_id = $2 AND ct.usuario_id = $2
       ORDER BY m.id ASC`,
      [parseInt(contrato_id), req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List modules error:', error);
    res.status(500).json({ success: false, message: 'Failed to list modules' });
  }
});

// POST /api/modulos-contrato
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { contrato_id, nome, valor_mensal, implantado, faturando, data_inicio_faturamento } =
      req.body as Record<string, unknown>;

    if (!contrato_id || !nome) {
      res.status(400).json({ success: false, message: 'contrato_id e nome são obrigatórios' });
      return;
    }

    // Verifica que o contrato pertence ao usuário
    const contratoCheck = await pool.query(
      'SELECT id FROM contratos WHERE id = $1 AND usuario_id = $2',
      [parseInt(String(contrato_id)), req.user!.id],
    );
    if (contratoCheck.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO modulos_contrato
         (contrato_id, usuario_id, nome, valor_mensal, implantado, faturando, data_inicio_faturamento)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        parseInt(String(contrato_id)),
        req.user!.id,
        String(nome).trim(),
        valor_mensal ? parseFloat(String(valor_mensal)) : 0,
        implantado ?? false,
        faturando ?? false,
        data_inicio_faturamento ?? null,
      ],
    );
    res.status(201).json({ success: true, message: 'Module created', data: result.rows[0] });
  } catch (error) {
    console.error('Create module error:', error);
    res.status(500).json({ success: false, message: 'Failed to create module' });
  }
});

// PUT /api/modulos-contrato/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const moduleId = parseInt(req.params['id']!);
    const { nome, valor_mensal, implantado, faturando, data_inicio_faturamento } =
      req.body as Record<string, unknown>;

    const result = await pool.query(
      `UPDATE modulos_contrato
       SET nome = $1, valor_mensal = $2, implantado = $3, faturando = $4, data_inicio_faturamento = $5
       WHERE id = $6 AND usuario_id = $7 RETURNING *`,
      [
        String(nome).trim(),
        valor_mensal ? parseFloat(String(valor_mensal)) : 0,
        implantado ?? false,
        faturando ?? false,
        data_inicio_faturamento ?? null,
        moduleId,
        req.user!.id,
      ],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Module not found' });
      return;
    }

    const modulo = result.rows[0] as { contrato_id: number };

    // Reajuste automático: atualiza valor das previstas futuras do contrato
    const novoTotal = await pool.query(
      `SELECT COALESCE(SUM(valor_mensal), 0) AS total
       FROM modulos_contrato
       WHERE contrato_id = $1 AND usuario_id = $2 AND faturando = true`,
      [modulo.contrato_id, req.user!.id],
    );
    const valorAtualizado = parseFloat((novoTotal.rows[0] as { total: string }).total);

    if (valorAtualizado > 0) {
      await pool.query(
        `UPDATE receitas SET valor = $1
         WHERE contrato_id = $2 AND status = 'prevista' AND data_recebimento >= CURRENT_DATE`,
        [valorAtualizado, modulo.contrato_id],
      );
    }

    res.json({ success: true, message: 'Module updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update module error:', error);
    res.status(500).json({ success: false, message: 'Failed to update module' });
  }
});

// DELETE /api/modulos-contrato/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'DELETE FROM modulos_contrato WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params['id'], req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Module not found' });
      return;
    }
    res.json({ success: true, message: 'Module deleted' });
  } catch (error) {
    console.error('Delete module error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete module' });
  }
});

export default router;
