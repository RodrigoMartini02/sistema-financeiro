import { Router, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { accounts } from '../db/schema';
import { authenticate, requireTitular } from '../middleware/auth';
import { listAccountPartners } from '../services/accountPartners';
import { RequestInputError, readQueryId, sendRequestError } from '../utils/requestInput';

const router = Router();

// GET /api/partners?conta_id= — sócios ativos de uma conta do titular, para o
// modal da conta. Só leitura: a gravação vai junto com a conta (POST/PUT
// /api/contas), e só o titular edita, porque o capital pode virar receita.
router.get('/', authenticate, requireTitular, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = readQueryId(req.query['conta_id'], 'Informe a conta');
    if (accountId === null) {
      throw new RequestInputError('Informe a conta');
    }

    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, req.user!.id)))
      .limit(1);
    if (!account) {
      res.status(404).json({ success: false, message: 'Conta não encontrada' });
      return;
    }

    res.json({ success: true, data: await listAccountPartners(req.user!.id, account.id) });
  } catch (error) {
    sendRequestError(res, error, 'List partners error:', req.user?.id, 'Não foi possível carregar os sócios agora.');
  }
});

export default router;
