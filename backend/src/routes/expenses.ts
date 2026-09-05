import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getMonthYearFromIsoDate, getTodayIsoInTimezone } from '../utils/date';
import { buildOwnerAndAccountWhere } from '../utils/ownerAndAccountWhere';

const router = Router();

function buildWhereClause(
  userId: number,
  userType: string,
  queryUserId: string | undefined,
  mes: string | undefined,
  ano: string | undefined,
  accountId: string | undefined,
  tableAlias: string = 'd',
): Promise<{ where: string; params: unknown[] }> {
  return buildOwnerAndAccountWhere(userId, userType, queryUserId, mes, ano, accountId, tableAlias);
}

async function validateCardId(cardId: unknown, userId: number): Promise<number | null> {
  if (!cardId) return null;
  const result = await pool.query('SELECT id FROM cartoes WHERE id = $1 AND usuario_id = $2', [cardId, userId]);
  return result.rows.length > 0 ? Number(cardId) : null;
}

// Confirma que o cartao (quando informado) e compativel com a forma de
// pagamento da despesa. Cartoes sem tipo definido (ainda nao classificados)
// sao sempre aceitos, para nao bloquear cartoes cadastrados antes deste
// campo existir. Retorna null quando valido, ou uma mensagem de erro.
async function validateCardTypeCompatibility(
  cardId: number | null,
  formaPagamento: unknown,
  userId: number,
): Promise<string | null> {
  if (!cardId) return null;
  const result = await pool.query('SELECT tipo FROM cartoes WHERE id = $1 AND usuario_id = $2', [cardId, userId]);
  const tipo = (result.rows[0] as { tipo: string | null } | undefined)?.tipo;
  if (!tipo || tipo === 'ambos') return null;
  if (tipo !== formaPagamento) {
    return `Card does not support payment method "${String(formaPagamento)}"`;
  }
  return null;
}

async function createFutureInstallments(
  userId: number,
  baseExpense: Record<string, unknown>,
  totalInstallments: number,
  installmentsAlreadyPaid: number = 0,
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

    const placeholders = Array.from({ length: 20 }, () => `$${idx++}`).join(', ');
    values.push(`(${placeholders})`);
    const valorParcela = parseFloat(String(baseExpense['valor_final'] ?? baseExpense['valor_original'] ?? 0));
    const installmentIsPaid = i <= installmentsAlreadyPaid;
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
      installmentIsPaid,
      baseExpense['id'],
      baseExpense['recorrente'] ?? false,
      baseExpense['conta_id'] ?? null,
      valorParcela,
      valorParcela,
      valorParcela,
    );
  }

  if (values.length > 0) {
    await pool.query(
      `INSERT INTO despesas (
        usuario_id, descricao, data_vencimento, data_compra,
        mes, ano, categoria_id, cartao_id, forma_pagamento,
        parcelado, numero_parcelas, parcela_atual, observacoes, pago,
        grupo_parcelamento_id, recorrente, conta_id,
        valor_original, valor_final, valor
      ) VALUES ${values.join(', ')}`,
      params,
    );
  }

  const firstInstallmentPaid = installmentsAlreadyPaid >= 1;
  await pool.query(
    `UPDATE despesas SET grupo_parcelamento_id = $1, descricao = $2, parcela_atual = 1, pago = $3 WHERE id = $4`,
    [baseExpense['id'], `${baseExpense['descricao']} (1/${totalInstallments})`, firstInstallmentPaid, baseExpense['id']],
  );
}

