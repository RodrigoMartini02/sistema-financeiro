import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { buildOwnerAndAccountWhere } from '../utils/ownerAndAccountWhere';
import { resolveAccountOwnerId, resolveVisibleUserIds, resolveOwnerForWrite } from '../utils/familyVisibility';
import { canWriteToAccount, ACCOUNT_ACCESS_DENIED } from '../utils/accountAccess';
import { RequestInputError, sendRequestError } from '../utils/requestInput';
import { isClassificationAllowed } from '../services/incomeClassificationCatalog';
import { processFixedIncomes } from '../services/fixedIncomes';
import {
  readCreateIncomeInput,
  readIncomeDuplicateQuery,
  readIncomeSuggestionsQuery,
  readUpdateIncomeInput,
} from '../services/incomeInput';
import {
  cancelIncome,
  createIncome,
  deleteIncome,
  findIncomeForUpdate,
  findRecentIncomeDuplicate,
  getIncomeSuggestions,
  updateIncome,
} from '../services/incomeService';

const router = Router();

const CATEGORY_NOT_AVAILABLE = 'Categoria indisponível para esta conta';

function buildWhereClause(
  userId: number,
  userType: string,
  queryUserId: string | undefined,
  mes: string | undefined,
  ano: string | undefined,
  accountId: string | undefined,
  visibleUserIds?: number[],
): Promise<{ where: string; params: unknown[] }> {
  return buildOwnerAndAccountWhere(userId, userType, queryUserId, mes, ano, accountId, 'r', visibleUserIds);
}

// GET /api/incomes
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, usuario_id, conta_id, escopo } = req.query as Record<string, string | undefined>;
    // Mesma regra das despesas: por padrao so os proprios lancamentos; amplia
    // para os demais membros so quando o cliente pede (escopo=familia) E o
    // solicitante tem a permissao correspondente.
    const visiveis = await resolveVisibleUserIds(req.user!.id, conta_id ? parseInt(conta_id) : null, escopo === 'familia');
    const { where, params } = await buildWhereClause(req.user!.id, req.user!.type, usuario_id, mes, ano, conta_id, visiveis);

    const result = await pool.query(
      // COALESCE com a conta padrao do autor: dono pode ter corrigido o nome
      // na conta sem isso refletir no cadastro de login (usuarios.nome).
      `SELECT r.*, cr.nome AS classificacao_nome, crp.nome AS classificacao_pai_nome, rep.nome AS representante_nome, COALESCE(ct.nome, TRIM(CONCAT(u.nome, ' ', u.sobrenome))) AS autor_nome
       FROM receitas r
       LEFT JOIN classificacoes_receita cr ON cr.id = r.classificacao_id
       LEFT JOIN classificacoes_receita crp ON crp.id = cr.parent_id
       LEFT JOIN representantes rep ON rep.id = r.representante_id
       LEFT JOIN usuarios u ON u.id = r.usuario_id
       LEFT JOIN contas ct ON ct.usuario_id = u.id AND ct.eh_padrao = true
       ${where} ORDER BY r.data_recebimento DESC`,
      params,
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List incomes error:', error);
    res.status(500).json({ success: false, message: 'Failed to list incomes' });
  }
});

// GET /api/incomes/suggestions?description=&account_id=
router.get('/suggestions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = readIncomeSuggestionsQuery(req.query as Record<string, unknown>);
    res.json({ success: true, data: await getIncomeSuggestions(req.user!.id, query) });
  } catch (error) {
    sendRequestError(res, error, 'Income suggestions error:', req.user?.id, 'Não foi possível buscar as sugestões');
  }
});

// GET /api/incomes/duplicate?description=&amount=&client=&account_id=&exclude_id=
router.get('/duplicate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = readIncomeDuplicateQuery(req.query as Record<string, unknown>);
    res.json({ success: true, data: { duplicate: await findRecentIncomeDuplicate(req.user!.id, query) } });
  } catch (error) {
    sendRequestError(res, error, 'Income duplicate check error:', req.user?.id, 'Não foi possível conferir se a receita já foi lançada');
  }
});

// POST /api/incomes — a receita e, com "Repetir até", as réplicas mensais, numa transação
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const input = readCreateIncomeInput(req.body);
    if (!(await canWriteToAccount(input.accountId, req.user!.id))) {
      throw new RequestInputError(ACCOUNT_ACCESS_DENIED);
    }
    if (!(await isClassificationAllowed(req.user!.id, input.accountId, input.categoryId))) {
      throw new RequestInputError(CATEGORY_NOT_AVAILABLE);
    }
    // Comissão, horas do contrato e estoque saem do catálogo da conta (o
    // titular); a receita fica com quem lançou.
    const catalogOwnerId = await resolveAccountOwnerId(req.user!.id, input.accountId);
    const created = await createIncome(req.user!.id, catalogOwnerId, input);
    res.status(201).json({ success: true, message: 'Income created', data: created });
  } catch (error) {
    // Estoque insuficiente (StockError) é erro de quem lança: a mensagem diz quanto há disponível.
    sendRequestError(res, error, 'Create income error:', req.user?.id, 'Não foi possível registrar a receita. Tente novamente.');
  }
});

