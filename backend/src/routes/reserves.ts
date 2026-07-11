import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

const AVAILABLE_BALANCE_SQL = `
  WITH uf AS (
    SELECT ano, mes, saldo_final
    FROM meses
    WHERE usuario_id = $1 AND fechado = true
      AND (ano < $2 OR (ano = $2 AND mes <= $3))
    ORDER BY ano DESC, mes DESC
    LIMIT 1
  )
  SELECT
    COALESCE((SELECT saldo_final FROM uf), 0)
    + COALESCE((
        SELECT SUM(r.valor)
        FROM receitas r
        WHERE r.usuario_id = $1
          AND r.descricao NOT ILIKE 'Saldo Anterior%'
          AND (r.ano < $2 OR (r.ano = $2 AND r.mes <= $3))
          AND NOT EXISTS (
              SELECT 1 FROM meses m
              WHERE m.usuario_id = $1 AND m.ano = r.ano AND m.mes = r.mes AND m.fechado = true
          )
          AND (
              NOT EXISTS (SELECT 1 FROM uf)
              OR r.ano > (SELECT ano FROM uf)
              OR (r.ano = (SELECT ano FROM uf) AND r.mes > (SELECT mes FROM uf))
          )
    ), 0)
    - COALESCE((
        SELECT SUM(d.valor)
        FROM despesas d
        WHERE d.usuario_id = $1
          AND (d.ano < $2 OR (d.ano = $2 AND d.mes <= $3))
          AND NOT EXISTS (
              SELECT 1 FROM meses m
              WHERE m.usuario_id = $1 AND m.ano = d.ano AND m.mes = d.mes AND m.fechado = true
          )
          AND (
              NOT EXISTS (SELECT 1 FROM uf)
              OR d.ano > (SELECT ano FROM uf)
              OR (d.ano = (SELECT ano FROM uf) AND d.mes > (SELECT mes FROM uf))
          )
    ), 0)
    - COALESCE((
        SELECT SUM(valor) FROM reservas
        WHERE usuario_id = $1 AND (ano < $2 OR (ano = $2 AND mes <= $3))
    ), 0)
    AS saldo_disponivel
`;

async function isMonthClosed(userId: number, month: number, year: number): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT fechado FROM meses WHERE usuario_id = $1 AND mes = $2 AND ano = $3',
      [userId, month, year],
    );
    return result.rows.length > 0 && (result.rows[0] as { fechado: boolean }).fechado === true;
  } catch {
    return false;
  }
}

async function checkAvailableBalance(
  userId: number,
  month: number,
  year: number,
  amount: number,
): Promise<{ ok: boolean; available: number; message?: string }> {
  try {
    const result = await pool.query(AVAILABLE_BALANCE_SQL, [userId, year, month]);
    const available = parseFloat((result.rows[0] as { saldo_disponivel: string }).saldo_disponivel) || 0;
    if (available < amount) {
      return { ok: false, available, message: `Insufficient balance. Available: R$ ${available.toFixed(2)}` };
    }
    return { ok: true, available };
  } catch {
    return { ok: false, available: 0, message: 'Failed to verify balance' };
  }
}

function profileFilter(perfilId: string | undefined, paramStart: number): { clause: string; params: unknown[] } {
  if (!perfilId) return { clause: '', params: [] };
  const p = paramStart;
  return {
    clause: ` AND (perfil_id = $${p} OR (perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis pf WHERE pf.id = $${p} AND pf.tipo = 'pessoal' AND pf.usuario_id = $1)))`,
    params: [parseInt(perfilId)],
  };
}

// GET /api/reserves/objectives — must come before /:id
router.get('/objectives', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { perfil_id } = req.query as Record<string, string | undefined>;
    const { clause, params: extra } = profileFilter(perfil_id, 2);

    const result = await pool.query(
      `SELECT *,
         CASE WHEN objetivo_valor > 0 THEN ROUND((valor / objetivo_valor * 100)::numeric, 1) ELSE 0 END AS progresso
       FROM reservas
       WHERE usuario_id = $1 AND tipo_reserva = 'objetivo'${clause}
       ORDER BY objetivo_atingido ASC, data_objetivo ASC NULLS LAST, id DESC`,
      [req.user!.id, ...extra],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List objectives error:', error);
    res.status(500).json({ success: false, message: 'Failed to list objectives' });
  }
});

