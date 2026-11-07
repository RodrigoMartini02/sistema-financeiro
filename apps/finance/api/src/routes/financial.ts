import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { accounts } from '../db/schema';
import { authenticate, requireActivePlan } from '../middleware/auth';
import { hasScreenAccess, requireScreenAccess } from '../middleware/permissions';
import { resolveDashboardScope } from '../utils/dashboardScope';
import { ACCOUNT_ACCESS_DENIED, canWriteToAccount } from '../utils/accountAccess';
import { getTodayIsoInTimezone } from '../utils/date';
import { RequestInputError, readQueryEnumList, readQueryIdList } from '../utils/requestInput';
import { PAYMENT_METHODS } from '../services/expenseInput';
import { validarPeriodo } from '../services/painelCalculos';
import { montarPainel, type TipoConta } from '../services/painelService';
import type { FiltrosDespesaPainel } from '../services/painelCalculos';

const router = Router();

const MEMBRO_INVALIDO = Symbol('membro_invalido');

/**
 * Contrato de `membro_id`: ausente = só o solicitante; `familia` = todas as
 * pessoas visíveis; um id = aquela pessoa; ids repetidos = exatamente esses.
 * Quem valida se o solicitante pode ver cada pessoa é resolveDashboardScope.
 */
function lerMembroId(valor: unknown): number | number[] | null | undefined | typeof MEMBRO_INVALIDO {
  if (valor === undefined) {
    return undefined;
  }
  if (valor === 'familia') {
    return null;
  }
  if (Array.isArray(valor)) {
    const ids = valor.map((item) => Number(item));
    return ids.every(Number.isInteger) ? ids : MEMBRO_INVALIDO;
  }
  const id = Number(valor);
  return Number.isInteger(id) ? id : MEMBRO_INVALIDO;
}

const FILTRO_INVALIDO = 'Filtro inválido';

/** Filtros de despesa do botão de filtros, com a mesma leitura dos Relatórios. */
function lerFiltrosDespesa(query: Request['query']): FiltrosDespesaPainel {
  return {
    categoryIds: readQueryIdList(query['category_id'], FILTRO_INVALIDO),
    cardIds: readQueryIdList(query['card_id'], FILTRO_INVALIDO),
    paymentMethods: readQueryEnumList(query['payment_method'], PAYMENT_METHODS, FILTRO_INVALIDO),
  };
}

// GET /api/financial/painel?de=AAAA-MM-DD&ate=AAAA-MM-DD[&membro_id=...][&conta_id=...]
//   [&category_id=...][&card_id=...][&payment_method=...]
router.get('/painel', authenticate, requireActivePlan, requireScreenAccess('accessDashboard'), async (req: Request, res: Response): Promise<void> => {
  try {
    const validacao = validarPeriodo(req.query['de'], req.query['ate']);
    if (!validacao.valido) {
      res.status(400).json({ success: false, message: validacao.mensagem });
      return;
    }

    const filtros = lerFiltrosDespesa(req.query);

    const membroId = lerMembroId(req.query['membro_id']);
    if (membroId === MEMBRO_INVALIDO) {
      res.status(400).json({ success: false, message: 'Parâmetro de membro inválido' });
      return;
    }

    const contaIdBruto = req.query['conta_id'];
    const accountId = contaIdBruto !== undefined ? Number(contaIdBruto) : null;
    if (accountId !== null && (!Number.isInteger(accountId) || accountId <= 0)) {
      res.status(400).json({ success: false, message: 'Parâmetro de conta inválido' });
      return;
    }

    const userId = req.user!.id;
    // conta_id vem do navegador: só passa se o solicitante for dono da conta ou
    // tiver vínculo ativo com ela (mesma checagem usada na gravação).
    if (accountId !== null && !(await canWriteToAccount(accountId, userId))) {
      res.status(404).json({ success: false, message: ACCOUNT_ACCESS_DENIED });
      return;
    }

    const escopo = await resolveDashboardScope(userId, accountId, membroId);
    if (escopo === null) {
      res.status(400).json({ success: false, message: 'Membro não disponível' });
      return;
    }

    const [conta, podeVerPlanejado] = await Promise.all([
      accountId !== null
        ? db.select({ tipo: accounts.type }).from(accounts).where(eq(accounts.id, accountId)).limit(1)
        : Promise.resolve([]),
      hasScreenAccess(userId, 'accessBudget'),
    ]);
    const tipoConta: TipoConta = conta[0]?.tipo === 'empresa' ? 'empresa' : 'pessoal';

    const painel = await montarPainel({
      solicitanteId: userId,
      escopo,
      filtros,
      accountId,
      tipoConta,
      periodo: validacao.periodo,
      hoje: getTodayIsoInTimezone(),
      podeVerPlanejado,
    });

    res.json({ success: true, data: painel });
  } catch (error) {
    if (error instanceof RequestInputError) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    console.error('Painel error:', { userId: req.user?.id, error });
    res.status(500).json({ success: false, message: 'Não foi possível carregar o painel' });
  }
});

export default router;
