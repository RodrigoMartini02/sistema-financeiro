import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

function profileWhere(profileId: number | null, paramIndex: number): { clause: string; params: unknown[] } {
  if (!profileId) return { clause: '', params: [] };
  return {
    clause: ` AND (perfil_id = $${paramIndex} OR (perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $${paramIndex} AND p.tipo = 'pessoal' AND p.usuario_id = usuario_id)))`,
    params: [profileId],
  };
}

// GET /api/months
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { perfil_id } = req.query as Record<string, string | undefined>;
    const profileId = perfil_id ? parseInt(perfil_id) : null;
    const { clause, params: extra } = profileWhere(profileId, 2);

    const result = await pool.query(
      `SELECT ano, mes, fechado, saldo_final, data_fechamento
       FROM meses
       WHERE usuario_id = $1${clause}
       ORDER BY ano DESC, mes DESC`,
      [req.user!.id, ...extra],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List months error:', error);
    res.status(500).json({ success: false, message: 'Failed to list months' });
  }
});

// GET /api/months/:year/:month
router.get('/:year/:month', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['year']!);
    const month = parseInt(req.params['month']!);
    const { perfil_id } = req.query as Record<string, string | undefined>;
    const profileId = perfil_id ? parseInt(perfil_id) : null;
    const { clause, params: extra } = profileWhere(profileId, 4);

    const result = await pool.query(
      `SELECT * FROM meses WHERE usuario_id = $1 AND ano = $2 AND mes = $3${clause} ORDER BY perfil_id NULLS LAST LIMIT 1`,
      [req.user!.id, year, month, ...extra],
    );

    if (result.rows.length === 0) {
      res.json({ success: true, data: { fechado: false, saldo_anterior: 0, saldo_final: 0 } });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get month error:', error);
    res.status(500).json({ success: false, message: 'Failed to get month data' });
  }
});

// POST /api/months/:year/:month/close
router.post('/:year/:month/close', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['year']!);
    const month = parseInt(req.params['month']!);
    const { saldo_final, perfil_id } = req.body as Record<string, unknown>;
    const profileId = perfil_id ? parseInt(String(perfil_id)) : null;
    const finalBalance = parseFloat(String(saldo_final));

    const result = await pool.query(
      `INSERT INTO meses (usuario_id, ano, mes, fechado, saldo_final, saldo_anterior, perfil_id)
       VALUES ($1, $2, $3, true, $4, 0, $5)
       ON CONFLICT (usuario_id, ano, mes, COALESCE(perfil_id, 0))
       DO UPDATE SET fechado = true, saldo_final = EXCLUDED.saldo_final, data_fechamento = NOW()
       RETURNING *`,
      [req.user!.id, year, month, finalBalance, profileId],
    );

    res.json({ success: true, message: 'Month closed', data: result.rows[0] });
  } catch (error) {
    console.error('Close month error:', error);
    res.status(500).json({ success: false, message: 'Failed to close month' });
  }
});

// POST /api/months/:year/:month/reopen
router.post('/:year/:month/reopen', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['year']!);
    const month = parseInt(req.params['month']!);
    const { perfil_id } = req.body as Record<string, unknown>;
    const profileId = perfil_id ? parseInt(String(perfil_id)) : null;
    const { clause, params: extra } = profileWhere(profileId, 4);

    const result = await pool.query(
      `UPDATE meses SET fechado = false, data_fechamento = NULL WHERE usuario_id = $1 AND ano = $2 AND mes = $3${clause} RETURNING *`,
      [req.user!.id, year, month, ...extra],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Month not found' });
      return;
    }

    res.json({ success: true, message: 'Month reopened', data: result.rows[0] });
  } catch (error) {
    console.error('Reopen month error:', error);
    res.status(500).json({ success: false, message: 'Failed to reopen month' });
  }
});

