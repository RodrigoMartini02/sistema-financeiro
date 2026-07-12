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

  const monthRows: Array<{ dueDate: string; monthIndex: number; year: number }> = [];
  let currentYear = startYear!;
  let currentMonth = startMonth!;

  while (
    currentYear < endYear! ||
    (currentYear === endYear! && currentMonth <= endMonth!)
  ) {
    monthRows.push({
      dueDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
      monthIndex: currentMonth - 1,
      year: currentYear,
    });
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  if (monthRows.length === 0) return 0;

  const valueGroups = monthRows.map((_, i) => {
    const b = i * 8;
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, 'prevista', $${b + 7}, $${b + 8})`;
  });

  const params: unknown[] = [];
  for (const row of monthRows) {
    params.push(userId, `Mensalidade - ${clientName}`, monthlyAmount, row.dueDate, row.monthIndex, row.year, contractId, profileId);
  }

  await pool.query(
    `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, status, contrato_id, perfil_id)
     VALUES ${valueGroups.join(', ')}`,
    params,
  );

  return monthRows.length;
}

// GET /api/contratos?cliente_id=X&status=ativo
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cliente_id, status } = req.query as Record<string, string | undefined>;

    let where = 'WHERE ct.usuario_id = $1';
    const params: unknown[] = [req.user!.id];

    if (cliente_id) {
      where += ` AND ct.cliente_id = $${params.length + 1}`;
      params.push(parseInt(cliente_id));
    }

    if (status) {
      where += ` AND ct.status = $${params.length + 1}`;
      params.push(status);
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

// GET /api/contratos/faturamento?mes=X&ano=Y
// IMPORTANT: must be declared before /:id to avoid Express matching "faturamento" as an ID
router.get('/faturamento', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano } = req.query as Record<string, string | undefined>;

    if (!mes || !ano) {
      res.status(400).json({ success: false, message: 'mes e ano são obrigatórios' });
      return;
    }

    const mesNum = parseInt(mes);
    const anoNum = parseInt(ano);

    if (isNaN(mesNum) || mesNum < 1 || mesNum > 12 || isNaN(anoNum)) {
      res.status(400).json({ success: false, message: 'mes deve ser 1-12 e ano deve ser um número' });
      return;
    }

    const result = await pool.query(
      `SELECT
         c.id AS contrato_id,
         cl.nome AS cliente_nome,
         c.descricao AS contrato_descricao,
         c.valor_mensal,
         r.id AS receita_id,
         r.status AS receita_status
       FROM contratos c
       JOIN clientes cl ON cl.id = c.cliente_id
       LEFT JOIN receitas r
         ON r.contrato_id = c.id
         AND EXTRACT(MONTH FROM r.data_recebimento) = $2
         AND EXTRACT(YEAR FROM r.data_recebimento) = $3
         AND r.usuario_id = $1
         AND r.status != 'cancelada'
       WHERE c.status = 'ativo'
         AND c.usuario_id = $1
       ORDER BY cl.nome, c.id`,
      [req.user!.id, mesNum, anoNum],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get faturamento error:', error);
    res.status(500).json({ success: false, message: 'Failed to get faturamento' });
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
      valor_mensal,
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
          valor_mensal)
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
      valor_mensal,
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
           valor_mensal = $16
       WHERE id = $17 AND usuario_id = $18 RETURNING *`,
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
        parseFloat(String(valor_mensal ?? 0)) || 0,                  // $16
        req.params['id'],                                             // $17
        req.user!.id,                                                 // $18
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
          valor_mensal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16, $17, $17, $18) RETURNING *`,
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
        parseFloat(String(currentContract['valor_mensal'] ?? 0)) || 0,                           // $18
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

// POST /api/contratos/:id/faturar
router.post('/:id/faturar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const contratoId = parseInt(req.params['id']!);
    const { mes, ano } = req.body as Record<string, unknown>;

    if (!mes || !ano) {
      res.status(400).json({ success: false, message: 'mes e ano são obrigatórios' });
      return;
    }

    const mesNum = parseInt(String(mes));
    const anoNum = parseInt(String(ano));

    // Verify contract belongs to user and fetch details
    const contratoResult = await pool.query(
      `SELECT c.*, cl.nome AS cliente_nome
       FROM contratos c
       JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.id = $1 AND c.usuario_id = $2 AND c.status = 'ativo'`,
      [contratoId, req.user!.id],
    );

    if (contratoResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contrato não encontrado ou inativo' });
      return;
    }

    const contrato = contratoResult.rows[0] as {
      valor_mensal: string | number;
      cliente_nome: string;
      perfil_id: number | null;
    };

    // Check if a receita already exists for this contract + month
    const receitaResult = await pool.query(
      `SELECT id, status FROM receitas
       WHERE contrato_id = $1
         AND EXTRACT(MONTH FROM data_recebimento) = $2
         AND EXTRACT(YEAR FROM data_recebimento) = $3
         AND usuario_id = $4
         AND status != 'cancelada'`,
      [contratoId, mesNum, anoNum, req.user!.id],
    );

    let resultRow: Record<string, unknown>;

    if (receitaResult.rows.length > 0) {
      const existing = receitaResult.rows[0] as { id: number; status: string };

      if (existing.status === 'ativa') {
        res.status(400).json({ success: false, message: 'Esta receita já foi recebida' });
        return;
      }

      // prevista → faturada
      const updated = await pool.query(
        `UPDATE receitas SET status = 'faturada' WHERE id = $1 AND usuario_id = $2 RETURNING *`,
        [existing.id, req.user!.id],
      );
      resultRow = updated.rows[0] as Record<string, unknown>;
    } else {
      // Create new receita with status faturada
      const dueDate = `${anoNum}-${String(mesNum).padStart(2, '0')}-01`;
      const monthIndex = mesNum - 1;
      const valor = parseFloat(String(contrato.valor_mensal)) || 0;

      const inserted = await pool.query(
        `INSERT INTO receitas
           (usuario_id, descricao, valor, data_recebimento, mes, ano, status, contrato_id, perfil_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'faturada', $7, $8)
         RETURNING *`,
        [
          req.user!.id,
          `Mensalidade - ${contrato.cliente_nome}`,
          valor,
          dueDate,
          monthIndex,
          anoNum,
          contratoId,
          contrato.perfil_id,
        ],
      );
      resultRow = inserted.rows[0] as Record<string, unknown>;
    }

    res.json({ success: true, data: resultRow });
  } catch (error) {
    console.error('Faturar contrato error:', error);
    res.status(500).json({ success: false, message: 'Failed to faturar contrato' });
  }
});

// POST /api/contratos/:id/receita-implantacao
router.post('/:id/receita-implantacao', authenticate, async (req: Request, res: Response): Promise<void> => {
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
      res.status(404).json({ success: false, message: 'Contrato não encontrado' });
      return;
    }

    const ct = contractResult.rows[0] as {
      implantacao_parcelas: number | null;
      implantacao_valor_parcela: number | null;
      data_assinatura: string | null;
      data_inicio_faturamento: string | null;
      cliente_nome: string;
      perfil_id: number | null;
    };

    const parcelas = ct.implantacao_parcelas ?? 1;
    const valorParcela = parseFloat(String(ct.implantacao_valor_parcela ?? 0)) || 0;
    const valorTotal = parcelas * valorParcela;

    if (valorTotal <= 0) {
      res.status(400).json({ success: false, message: 'Contrato sem valor de implantação' });
      return;
    }

    // Evitar duplicata
    const existing = await pool.query(
      `SELECT id FROM receitas WHERE contrato_id = $1 AND tipo_receita = 'Implantação' AND usuario_id = $2 LIMIT 1`,
      [contractId, req.user!.id],
    );
    if (existing.rows.length > 0) {
      res.json({ success: true, message: 'Receita de implantação já existe', data: existing.rows[0] });
      return;
    }

    const dataRef = ct.data_assinatura ?? ct.data_inicio_faturamento ?? new Date().toISOString().slice(0, 10);
    const [ano, mesStr] = dataRef.split('-');
    const mes = parseInt(mesStr!) - 1;

    const result = await pool.query(
      `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, status, contrato_id, tipo_receita, perfil_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'prevista', $7, 'Implantação', $8)
       RETURNING *`,
      [
        req.user!.id,
        `Implantação - ${ct.cliente_nome}`,
        valorTotal,
        dataRef,
        mes,
        parseInt(String(ano)),
        contractId,
        ct.perfil_id,
      ],
    );

    res.status(201).json({ success: true, message: 'Receita de implantação criada', data: result.rows[0] });
  } catch (error) {
    console.error('Create implantacao income error:', error);
    res.status(500).json({ success: false, message: 'Failed to create implantacao income' });
  }
});

export default router;