async function createRecurringOccurrences(
  userId: number,
  baseExpense: Record<string, unknown>,
  totalOccurrences: number,
): Promise<void> {
  const values: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const [yr, mo, dy] = String(baseExpense['data_vencimento']).split('-').map(Number);

  for (let i = 2; i <= totalOccurrences; i++) {
    let nextMonth = Number(baseExpense['mes']) + (i - 1);
    let nextYear = Number(baseExpense['ano']);
    while (nextMonth > 11) {
      nextMonth -= 12;
      nextYear += 1;
    }

    const baseDate = new Date(yr!, mo! - 1, dy!);
    baseDate.setMonth(baseDate.getMonth() + (i - 1));
    const nextDue = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;

    const placeholders = Array.from({ length: 17 }, () => `$${idx++}`).join(', ');
    values.push(`(${placeholders})`);
    params.push(
      userId,
      baseExpense['descricao'],
      nextDue,
      null,
      nextMonth,
      nextYear,
      baseExpense['categoria_id'],
      baseExpense['cartao_id'],
      baseExpense['forma_pagamento'],
      baseExpense['observacoes'],
      false,
      baseExpense['id'],
      true,
      baseExpense['conta_id'] ?? null,
      baseExpense['valor_original'],
      baseExpense['valor_final'],
      baseExpense['valor_final'],
    );
  }

  if (values.length > 0) {
    await pool.query(
      `INSERT INTO despesas (
        usuario_id, descricao, data_vencimento, data_compra,
        mes, ano, categoria_id, cartao_id, forma_pagamento,
        observacoes, pago,
        grupo_parcelamento_id, recorrente, conta_id,
        valor_original, valor_final, valor
      ) VALUES ${values.join(', ')}`,
      params,
    );
  }

  await pool.query(
    `UPDATE despesas SET grupo_parcelamento_id = $1 WHERE id = $2`,
    [baseExpense['id'], baseExpense['id']],
  );
}

