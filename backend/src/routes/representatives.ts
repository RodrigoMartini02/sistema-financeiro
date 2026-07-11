import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/representatives
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { perfil_id } = req.query as Record<string, string | undefined>;

    const result = await pool.query(
      `SELECT r.*,
         COALESCE(json_agg(c ORDER BY c.tipo_receita) FILTER (WHERE c.id IS NOT NULL), '[]') AS comissoes
       FROM representantes r
       LEFT JOIN comissoes c ON c.representante_id = r.id AND c.ativo = true
       WHERE r.usuario_id = $1 AND r.ativo = true
         AND ($2::int IS NULL OR r.perfil_id = $2)
       GROUP BY r.id
       ORDER BY r.nome ASC`,
      [req.user!.id, perfil_id ? parseInt(perfil_id) : null],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List representatives error:', error);
    res.status(500).json({ success: false, message: 'Failed to list representatives' });
  }
});

// POST /api/representatives
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, email, telefone, perfil_id, comissoes: commissionsInput } =
      req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO representantes (usuario_id, perfil_id, nome, email, telefone)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user!.id, perfil_id ? parseInt(String(perfil_id)) : null, String(nome).trim(), email ?? null, telefone ?? null],
    );

    const rep = result.rows[0] as Record<string, unknown>;

    if (Array.isArray(commissionsInput)) {
      for (const c of commissionsInput as Array<Record<string, unknown>>) {
        if (c['tipo_receita'] && c['percentual'] != null) {
          const tipo = c['tipo'] === 'unica' ? 'unica' : 'mensal';
          await pool.query(
            `INSERT INTO comissoes (representante_id, tipo_receita, percentual, tipo) VALUES ($1, $2, $3, $4)`,
            [rep['id'], c['tipo_receita'], parseFloat(String(c['percentual'])), tipo],
          );
        }
      }
    }

    // Auto-criar categoria "Comissão" para o usuário (idempotente)
    await pool.query(
      `INSERT INTO categorias (usuario_id, nome, cor, icone)
       SELECT $1, 'Comissão', '#f59e0b', 'handshake'
       WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = 'comissão')`,
      [req.user!.id],
    );

    res.status(201).json({ success: true, message: 'Representative created', data: rep });
  } catch (error) {
    console.error('Create representative error:', error);
    res.status(500).json({ success: false, message: 'Failed to create representative' });
  }
});

// PUT /api/representatives/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nome, email, telefone, comissoes: commissionsInput } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const result = await pool.query(
      `UPDATE representantes SET nome = $1, email = $2, telefone = $3
       WHERE id = $4 AND usuario_id = $5 RETURNING *`,
      [String(nome).trim(), email ?? null, telefone ?? null, id, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Representative not found' });
      return;
    }

    await pool.query(`UPDATE comissoes SET ativo = false WHERE representante_id = $1`, [id]);

    if (Array.isArray(commissionsInput)) {
      for (const c of commissionsInput as Array<Record<string, unknown>>) {
        if (c['tipo_receita'] && c['percentual'] != null) {
          const tipo = c['tipo'] === 'unica' ? 'unica' : 'mensal';
          await pool.query(
            `INSERT INTO comissoes (representante_id, tipo_receita, percentual, tipo) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [id, c['tipo_receita'], parseFloat(String(c['percentual'])), tipo],
          );
        }
      }
    }

    res.json({ success: true, message: 'Representative updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update representative error:', error);
    res.status(500).json({ success: false, message: 'Failed to update representative' });
  }
});

// DELETE /api/representatives/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE representantes SET ativo = false WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [id, req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Representative not found' });
      return;
    }
    res.json({ success: true, message: 'Representative archived' });
  } catch (error) {
    console.error('Archive representative error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive representative' });
  }
});

export default router;
