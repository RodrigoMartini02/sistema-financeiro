import { Router, Request, Response } from 'express';
import { eq, and, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { cards, expenses } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { accountWhere } from '../utils/accountFilter';
import { resolveVisibleCardOwnerIds } from '../utils/familyVisibility';
import { canWriteToAccount, ACCOUNT_ACCESS_DENIED } from '../utils/accountAccess';
import { getCardLimits } from '../services/cardLimitService';
import { moveDueDateToDay, parseEffectiveMonth } from '../services/cardDueDate';
import { ACTIVE_STATUS } from '../services/entryQueries';
import type { PaymentMethod } from '../services/expenseInput';

const router = Router();
const VALIDADE_REGEX = /^\d{2}\/\d{2}$/;
const TIPOS_VALIDOS = ['credito', 'debito', 'ambos'];
const COR_REGEX = /^#[0-9a-fA-F]{6}$/;
const INVALID_COLOR = 'Cor inválida';
const INVALID_EFFECTIVE_MONTH = 'Mês de vigência inválido';
// Só o crédito tem fatura: o débito de um cartão "ambos" vence na data da compra.
const CREDIT_PAYMENT_METHOD: PaymentMethod = 'credito';

function isInvalidColor(cor: unknown): boolean {
  return cor !== undefined && cor !== null && !COR_REGEX.test(String(cor));
}

// GET /api/cards
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { usuario_id, conta_id, escopo } = req.query as Record<string, string | undefined>;
    const targetUserId = usuario_id && req.user!.type === 'admin' ? parseInt(usuario_id) : req.user!.id;

    // Com a permissao de cartoes da familia, o membro pode enxergar tambem os
    // cartoes dos demais — para poder registrar um gasto feito no cartao de
    // outra pessoa, ou para ver a lista completa quando pede explicitamente
    // (escopo=familia). Por padrao, so os proprios cartoes.
    const donosVisiveis = await resolveVisibleCardOwnerIds(req.user!.id, conta_id ? parseInt(conta_id) : null, escopo === 'familia');

    let whereClause: string;
    const params: unknown[] = [];
    if (donosVisiveis.length > 1) {
      params.push(donosVisiveis);
      whereClause = 'WHERE c.usuario_id = ANY($1)';
    } else {
      params.push(targetUserId);
      whereClause = 'WHERE c.usuario_id = $1';
    }

    const accountClause = accountWhere(conta_id ? parseInt(conta_id) : null, 2, 'c');
    whereClause += accountClause.clause;
    params.push(...accountClause.params);

    const result = await pool.query(
      `SELECT c.id, c.nome, c.limite, c.dia_fechamento, c.dia_vencimento, c.cor, c.ativo,
              c.numero_cartao, c.validade, c.conta_id, c.tipo, c.data_criacao, c.data_atualizacao
       FROM cartoes c
       ${whereClause}
       ORDER BY c.numero_cartao ASC NULLS LAST, c.id ASC`,
      params,
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List cards error:', error);
    res.status(500).json({ success: false, message: 'Failed to list cards' });
  }
});

// GET /api/cards/limites — deve vir antes de /:id para não colidir com o parâmetro
router.get('/limites', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { conta_id, escopo } = req.query as Record<string, string | undefined>;
    const accountId = conta_id ? parseInt(conta_id) : null;
    const data = await getCardLimits(req.user!.id, accountId, escopo === 'familia');
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get card limits error:', error);
    res.status(500).json({ success: false, message: 'Failed to get card limits' });
  }
});

// GET /api/cards/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const cardId = parseInt(req.params['id']!);
    if (isNaN(cardId)) {
      res.status(400).json({ success: false, message: 'Card ID must be a valid number' });
      return;
    }

    const [card] = await db.select().from(cards)
      .where(and(eq(cards.id, cardId), eq(cards.userId, req.user!.id))).limit(1);

    if (!card) {
      res.status(404).json({ success: false, message: 'Card not found' });
      return;
    }

    res.json({ success: true, data: card });
  } catch (error) {
    console.error('Get card error:', error);
    res.status(500).json({ success: false, message: 'Failed to get card' });
  }
});

