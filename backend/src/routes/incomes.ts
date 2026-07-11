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
): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  let p = 0;

  const targetUserId = queryUserId && userType === 'master' ? parseInt(queryUserId) : userId;
  p++;
  let where = `WHERE r.usuario_id = $${p}`;
  params.push(targetUserId);

  if (mes !== undefined && ano !== undefined) {
    where += ` AND r.mes = $${p + 1} AND r.ano = $${p + 2}`;
    params.push(parseInt(mes), parseInt(ano));
    p += 2;
  }

  if (perfilId) {
    p++;
    where += ` AND (r.perfil_id = $${p} OR (r.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis pf WHERE pf.id = $${p} AND pf.tipo = 'pessoal' AND pf.usuario_id = r.usuario_id)))`;
    params.push(parseInt(perfilId));
  }

  return { where, params };
}

// GET /api/incomes
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, usuario_id, perfil_id } = req.query as Record<string, string | undefined>;
    const { where, params } = buildWhereClause(req.user!.id, req.user!.type, usuario_id, mes, ano, perfil_id);

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

// POST /api/incomes
router.post(
  '/',
  authenticate,
  [
    body('descricao').notEmpty().withMessage('Description is required'),
    body('valor').isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero'),
    body('data_recebimento').isISO8601().withMessage('Invalid date'),
    body('mes').isInt({ min: 0, max: 11 }).withMessage('Invalid month'),
    body('ano').isInt({ min: 2000 }).withMessage('Invalid year'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { descricao, valor, data_recebimento, mes, ano, observacoes, anexos, perfil_id, cliente, tipo_receita, representante_id } =
        req.body as Record<string, unknown>;

      const attachmentsJson = Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

      const { valor_comissao } = req.body as Record<string, unknown>;
      const representanteIdInt = representante_id ? parseInt(String(representante_id)) : null;

      const result = await pool.query(
        `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, observacoes, anexos, perfil_id, cliente, tipo_receita, representante_id, valor_comissao)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
          perfil_id ? parseInt(String(perfil_id)) : null,
          cliente ?? null,
          tipo_receita ?? null,
          representanteIdInt,
          valor_comissao != null ? parseFloat(String(valor_comissao)) : null,
        ],
      );

      // Auto-criar despesa de comissão sempre que houver representante vinculado
      if (representanteIdInt) {
        const repResult = await pool.query(
          'SELECT nome FROM representantes WHERE id = $1 AND usuario_id = $2',
          [representanteIdInt, req.user!.id],
        );

        if (repResult.rows.length > 0) {
          const repNome = (repResult.rows[0] as { nome: string }).nome;

          // Buscar ou criar categoria "Comissão"
          let catResult = await pool.query(
            `SELECT id FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = 'comissão' LIMIT 1`,
            [req.user!.id],
          );
          if (catResult.rows.length === 0) {
            catResult = await pool.query(
              `INSERT INTO categorias (usuario_id, nome, cor, icone) VALUES ($1, 'Comissão', '#f59e0b', 'handshake') RETURNING id`,
              [req.user!.id],
            );
          }
          const categoriaId = (catResult.rows[0] as { id: number }).id;

          const numResult = await pool.query(
            'SELECT COALESCE(MAX(numero), 0) + 1 AS proximo FROM despesas WHERE usuario_id = $1',
            [req.user!.id],
          );
          const proximoNumero = (numResult.rows[0] as { proximo: number }).proximo;

          const valorCom =
            valor_comissao != null && parseFloat(String(valor_comissao)) > 0
              ? parseFloat(String(valor_comissao))
              : 0.01;

          await pool.query(
            `INSERT INTO despesas (usuario_id, descricao, valor_original, valor_final,
              data_vencimento, mes, ano, categoria_id, forma_pagamento, pago, recorrente, perfil_id, numero)
             VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'dinheiro', false, false, $8, $9)`,
            [
              req.user!.id,
              `Comissão - ${repNome}`,
              valorCom,
              data_recebimento,
              mes,
              ano,
              categoriaId,
              perfil_id ? parseInt(String(perfil_id)) : null,
              proximoNumero,
            ],
          );
        }
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
    const { descricao, valor, data_recebimento, observacoes, anexos, perfil_id, cliente, tipo_receita, representante_id } =
      req.body as Record<string, unknown>;

    const attachmentsJson = Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

    const result = await pool.query(
      `UPDATE receitas
       SET descricao = $1, valor = $2, data_recebimento = $3, observacoes = $4, anexos = $5,
           perfil_id = COALESCE($6, perfil_id),
           cliente = $7, tipo_receita = $8, representante_id = $9
       WHERE id = $10 AND usuario_id = $11
       RETURNING *`,
      [
        descricao,
        parseFloat(String(valor)),
        data_recebimento,
        observacoes ?? null,
        attachmentsJson,
        perfil_id ? parseInt(String(perfil_id)) : null,
        cliente ?? null,
        tipo_receita ?? null,
        representante_id ? parseInt(String(representante_id)) : null,
        incomeId,
        req.user!.id,
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
       WHERE id = $3 AND usuario_id = $4 AND status = 'prevista'
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
