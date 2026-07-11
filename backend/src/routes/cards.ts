import { Router, Request, Response } from 'express';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { cards, expenses } from '../db/schema';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/cards
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { usuario_id, perfil_id } = req.query as Record<string, string | undefined>;
    const targetUserId = usuario_id && req.user!.type === 'master' ? parseInt(usuario_id) : req.user!.id;

    let whereClause = 'WHERE c.usuario_id = $1';
    const params: unknown[] = [targetUserId];

    if (perfil_id) {
      whereClause += ` AND (c.perfil_id = $2 OR (c.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $2 AND p.tipo = 'pessoal' AND p.usuario_id = $1)))`;
      params.push(parseInt(perfil_id));
    }

    const result = await pool.query(
      `SELECT c.id, c.nome, c.limite, c.dia_fechamento, c.dia_vencimento, c.cor, c.ativo,
              c.numero_cartao, c.validade, c.perfil_id, c.data_criacao, c.data_atualizacao
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
    const { nome, limite, dia_fechamento, dia_vencimento, cor, validade, perfil_id } =
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

    const profileId = perfil_id ? parseInt(String(perfil_id)) : null;

    const countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM cartoes WHERE usuario_id = $1 AND perfil_id IS NOT DISTINCT FROM $2',
      [req.user!.id, profileId],
    );
    if (parseInt((countResult.rows[0] as { total: string }).total) >= 3) {
      res.status(400).json({ success: false, message: 'Maximum of 3 cards allowed per profile' });
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
      `INSERT INTO cartoes (usuario_id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao, validade, perfil_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (usuario_id, LOWER(nome), COALESCE(perfil_id, 0)) DO NOTHING
       RETURNING id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao, validade, perfil_id, data_criacao, data_atualizacao`,
      [req.user!.id, String(nome).trim(), parseFloat(String(limite)), parseInt(String(dia_fechamento)) || 1, parseInt(String(dia_vencimento)) || 1, cor ?? '#3498db', true, nextNum, validade ?? null, profileId],
    );

    res.status(201).json({ success: true, message: 'Card created', data: result.rows[0] });
  } catch (error) {
    console.error('Create card error:', error);
    res.status(500).json({ success: false, message: 'Failed to create card' });
  }
});

// PUT /api/cards (bulk replace — legacy)
router.put('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cartoes } = req.body as { cartoes: Record<string, unknown>[] };

    if (!Array.isArray(cartoes)) {
      res.status(400).json({ success: false, message: 'Expected an array of cards' });
      return;
    }
    if (cartoes.length > 3) {
      res.status(400).json({ success: false, message: 'Maximum of 3 cards allowed' });
      return;
    }

    for (let i = 0; i < cartoes.length; i++) {
      const c = cartoes[i]!;
      if (!c['nome'] || String(c['nome']).trim() === '') {
        res.status(400).json({ success: false, message: `Card ${i + 1}: name is required` });
        return;
      }
      if (!c['limite'] || Number(c['limite']) <= 0) {
        res.status(400).json({ success: false, message: `Card ${i + 1}: limit must be greater than zero` });
        return;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM cartoes WHERE usuario_id = $1', [req.user!.id]);

      const inserted: unknown[] = [];
      for (let i = 0; i < cartoes.length; i++) {
        const c = cartoes[i]!;
        const r = await client.query(
          `INSERT INTO cartoes (usuario_id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao`,
          [req.user!.id, String(c['nome']).trim(), parseFloat(String(c['limite'])), parseInt(String(c['dia_fechamento'])) || 1, parseInt(String(c['dia_vencimento'])) || 10, c['cor'] ?? '#3498db', true, c['numero_cartao'] ?? i + 1],
        );
        inserted.push(r.rows[0]);
      }

      await client.query('COMMIT');
      res.json({ success: true, message: 'Cards saved', data: inserted });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Bulk update cards error:', error);
    res.status(500).json({ success: false, message: 'Failed to save cards' });
  }
});

// PUT /api/cards/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const cardId = parseInt(req.params['id']!);
    const { nome, limite, dia_fechamento, dia_vencimento, cor, ativo, validade, perfil_id } =
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

    const [existing] = await db.select({ id: cards.id, name: cards.name }).from(cards)
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

    const result = await pool.query(
      `UPDATE cartoes
       SET nome = $1, limite = $2, dia_fechamento = $3, dia_vencimento = $4, cor = $5,
           ativo = $6, validade = $7, perfil_id = $8, data_atualizacao = CURRENT_TIMESTAMP
       WHERE id = $9 AND usuario_id = $10
       RETURNING id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, validade, perfil_id, data_criacao, data_atualizacao`,
      [String(nome).trim(), parseFloat(String(limite)), parseInt(String(dia_fechamento)) || 1, parseInt(String(dia_vencimento)) || 1, cor ?? '#3498db', ativo !== undefined ? ativo : true, validade ?? null, perfil_id ? parseInt(String(perfil_id)) : null, cardId, req.user!.id],
    );

    res.json({ success: true, message: 'Card updated', data: result.rows[0] });
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

    const [existing] = await db.select({ id: cards.id, name: cards.name }).from(cards)
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
