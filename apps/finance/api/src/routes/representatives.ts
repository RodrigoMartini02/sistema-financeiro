import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { canWriteToAccount, ACCOUNT_ACCESS_DENIED } from '../utils/accountAccess';
import { resolveAccountOwnerId } from '../utils/familyVisibility';
import { isClassificationAllowed, parseClassificationId } from '../services/incomeClassificationCatalog';

const router = Router();

const CLASSIFICATION_NOT_AVAILABLE = 'Classification not available for this account';

interface CommissionInput {
  classificacaoId: number;
  percentual: number;
  tipo: 'mensal' | 'unica';
}

/**
 * Regras de comissão do corpo: cada uma aponta para uma classificação do
 * catálogo da conta do representante. Null quando alguma não pertence à conta.
 */
async function readCommissions(
  requesterId: number,
  accountId: number | null,
  value: unknown,
): Promise<CommissionInput[] | null> {
  if (!Array.isArray(value)) return [];
  const commissions: CommissionInput[] = [];
  for (const item of value as Array<Record<string, unknown>>) {
    const classificacaoId = parseClassificationId(item['classificacao_id']);
    if (classificacaoId === undefined || classificacaoId === null || item['percentual'] == null) continue;
    if (Number.isNaN(classificacaoId) || !(await isClassificationAllowed(requesterId, accountId, classificacaoId))) return null;
    commissions.push({
      classificacaoId,
      percentual: parseFloat(String(item['percentual'])),
      tipo: item['tipo'] === 'unica' ? 'unica' : 'mensal',
    });
  }
  return commissions;
}

// GET /api/representatives
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { conta_id } = req.query as Record<string, string | undefined>;
    const incluirInativos = req.query['incluir_inativos'] === 'true';
    const ownerId = await resolveAccountOwnerId(req.user!.id, conta_id ? parseInt(conta_id) : null);

    const result = await pool.query(
      // O `c.ativo` do JOIN filtra comissões, não representantes — só o
      // `r.ativo` do WHERE responde ao parâmetro.
      `SELECT r.*,
         COALESCE(
           json_agg(json_build_object(
             'id', c.id, 'classificacao_id', c.classificacao_id, 'classificacao_nome', cr.nome,
             'percentual', c.percentual, 'tipo', c.tipo, 'ativo', c.ativo
           ) ORDER BY cr.nome) FILTER (WHERE c.id IS NOT NULL),
           '[]'
         ) AS comissoes
       FROM representantes r
       LEFT JOIN comissoes c ON c.representante_id = r.id AND c.ativo = true
       LEFT JOIN classificacoes_receita cr ON cr.id = c.classificacao_id
       WHERE r.usuario_id = $1 ${incluirInativos ? '' : 'AND r.ativo = true'}
         AND ($2::int IS NULL OR r.conta_id = $2)
       GROUP BY r.id
       ORDER BY r.nome ASC`,
      [ownerId, conta_id ? parseInt(conta_id) : null],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List representatives error:', error);
    res.status(500).json({ success: false, message: 'Failed to list representatives' });
  }
});

// POST /api/representatives
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome, email, telefone, conta_id, comissoes: commissionsInput } =
      req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    if (!(await canWriteToAccount(conta_id ? parseInt(String(conta_id)) : null, req.user!.id))) {
      res.status(400).json({ success: false, message: ACCOUNT_ACCESS_DENIED });
      return;
    }
    const ownerId = await resolveAccountOwnerId(req.user!.id, conta_id ? parseInt(String(conta_id)) : null);

    const commissions = await readCommissions(req.user!.id, conta_id ? parseInt(String(conta_id)) : null, commissionsInput);
    if (!commissions) {
      res.status(400).json({ success: false, message: CLASSIFICATION_NOT_AVAILABLE });
      return;
    }

    const result = await pool.query(
      `INSERT INTO representantes (usuario_id, conta_id, nome, email, telefone)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [ownerId, conta_id ? parseInt(String(conta_id)) : null, String(nome).trim(), email ?? null, telefone ?? null],
    );

    const rep = result.rows[0] as Record<string, unknown>;

    for (const commission of commissions) {
      await pool.query(
        `INSERT INTO comissoes (representante_id, classificacao_id, percentual, tipo) VALUES ($1, $2, $3, $4)`,
        [rep['id'], commission.classificacaoId, commission.percentual, commission.tipo],
      );
    }

    // Auto-criar categoria "Comissão" no catálogo do dono da conta (idempotente)
    await pool.query(
      `INSERT INTO categorias (usuario_id, nome, cor, icone)
       SELECT $1, 'Comissão', '#f59e0b', 'handshake'
       WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = 'comissão')`,
      [ownerId],
    );

    res.status(201).json({ success: true, message: 'Representative created', data: rep });
  } catch (error) {
    console.error('Create representative error:', error);
    res.status(500).json({ success: false, message: 'Failed to create representative' });
  }
});

// PUT /api/representatives/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);
    const { nome, email, telefone, comissoes: commissionsInput } = req.body as Record<string, unknown>;

    if (!nome || String(nome).trim() === '') {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    const existing = await pool.query(
      'SELECT conta_id FROM representantes WHERE id = $1 AND usuario_id = $2',
      [id, ownerId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Representative not found' });
      return;
    }
    const commissions = await readCommissions(
      req.user!.id,
      (existing.rows[0] as { conta_id: number | null }).conta_id,
      commissionsInput,
    );
    if (!commissions) {
      res.status(400).json({ success: false, message: CLASSIFICATION_NOT_AVAILABLE });
      return;
    }

    const result = await pool.query(
      `UPDATE representantes SET nome = $1, email = $2, telefone = $3
       WHERE id = $4 AND usuario_id = $5 RETURNING *`,
      [String(nome).trim(), email ?? null, telefone ?? null, id, ownerId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Representative not found' });
      return;
    }

    await pool.query(`UPDATE comissoes SET ativo = false WHERE representante_id = $1`, [id]);

    for (const commission of commissions) {
      await pool.query(
        `INSERT INTO comissoes (representante_id, classificacao_id, percentual, tipo) VALUES ($1, $2, $3, $4)`,
        [id, commission.classificacaoId, commission.percentual, commission.tipo],
      );
    }

    res.json({ success: true, message: 'Representative updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update representative error:', error);
    res.status(500).json({ success: false, message: 'Failed to update representative' });
  }
});

// DELETE /api/representatives/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);
    const result = await pool.query(
      `UPDATE representantes SET ativo = false WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [id, ownerId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Representative not found' });
      return;
    }
    res.json({ success: true, message: 'Representative archived' });
  } catch (error) {
    console.error('Archive representative error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive representative' });
  }
});

export default router;
