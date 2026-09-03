import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getMonthYearFromIsoDate } from '../utils/date';
import { buildOwnerAndAccountWhere } from '../utils/ownerAndAccountWhere';
import { createCommissionExpense } from '../services/commissionService';

const router = Router();

function buildWhereClause(
  userId: number,
  userType: string,
  queryUserId: string | undefined,
  mes: string | undefined,
  ano: string | undefined,
  accountId: string | undefined,
): { where: string; params: unknown[] } {
  return buildOwnerAndAccountWhere(userId, userType, queryUserId, mes, ano, accountId, 'r');
}

// GET /api/incomes
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, usuario_id, conta_id } = req.query as Record<string, string | undefined>;
    const { where, params } = buildWhereClause(req.user!.id, req.user!.type, usuario_id, mes, ano, conta_id);

    const result = await pool.query(
      `SELECT r.*, rep.nome AS representante_nome
       FROM receitas r
       LEFT JOIN representantes rep ON rep.id = r.representante_id
       ${where} ORDER BY r.data_recebimento DESC`,
      params,
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List incomes error:', error);
    res.status(500).json({ success: false, message: 'Failed to list incomes' });
  }
});

// GET /api/incomes/suggestions
router.get('/suggestions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { descricao } = req.query as Record<string, string | undefined>;
    const userId = req.user!.id;
    const normalizedDescricao = descricao?.trim();

    const matches = normalizedDescricao
      ? await pool.query(
          `SELECT descricao, valor, cliente, tipo_receita,
                  COUNT(*) OVER (PARTITION BY LOWER(descricao)) AS frequencia,
                  data_recebimento
           FROM receitas
           WHERE usuario_id = $1 AND descricao ILIKE $2 AND status != 'cancelada'
           ORDER BY frequencia DESC, data_recebimento DESC
           LIMIT 4`,
          [userId, `%${normalizedDescricao}%`],
        )
      : { rows: [] as Record<string, unknown>[] };

    res.json({ success: true, data: { matches: matches.rows } });
  } catch (error) {
    console.error('Get income suggestions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get income suggestions' });
  }
});