// PUT /api/incomes/:id — edita uma receita; conta, observação e status não mudam
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const incomeId = Number(req.params['id']);
    // Alterar lançamento de outro membro exige a permissão correspondente; sem
    // ela, a resposta é a mesma de registro inexistente.
    const ownerId = Number.isInteger(incomeId)
      ? await resolveOwnerForWrite('receitas', incomeId, req.user!.id)
      : null;
    const current = ownerId === null ? null : await findIncomeForUpdate(ownerId, incomeId);
    if (ownerId === null || current === null) {
      throw new RequestInputError('Receita não encontrada', 404);
    }

    const input = readUpdateIncomeInput(req.body);
    if (!(await isClassificationAllowed(req.user!.id, current.accountId, input.categoryId))) {
      throw new RequestInputError(CATEGORY_NOT_AVAILABLE);
    }
    const updated = await updateIncome(ownerId, incomeId, input);
    if (!updated) {
      throw new RequestInputError('Receita não encontrada', 404);
    }
    res.json({ success: true, message: 'Income updated', data: updated });
  } catch (error) {
    sendRequestError(res, error, 'Update income error:', req.user?.id, 'Não foi possível salvar a receita. Tente novamente.');
  }
});

// POST /api/incomes/fixas/processar — checagem ao abrir o sistema: lança as
// receitas fixas do mês que a rotina diária ainda não lançou, só das
// configurações de quem pediu.
router.post('/fixas/processar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await processFixedIncomes({ userId: req.user!.id });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Process fixed incomes error:', error);
    res.status(500).json({ success: false, message: 'Failed to process fixed incomes' });
  }
});

// PUT /api/incomes/:id/receber
router.put('/:id/receber', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const incomeId = parseInt(req.params['id']!);
    const donoWrite = await resolveOwnerForWrite('receitas', incomeId, req.user!.id);
    if (donoWrite === null) {
      res.status(404).json({ success: false, message: 'Income not found' });
      return;
    }
    const { data_recebimento, valor_recebido } = req.body as Record<string, unknown>;

    const result = await pool.query(
      `UPDATE receitas
       SET status = 'ativa',
           data_recebimento = COALESCE($1, data_recebimento),
           valor = COALESCE($2, valor)
       WHERE id = $3 AND usuario_id = $4 AND status IN ('prevista', 'faturada')
       RETURNING *`,
      [
        data_recebimento ?? null,
        valor_recebido ? parseFloat(String(valor_recebido)) : null,
        incomeId,
        donoWrite,
      ],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Predicted income not found' });
      return;
    }

    res.json({ success: true, message: 'Income received', data: result.rows[0] });
  } catch (error) {
    console.error('Receive income error:', error);
    res.status(500).json({ success: false, message: 'Failed to receive income' });
  }
});

/** Dono da receita para escrever: sem permissão, a resposta é a mesma de receita inexistente. */
async function resolveIncomeOwner(rawId: string | undefined, requesterId: number): Promise<{ incomeId: number; ownerId: number }> {
  const incomeId = Number(rawId);
  const ownerId = Number.isInteger(incomeId) && incomeId > 0
    ? await resolveOwnerForWrite('receitas', incomeId, requesterId)
    : null;
  if (ownerId === null) {
    throw new RequestInputError('Receita não encontrada', 404);
  }
  return { incomeId, ownerId };
}

// PUT /api/incomes/:id/cancelar — devolve o estoque vendido e cancela a comissão não paga
router.put('/:id/cancelar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { incomeId, ownerId } = await resolveIncomeOwner(req.params['id'], req.user!.id);
    if (!(await cancelIncome(ownerId, incomeId))) {
      throw new RequestInputError('Receita não encontrada', 404);
    }
    res.json({ success: true, message: 'Income cancelled' });
  } catch (error) {
    sendRequestError(res, error, 'Cancel income error:', req.user?.id, 'Não foi possível cancelar a receita. Tente novamente.');
  }
});

// DELETE /api/incomes/:id — devolve o estoque vendido e cancela a comissão não paga, se a receita não estava cancelada
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { incomeId, ownerId } = await resolveIncomeOwner(req.params['id'], req.user!.id);
    if (!(await deleteIncome(ownerId, incomeId))) {
      throw new RequestInputError('Receita não encontrada', 404);
    }
    res.json({ success: true, message: 'Income deleted' });
  } catch (error) {
    sendRequestError(res, error, 'Delete income error:', req.user?.id, 'Não foi possível excluir a receita. Tente novamente.');
  }
});

export default router;
