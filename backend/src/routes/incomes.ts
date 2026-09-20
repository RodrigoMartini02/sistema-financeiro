import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getMonthYearFromIsoDate } from '../utils/date';
import { buildOwnerAndAccountWhere } from '../utils/ownerAndAccountWhere';
import { resolveVisibleUserIds, resolveOwnerForWrite } from '../utils/familyVisibility';
import { canWriteToAccount, ACCOUNT_ACCESS_DENIED } from '../utils/accountAccess';
import { createCommissionExpense } from '../services/commissionService';
import { EstoqueError, registrarMovimentacaoEstoqueNaTransacao } from '../services/estoque';

const router = Router();

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
      `SELECT r.*, rep.nome AS representante_nome, COALESCE(ct.nome, u.nome) AS autor_nome
       FROM receitas r
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
        produto_id, quantidade_vendida,
      } = req.body as Record<string, unknown>;

      if (!(await canWriteToAccount(conta_id ? parseInt(String(conta_id)) : null, req.user!.id))) {
        res.status(400).json({ success: false, message: ACCOUNT_ACCESS_DENIED });
        return;
      }

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

      // Venda de produto do catalogo: so baixa estoque quando os dois campos
      // vem juntos. Quantidade sem produto (ou o contrario) e lancamento
      // avulso — o valor da receita segue livre de qualquer forma.
      const produtoIdVenda = produto_id ? String(produto_id) : null;
      const qtdVendida = quantidade_vendida != null ? parseFloat(String(quantidade_vendida)) : null;
      const baixaEstoque = produtoIdVenda && qtdVendida != null && qtdVendida > 0;

      const client = await pool.connect();
      let result: { rows: unknown[] } = { rows: [] };
      try {
        await client.query('BEGIN');

        result = await client.query(
          `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, observacoes, anexos, conta_id, cliente, tipo_receita, representante_id, valor_comissao, contrato_id, produto_id, quantidade_vendida)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
            baixaEstoque ? produtoIdVenda : null,
            baixaEstoque ? qtdVendida : null,
          ],
        );

        // Na mesma transacao do INSERT: falhar aqui desfaz a receita tambem,
        // nunca deixa estoque baixado sem a venda correspondente.
        if (baixaEstoque) {
          const receitaCriada = result.rows[0] as { id: number };
          await registrarMovimentacaoEstoqueNaTransacao(client, {
            produtoId: produtoIdVenda!,
            usuarioId: req.user!.id,
            tipo: 'saida',
            quantidade: qtdVendida!,
            motivo: 'Venda registrada em receita',
            receitaId: receitaCriada.id,
          });
        }

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
      // Estoque insuficiente e erro do usuario, nao falha do servidor: a
      // mensagem diz quanto ha disponivel para ele corrigir a quantidade.
      if (error instanceof EstoqueError) {
        const status = error.code === 'PRODUTO_NAO_ENCONTRADO' ? 404 : 400;
        res.status(status).json({ success: false, code: error.code, message: error.message });
        return;
      }
      console.error('Create income error:', error);
      res.status(500).json({ success: false, message: 'Failed to create income' });
    }
  },
);

// PUT /api/incomes/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const incomeId = parseInt(req.params['id']!);
    const donoWrite = await resolveOwnerForWrite('receitas', incomeId, req.user!.id);
    if (donoWrite === null) {
      res.status(404).json({ success: false, message: 'Income not found' });
      return;
    }

    const { descricao, valor, data_recebimento, observacoes, anexos, conta_id, cliente, tipo_receita, representante_id } =
      req.body as Record<string, unknown>;

    if (!(await canWriteToAccount(conta_id ? parseInt(String(conta_id)) : null, req.user!.id))) {
      res.status(400).json({ success: false, message: ACCOUNT_ACCESS_DENIED });
      return;
    }

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
        donoWrite,
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

// PUT /api/incomes/:id/cancelar
router.put('/:id/cancelar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const incomeId = parseInt(req.params['id']!);
    const donoWrite = await resolveOwnerForWrite('receitas', incomeId, req.user!.id);
    if (donoWrite === null) {
      res.status(404).json({ success: false, message: 'Income not found' });
      return;
    }

    const receitaResult = await pool.query(
      'SELECT representante_id, mes, ano FROM receitas WHERE id = $1 AND usuario_id = $2',
      [incomeId, donoWrite],
    );

    if (receitaResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Income not found' });
      return;
    }

    const receita = receitaResult.rows[0] as { representante_id: number | null; mes: number; ano: number };

    await pool.query(
      "UPDATE receitas SET status = 'cancelada' WHERE id = $1 AND usuario_id = $2",
      [incomeId, donoWrite],
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
    const donoWrite = await resolveOwnerForWrite('receitas', incomeId, req.user!.id);
    if (donoWrite === null) {
      res.status(404).json({ success: false, message: 'Income not found' });
      return;
    }

    const result = await pool.query(
      'DELETE FROM receitas WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [incomeId, donoWrite],
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
