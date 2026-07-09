import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

function buildWhereClause(
  userId: number,
  userType: string,
  queryUserId: string | undefined,
  mes: string | undefined,
  ano: string | undefined,
  perfilId: string | undefined,
  tableAlias: string = 'd',
): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  let p = 0;

  const targetUserId = queryUserId && userType === 'master' ? parseInt(queryUserId) : userId;
  p++;
  let where = `WHERE ${tableAlias}.usuario_id = $${p}`;
  params.push(targetUserId);

  if (mes !== undefined && ano !== undefined) {
    where += ` AND ${tableAlias}.mes = $${p + 1} AND ${tableAlias}.ano = $${p + 2}`;
    params.push(parseInt(mes), parseInt(ano));
    p += 2;
  }

  if (perfilId) {
    p++;
    where += ` AND (${tableAlias}.perfil_id = $${p} OR (${tableAlias}.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis pf WHERE pf.id = $${p} AND pf.tipo = 'pessoal' AND pf.usuario_id = ${tableAlias}.usuario_id)))`;
    params.push(parseInt(perfilId));
  }

  return { where, params };
}

async function validateCardId(cardId: unknown, userId: number): Promise<number | null> {
  if (!cardId) return null;
  const result = await pool.query('SELECT id FROM cartoes WHERE id = $1 AND usuario_id = $2', [cardId, userId]);
  return result.rows.length > 0 ? Number(cardId) : null;
}

async function createFutureInstallments(
  userId: number,
  baseExpense: Record<string, unknown>,
  totalInstallments: number,
): Promise<void> {
  const values: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (let i = 2; i <= totalInstallments; i++) {
    let nextMonth = Number(baseExpense['mes']) + (i - 1);
    let nextYear = Number(baseExpense['ano']);
    while (nextMonth > 11) {
      nextMonth -= 12;
      nextYear += 1;
    }

    const [yr, mo, dy] = String(baseExpense['data_vencimento']).split('-').map(Number);
    const baseDate = new Date(yr!, mo! - 1, dy!);
    baseDate.setMonth(baseDate.getMonth() + (i - 1));
    const nextDue = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;

    const placeholders = Array.from({ length: 19 }, () => `$${idx++}`).join(', ');
    values.push(`(${placeholders})`);
    const valorPorParcela = parseFloat(String(baseExpense['valor_final'] ?? baseExpense['valor_original'] ?? 0)) / totalInstallments;
    params.push(
      userId,
      `${baseExpense['descricao']} (${i}/${totalInstallments})`,
      nextDue,
      baseExpense['data_compra'],
      nextMonth,
      nextYear,
      baseExpense['categoria_id'],
      baseExpense['cartao_id'],
      baseExpense['forma_pagamento'],
      true,
      totalInstallments,
      i,
      baseExpense['observacoes'],
      false,
      baseExpense['id'],
      baseExpense['recorrente'] ?? false,
      baseExpense['perfil_id'] ?? null,
      valorPorParcela,
      valorPorParcela,
    );
  }

  if (values.length > 0) {
    await pool.query(
      `INSERT INTO despesas (
        usuario_id, descricao, data_vencimento, data_compra,
        mes, ano, categoria_id, cartao_id, forma_pagamento,
        parcelado, numero_parcelas, parcela_atual, observacoes, pago,
        grupo_parcelamento_id, recorrente, perfil_id,
        valor_original, valor_final
      ) VALUES ${values.join(', ')}`,
      params,
    );
  }

  await pool.query(
    `UPDATE despesas SET grupo_parcelamento_id = $1, descricao = $2, parcela_atual = 1 WHERE id = $3`,
    [baseExpense['id'], `${baseExpense['descricao']} (1/${totalInstallments})`, baseExpense['id']],
  );
}

// GET /api/expenses
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, usuario_id, perfil_id } = req.query as Record<string, string | undefined>;
    const { where, params } = buildWhereClause(req.user!.id, req.user!.type, usuario_id, mes, ano, perfil_id);

    const result = await pool.query(
      `SELECT d.*, c.nome AS categoria_nome
       FROM despesas d
       LEFT JOIN categorias c ON d.categoria_id = c.id
       ${where}
       ORDER BY d.data_vencimento ASC`,
      params,
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List expenses error:', error);
    res.status(500).json({ success: false, message: 'Failed to list expenses' });
  }
});

