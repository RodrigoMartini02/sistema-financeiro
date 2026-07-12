import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// Cancel all future predicted revenues for a contract
async function cancelFutureRevenues(contractId: number, userId: number): Promise<void> {
  await pool.query(
    `UPDATE receitas SET status = 'cancelada'
     WHERE contrato_id = $1 AND usuario_id = $2 AND status = 'prevista' AND data_recebimento >= CURRENT_DATE`,
    [contractId, userId],
  );
}

async function gerarPrevistas(
  contractId: number,
  userId: number,
  clientName: string,
  startDate: string,
  endDate: string,
  profileId: number | null,
): Promise<number> {
  const valorResult = await pool.query(
    `SELECT COALESCE(SUM(valor_mensal), 0) AS total
     FROM contratos_servicos
     WHERE contrato_id = $1 AND usuario_id = $2 AND faturando = true`,
    [contractId, userId],
  );
  const monthlyAmount = parseFloat((valorResult.rows[0] as { total: string }).total);

  if (monthlyAmount <= 0) return 0;

  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);

  let count = 0;
  let currentYear = startYear!;
  let currentMonth = startMonth!;

  while (
    currentYear < endYear! ||
    (currentYear === endYear! && currentMonth <= endMonth!)
  ) {
    const dueDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const monthIndex = currentMonth - 1;

    await pool.query(
      `INSERT INTO receitas
         (usuario_id, descricao, valor, data_recebimento, mes, ano, status, contrato_id, perfil_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'prevista', $7, $8)`,
      [
        userId,
        `Mensalidade - ${clientName}`,
        monthlyAmount,
        dueDate,
        monthIndex,
        currentYear,
        contractId,
        profileId,
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
      observacoes,
      representante_id,
      implantacao_parcelas, implantacao_valor_parcela,
      horas_presenciais_valor, horas_presenciais_saldo_ini,
      horas_remotas_valor, horas_remotas_saldo_ini,
      valor_contrato, valor_mensal,
    } = req.body as Record<string, unknown>;

    if (!vencimento) {
      res.status(400).json({ success: false, message: 'vencimento is required' });
      return;
    }
    if (!cliente_id) {
      res.status(400).json({ success: false, message: 'cliente_id is required' });
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
          valor_contrato, valor_mensal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17,$17,$18,$19) RETURNING *`,
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
        parseFloat(String(valor_mensal ?? 0)) || 0,
      ],
    );
    res.status(201).json({ success: true, message: 'Contract created', data: result.rows[0] });
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
      horas_presenciais_valor, horas_presenciais_saldo_ini,
      horas_remotas_valor, horas_remotas_saldo_ini,
      valor_contrato, valor_mensal,
    } = req.body as Record<string, unknown>;

    const hpIni = parseFloat(String(horas_presenciais_saldo_ini ?? 0)) || 0;
    const hrIni = parseFloat(String(horas_remotas_saldo_ini ?? 0)) || 0;

    const result = await pool.query(
      `UPDATE contratos
       SET numero = $1, data_assinatura = $2, vencimento = $3,
           num_aditivo = $4, data_aditivo = $5, ajuste = $6,
           data_inicio_faturamento = $7, observacoes = $8,
           representante_id = $9, implantacao_parcelas = $10, implantacao_valor_parcela = $11,
           horas_presenciais_valor = $12, horas_presenciais_saldo_ini = $13,
           horas_presenciais_saldo_atual = CASE
             WHEN horas_presenciais_saldo_atual = 0 OR horas_presenciais_saldo_atual IS NULL THEN $13
             ELSE horas_presenciais_saldo_atual
           END,
           horas_remotas_valor = $14, horas_remotas_saldo_ini = $15,
           horas_remotas_saldo_atual = CASE
             WHEN horas_remotas_saldo_atual = 0 OR horas_remotas_saldo_atual IS NULL THEN $15
             ELSE horas_remotas_saldo_atual
           END,
           valor_contrato = $16, valor_mensal = $17
       WHERE id = $18 AND usuario_id = $19 RETURNING *`,
      [
        numero ?? null,                                               // $1
        data_assinatura ?? null,                                      // $2
        vencimento,                                                   // $3
        num_aditivo ? parseInt(String(num_aditivo)) : 0,             // $4
        data_aditivo ?? null,                                         // $5
        ajuste ?? 'NADA CONSTA',                                      // $6
        data_inicio_faturamento ?? null,                              // $7
        observacoes ?? null,                                          // $8
        representante_id ? parseInt(String(representante_id)) : null, // $9
        implantacao_parcelas ? parseInt(String(implantacao_parcelas)) : 1, // $10
        parseFloat(String(implantacao_valor_parcela ?? 0)) || 0,     // $11
        parseFloat(String(horas_presenciais_valor ?? 0)) || 0,       // $12
        hpIni,                                                        // $13
        parseFloat(String(horas_remotas_valor ?? 0)) || 0,           // $14
        hrIni,                                                        // $15
        parseFloat(String(valor_contrato ?? 0)) || 0,                // $16
        parseFloat(String(valor_mensal ?? 0)) || 0,                  // $17
        req.params['id'],                                            // $18
        req.user!.id,                                               // $19
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
    const contractId = parseInt(req.params['id']!);

    const contractResult = await pool.query(
      `SELECT ct.*, cl.nome AS cliente_nome
       FROM contratos ct
       LEFT JOIN clientes cl ON cl.id = ct.cliente_id
       WHERE ct.id = $1 AND ct.usuario_id = $2`,
      [contractId, req.user!.id],
    );

    if (contractResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    const contract = contractResult.rows[0] as {
      vencimento: string;
      data_inicio_faturamento: string | null;
      cliente_nome: string;
      perfil_id: number | null;
    };

    if (!contract.data_inicio_faturamento) {
      res.status(400).json({ success: false, message: 'data_inicio_faturamento not set' });
      return;
    }

    // Cancel existing future predicted revenues before regenerating
    await cancelFutureRevenues(contractId, req.user!.id);

    const count = await gerarPrevistas(
      contractId,
      req.user!.id,
      contract.cliente_nome,
      contract.data_inicio_faturamento,
      contract.vencimento,
      contract.perfil_id,
    );

    res.json({ success: true, message: `${count} predicted revenues generated`, data: { count } });
  } catch (error) {
    console.error('Generate predicted incomes error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate predicted incomes' });
  }
});

// PUT /api/contratos/:id/encerrar
router.put('/:id/encerrar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractId = parseInt(req.params['id']!);

    const result = await pool.query(
      `UPDATE contratos SET status = 'encerrado' WHERE id = $1 AND usuario_id = $2 RETURNING *`,
      [contractId, req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    // Cancel future predicted revenues (só após confirmar que o contrato pertence ao usuário)
    await cancelFutureRevenues(contractId, req.user!.id);

    res.json({ success: true, message: 'Contract closed', data: result.rows[0] });
  } catch (error) {
    console.error('Close contract error:', error);
    res.status(500).json({ success: false, message: 'Failed to close contract' });
  }
});

// PUT /api/contratos/:id/aditivo — close current contract + create new one + transfer linked services
router.put('/:id/aditivo', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractId = parseInt(req.params['id']!);
    const {
      novo_numero, nova_data_assinatura, novo_vencimento,
      novo_num_aditivo, nova_data_aditivo, novo_ajuste,
      nova_data_inicio_faturamento, observacoes,
    } = req.body as Record<string, unknown>;

    if (!novo_vencimento) {
      res.status(400).json({ success: false, message: 'novo_vencimento is required' });
      return;
    }

    // Fetch current contract
    const currentContractResult = await pool.query(
      `SELECT ct.*, cl.nome AS cliente_nome
       FROM contratos ct LEFT JOIN clientes cl ON cl.id = ct.cliente_id
       WHERE ct.id = $1 AND ct.usuario_id = $2`,
      [contractId, req.user!.id],
    );

    if (currentContractResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    const currentContract = currentContractResult.rows[0] as Record<string, unknown>;

    // Close previous contract (cancel future revenues + mark as encerrado)
    await cancelFutureRevenues(contractId, req.user!.id);
    await pool.query(
      `UPDATE contratos SET status = 'encerrado' WHERE id = $1 AND usuario_id = $2`,
      [contractId, req.user!.id],
    );

    // Carry financial fields from the previous contract — new period starts with fresh saldo_atual = saldo_ini
    const hpIni = parseFloat(String(currentContract['horas_presenciais_saldo_ini'] ?? 0)) || 0;
    const hrIni = parseFloat(String(currentContract['horas_remotas_saldo_ini'] ?? 0)) || 0;

    // Create new contract copying all financial terms
    const newContractResult = await pool.query(
      `INSERT INTO contratos
         (usuario_id, cliente_id, numero, data_assinatura, vencimento,
          num_aditivo, data_aditivo, ajuste, data_inicio_faturamento, observacoes,
          representante_id,
          implantacao_parcelas, implantacao_valor_parcela,
          horas_presenciais_valor, horas_presenciais_saldo_ini, horas_presenciais_saldo_atual,
          horas_remotas_valor, horas_remotas_saldo_ini, horas_remotas_saldo_atual,
          valor_contrato, valor_mensal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16, $17, $17, $18, $19) RETURNING *`,
      [
        req.user!.id,                                                                              // $1
        currentContract['cliente_id'],                                                             // $2
        novo_numero ?? currentContract['numero'],                                                   // $3
        nova_data_assinatura ?? currentContract['data_assinatura'],                               // $4
        novo_vencimento,                                                                           // $5
        novo_num_aditivo ?? (Number(currentContract['num_aditivo'] ?? 0) + 1),                   // $6
        nova_data_aditivo ?? null,                                                                 // $7
        novo_ajuste ?? 'NADA CONSTA',                                                              // $8
        nova_data_inicio_faturamento ?? currentContract['data_inicio_faturamento'],               // $9
        observacoes ?? currentContract['observacoes'],                                             // $10
        currentContract['representante_id'] ?? null,                                              // $11
        parseFloat(String(currentContract['implantacao_parcelas'] ?? 1)) || 1,                   // $12
        parseFloat(String(currentContract['implantacao_valor_parcela'] ?? 0)) || 0,              // $13
        parseFloat(String(currentContract['horas_presenciais_valor'] ?? 0)) || 0,                // $14
        hpIni,                                                                                     // $15 (saldo_ini + saldo_atual via duplicate param)
        parseFloat(String(currentContract['horas_remotas_valor'] ?? 0)) || 0,                    // $16
        hrIni,                                                                                     // $17 (saldo_ini + saldo_atual via duplicate param)
        parseFloat(String(currentContract['valor_contrato'] ?? 0)) || 0,                         // $18
        parseFloat(String(currentContract['valor_mensal'] ?? 0)) || 0,                           // $19
      ],
    );

    const newContract = newContractResult.rows[0] as Record<string, unknown>;
    const newContractId = newContract['id'] as number;

    // Copy linked services from the previous contract
    await pool.query(
      `INSERT INTO contratos_servicos (contrato_id, servico_id, usuario_id, valor_mensal, implantado, faturando, data_inicio_faturamento)
       SELECT $1, servico_id, usuario_id, valor_mensal, implantado, faturando, data_inicio_faturamento
       FROM contratos_servicos WHERE contrato_id = $2 AND usuario_id = $3`,
      [newContractId, contractId, req.user!.id],
    );

    // Copy legacy technical services if any exist
    await pool.query(
      `INSERT INTO servicos_tecnicos_contrato (contrato_id, usuario_id, tipo, valor_hora, qtde_contratada, qtde_consumida)
       SELECT $1, usuario_id, tipo, valor_hora, qtde_contratada, 0
       FROM servicos_tecnicos_contrato WHERE contrato_id = $2 AND usuario_id = $3`,
      [newContractId, contractId, req.user!.id],
    );

    // Generate predicted revenues for the new contract
    if (nova_data_inicio_faturamento ?? currentContract['data_inicio_faturamento']) {
      await gerarPrevistas(
        newContractId,
        req.user!.id,
        String(currentContract['cliente_nome']),
        String(nova_data_inicio_faturamento ?? currentContract['data_inicio_faturamento']),
        String(novo_vencimento),
        currentContract['perfil_id'] as number | null,
      );
    }

    res.json({ success: true, message: 'Additive processed', data: newContract });
  } catch (error) {
    console.error('Additive error:', error);
    res.status(500).json({ success: false, message: 'Failed to process additive' });
  }
});

export default router;
