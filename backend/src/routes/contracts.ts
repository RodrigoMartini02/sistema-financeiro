import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

async function gerarPrevistas(
  contratoId: number,
  usuarioId: number,
  clienteNome: string,
  dataInicio: string,
  vencimento: string,
  perfilId: number | null,
): Promise<number> {
  const valorResult = await pool.query(
    `SELECT COALESCE(SUM(valor_mensal), 0) AS total
     FROM contratos_servicos
     WHERE contrato_id = $1 AND usuario_id = $2 AND faturando = true`,
    [contratoId, usuarioId],
  );
  const valorMensal = parseFloat((valorResult.rows[0] as { total: string }).total);

  if (valorMensal <= 0) return 0;

  const [startYear, startMonth] = dataInicio.split('-').map(Number);
  const [endYear, endMonth] = vencimento.split('-').map(Number);

  let count = 0;
  let currentYear = startYear!;
  let currentMonth = startMonth!;

  while (
    currentYear < endYear! ||
    (currentYear === endYear! && currentMonth <= endMonth!)
  ) {
    const dataRecebimento = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const mesIndex = currentMonth - 1;

    await pool.query(
      `INSERT INTO receitas
         (usuario_id, descricao, valor, data_recebimento, mes, ano, status, contrato_id, perfil_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'prevista', $7, $8)`,
      [
        usuarioId,
        `Mensalidade - ${clienteNome}`,
        valorMensal,
        dataRecebimento,
        mesIndex,
        currentYear,
        contratoId,
        perfilId,
      ],
    );

    count++;
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return count;
}

// GET /api/contratos?cliente_id=X
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cliente_id } = req.query as Record<string, string | undefined>;

    let where = 'WHERE ct.usuario_id = $1';
    const params: unknown[] = [req.user!.id];

    if (cliente_id) {
      where += ' AND ct.cliente_id = $2';
      params.push(parseInt(cliente_id));
    }

    const result = await pool.query(
      `SELECT ct.*, cl.nome AS cliente_nome, r.nome AS representante_nome
       FROM contratos ct
       LEFT JOIN clientes cl ON cl.id = ct.cliente_id
       LEFT JOIN representantes r ON r.id = ct.representante_id
       ${where}
       ORDER BY ct.criado_em DESC`,
      params,
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List contracts error:', error);
    res.status(500).json({ success: false, message: 'Failed to list contracts' });
  }
});

