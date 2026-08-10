import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

function profileWhere(profileId: number | null, paramIndex: number): { clause: string; params: unknown[] } {
  if (!profileId) return { clause: '', params: [] };
  return {
    clause: ` AND (perfil_id = $${paramIndex} OR (perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $${paramIndex} AND p.tipo = 'pessoal' AND p.usuario_id = compromissos.usuario_id)))`,
    params: [profileId],
  };
}

// GET /api/appointments?mes=X&ano=Y&perfil_id=Z
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, perfil_id } = req.query as Record<string, string | undefined>;

    let where = 'WHERE usuario_id = $1';
    const params: unknown[] = [req.user!.id];
    let p = 1;

    if (mes !== undefined && ano !== undefined) {
      where += ` AND EXTRACT(MONTH FROM data) = $${++p} AND EXTRACT(YEAR FROM data) = $${++p}`;
      params.push(parseInt(mes) + 1, parseInt(ano));
    }

    const profileId = perfil_id ? parseInt(perfil_id) : null;
    const { clause: profileClause, params: profileParams } = profileWhere(profileId, p + 1);
    where += profileClause;
    params.push(...profileParams);

    const result = await pool.query(
      `SELECT * FROM compromissos ${where} ORDER BY data ASC, hora ASC NULLS LAST`,
      params,
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List appointments error:', error);
    res.status(500).json({ success: false, message: 'Failed to list appointments' });
  }
});

// POST /api/appointments
router.post(
  '/',
  authenticate,
  [
    body('titulo').notEmpty().withMessage('Title is required'),
    body('data').isISO8601().withMessage('Invalid date'),
    body('hora').optional({ values: 'falsy' }).matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('Invalid time'),
    body('duracao_minutos').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Duration must be a positive integer'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { titulo, descricao, data, hora, duracao_minutos, local, perfil_id } = req.body as Record<string, unknown>;

      const result = await pool.query(
        `INSERT INTO compromissos (usuario_id, perfil_id, titulo, descricao, data, hora, duracao_minutos, local)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          req.user!.id,
          perfil_id ? parseInt(String(perfil_id)) : null,
          titulo,
          descricao ?? null,
          data,
          hora ?? null,
          duracao_minutos ? parseInt(String(duracao_minutos)) : null,
          local ?? null,
        ],
      );

      res.status(201).json({ success: true, message: 'Appointment created', data: result.rows[0] });
    } catch (error) {
      console.error('Create appointment error:', error);
      res.status(500).json({ success: false, message: 'Failed to create appointment' });
    }
  },
);

// PUT /api/appointments/:id
router.put(
  '/:id',
  authenticate,
  [
    body('titulo').notEmpty().withMessage('Title is required'),
    body('data').isISO8601().withMessage('Invalid date'),
    body('hora').optional({ values: 'falsy' }).matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('Invalid time'),
    body('duracao_minutos').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Duration must be a positive integer'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const appointmentId = parseInt(req.params['id']!);
      const { titulo, descricao, data, hora, duracao_minutos, local } = req.body as Record<string, unknown>;

      const result = await pool.query(
        `UPDATE compromissos
         SET titulo = $1, descricao = $2, data = $3, hora = $4, duracao_minutos = $5, local = $6
         WHERE id = $7 AND usuario_id = $8
         RETURNING *`,
        [
          titulo,
          descricao ?? null,
          data,
          hora ?? null,
          duracao_minutos ? parseInt(String(duracao_minutos)) : null,
          local ?? null,
          appointmentId,
          req.user!.id,
        ],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Appointment not found' });
        return;
      }

      res.json({ success: true, message: 'Appointment updated', data: result.rows[0] });
    } catch (error) {
      console.error('Update appointment error:', error);
      res.status(500).json({ success: false, message: 'Failed to update appointment' });
    }
  },
);

// DELETE /api/appointments/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const appointmentId = parseInt(req.params['id']!);

    const result = await pool.query(
      'DELETE FROM compromissos WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [appointmentId, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Appointment not found' });
      return;
    }

    res.json({ success: true, message: 'Appointment deleted' });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete appointment' });
  }
});

export default router;
