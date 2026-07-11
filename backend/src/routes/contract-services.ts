import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/contratos-servicos?contrato_id=X
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { contrato_id } = req.query as Record<string, string | undefined>;

    if (!contrato_id) {
      res.status(400).json({ success: false, message: 'contrato_id is required' });
      return;
    }

    const result = await pool.query(
      `SELECT cs.*, s.nome AS servico_nome, s.valor_mensal_padrao
       FROM contratos_servicos cs
       JOIN servicos s ON s.id = cs.servico_id
       JOIN contratos ct ON ct.id = cs.contrato_id
       WHERE cs.contrato_id = $1 AND cs.usuario_id = $2 AND ct.usuario_id = $2
       ORDER BY s.nome ASC`,
      [parseInt(contrato_id), req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List contract services error:', error);
    res.status(500).json({ success: false, message: 'Failed to list contract services' });
  }
});

// POST /api/contratos-servicos — vincular serviço a contrato
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { contrato_id, servico_id, valor_mensal } = req.body as Record<string, unknown>;

    if (!contrato_id || !servico_id) {
      res.status(400).json({ success: false, message: 'contrato_id and servico_id are required' });
      return;
    }

    // Verify contract belongs to user
    const contratoCheck = await pool.query(
      'SELECT id FROM contratos WHERE id = $1 AND usuario_id = $2',
      [parseInt(String(contrato_id)), req.user!.id],
    );
    if (contratoCheck.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    // Verify service belongs to user
    const servicoCheck = await pool.query(
      'SELECT id, valor_mensal_padrao FROM servicos WHERE id = $1 AND usuario_id = $2',
      [parseInt(String(servico_id)), req.user!.id],
    );
    if (servicoCheck.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Service not found' });
      return;
    }

    const valorFinal = valor_mensal != null
      ? parseFloat(String(valor_mensal))
      : parseFloat(String((servicoCheck.rows[0] as { valor_mensal_padrao: string }).valor_mensal_padrao));

    try {
      const result = await pool.query(
        `INSERT INTO contratos_servicos (contrato_id, servico_id, usuario_id, valor_mensal)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [parseInt(String(contrato_id)), parseInt(String(servico_id)), req.user!.id, valorFinal],
      );

      // JOIN to return service name in response
      const full = await pool.query(
        `SELECT cs.*, s.nome AS servico_nome FROM contratos_servicos cs
         JOIN servicos s ON s.id = cs.servico_id WHERE cs.id = $1`,
        [(result.rows[0] as { id: number }).id],
      );
      res.status(201).json({ success: true, message: 'Service linked', data: full.rows[0] });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        res.status(409).json({ success: false, message: 'Service already linked to this contract' });
        return;
      }
      throw err;
    }
  } catch (error) {
    console.error('Link contract service error:', error);
    res.status(500).json({ success: false, message: 'Failed to link service' });
  }
});

// PUT /api/contratos-servicos/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { valor_mensal, implantado, faturando, data_inicio_faturamento } =
      req.body as Record<string, unknown>;

    const result = await pool.query(
      `UPDATE contratos_servicos
       SET valor_mensal = COALESCE($1, valor_mensal),
           implantado = COALESCE($2, implantado),
           faturando = COALESCE($3, faturando),
           data_inicio_faturamento = $4
       WHERE id = $5 AND usuario_id = $6 RETURNING *`,
      [
        valor_mensal != null ? parseFloat(String(valor_mensal)) : null,
        implantado != null ? Boolean(implantado) : null,
        faturando != null ? Boolean(faturando) : null,
        data_inicio_faturamento ?? null,
        req.params['id'],
        req.user!.id,
      ],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract service not found' });
      return;
    }

    const full = await pool.query(
      `SELECT cs.*, s.nome AS servico_nome FROM contratos_servicos cs
       JOIN servicos s ON s.id = cs.servico_id WHERE cs.id = $1`,
      [req.params['id']],
    );
    res.json({ success: true, message: 'Contract service updated', data: full.rows[0] });
  } catch (error) {
    console.error('Update contract service error:', error);
    res.status(500).json({ success: false, message: 'Failed to update contract service' });
  }
});

// DELETE /api/contratos-servicos/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'DELETE FROM contratos_servicos WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params['id'], req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract service not found' });
      return;
    }
    res.json({ success: true, message: 'Service unlinked' });
  } catch (error) {
    console.error('Unlink contract service error:', error);
    res.status(500).json({ success: false, message: 'Failed to unlink service' });
  }
});

export default router;