// GET /api/reserves/movimentacoes/todas (PT alias) — must come before /:id
router.get('/movimentacoes/todas', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { limite, limit = limite ?? '20', offset = '0', perfil_id } = req.query as Record<string, string | undefined>;

    const baseParams: unknown[] = [req.user!.id];
    let profileClause = '';
    if (perfil_id) {
      baseParams.push(parseInt(perfil_id));
      profileClause = ` AND (r.perfil_id = $2 OR (r.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis pf WHERE pf.id = $2 AND pf.tipo = 'pessoal' AND pf.usuario_id = $1)))`;
    }
    const limitIdx = baseParams.push(parseInt(limit));
    const offsetIdx = baseParams.push(parseInt(offset));

    const result = await pool.query(
      `SELECT mr.*, r.observacoes AS reserve_name
       FROM movimentacoes_reservas mr
       INNER JOIN reservas r ON mr.reserva_id = r.id
       WHERE r.usuario_id = $1${profileClause}
       ORDER BY mr.data_hora ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      baseParams,
    );

    const countParams: unknown[] = [req.user!.id];
    if (perfil_id) countParams.push(parseInt(perfil_id));
    const total = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM movimentacoes_reservas mr
       INNER JOIN reservas r ON mr.reserva_id = r.id
       WHERE r.usuario_id = $1${profileClause}`,
      countParams,
    );

    res.json({
      success: true,
      data: result.rows,
      total: parseInt((total.rows[0] as { cnt: string }).cnt),
      offset: parseInt(offset),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('List all movements (PT) error:', error);
    res.status(500).json({ success: false, message: 'Failed to list movements' });
  }
});

// GET /api/reserves/movements/all — must come before /:id
router.get('/movements/all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = '20', offset = '0', perfil_id } = req.query as Record<string, string | undefined>;
    const { clause, params: extra } = profileFilter(perfil_id, 2);

    const baseParams: unknown[] = [req.user!.id, ...extra];
    const limitIdx = baseParams.push(parseInt(limit));
    const offsetIdx = baseParams.push(parseInt(offset));

    const result = await pool.query(
      `SELECT mr.*, r.observacoes AS reserve_name
       FROM movimentacoes_reservas mr
       INNER JOIN reservas r ON mr.reserva_id = r.id
       WHERE r.usuario_id = $1${clause}
       ORDER BY mr.data_hora ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      baseParams,
    );

    const countParams: unknown[] = [req.user!.id, ...extra];
    const total = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM movimentacoes_reservas mr
       INNER JOIN reservas r ON mr.reserva_id = r.id
       WHERE r.usuario_id = $1${clause}`,
      countParams,
    );

    res.json({
      success: true,
      data: result.rows,
      total: parseInt((total.rows[0] as { cnt: string }).cnt),
      offset: parseInt(offset),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('List all movements error:', error);
    res.status(500).json({ success: false, message: 'Failed to list movements' });
  }
});

// GET /api/reserves
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, perfil_id } = req.query as Record<string, string | undefined>;

    let where = 'WHERE usuario_id = $1';
    const params: unknown[] = [req.user!.id];
    let p = 1;

    if (mes !== undefined && ano !== undefined) {
      where += ` AND mes = $${++p} AND ano = $${++p}`;
      params.push(parseInt(mes), parseInt(ano));
    } else if (ano !== undefined) {
      where += ` AND ano = $${++p}`;
      params.push(parseInt(ano));
    }

    if (perfil_id) {
      where += ` AND (perfil_id = $${++p} OR (perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis pf WHERE pf.id = $${p} AND pf.tipo = 'pessoal' AND pf.usuario_id = $1)))`;
      params.push(parseInt(perfil_id));
    }

    const result = await pool.query(
      `SELECT * FROM reservas ${where} ORDER BY data DESC, id DESC`,
      params,
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List reserves error:', error);
    res.status(500).json({ success: false, message: 'Failed to list reserves' });
  }
});