// POST /api/cards
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, limite, dia_fechamento, dia_vencimento, cor, validade, conta_id, tipo } =
      req.body as Record<string, string | number | undefined>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Card name is required' });
      return;
    }
    if (String(nome).length > 255) {
      res.status(400).json({ success: false, message: 'Card name must be at most 255 characters' });
      return;
    }
    if (!limite || Number(limite) <= 0) {
      res.status(400).json({ success: false, message: 'Limit must be greater than zero' });
      return;
    }
    if (Number(limite) > 999999.99) {
      res.status(400).json({ success: false, message: 'Maximum limit is 999,999.99' });
      return;
    }
    if (validade && !VALIDADE_REGEX.test(String(validade))) {
      res.status(400).json({ success: false, message: 'Validade must be in MM/AA format' });
      return;
    }
    if (tipo && !TIPOS_VALIDOS.includes(String(tipo))) {
      res.status(400).json({ success: false, message: 'Tipo must be one of: credito, debito, ambos' });
      return;
    }
    if (isInvalidColor(cor)) {
      res.status(400).json({ success: false, message: INVALID_COLOR });
      return;
    }

    const accountId = conta_id ? parseInt(String(conta_id)) : null;
    if (!(await canWriteToAccount(accountId, req.user!.id))) {
      res.status(400).json({ success: false, message: ACCOUNT_ACCESS_DENIED });
      return;
    }

    const countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM cartoes WHERE usuario_id = $1 AND conta_id IS NOT DISTINCT FROM $2',
      [req.user!.id, accountId],
    );
    if (parseInt((countResult.rows[0] as { total: string }).total) >= 3) {
      res.status(400).json({ success: false, message: 'Maximum of 3 cards allowed per account' });
      return;
    }

    const duplicateResult = await pool.query(
      'SELECT id FROM cartoes WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2)',
      [req.user!.id, String(nome).trim()],
    );
    if (duplicateResult.rows.length > 0) {
      res.status(400).json({ success: false, message: 'A card with this name already exists' });
      return;
    }

    const nextNumResult = await pool.query(
      'SELECT COALESCE(MAX(numero_cartao), 0) + 1 AS next FROM cartoes WHERE usuario_id = $1',
      [req.user!.id],
    );
    const nextNum = (nextNumResult.rows[0] as { next: number }).next;

    const result = await pool.query(
      `INSERT INTO cartoes (usuario_id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao, validade, conta_id, tipo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (usuario_id, LOWER(nome), COALESCE(conta_id, 0)) DO NOTHING
       RETURNING id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao, validade, conta_id, tipo, data_criacao, data_atualizacao`,
      [req.user!.id, String(nome).trim(), parseFloat(String(limite)), parseInt(String(dia_fechamento)) || 1, parseInt(String(dia_vencimento)) || 1, cor ?? '#3498db', true, nextNum, validade ?? null, accountId, tipo ?? null],
    );

    res.status(201).json({ success: true, message: 'Card created', data: result.rows[0] });
  } catch (error) {
    console.error('Create card error:', error);
    res.status(500).json({ success: false, message: 'Failed to create card' });
  }
});

