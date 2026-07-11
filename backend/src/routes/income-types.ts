import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/income-types
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, nome, ativo, criado_em, atualizado_em
       FROM tipos_receita
       WHERE usuario_id = $1
       ORDER BY nome ASC`,
      [req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List income types error:', error);
    res.status(500).json({ success: false, message: 'Failed to list income types' });
  }
});

// POST /api/income-types
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      return;
    }
    if (String(nome).trim().length > 100) {
      res.status(400).json({ success: false, message: 'Nome deve ter no máximo 100 caracteres' });
      return;
    }

    const dup = await pool.query(
      `SELECT id FROM tipos_receita WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2)`,
      [req.user!.id, String(nome).trim()],
    );
    if (dup.rows.length > 0) {
      res.status(400).json({ success: false, message: 'Já existe um tipo com este nome' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO tipos_receita (usuario_id, nome)
       VALUES ($1, $2)
       RETURNING id, nome, ativo, criado_em, atualizado_em`,
      [req.user!.id, String(nome).trim()],
    );

    res.status(201).json({ success: true, message: 'Tipo criado', data: result.rows[0] });
  } catch (error) {
    console.error('Create income type error:', error);
    res.status(500).json({ success: false, message: 'Failed to create income type' });
  }
});

// PUT /api/income-types/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const typeId = parseInt(req.params['id']!);
    const { nome } = req.body as Record<string, unknown>;

    if (isNaN(typeId)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }
    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      return;
    }
    if (String(nome).trim().length > 100) {
      res.status(400).json({ success: false, message: 'Nome deve ter no máximo 100 caracteres' });
      return;
    }

    const existing = await pool.query(
      `SELECT id FROM tipos_receita WHERE id = $1 AND usuario_id = $2`,
      [typeId, req.user!.id],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Tipo não encontrado' });
      return;
    }

    const dup = await pool.query(
      `SELECT id FROM tipos_receita WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2) AND id != $3`,
      [req.user!.id, String(nome).trim(), typeId],
    );
    if (dup.rows.length > 0) {
      res.status(400).json({ success: false, message: 'Já existe um tipo com este nome' });
      return;
    }

    const result = await pool.query(
      `UPDATE tipos_receita
       SET nome = $1, atualizado_em = NOW()
       WHERE id = $2 AND usuario_id = $3
       RETURNING id, nome, ativo, criado_em, atualizado_em`,
      [String(nome).trim(), typeId, req.user!.id],
    );

    res.json({ success: true, message: 'Tipo atualizado', data: result.rows[0] });
  } catch (error) {
    console.error('Update income type error:', error);
    res.status(500).json({ success: false, message: 'Failed to update income type' });
  }
});

// PATCH /api/income-types/:id/toggle
router.patch('/:id/toggle', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const typeId = parseInt(req.params['id']!);
    if (isNaN(typeId)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }

    const result = await pool.query(
      `UPDATE tipos_receita
       SET ativo = NOT ativo, atualizado_em = NOW()
       WHERE id = $1 AND usuario_id = $2
       RETURNING id, nome, ativo`,
      [typeId, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Tipo não encontrado' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Toggle income type error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle income type' });
  }
});

// DELETE /api/income-types/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const typeId = parseInt(req.params['id']!);
    if (isNaN(typeId)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }

    const existing = await pool.query(
      `SELECT nome FROM tipos_receita WHERE id = $1 AND usuario_id = $2`,
      [typeId, req.user!.id],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Tipo não encontrado' });
      return;
    }

    const nome = (existing.rows[0] as { nome: string }).nome;

    const inUseReceitas = await pool.query(
      `SELECT COUNT(*) AS total FROM receitas WHERE LOWER(tipo_receita) = LOWER($1) AND usuario_id = $2`,
      [nome, req.user!.id],
    );
    const inUseComissoes = await pool.query(
      `SELECT COUNT(*) AS total FROM comissoes c
       JOIN representantes r ON c.representante_id = r.id
       WHERE LOWER(c.tipo_receita) = LOWER($1) AND r.usuario_id = $2`,
      [nome, req.user!.id],
    );

    const totalUse =
      parseInt((inUseReceitas.rows[0] as { total: string }).total) +
      parseInt((inUseComissoes.rows[0] as { total: string }).total);

    if (totalUse > 0) {
      res.status(400).json({
        success: false,
        message: `Não é possível excluir: tipo está em uso em ${totalUse} registro(s). Desative-o em vez de excluir.`,
      });
      return;
    }

    await pool.query(`DELETE FROM tipos_receita WHERE id = $1 AND usuario_id = $2`, [typeId, req.user!.id]);
    res.json({ success: true, message: `Tipo "${nome}" excluído` });
  } catch (error) {
    console.error('Delete income type error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete income type' });
  }
});

export default router;
