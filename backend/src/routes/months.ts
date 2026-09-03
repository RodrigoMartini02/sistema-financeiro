import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { accountWhere } from '../utils/accountFilter';

const router = Router();

interface BalanceBreakdown {
  previousBalance: number;
  totalIncomes: number;
  totalExpenses: number;
  finalBalance: number;
}

// Verifica se existe algum lançamento (receita ou despesa) anterior a um
// (ano, mes), comparando pela mesma chave (ano * 12 + mes) que o endpoint
// /panorama já utiliza. $2 é a chave de comparação; a cláusula de conta
// (quando houver) usa $3.
async function isInicioRealDoHistorico(userId: number, year: number, month: number, accountId: number | null): Promise<boolean> {
  const { clause, params: extra } = accountWhere(accountId, 3);
  const chave = year * 12 + month;

  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1 FROM receitas WHERE usuario_id = $1 AND (ano * 12 + mes) < $2 AND status = 'ativa'${clause}
      UNION ALL
      SELECT 1 FROM despesas WHERE usuario_id = $1 AND (ano * 12 + mes) < $2 AND status = 'ativa'${clause}
    ) AS existe`,
    [userId, chave, ...extra],
  );

  return (result.rows[0] as { existe: boolean }).existe === false;
}

async function fetchAporteInicial(userId: number, accountId: number | null): Promise<number> {
  if (!accountId) return 0;
  const result = await pool.query(
    `SELECT aporte_inicial FROM contas WHERE id = $1 AND usuario_id = $2`,
    [accountId, userId],
  );
  const raw = (result.rows[0] as { aporte_inicial: string | null } | undefined)?.aporte_inicial;
  return raw ? parseFloat(raw) : 0;
}

async function calculateBalanceBreakdown(userId: number, year: number, month: number, accountId: number | null): Promise<BalanceBreakdown> {
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const { clause, params: extra } = accountWhere(accountId, 4);

  const [incomes, expenses_, prevBalance] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM receitas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
      [userId, year, month, ...extra],
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN parcelado = true AND COALESCE(numero_parcelas, 0) > 0 AND parcela_atual = 1 THEN (CASE WHEN pago THEN COALESCE(valor_pago, valor_final, valor_original, valor) ELSE COALESCE(valor_final, valor_original, valor) END) / numero_parcelas ELSE (CASE WHEN pago THEN COALESCE(valor_pago, valor_final, valor_original, valor) ELSE COALESCE(valor_final, valor_original, valor) END) END), 0) AS total FROM despesas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
      [userId, year, month, ...extra],
    ),
    pool.query(
      `SELECT COALESCE(saldo_final, 0) AS balance FROM meses WHERE usuario_id = $1 AND ano = $2 AND mes = $3${clause} ORDER BY conta_id NULLS LAST LIMIT 1`,
      [userId, prevYear, prevMonth, ...extra],
    ),
  ]);

  const totalIncomes = parseFloat((incomes.rows[0] as { total: string }).total);
  const totalExpenses = parseFloat((expenses_.rows[0] as { total: string }).total);
  const prevBalanceRow = (prevBalance.rows[0] as { balance: string } | undefined)?.balance;

  // Sem registro do mês anterior em `meses`: só aplica o aporte inicial da
  // conta se este for de fato o início real do histórico (nenhum lançamento
  // anterior a ele) — evita somar o aporte de novo em "buracos" no meio do
  // histórico.
  let previousBalance = parseFloat(prevBalanceRow ?? '0');
  if (prevBalanceRow === undefined) {
    const isInicio = await isInicioRealDoHistorico(userId, year, month, accountId);
    if (isInicio) {
      previousBalance = await fetchAporteInicial(userId, accountId);
    }
  }

  return { previousBalance, totalIncomes, totalExpenses, finalBalance: previousBalance + totalIncomes - totalExpenses };
}

async function calculateFinalBalance(userId: number, year: number, month: number, accountId: number | null): Promise<number> {
  const breakdown = await calculateBalanceBreakdown(userId, year, month, accountId);
  return breakdown.finalBalance;
}

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { conta_id } = req.query as Record<string, string | undefined>;
    const accountId = conta_id ? parseInt(conta_id) : null;
    const { clause, params: extra } = accountWhere(accountId, 2);

    const result = await pool.query(
      `SELECT ano, mes, fechado FROM meses WHERE usuario_id = $1${clause} ORDER BY ano, mes`,
      [req.user!.id, ...extra],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List meses error:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar meses' });
  }
});

router.get('/:ano/:mes/saldo', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['ano']!);
    const month = parseInt(req.params['mes']!);
    const { conta_id } = req.query as Record<string, string | undefined>;
    const accountId = conta_id ? parseInt(conta_id) : null;

    const { previousBalance, totalIncomes, totalExpenses, finalBalance } =
      await calculateBalanceBreakdown(req.user!.id, year, month, accountId);

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
    const { saldo_final, conta_id } = req.body as Record<string, unknown>;
    const accountId = conta_id ? parseInt(String(conta_id)) : null;
    const parsedFinalBalance = parseFloat(String(saldo_final ?? ''));
    const finalBalance = Number.isFinite(parsedFinalBalance)
      ? parsedFinalBalance
      : await calculateFinalBalance(req.user!.id, year, month, accountId);

    const result = await pool.query(
      `INSERT INTO meses (usuario_id, ano, mes, fechado, saldo_final, conta_id)
       VALUES ($1, $2, $3, true, $4, $5)
       ON CONFLICT (usuario_id, ano, mes, COALESCE(conta_id, 0))
       DO UPDATE SET fechado = true, saldo_final = EXCLUDED.saldo_final, data_fechamento = NOW()
       RETURNING *`,
      [req.user!.id, year, month, finalBalance, accountId],
    );

    res.json({ success: true, message: 'Mês fechado', data: result.rows[0] });
  } catch (error) {
    const pgCode = (error as { code?: string }).code;
    console.error('Fechar mês error:', { code: pgCode, error });
    res.status(500).json({ success: false, message: 'Erro ao fechar mês' });
  }
});

router.post('/:ano/:mes/reabrir', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params['ano']!);
    const month = parseInt(req.params['mes']!);
    const { conta_id } = req.body as Record<string, unknown>;
    const accountId = conta_id ? parseInt(String(conta_id)) : null;
    const { clause, params: extra } = accountWhere(accountId, 4);

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