// PUT /api/cards/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const cardId = parseInt(req.params['id']!);
    const { nome, limite, dia_fechamento, dia_vencimento, cor, ativo, validade, conta_id, tipo, vigente_desde } =
      req.body as Record<string, string | number | boolean | undefined>;

    if (isNaN(cardId)) {
      res.status(400).json({ success: false, message: 'Card ID must be a valid number' });
      return;
    }
    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Card name is required' });
      return;
    }
    if (!limite || Number(limite) <= 0) {
      res.status(400).json({ success: false, message: 'Limit must be greater than zero' });
      return;
    }
    if (validade && !VALIDADE_REGEX.test(String(validade))) {
      res.status(400).json({ success: false, message: 'Validade must be in MM/AA format' });
      return;
    }
    if (tipo && !TIPOS_VALIDOS.includes(String(tipo))) {
      res.status(400).json({ success: false, message: 'Tipo must be one of: credito, debito, ambos' });
      return;
    }
    if (isInvalidColor(cor)) {
      res.status(400).json({ success: false, message: INVALID_COLOR });
      return;
    }
    // Vigência (AAAA-MM): de qual fatura em diante o novo dia de vencimento vale
    // para as despesas já lançadas. Sem ela, só o cartão muda.
    const effectiveFrom = vigente_desde === undefined || vigente_desde === null ? null : parseEffectiveMonth(vigente_desde);
    if (vigente_desde !== undefined && vigente_desde !== null && !effectiveFrom) {
      res.status(400).json({ success: false, message: INVALID_EFFECTIVE_MONTH });
      return;
    }
    if (!(await canWriteToAccount(conta_id ? parseInt(String(conta_id)) : null, req.user!.id))) {
      res.status(400).json({ success: false, message: ACCOUNT_ACCESS_DENIED });
      return;
    }

    const [existing] = await db.select({ id: cards.id, name: cards.name, userId: cards.userId, dueDay: cards.dueDay }).from(cards)
      .where(and(eq(cards.id, cardId), eq(cards.userId, req.user!.id))).limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: 'Card not found' });
      return;
    }

    const duplicateResult = await pool.query(
      'SELECT id FROM cartoes WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2) AND id != $3',
      [req.user!.id, String(nome).trim(), cardId],
    );
    if (duplicateResult.rows.length > 0) {
      res.status(400).json({ success: false, message: 'A card with this name already exists' });
      return;
    }

    const newDueDay = parseInt(String(dia_vencimento)) || 1;
    // Cartão e despesas mudam juntos (ou nada muda).
    const { card, updatedExpenses } = await db.transaction(async (transaction) => {
      const [updatedCard] = await transaction.update(cards)
        .set({
          name: String(nome).trim(),
          limit: String(parseFloat(String(limite))),
          closingDay: parseInt(String(dia_fechamento)) || 1,
          dueDay: newDueDay,
          color: cor === undefined || cor === null ? '#3498db' : String(cor),
          active: ativo === undefined ? true : ativo === true || ativo === 'true',
          expiration: validade ? String(validade) : null,
          accountId: conta_id ? parseInt(String(conta_id)) : null,
          type: tipo ? String(tipo) : null,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(cards.id, cardId), eq(cards.userId, req.user!.id)))
        .returning({
          id: cards.id, nome: cards.name, limite: cards.limit, dia_fechamento: cards.closingDay, dia_vencimento: cards.dueDay,
          cor: cards.color, ativo: cards.active, validade: cards.expiration, conta_id: cards.accountId, tipo: cards.type,
          data_criacao: cards.createdAt, data_atualizacao: cards.updatedAt,
        });

      if (!effectiveFrom || existing.dueDay === newDueDay) {
        return { card: updatedCard, updatedExpenses: 0 };
      }

      // Despesas no crédito deste cartão (de quem quer que tenha lançado: a fatura
      // é do dono), ativas e não pagas, da fatura do mês de vigência em diante.
      // Cada uma fica na mesma fatura: só o dia de vencimento muda.
      const affected = await transaction.select({ id: expenses.id, dueDate: expenses.dueDate }).from(expenses)
        .where(and(
          eq(expenses.cardId, cardId),
          eq(expenses.paymentMethod, CREDIT_PAYMENT_METHOD),
          eq(expenses.status, ACTIVE_STATUS),
          or(eq(expenses.paid, false), isNull(expenses.paid)),
          gte(expenses.dueDate, effectiveFrom),
        ));
      const idsByDueDate = new Map<string, number[]>();
      for (const expense of affected) {
        const dueDate = moveDueDateToDay(String(expense.dueDate), newDueDay);
        if (dueDate !== String(expense.dueDate)) {
          idsByDueDate.set(dueDate, [...(idsByDueDate.get(dueDate) ?? []), expense.id]);
        }
      }
      // Uma atualização por data nova (no máximo uma por mês), não uma por despesa.
      let updatedCount = 0;
      for (const [dueDate, ids] of idsByDueDate) {
        await transaction.update(expenses).set({ dueDate }).where(inArray(expenses.id, ids));
        updatedCount += ids.length;
      }
      return { card: updatedCard, updatedExpenses: updatedCount };
    });

    res.json({ success: true, message: 'Card updated', data: { ...card, despesas_atualizadas: updatedExpenses } });
  } catch (error) {
    console.error('Update card error:', error);
    res.status(500).json({ success: false, message: 'Failed to update card' });
  }
});

// DELETE /api/cards/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const cardId = parseInt(req.params['id']!);
    if (isNaN(cardId)) {
      res.status(400).json({ success: false, message: 'Card ID must be a valid number' });
      return;
    }

    const [existing] = await db.select({ id: cards.id, name: cards.name, userId: cards.userId }).from(cards)
      .where(and(eq(cards.id, cardId), eq(cards.userId, req.user!.id))).limit(1);

    if (!existing) {
      res.status(404).json({ success: false, message: 'Card not found' });
      return;
    }

    const usageResult = await pool.query(
      'SELECT COUNT(*) AS total FROM despesas WHERE cartao_id = $1 AND usuario_id = $2',
      [cardId, req.user!.id],
    );
    const totalUses = parseInt((usageResult.rows[0] as { total: string }).total);
    if (totalUses > 0) {
      res.status(400).json({ success: false, message: `Cannot delete: card is used in ${totalUses} expense(s).` });
      return;
    }

    await db.delete(cards).where(and(eq(cards.id, cardId), eq(cards.userId, req.user!.id)));
    res.json({ success: true, message: `Card "${existing.name}" deleted` });
  } catch (error) {
    console.error('Delete card error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete card' });
  }
});

export default router;