// GET /api/months/:year/:month/balance
router.get('/:year/:month/balance', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['year']!);
    const month = parseInt(req.params['month']!);
    const { perfil_id } = req.query as Record<string, string | undefined>;
    const profileId = perfil_id ? parseInt(perfil_id) : null;

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;

    const { clause, params: extra } = profileWhere(profileId, 4);

    const [incomes, expenses_, prevBalance] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(valor), 0) AS total FROM receitas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
        [req.user!.id, year, month, ...extra],
      ),
      pool.query(
        `SELECT COALESCE(SUM(CASE WHEN parcelado = true AND COALESCE(numero_parcelas, 0) > 0 AND parcela_atual = 1 THEN COALESCE(valor_final, valor_original, valor) / numero_parcelas ELSE COALESCE(valor_final, valor_original, valor) END), 0) AS total FROM despesas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
        [req.user!.id, year, month, ...extra],
      ),
      pool.query(
        `SELECT COALESCE(saldo_final, 0) AS balance FROM meses WHERE usuario_id = $1 AND ano = $2 AND mes = $3${clause} ORDER BY perfil_id NULLS LAST LIMIT 1`,
        [req.user!.id, prevYear, prevMonth, ...extra],
      ),
    ]);

    const totalIncomes = parseFloat((incomes.rows[0] as { total: string }).total);
    const totalExpenses = parseFloat((expenses_.rows[0] as { total: string }).total);
    const previousBalance = parseFloat((prevBalance.rows[0] as { balance: string } | undefined)?.balance ?? '0');
    const finalBalance = previousBalance + totalIncomes - totalExpenses;

    res.json({
      success: true,
      data: { previous_balance: previousBalance, incomes: totalIncomes, expenses: totalExpenses, final_balance: finalBalance },
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate balance' });
  }
});

// PT aliases for legacy app.html frontend
router.get('/:ano/:mes/saldo', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['ano']!);
    const month = parseInt(req.params['mes']!);
    const { perfil_id } = req.query as Record<string, string | undefined>;
    const profileId = perfil_id ? parseInt(perfil_id) : null;

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const { clause, params: extra } = profileWhere(profileId, 4);

    const [incomes, expenses_, prevBalance] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(valor), 0) AS total FROM receitas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
        [req.user!.id, year, month, ...extra],
      ),
      pool.query(
        `SELECT COALESCE(SUM(CASE WHEN parcelado = true AND COALESCE(numero_parcelas, 0) > 0 AND parcela_atual = 1 THEN COALESCE(valor_final, valor_original, valor) / numero_parcelas ELSE COALESCE(valor_final, valor_original, valor) END), 0) AS total FROM despesas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
        [req.user!.id, year, month, ...extra],
      ),
      pool.query(
        `SELECT COALESCE(saldo_final, 0) AS balance FROM meses WHERE usuario_id = $1 AND ano = $2 AND mes = $3${clause} ORDER BY perfil_id NULLS LAST LIMIT 1`,
        [req.user!.id, prevYear, prevMonth, ...extra],
      ),
    ]);

    const totalIncomes = parseFloat((incomes.rows[0] as { total: string }).total);
    const totalExpenses = parseFloat((expenses_.rows[0] as { total: string }).total);
    const previousBalance = parseFloat((prevBalance.rows[0] as { balance: string } | undefined)?.balance ?? '0');
    const finalBalance = previousBalance + totalIncomes - totalExpenses;

    res.json({
      success: true,
      data: { saldo_anterior: previousBalance, receitas: totalIncomes, despesas: totalExpenses, saldo_final: finalBalance },
    });
  } catch (error) {
    console.error('Get saldo error:', error);
    res.status(500).json({ success: false, message: 'Erro ao calcular saldo' });
  }
});

router.post('/:ano/:mes/fechar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['ano']!);
    const month = parseInt(req.params['mes']!);
    const { saldo_final, perfil_id } = req.body as Record<string, unknown>;
    const profileId = perfil_id ? parseInt(String(perfil_id)) : null;
    const finalBalance = parseFloat(String(saldo_final));

    const result = await pool.query(
      `INSERT INTO meses (usuario_id, ano, mes, fechado, saldo_final, saldo_anterior, perfil_id)
       VALUES ($1, $2, $3, true, $4, 0, $5)
       ON CONFLICT (usuario_id, ano, mes, COALESCE(perfil_id, 0))
       DO UPDATE SET fechado = true, saldo_final = EXCLUDED.saldo_final, data_fechamento = NOW()
       RETURNING *`,
      [req.user!.id, year, month, finalBalance, profileId],
    );

    res.json({ success: true, message: 'Mês fechado', data: result.rows[0] });
  } catch (error) {
    console.error('Fechar mês error:', error);
    res.status(500).json({ success: false, message: 'Erro ao fechar mês' });
  }
});

router.post('/:ano/:mes/reabrir', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['ano']!);
    const month = parseInt(req.params['mes']!);
    const { perfil_id } = req.body as Record<string, unknown>;
    const profileId = perfil_id ? parseInt(String(perfil_id)) : null;
    const { clause, params: extra } = profileWhere(profileId, 4);

    const result = await pool.query(
      `UPDATE meses SET fechado = false, data_fechamento = NULL WHERE usuario_id = $1 AND ano = $2 AND mes = $3${clause} RETURNING *`,
      [req.user!.id, year, month, ...extra],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Mês não encontrado' });
      return;
    }

    res.json({ success: true, message: 'Mês reaberto', data: result.rows[0] });
  } catch (error) {
    console.error('Reabrir mês error:', error);
    res.status(500).json({ success: false, message: 'Erro ao reabrir mês' });
  }
});

export default router;