// GET /api/expenses
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, usuario_id, conta_id } = req.query as Record<string, string | undefined>;
    const { where, params } = await buildWhereClause(req.user!.id, req.user!.type, usuario_id, mes, ano, conta_id);

    const result = await pool.query(
      `SELECT d.*, c.nome AS categoria_nome, ct.nome AS cartao_nome, ct.tipo AS cartao_tipo
       FROM despesas d
       LEFT JOIN categorias c ON d.categoria_id = c.id
       LEFT JOIN cartoes ct ON d.cartao_id = ct.id
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
    const { conta_id } = req.query as Record<string, string | undefined>;

    let whereClause = 'WHERE usuario_id = $1';
    const params: unknown[] = [req.user!.id];

    if (conta_id) {
      const accountResult = await pool.query('SELECT tipo FROM contas WHERE id = $1 AND usuario_id = $2', [parseInt(conta_id), req.user!.id]);
      if (accountResult.rows.length > 0) {
        // Uniao: categorias PADRAO do tipo da conta ativa OU categorias
        // CUSTOM exclusivas deste conta_id especifico.
        params.push((accountResult.rows[0] as { tipo: string }).tipo, parseInt(conta_id));
        whereClause += ` AND (tipo = $${params.length - 1} OR conta_id = $${params.length})`;
      }
    }

    const result = await pool.query(
      `SELECT * FROM categorias ${whereClause} ORDER BY nome ASC`,
      params,
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to get categories' });
  }
});

// GET /api/expenses/suggestions?descricao=&categoria_id=
router.get('/suggestions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { descricao, categoria_id } = req.query as Record<string, string | undefined>;
    const userId = req.user!.id;
    const normalizedDescricao = descricao?.trim();
    const parsedCategoryId = categoria_id ? parseInt(categoria_id, 10) : null;

    const matches = normalizedDescricao
      ? await pool.query(
          `SELECT descricao, valor_final, valor_original, categoria_id, forma_pagamento,
                  COUNT(*) OVER (PARTITION BY LOWER(descricao)) AS frequencia,
                  data_vencimento
           FROM despesas
           WHERE usuario_id = $1 AND descricao ILIKE $2
           ORDER BY frequencia DESC, data_vencimento DESC
           LIMIT 4`,
          [userId, `%${normalizedDescricao}%`],
        )
      : { rows: [] as Record<string, unknown>[] };

    let formaPagamentoSugerida: string | null = null;

    if (Number.isFinite(parsedCategoryId)) {
      const porCategoria = await pool.query(
        `SELECT forma_pagamento, COUNT(*) AS total
         FROM despesas
         WHERE usuario_id = $1 AND categoria_id = $2
         GROUP BY forma_pagamento
         ORDER BY total DESC
         LIMIT 1`,
        [userId, parsedCategoryId],
      );
      if (porCategoria.rows.length > 0) {
        formaPagamentoSugerida = (porCategoria.rows[0] as { forma_pagamento: string }).forma_pagamento;
      }
    }

    if (!formaPagamentoSugerida) {
      const geral = await pool.query(
        `SELECT forma_pagamento, COUNT(*) AS total
         FROM despesas
         WHERE usuario_id = $1
         GROUP BY forma_pagamento
         ORDER BY total DESC
         LIMIT 1`,
        [userId],
      );
      if (geral.rows.length > 0) {
        formaPagamentoSugerida = (geral.rows[0] as { forma_pagamento: string }).forma_pagamento;
      }
    }

    let cartaoSugerido: Record<string, unknown> | null = null;

    if (formaPagamentoSugerida === 'credito' || formaPagamentoSugerida === 'debito') {
      const cartaoMaisUsado = await pool.query(
        `SELECT c.id, COUNT(d.id) AS total_usos
         FROM cartoes c
         LEFT JOIN despesas d ON d.cartao_id = c.id AND d.forma_pagamento = $2
         WHERE c.usuario_id = $1 AND c.ativo = true
         GROUP BY c.id
         ORDER BY total_usos DESC
         LIMIT 1`,
        [userId, formaPagamentoSugerida],
      );
      if (cartaoMaisUsado.rows.length > 0) {
        const row = cartaoMaisUsado.rows[0] as { id: number };
        cartaoSugerido = { id: row.id };
      }
    }

    res.json({
      success: true,
      data: {
        matches: matches.rows,
        forma_pagamento_sugerida: formaPagamentoSugerida,
        cartao_sugerido: cartaoSugerido,
      },
    });
  } catch (error) {
    console.error('Get expense suggestions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get expense suggestions' });
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
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        descricao, valor_original, valor_final, data_vencimento, data_compra, data_pagamento,
        categoria_id, cartao_id, forma_pagamento,
        parcelado, total_parcelas, parcela_atual, parcelas_ja_pagas, observacoes, pago,
        valor_pago, anexos, recorrente, recorrencia_mensal, conta_id,
        numero_nf, data_emissao_nf, tipo_despesa,
      } = req.body as Record<string, unknown>;

      const totalInstallments = total_parcelas ?? null;
      const currentInstallment = parcela_atual ?? (parcelado ? 1 : null);
      const cardIdFinal = await validateCardId(cartao_id, req.user!.id);
      const cardCompatibilityError = await validateCardTypeCompatibility(cardIdFinal, forma_pagamento, req.user!.id);
      if (cardCompatibilityError) {
        res.status(400).json({ success: false, message: cardCompatibilityError });
        return;
      }
      const attachmentsJson = Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

      const parsedCategoryId = categoria_id ? parseInt(String(categoria_id), 10) : NaN;
      const categoryFinal = Number.isFinite(parsedCategoryId) ? parsedCategoryId : null;

      const valorFinalCalculado = valor_final
        ? parseFloat(String(valor_final))
        : parseFloat(String(valor_original));

      // Mês/ano do lançamento sempre derivados da data de vencimento, nunca do
      // mês que o client tinha aberto na tela no momento do cadastro.
      const { mes, ano } = getMonthYearFromIsoDate(data_vencimento as string);

      // Data de vencimento já passada (ou é hoje) e forma de pagamento não é
      // cartão de crédito (que entra na fatura, paga depois): já nasce paga.
      const dataReferencia = (data_pagamento as string) || (data_vencimento as string);
      const isRetroativaEPagavelNaHora = forma_pagamento !== 'credito' && dataReferencia <= getTodayIsoInTimezone();
      const pagoFinal = Boolean(pago) || isRetroativaEPagavelNaHora;
      const dataPagamentoFinal = pagoFinal ? (dataReferencia) : null;
      const valorPagoFinal = pagoFinal
        ? (valor_pago ? parseFloat(String(valor_pago)) : valorFinalCalculado)
        : null;

      const result = await pool.query(
        `INSERT INTO despesas (
          usuario_id, descricao, data_vencimento, data_compra, data_pagamento,
          mes, ano, categoria_id, cartao_id, forma_pagamento,
          parcelado, numero_parcelas, parcela_atual, observacoes, pago,
          valor_original, valor_final, valor, valor_pago, anexos, recorrente, conta_id,
          numero_nf, data_emissao_nf, tipo_despesa
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        RETURNING *`,
        [
          req.user!.id, descricao, data_vencimento,
          (data_compra as string) || null, dataPagamentoFinal, mes, ano,
          categoryFinal, cardIdFinal, forma_pagamento ?? 'dinheiro',
          parcelado ?? false, totalInstallments, currentInstallment,
          observacoes ?? null, pagoFinal,
          valor_original ? parseFloat(String(valor_original)) : null,
          valorFinalCalculado,
          valorFinalCalculado,
          valorPagoFinal,
          attachmentsJson, recorrente ?? false,
          conta_id ? parseInt(String(conta_id)) : null,
          (numero_nf as string) || null, (data_emissao_nf as string) || null,
          (tipo_despesa as string) || null,
        ],
      );

      const created = result.rows[0] as Record<string, unknown>;

      if (parcelado && totalInstallments && Number(totalInstallments) > 1) {
        const installmentsAlreadyPaid = parcelas_ja_pagas ? Number(parcelas_ja_pagas) : 0;
        await createFutureInstallments(req.user!.id, created, Number(totalInstallments), installmentsAlreadyPaid);
      } else if (recorrencia_mensal) {
        const MONTHLY_RECURRENCE_OCCURRENCES = 12;
        await createRecurringOccurrences(req.user!.id, created, MONTHLY_RECURRENCE_OCCURRENCES);
      }

      res.status(201).json({ success: true, message: 'Expense created', data: created });
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({ success: false, message: 'Nao foi possivel registrar a despesa. Tente novamente.' });
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
      anexos, parcelado, recorrente, conta_id,
      numero_nf, data_emissao_nf, tipo_despesa,
    } = req.body as Record<string, unknown>;

    const cardIdFinal = await validateCardId(cartao_id, req.user!.id);
    const cardCompatibilityError = await validateCardTypeCompatibility(cardIdFinal, forma_pagamento, req.user!.id);
    if (cardCompatibilityError) {
      res.status(400).json({ success: false, message: cardCompatibilityError });
      return;
    }
    const attachmentsJson = Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

    const valorFinalCalculado = valor_final
      ? parseFloat(String(valor_final))
      : (valor_original ? parseFloat(String(valor_original)) : null);

    // Mesma regra da criação: mês/ano seguem a data de vencimento, e uma data
    // já vencida (fora do crédito) mantém/assume status pago automaticamente.
    const { mes, ano } = getMonthYearFromIsoDate(data_vencimento as string);
    const dataReferencia = (data_pagamento as string) || (data_vencimento as string);
    const isRetroativaEPagavelNaHora = forma_pagamento !== 'credito' && dataReferencia <= getTodayIsoInTimezone();
    const pagoFinal = Boolean(pago) || isRetroativaEPagavelNaHora;
    const dataPagamentoFinal = pagoFinal ? dataReferencia : null;
    const valorPagoFinal = pagoFinal
      ? (valor_pago ? parseFloat(String(valor_pago)) : valorFinalCalculado)
      : null;

    const result = await pool.query(
      `UPDATE despesas
       SET descricao = $1, data_vencimento = $2, data_compra = $3,
           data_pagamento = $4, categoria_id = $5, cartao_id = $6,
           forma_pagamento = $7, observacoes = $8, pago = $9,
           numero_parcelas = $10, parcela_atual = $11,
           valor_original = $12, valor_final = $13, valor_pago = $14,
           anexos = $15,
           mes = $16, ano = $17,
           parcelado = COALESCE($18, parcelado),
           recorrente = COALESCE($19, recorrente),
           conta_id = COALESCE($20, conta_id),
           numero_nf = $21, data_emissao_nf = $22, tipo_despesa = $23
       WHERE id = $24 AND usuario_id = $25
       RETURNING *`,
      [
        descricao, data_vencimento, (data_compra as string) || null,
        dataPagamentoFinal, categoria_id ?? null, cardIdFinal, forma_pagamento,
        observacoes ?? null, pagoFinal,
        total_parcelas ?? null, parcela_atual ?? null,
        valor_original ? parseFloat(String(valor_original)) : null,
        valorFinalCalculado,
        valorPagoFinal,
        attachmentsJson,
        mes,
        ano,
        parcelado !== undefined ? parcelado : null,
        recorrente !== undefined ? recorrente : null,
        conta_id ? parseInt(String(conta_id)) : null,
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

    const paymentDate = data_pagamento ?? getTodayIsoInTimezone();

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

// POST /api/despesas/:id/mover — move vencimento para o mesmo dia do proximo mes
router.post('/:id/mover', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = parseInt(req.params['id']!);

    const existing = await pool.query(
      `SELECT data_vencimento, pago FROM despesas WHERE id = $1 AND usuario_id = $2`,
      [expenseId, req.user!.id],
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }

    const despesa = existing.rows[0] as { data_vencimento: string; pago: boolean };

    if (despesa.pago) {
      res.status(400).json({ success: false, message: 'Cannot move a paid expense' });
      return;
    }

    const [year, month, day] = despesa.data_vencimento.split('-').map(Number) as [number, number, number];

    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    // Ajusta o dia se o mes seguinte nao tiver esse dia (ex: 31/jan -> ultimo dia de fev)
    const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate();
    const nextDay = Math.min(day, lastDayOfNextMonth);

    const newDueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;

    const result = await pool.query(
      `UPDATE despesas SET data_vencimento = $1, mes = $2, ano = $3 WHERE id = $4 AND usuario_id = $5 RETURNING *`,
      [newDueDate, nextMonth - 1, nextYear, expenseId, req.user!.id],
    );

    res.json({ success: true, message: 'Expense moved to next month', data: result.rows[0] });
  } catch (error) {
    console.error('Move expense error:', error);
    res.status(500).json({ success: false, message: 'Failed to move expense' });
  }
});

// GET /api/despesas/parcelas-futuras?mes=X&ano=Y&meses=3
router.get('/parcelas-futuras', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes: mesQ, ano: anoQ, meses: mesesQ, conta_id } = req.query as Record<string, string | undefined>;
    const mes = parseInt(mesQ ?? '');
    const ano = parseInt(anoQ ?? '');
    const meses = parseInt(mesesQ ?? '3');

    if (isNaN(mes) || mes < 0 || mes > 11) {
      res.status(400).json({ success: false, message: 'Parâmetro mes inválido (0-11)' });
      return;
    }
    if (isNaN(ano) || ano < 2000 || ano > 2100) {
      res.status(400).json({ success: false, message: 'Parâmetro ano inválido' });
      return;
    }

    const userId = req.user!.id;
    const accountId = conta_id ? parseInt(conta_id) : null;
    const limiteMeses = Math.min(Math.max(meses || 3, 1), 12);

    const result = await pool.query(
      `SELECT mes, ano,
        SUM(
          CASE WHEN parcela_atual = 1 AND numero_parcelas > 1
               THEN COALESCE(valor_final, valor_original)::float / NULLIF(numero_parcelas, 0)
               ELSE COALESCE(valor_final, valor_original)::float
          END
        ) AS total
       FROM despesas
       WHERE usuario_id = $1
         AND parcelado = true
         AND pago = false
         AND (ano * 12 + mes) > ($2 * 12 + $3)
         AND (ano * 12 + mes) <= ($2 * 12 + $3 + $4)
         AND ($5::int IS NULL OR conta_id = $5 OR (conta_id IS NULL AND EXISTS (
           SELECT 1 FROM contas pf WHERE pf.id = $5 AND pf.tipo = 'pessoal' AND pf.usuario_id = $1
         )))
       GROUP BY mes, ano
       ORDER BY ano, mes`,
      [userId, ano, mes, limiteMeses, accountId],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Parcelas futuras error:', error);
    res.status(500).json({ success: false, message: 'Failed to load future installments' });
  }
});

export default router;
