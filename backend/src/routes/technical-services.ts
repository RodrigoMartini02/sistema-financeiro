import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

const TIPOS_VALIDOS = ['presencial', 'remoto', 'desenvolvimento', 'estada', 'deslocamento'];

// GET /api/servicos-tecnicos?contrato_id=X
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { contrato_id } = req.query as Record<string, string | undefined>;

    if (!contrato_id) {
      res.status(400).json({ success: false, message: 'contrato_id é obrigatório' });
      return;
    }

    const result = await pool.query(
      `SELECT s.* FROM servicos_tecnicos_contrato s
       JOIN contratos ct ON ct.id = s.contrato_id
       WHERE s.contrato_id = $1 AND s.usuario_id = $2 AND ct.usuario_id = $2
       ORDER BY s.tipo ASC`,
      [parseInt(contrato_id), req.user!.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List technical services error:', error);
    res.status(500).json({ success: false, message: 'Failed to list technical services' });
  }
});

// POST /api/servicos-tecnicos
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { contrato_id, tipo, valor_hora, qtde_contratada } =
      req.body as Record<string, unknown>;

    if (!contrato_id || !tipo) {
      res.status(400).json({ success: false, message: 'contrato_id e tipo são obrigatórios' });
      return;
    }
    if (!TIPOS_VALIDOS.includes(String(tipo))) {
      res.status(400).json({ success: false, message: `Tipo inválido. Use: ${TIPOS_VALIDOS.join(', ')}` });
      return;
    }

    const contratoCheck = await pool.query(
      'SELECT id FROM contratos WHERE id = $1 AND usuario_id = $2',
      [parseInt(String(contrato_id)), req.user!.id],
    );
    if (contratoCheck.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO servicos_tecnicos_contrato
         (contrato_id, usuario_id, tipo, valor_hora, qtde_contratada)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        parseInt(String(contrato_id)),
        req.user!.id,
        tipo,
        valor_hora ? parseFloat(String(valor_hora)) : 0,
        qtde_contratada ? parseFloat(String(qtde_contratada)) : 0,
      ],
    );
    res.status(201).json({ success: true, message: 'Technical service created', data: result.rows[0] });
  } catch (error) {
    console.error('Create technical service error:', error);
    res.status(500).json({ success: false, message: 'Failed to create technical service' });
  }
});

// PUT /api/servicos-tecnicos/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { valor_hora, qtde_contratada, qtde_consumida } =
      req.body as Record<string, unknown>;

    const result = await pool.query(
      `UPDATE servicos_tecnicos_contrato
       SET valor_hora = $1, qtde_contratada = $2, qtde_consumida = $3
       WHERE id = $4 AND usuario_id = $5 RETURNING *`,
      [
        valor_hora ? parseFloat(String(valor_hora)) : 0,
        qtde_contratada ? parseFloat(String(qtde_contratada)) : 0,
        qtde_consumida ? parseFloat(String(qtde_consumida)) : 0,
        req.params['id'],
        req.user!.id,
      ],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Technical service not found' });
      return;
    }
    res.json({ success: true, message: 'Technical service updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update technical service error:', error);
    res.status(500).json({ success: false, message: 'Failed to update technical service' });
  }
});

// POST /api/servicos-tecnicos/:id/lancar — lançar horas consumidas
router.post('/:id/lancar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const servicoId = parseInt(req.params['id']!);
    const { data, qtde, descricao } = req.body as Record<string, unknown>;

    if (!qtde || parseFloat(String(qtde)) <= 0) {
      res.status(400).json({ success: false, message: 'Quantidade deve ser maior que zero' });
      return;
    }

    // Verificar que o serviço pertence ao usuário
    const servicoResult = await pool.query(
      'SELECT * FROM servicos_tecnicos_contrato WHERE id = $1 AND usuario_id = $2',
      [servicoId, req.user!.id],
    );
    if (servicoResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Technical service not found' });
      return;
    }

    const servico = servicoResult.rows[0] as {
      contrato_id: number;
      tipo: string;
      qtde_consumida: number;
    };

    const qtdeNum = parseFloat(String(qtde));
    const dataLancamento = String(data || new Date().toISOString().split('T')[0]);

    // Registrar em consumo_horas
    await pool.query(
      `INSERT INTO consumo_horas (contrato_id, usuario_id, tipo, data, qtde, descricao)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [servico.contrato_id, req.user!.id, servico.tipo, dataLancamento, qtdeNum, descricao ?? null],
    );

    // Atualizar qtde_consumida
    const updated = await pool.query(
      `UPDATE servicos_tecnicos_contrato
       SET qtde_consumida = qtde_consumida + $1
       WHERE id = $2 AND usuario_id = $3 RETURNING *`,
      [qtdeNum, servicoId, req.user!.id],
    );

    res.json({ success: true, message: 'Hours logged', data: updated.rows[0] });
  } catch (error) {
    console.error('Log hours error:', error);
    res.status(500).json({ success: false, message: 'Failed to log hours' });
  }
});

export default router;
