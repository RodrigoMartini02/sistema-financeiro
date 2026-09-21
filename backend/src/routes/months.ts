import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { calculateBalanceBreakdown } from '../services/balanceService';

const router = Router();

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

export default router;