// POST /api/reserves
router.post(
  '/',
  authenticate,
  [
    body('valor').isFloat({ min: 0 }).withMessage('Amount must be >= 0'),
    body('mes').isInt({ min: 0, max: 11 }).withMessage('Invalid month'),
    body('ano').isInt({ min: 2000 }).withMessage('Invalid year'),
    body('data').isISO8601().withMessage('Invalid date'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { valor, mes, ano, data, observacoes, tipo_reserva, objetivo_valor, objetivo_atingido, data_objetivo, perfil_id } =
        req.body as Record<string, unknown>;

      const amount = parseFloat(String(valor));
      const month = parseInt(String(mes));
      const year = parseInt(String(ano));
      const reserveType = String(tipo_reserva ?? 'normal');

      if (reserveType !== 'objetivo' && amount < 0.01) {
        res.status(400).json({ success: false, message: 'Amount must be greater than zero for normal reserves' });
        return;
      }

      if (await isMonthClosed(req.user!.id, month, year)) {
        res.status(400).json({ success: false, message: 'Cannot create reserves in a closed month' });
        return;
      }

      if (reserveType !== 'objetivo') {
        const balanceCheck = await checkAvailableBalance(req.user!.id, month, year, amount);
        if (!balanceCheck.ok) {
          res.status(400).json({ success: false, message: balanceCheck.message, saldoAtual: balanceCheck.available });
          return;
        }
      }

      const result = await pool.query(
        `INSERT INTO reservas (usuario_id, valor, mes, ano, data, observacoes, tipo_reserva, objetivo_valor, objetivo_atingido, data_objetivo, perfil_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          req.user!.id, amount, month, year, data,
          observacoes ?? null, reserveType,
          objetivo_valor ? parseFloat(String(objetivo_valor)) : null,
          objetivo_atingido ?? false,
          data_objetivo ?? null,
          perfil_id ? parseInt(String(perfil_id)) : null,
        ],
      );

      const created = result.rows[0] as Record<string, unknown>;

      if (amount > 0) {
        await pool.query(
          `INSERT INTO movimentacoes_reservas (reserva_id, tipo, valor, observacoes, data_hora)
           VALUES ($1, 'entrada', $2, 'Reserve creation', $3)`,
          [created['id'], amount, data],
        );
      }

      res.status(201).json({ success: true, message: 'Reserve created', data: created });
    } catch (error) {
      console.error('Create reserve error:', error);
      res.status(500).json({ success: false, message: 'Failed to create reserve' });
    }
  },
);

// PUT /api/reserves/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { observacoes, tipo_reserva, objetivo_valor, objetivo_atingido, data_objetivo } =
      req.body as Record<string, unknown>;

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let p = 0;

    if (observacoes !== undefined) { setClauses.push(`observacoes = $${++p}`); params.push(observacoes); }
    if (tipo_reserva !== undefined) { setClauses.push(`tipo_reserva = $${++p}`); params.push(tipo_reserva); }
    if (objetivo_valor !== undefined) { setClauses.push(`objetivo_valor = $${++p}`); params.push(objetivo_valor !== null ? parseFloat(String(objetivo_valor)) : null); }
    if (objetivo_atingido !== undefined) { setClauses.push(`objetivo_atingido = $${++p}`); params.push(!!objetivo_atingido); }
    if (data_objetivo !== undefined) { setClauses.push(`data_objetivo = $${++p}`); params.push(data_objetivo ?? null); }

    if (setClauses.length === 0) {
      res.status(400).json({ success: false, message: 'No fields to update' });
      return;
    }

    params.push(id, req.user!.id);
    const result = await pool.query(
      `UPDATE reservas SET ${setClauses.join(', ')} WHERE id = $${++p} AND usuario_id = $${++p} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Reserve not found' });
      return;
    }

    res.json({ success: true, message: 'Reserve updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update reserve error:', error);
    res.status(500).json({ success: false, message: 'Failed to update reserve' });
  }
});

// DELETE /api/reserves/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const reserveResult = await pool.query(
      'SELECT * FROM reservas WHERE id = $1 AND usuario_id = $2',
      [id, req.user!.id],
    );

    if (reserveResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Reserve not found' });
      return;
    }

    const reserve = reserveResult.rows[0] as Record<string, unknown>;

    if (await isMonthClosed(req.user!.id, Number(reserve['mes']), Number(reserve['ano']))) {
      res.status(400).json({ success: false, message: 'Cannot delete reserves from a closed month' });
      return;
    }

    await pool.query('DELETE FROM reservas WHERE id = $1 AND usuario_id = $2', [id, req.user!.id]);
    res.json({ success: true, message: 'Reserve deleted', data: reserve });
  } catch (error) {
    console.error('Delete reserve error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete reserve' });
  }
});