// GET /api/expenses/categories (dropdown helper)
router.get('/categories', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT * FROM categorias WHERE usuario_id = $1 ORDER BY nome ASC',
      [req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to get categories' });
  }
});

// POST /api/expenses
router.post(
  '/',
  authenticate,
  [
    body('descricao').notEmpty().withMessage('Description is required'),
    body('valor_original').isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero'),
    body('data_vencimento').isISO8601().withMessage('Invalid date'),
    body('mes').isInt({ min: 0, max: 11 }).withMessage('Invalid month'),
    body('ano').isInt({ min: 2000 }).withMessage('Invalid year'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        descricao, valor_original, valor_final, data_vencimento, data_compra, data_pagamento,
        mes, ano, categoria_id, cartao_id, forma_pagamento,
        parcelado, total_parcelas, parcela_atual, observacoes, pago,
        valor_pago, anexos, recorrente, perfil_id,
        numero_nf, data_emissao_nf, tipo_despesa,
      } = req.body as Record<string, unknown>;

      const totalInstallments = total_parcelas ?? null;
      const currentInstallment = parcela_atual ?? (parcelado ? 1 : null);
      const cardIdFinal = await validateCardId(cartao_id, req.user!.id);
      const attachmentsJson = Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

      let categoryFinal = categoria_id;
      if (!categoryFinal) {
        const fallback = await pool.query('SELECT id FROM categorias WHERE usuario_id = $1 ORDER BY id ASC LIMIT 1', [req.user!.id]);
        categoryFinal = fallback.rows.length > 0 ? (fallback.rows[0] as { id: number }).id : null;
      }

      const result = await pool.query(
        `INSERT INTO despesas (
          usuario_id, descricao, data_vencimento, data_compra, data_pagamento,
          mes, ano, categoria_id, cartao_id, forma_pagamento,
          parcelado, numero_parcelas, parcela_atual, observacoes, pago,
          valor_original, valor_final, valor_pago, anexos, recorrente, perfil_id,
          numero_nf, data_emissao_nf, tipo_despesa
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        RETURNING *`,
        [
          req.user!.id, descricao, data_vencimento,
          (data_compra as string) || null, (data_pagamento as string) || null, mes, ano,
          categoryFinal, cardIdFinal, forma_pagamento ?? 'dinheiro',
          parcelado ?? false, totalInstallments, currentInstallment,
          observacoes ?? null, pago ?? false,
          valor_original ? parseFloat(String(valor_original)) : null,
          valor_final
            ? parseFloat(String(valor_final))
            : (valor_original ? parseFloat(String(valor_original)) : null),
          valor_pago ? parseFloat(String(valor_pago)) : null,
          attachmentsJson, recorrente ?? false,
          perfil_id ? parseInt(String(perfil_id)) : null,
          (numero_nf as string) || null, (data_emissao_nf as string) || null,
          (tipo_despesa as string) || null,
        ],
      );

      const created = result.rows[0] as Record<string, unknown>;

      if (parcelado && totalInstallments && Number(totalInstallments) > 1) {
        await createFutureInstallments(req.user!.id, created, Number(totalInstallments));
      }

      res.status(201).json({ success: true, message: 'Expense created', data: created });
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({ success: false, message: 'Failed to create expense' });
    }
  },
);

