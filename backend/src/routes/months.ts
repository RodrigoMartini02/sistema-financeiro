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

interface BalanceBreakdown {
  previousBalance: number;
  totalIncomes: number;
  totalExpenses: number;
  finalBalance: number;
}

async function calculateBalanceBreakdown(userId: number, year: number, month: number, profileId: number | null): Promise<BalanceBreakdown> {
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const { clause, params: extra } = profileWhere(profileId, 4);

  const [incomes, expenses_, prevBalance] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM receitas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
      [userId, year, month, ...extra],
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN parcelado = true AND COALESCE(numero_parcelas, 0) > 0 AND parcela_atual = 1 THEN COALESCE(valor_final, valor_original) / numero_parcelas ELSE COALESCE(valor_final, valor_original) END), 0) AS total FROM despesas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
      [userId, year, month, ...extra],
    ),
    pool.query(
      `SELECT COALESCE(saldo_final, 0) AS balance FROM meses WHERE usuario_id = $1 AND ano = $2 AND mes = $3${clause} ORDER BY perfil_id NULLS LAST LIMIT 1`,
      [userId, prevYear, prevMonth, ...extra],
    ),
  ]);

  const totalIncomes = parseFloat((incomes.rows[0] as { total: string }).total);
  const totalExpenses = parseFloat((expenses_.rows[0] as { total: string }).total);
  const previousBalance = parseFloat((prevBalance.rows[0] as { balance: string } | undefined)?.balance ?? '0');
  return { previousBalance, totalIncomes, totalExpenses, finalBalance: previousBalance + totalIncomes - totalExpenses };
}

async function calculateFinalBalance(userId: number, year: number, month: number, profileId: number | null): Promise<number> {
  const breakdown = await calculateBalanceBreakdown(userId, year, month, profileId);
  return breakdown.finalBalance;
}

router.get('/:ano/:mes/saldo', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['ano']!);
    const month = parseInt(req.params['mes']!);
    const { perfil_id } = req.query as Record<string, string | undefined>;
    const profileId = perfil_id ? parseInt(perfil_id) : null;

    const { previousBalance, totalIncomes, totalExpenses, finalBalance } =
      await calculateBalanceBreakdown(req.user!.id, year, month, profileId);

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
    const parsedFinalBalance = parseFloat(String(saldo_final ?? ''));
    const finalBalance = Number.isFinite(parsedFinalBalance)
      ? parsedFinalBalance
      : await calculateFinalBalance(req.user!.id, year, month, profileId);

    const result = await pool.query(
      `INSERT INTO meses (usuario_id, ano, mes, fechado, saldo_final, perfil_id)
       VALUES ($1, $2, $3, true, $4, $5)
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