// GET /api/contratos/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT ct.*, cl.nome AS cliente_nome, r.nome AS representante_nome
       FROM contratos ct
       LEFT JOIN clientes cl ON cl.id = ct.cliente_id
       LEFT JOIN representantes r ON r.id = ct.representante_id
       WHERE ct.id = $1 AND ct.usuario_id = $2`,
      [req.params['id'], req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get contract error:', error);
    res.status(500).json({ success: false, message: 'Failed to get contract' });
  }
});

// POST /api/contratos
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      cliente_id, numero, data_assinatura, vencimento,
      num_aditivo, data_aditivo, ajuste, data_inicio_faturamento,
      observacoes, perfil_id,
      representante_id,
      implantacao_parcelas, implantacao_valor_parcela,
      horas_presenciais_valor, horas_presenciais_saldo_ini,
      horas_remotas_valor, horas_remotas_saldo_ini,
      valor_contrato,
    } = req.body as Record<string, unknown>;

    if (!vencimento) {
      res.status(400).json({ success: false, message: 'Vencimento é obrigatório' });
      return;
    }
    if (!cliente_id) {
      res.status(400).json({ success: false, message: 'Cliente é obrigatório' });
      return;
    }

    const hpIni = parseFloat(String(horas_presenciais_saldo_ini ?? 0)) || 0;
    const hrIni = parseFloat(String(horas_remotas_saldo_ini ?? 0)) || 0;

    const result = await pool.query(
      `INSERT INTO contratos
         (usuario_id, cliente_id, numero, data_assinatura, vencimento,
          num_aditivo, data_aditivo, ajuste, data_inicio_faturamento, observacoes,
          representante_id, implantacao_parcelas, implantacao_valor_parcela,
          horas_presenciais_valor, horas_presenciais_saldo_ini, horas_presenciais_saldo_atual,
          horas_remotas_valor, horas_remotas_saldo_ini, horas_remotas_saldo_atual,
          valor_contrato)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17,$17,$18) RETURNING *`,
      [
        req.user!.id,
        parseInt(String(cliente_id)),
        numero ?? null,
        data_assinatura ?? null,
        vencimento,
        num_aditivo ? parseInt(String(num_aditivo)) : 0,
        data_aditivo ?? null,
        ajuste ?? 'NADA CONSTA',
        data_inicio_faturamento ?? null,
        observacoes ?? null,
        representante_id ? parseInt(String(representante_id)) : null,
        implantacao_parcelas ? parseInt(String(implantacao_parcelas)) : 1,
        parseFloat(String(implantacao_valor_parcela ?? 0)) || 0,
        parseFloat(String(horas_presenciais_valor ?? 0)) || 0,
        hpIni,
        parseFloat(String(horas_remotas_valor ?? 0)) || 0,
        hrIni,
        parseFloat(String(valor_contrato ?? 0)) || 0,
      ],
    );
    res.status(201).json({ success: true, message: 'Contract created', data: result.rows[0] });
    void perfil_id;
  } catch (error) {
    console.error('Create contract error:', error);
    res.status(500).json({ success: false, message: 'Failed to create contract' });
  }
});

// PUT /api/contratos/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      numero, data_assinatura, vencimento, num_aditivo, data_aditivo,
      ajuste, data_inicio_faturamento, observacoes,
      representante_id,
      implantacao_parcelas, implantacao_valor_parcela,
      horas_presenciais_valor, horas_presenciais_saldo_ini, horas_presenciais_saldo_atual,
      horas_remotas_valor, horas_remotas_saldo_ini, horas_remotas_saldo_atual,
      valor_contrato,
    } = req.body as Record<string, unknown>;

    const result = await pool.query(
      `UPDATE contratos
       SET numero = $1, data_assinatura = $2, vencimento = $3,
           num_aditivo = $4, data_aditivo = $5, ajuste = $6,
           data_inicio_faturamento = $7, observacoes = $8,
           representante_id = $9, implantacao_parcelas = $10, implantacao_valor_parcela = $11,
           horas_presenciais_valor = $12, horas_presenciais_saldo_ini = $13, horas_presenciais_saldo_atual = $14,
           horas_remotas_valor = $15, horas_remotas_saldo_ini = $16, horas_remotas_saldo_atual = $17,
           valor_contrato = $18
       WHERE id = $19 AND usuario_id = $20 RETURNING *`,
      [
        numero ?? null,
        data_assinatura ?? null,
        vencimento,
        num_aditivo ? parseInt(String(num_aditivo)) : 0,
        data_aditivo ?? null,
        ajuste ?? 'NADA CONSTA',
        data_inicio_faturamento ?? null,
        observacoes ?? null,
        representante_id ? parseInt(String(representante_id)) : null,
        implantacao_parcelas ? parseInt(String(implantacao_parcelas)) : 1,
        parseFloat(String(implantacao_valor_parcela ?? 0)) || 0,
        parseFloat(String(horas_presenciais_valor ?? 0)) || 0,
        parseFloat(String(horas_presenciais_saldo_ini ?? 0)) || 0,
        parseFloat(String(horas_presenciais_saldo_atual ?? 0)) || 0,
        parseFloat(String(horas_remotas_valor ?? 0)) || 0,
        parseFloat(String(horas_remotas_saldo_ini ?? 0)) || 0,
        parseFloat(String(horas_remotas_saldo_atual ?? 0)) || 0,
        parseFloat(String(valor_contrato ?? 0)) || 0,
        req.params['id'],
        req.user!.id,
      ],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }
    res.json({ success: true, message: 'Contract updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update contract error:', error);
    res.status(500).json({ success: false, message: 'Failed to update contract' });
  }
});

// POST /api/contratos/:id/gerar-previstas
router.post('/:id/gerar-previstas', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const contratoId = parseInt(req.params['id']!);

    const contratoResult = await pool.query(
      `SELECT ct.*, cl.nome AS cliente_nome
       FROM contratos ct
       LEFT JOIN clientes cl ON cl.id = ct.cliente_id
       WHERE ct.id = $1 AND ct.usuario_id = $2`,
      [contratoId, req.user!.id],
    );

    if (contratoResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    const contrato = contratoResult.rows[0] as {
      vencimento: string;
      data_inicio_faturamento: string | null;
      cliente_nome: string;
      perfil_id: number | null;
    };

    if (!contrato.data_inicio_faturamento) {
      res.status(400).json({ success: false, message: 'Data de início de faturamento não definida' });
      return;
    }

    // Cancela previstas futuras existentes do contrato antes de regerar
    await pool.query(
      `UPDATE receitas SET status = 'cancelada'
       WHERE contrato_id = $1 AND status = 'prevista' AND data_recebimento >= CURRENT_DATE`,
      [contratoId],
    );

    const count = await gerarPrevistas(
      contratoId,
      req.user!.id,
      contrato.cliente_nome,
      contrato.data_inicio_faturamento,
      contrato.vencimento,
      contrato.perfil_id,
    );

    res.json({ success: true, message: `${count} receitas previstas geradas`, data: { count } });
  } catch (error) {
    console.error('Generate predicted incomes error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate predicted incomes' });
  }
});

// PUT /api/contratos/:id/encerrar
router.put('/:id/encerrar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const contratoId = parseInt(req.params['id']!);

    // Cancela previstas futuras
    await pool.query(
      `UPDATE receitas SET status = 'cancelada'
       WHERE contrato_id = $1 AND status = 'prevista' AND data_recebimento >= CURRENT_DATE`,
      [contratoId],
    );

    const result = await pool.query(
      `UPDATE contratos SET status = 'encerrado' WHERE id = $1 AND usuario_id = $2 RETURNING *`,
      [contratoId, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    res.json({ success: true, message: 'Contract closed', data: result.rows[0] });
  } catch (error) {
    console.error('Close contract error:', error);
    res.status(500).json({ success: false, message: 'Failed to close contract' });
  }
});

// PUT /api/contratos/:id/aditivo — encerra atual + cria novo + transfere módulos
router.put('/:id/aditivo', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const contratoId = parseInt(req.params['id']!);
    const {
      novo_numero, nova_data_assinatura, novo_vencimento,
      novo_num_aditivo, nova_data_aditivo, novo_ajuste,
      nova_data_inicio_faturamento, observacoes,
    } = req.body as Record<string, unknown>;

    if (!novo_vencimento) {
      res.status(400).json({ success: false, message: 'Novo vencimento é obrigatório' });
      return;
    }

    // Busca contrato atual
    const contratoAtualResult = await pool.query(
      `SELECT ct.*, cl.nome AS cliente_nome
       FROM contratos ct LEFT JOIN clientes cl ON cl.id = ct.cliente_id
       WHERE ct.id = $1 AND ct.usuario_id = $2`,
      [contratoId, req.user!.id],
    );

    if (contratoAtualResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    const contratoAtual = contratoAtualResult.rows[0] as Record<string, unknown>;

    // Encerra contrato anterior
    await pool.query(
      `UPDATE receitas SET status = 'cancelada'
       WHERE contrato_id = $1 AND status = 'prevista' AND data_recebimento >= CURRENT_DATE`,
      [contratoId],
    );
    await pool.query(
      `UPDATE contratos SET status = 'encerrado' WHERE id = $1 AND usuario_id = $2`,
      [contratoId, req.user!.id],
    );

    // Cria novo contrato
    const novoContratoResult = await pool.query(
      `INSERT INTO contratos
         (usuario_id, cliente_id, numero, data_assinatura, vencimento,
          num_aditivo, data_aditivo, ajuste, data_inicio_faturamento, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        req.user!.id,
        contratoAtual['cliente_id'],
        novo_numero ?? contratoAtual['numero'],
        nova_data_assinatura ?? contratoAtual['data_assinatura'],
        novo_vencimento,
        novo_num_aditivo ?? (Number(contratoAtual['num_aditivo'] ?? 0) + 1),
        nova_data_aditivo ?? null,
        novo_ajuste ?? 'NADA CONSTA',
        nova_data_inicio_faturamento ?? contratoAtual['data_inicio_faturamento'],
        observacoes ?? contratoAtual['observacoes'],
      ],
    );

    const novoContrato = novoContratoResult.rows[0] as Record<string, unknown>;
    const novoContratoId = novoContrato['id'] as number;

    // Copia serviços vinculados do contrato anterior
    await pool.query(
      `INSERT INTO contratos_servicos (contrato_id, servico_id, usuario_id, valor_mensal, implantado, faturando, data_inicio_faturamento)
       SELECT $1, servico_id, usuario_id, valor_mensal, implantado, faturando, data_inicio_faturamento
       FROM contratos_servicos WHERE contrato_id = $2 AND usuario_id = $3`,
      [novoContratoId, contratoId, req.user!.id],
    );

    // Copia serviços técnicos
    await pool.query(
      `INSERT INTO servicos_tecnicos_contrato (contrato_id, usuario_id, tipo, valor_hora, qtde_contratada, qtde_consumida)
       SELECT $1, usuario_id, tipo, valor_hora, qtde_contratada, 0
       FROM servicos_tecnicos_contrato WHERE contrato_id = $2 AND usuario_id = $3`,
      [novoContratoId, contratoId, req.user!.id],
    );

    // Gera previstas para o novo contrato
    if (nova_data_inicio_faturamento ?? contratoAtual['data_inicio_faturamento']) {
      await gerarPrevistas(
        novoContratoId,
        req.user!.id,
        String(contratoAtual['cliente_nome']),
        String(nova_data_inicio_faturamento ?? contratoAtual['data_inicio_faturamento']),
        String(novo_vencimento),
        contratoAtual['perfil_id'] as number | null,
      );
    }

    res.json({ success: true, message: 'Additive processed', data: novoContrato });
  } catch (error) {
    console.error('Additive error:', error);
    res.status(500).json({ success: false, message: 'Failed to process additive' });
  }
});

export default router;