// POST /api/incomes
router.post(
  '/',
  authenticate,
  [
    body('descricao').notEmpty().withMessage('Description is required'),
    body('valor').isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero'),
    body('data_recebimento').isISO8601().withMessage('Invalid date'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        descricao, valor, data_recebimento, observacoes, anexos, conta_id,
        cliente, tipo_receita, representante_id, valor_comissao,
        contrato_id, tipo_hora, quantidade_horas,
      } = req.body as Record<string, unknown>;

      // Mês/ano da receita sempre derivados da data de recebimento, nunca do
      // mês que o client tinha aberto na tela no momento do cadastro.
      const { mes, ano } = getMonthYearFromIsoDate(data_recebimento as string);

      const attachmentsJson = Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;
      const representanteIdInt = representante_id ? parseInt(String(representante_id)) : null;
      const contratoIdInt = contrato_id ? parseInt(String(contrato_id)) : null;
      const qtdHoras = quantidade_horas ? parseFloat(String(quantidade_horas)) : null;

      // Auto-criar despesa de comissão apenas quando há match real de comissão
      // (valor_comissao positivo enviado pelo client). Sem match, não criar
      // despesa nenhuma — evita lançamentos-fantasma de valor simbólico.
      const valorComissaoValido = valor_comissao != null && parseFloat(String(valor_comissao)) > 0
        ? parseFloat(String(valor_comissao))
        : null;
      const comissaoContaId = conta_id ? parseInt(String(conta_id)) : null;

      const client = await pool.connect();
      let result: { rows: unknown[] } = { rows: [] };
      try {
        await client.query('BEGIN');

        result = await client.query(
          `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, observacoes, anexos, conta_id, cliente, tipo_receita, representante_id, valor_comissao, contrato_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING *`,
          [
            req.user!.id,
            descricao,
            parseFloat(String(valor)),
            data_recebimento,
            mes,
            ano,
            observacoes ?? null,
            attachmentsJson,
            comissaoContaId,
            cliente ?? null,
            tipo_receita ?? null,
            representanteIdInt,
            valor_comissao != null ? parseFloat(String(valor_comissao)) : null,
            contratoIdInt,
          ],
        );

        // Debitar horas do contrato se informadas
        if (contratoIdInt && qtdHoras && qtdHoras > 0 && tipo_hora) {
          const col = tipo_hora === 'remoto'
            ? 'horas_remotas_saldo_atual'
            : 'horas_presenciais_saldo_atual';
          await client.query(
            `UPDATE contratos SET ${col} = GREATEST(0, ${col} - $1) WHERE id = $2 AND usuario_id = $3`,
            [qtdHoras, contratoIdInt, req.user!.id],
          );
        }

        if (representanteIdInt && valorComissaoValido != null) {
          await createCommissionExpense({
            client,
            userId: req.user!.id,
            representanteId: representanteIdInt,
            valorComissao: valorComissaoValido,
            dataRecebimento: data_recebimento as string,
            mes,
            ano,
            contaId: comissaoContaId,
          });
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.status(201).json({ success: true, message: 'Income created', data: result.rows[0] });
    } catch (error) {
      console.error('Create income error:', error);
      res.status(500).json({ success: false, message: 'Failed to create income' });
    }
  },
);

// PUT /api/incomes/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const incomeId = parseInt(req.params['id']!);
    const { descricao, valor, data_recebimento, observacoes, anexos, conta_id, cliente, tipo_receita, representante_id } =
      req.body as Record<string, unknown>;

    const attachmentsJson = Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

    // Mesma regra da criação: mês/ano seguem a data de recebimento.
    const { mes, ano } = getMonthYearFromIsoDate(data_recebimento as string);

    const result = await pool.query(
      `UPDATE receitas
       SET descricao = $1, valor = $2, data_recebimento = $3, observacoes = $4, anexos = $5,
           conta_id = COALESCE($6, conta_id),
           cliente = $7, tipo_receita = $8, representante_id = $9,
           mes = $12, ano = $13
       WHERE id = $10 AND usuario_id = $11
       RETURNING *`,
      [
        descricao,
        parseFloat(String(valor)),
        data_recebimento,
        observacoes ?? null,
        attachmentsJson,
        conta_id ? parseInt(String(conta_id)) : null,
        cliente ?? null,
        tipo_receita ?? null,
        representante_id ? parseInt(String(representante_id)) : null,
        incomeId,
        req.user!.id,
        mes,
        ano,
      ],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Income not found' });
      return;
    }

    res.json({ success: true, message: 'Income updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update income error:', error);
    res.status(500).json({ success: false, message: 'Failed to update income' });
  }
});

// PUT /api/incomes/:id/receber
router.put('/:id/receber', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const incomeId = parseInt(req.params['id']!);
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
        req.user!.id,
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

// PUT /api/incomes/:id/cancelar
router.put('/:id/cancelar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const incomeId = parseInt(req.params['id']!);

    const receitaResult = await pool.query(
      'SELECT representante_id, mes, ano FROM receitas WHERE id = $1 AND usuario_id = $2',
      [incomeId, req.user!.id],
    );

    if (receitaResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Income not found' });
      return;
    }

    const receita = receitaResult.rows[0] as { representante_id: number | null; mes: number; ano: number };

    await pool.query(
      "UPDATE receitas SET status = 'cancelada' WHERE id = $1 AND usuario_id = $2",
      [incomeId, req.user!.id],
    );

    if (receita.representante_id) {
      await pool.query(
        `UPDATE despesas SET status = 'cancelada'
         WHERE usuario_id = $1 AND mes = $2 AND ano = $3
           AND descricao LIKE 'Comissão - %' AND status = 'ativa'`,
        [req.user!.id, receita.mes, receita.ano],
      );
    }

    res.json({ success: true, message: 'Income cancelled' });
  } catch (error) {
    console.error('Cancel income error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel income' });
  }
});

// DELETE /api/incomes/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const incomeId = parseInt(req.params['id']!);
    const result = await pool.query(
      'DELETE FROM receitas WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [incomeId, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Income not found' });
      return;
    }

    res.json({ success: true, message: 'Income deleted' });
  } catch (error) {
    console.error('Delete income error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete income' });
  }
});

export default router;