// PUT /api/expenses/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = parseInt(req.params['id']!);
    const {
      descricao, valor_original, valor_final, data_vencimento, data_compra, data_pagamento,
      categoria_id, cartao_id, forma_pagamento, observacoes, pago,
      total_parcelas, parcela_atual, valor_pago,
      anexos, mes, ano, parcelado, recorrente, perfil_id,
      numero_nf, data_emissao_nf, tipo_despesa,
    } = req.body as Record<string, unknown>;

    const cardIdFinal = await validateCardId(cartao_id, req.user!.id);
    const attachmentsJson = Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

    const result = await pool.query(
      `UPDATE despesas
       SET descricao = $1, data_vencimento = $2, data_compra = $3,
           data_pagamento = $4, categoria_id = $5, cartao_id = $6,
           forma_pagamento = $7, observacoes = $8, pago = $9,
           numero_parcelas = $10, parcela_atual = $11,
           valor_original = $12, valor_final = $13, valor_pago = $14,
           anexos = $15,
           mes = COALESCE($16, mes), ano = COALESCE($17, ano),
           parcelado = COALESCE($18, parcelado),
           recorrente = COALESCE($19, recorrente),
           perfil_id = COALESCE($20, perfil_id),
           numero_nf = $21, data_emissao_nf = $22, tipo_despesa = $23
       WHERE id = $24 AND usuario_id = $25
       RETURNING *`,
      [
        descricao, data_vencimento, (data_compra as string) || null,
        (data_pagamento as string) || null, categoria_id ?? null, cardIdFinal, forma_pagamento,
        observacoes ?? null, pago,
        total_parcelas ?? null, parcela_atual ?? null,
        valor_original ? parseFloat(String(valor_original)) : null,
        valor_final
          ? parseFloat(String(valor_final))
          : (valor_original ? parseFloat(String(valor_original)) : null),
        valor_pago ? parseFloat(String(valor_pago)) : null,
        attachmentsJson,
        mes !== undefined ? mes : null,
        ano !== undefined ? ano : null,
        parcelado !== undefined ? parcelado : null,
        recorrente !== undefined ? recorrente : null,
        perfil_id ? parseInt(String(perfil_id)) : null,
        (numero_nf as string) || null, (data_emissao_nf as string) || null, (tipo_despesa as string) || null,
        expenseId, req.user!.id,
      ],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }

    res.json({ success: true, message: 'Expense updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ success: false, message: 'Failed to update expense' });
  }
});

// PUT /api/expenses/:id/cancelar
router.put('/:id/cancelar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = parseInt(req.params['id']!);
    const result = await pool.query(
      "UPDATE despesas SET status = 'cancelada' WHERE id = $1 AND usuario_id = $2 RETURNING id",
      [expenseId, req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }
    res.json({ success: true, message: 'Expense cancelled' });
  } catch (error) {
    console.error('Cancel expense error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel expense' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = parseInt(req.params['id']!);
    const { delete_group } = req.query as { delete_group?: string };

    if (delete_group === 'true') {
      await pool.query(
        `DELETE FROM despesas WHERE (id = $1 OR grupo_parcelamento_id = $1) AND usuario_id = $2`,
        [expenseId, req.user!.id],
      );
    } else {
      const result = await pool.query(
        'DELETE FROM despesas WHERE id = $1 AND usuario_id = $2 RETURNING id',
        [expenseId, req.user!.id],
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Expense not found' });
        return;
      }
    }

    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete expense' });
  }
});

// POST /api/expenses/:id/pay
router.post('/:id/pay', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = parseInt(req.params['id']!);
    const { data_pagamento, valor_pago, settle_future } = req.body as Record<string, unknown>;

    const paymentDate = data_pagamento ?? new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `UPDATE despesas SET pago = true, data_pagamento = $1, valor_pago = $2 WHERE id = $3 AND usuario_id = $4 RETURNING *`,
      [paymentDate, valor_pago ?? null, expenseId, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }

    const expense = result.rows[0] as Record<string, unknown>;

    if (settle_future && expense['grupo_parcelamento_id']) {
      await pool.query(
        `UPDATE despesas SET pago = true, data_pagamento = $1, valor_pago = 0
         WHERE grupo_parcelamento_id = $2 AND parcela_atual > $3 AND usuario_id = $4`,
        [paymentDate, expense['grupo_parcelamento_id'], expense['parcela_atual'], req.user!.id],
      );
    }

    res.json({ success: true, message: 'Payment processed', data: expense });
  } catch (error) {
    console.error('Pay expense error:', error);
    res.status(500).json({ success: false, message: 'Failed to process payment' });
  }
});

export default router;