// POST /api/reserves/:id/move
router.post(
  '/:id/move',
  authenticate,
  [
    body('tipo').isIn(['entrada', 'saida']).withMessage('Type must be entrada or saida'),
    body('valor').isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero'),
    body('mes').optional().isInt({ min: 0, max: 11 }),
    body('ano').optional().isInt({ min: 2000 }),
    body('observacoes').optional().isString(),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { tipo, valor, observacoes } = req.body as Record<string, unknown>;
      const currentMonth = req.body.mes !== undefined ? parseInt(String(req.body.mes)) : new Date().getMonth();
      const currentYear = req.body.ano !== undefined ? parseInt(String(req.body.ano)) : new Date().getFullYear();

      if (await isMonthClosed(req.user!.id, currentMonth, currentYear)) {
        res.status(400).json({ success: false, message: 'Cannot move reserves in a closed month' });
        return;
      }

      const reserveResult = await pool.query(
        'SELECT * FROM reservas WHERE id = $1 AND usuario_id = $2',
        [id, req.user!.id],
      );

      if (reserveResult.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Reserve not found' });
        return;
      }

      const reserve = reserveResult.rows[0] as Record<string, unknown>;
      const amount = parseFloat(String(valor));

      if (tipo === 'saida') {
        const reserveBalance = parseFloat(String(reserve['valor']));
        if (reserveBalance < amount) {
          res.status(400).json({
            success: false,
            message: `Insufficient reserve balance. Available: R$ ${reserveBalance.toFixed(2)}`,
          });
          return;
        }
      }

      if (tipo === 'entrada') {
        const balanceCheck = await checkAvailableBalance(req.user!.id, currentMonth, currentYear, amount);
        if (!balanceCheck.ok) {
          res.status(400).json({ success: false, message: balanceCheck.message, saldoAtual: balanceCheck.available });
          return;
        }
      }

      const movDate = new Date(currentYear, currentMonth, 15);

      const movResult = await pool.query(
        `INSERT INTO movimentacoes_reservas (reserva_id, tipo, valor, observacoes, data_hora)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, tipo, amount, observacoes ?? null, movDate],
      );

      const newBalance =
        tipo === 'entrada'
          ? parseFloat(String(reserve['valor'])) + amount
          : parseFloat(String(reserve['valor'])) - amount;

      await pool.query('UPDATE reservas SET valor = $1 WHERE id = $2', [newBalance, id]);

      res.status(201).json({
        success: true,
        message: tipo === 'entrada' ? 'Amount added' : 'Amount withdrawn',
        data: { movement: movResult.rows[0], newBalance },
      });
    } catch (error) {
      console.error('Move reserve error:', error);
      res.status(500).json({ success: false, message: 'Failed to process movement' });
    }
  },
);

// GET /api/reserves/:id/movements
router.get('/:id/movements', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const reserveResult = await pool.query(
      'SELECT id FROM reservas WHERE id = $1 AND usuario_id = $2',
      [id, req.user!.id],
    );

    if (reserveResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Reserve not found' });
      return;
    }

    const result = await pool.query(
      'SELECT * FROM movimentacoes_reservas WHERE reserva_id = $1 ORDER BY data_hora DESC',
      [id],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get reserve movements error:', error);
    res.status(500).json({ success: false, message: 'Failed to get movements' });
  }
});

export default router;
