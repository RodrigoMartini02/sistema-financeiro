import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { getTodayIsoInTimezone } from '../utils/date';
import { accountWhere as accountWhereBase } from '../utils/accountFilter';
import { canWriteToAccount, ACCOUNT_ACCESS_DENIED } from '../utils/accountAccess';
import { resolveAccountOwnerId } from '../utils/familyVisibility';
import {
  findCatalogClassification,
  findDefaultClassificationId,
  parseClassificationId,
  resolveIncomeClassificationCatalog,
} from '../services/incomeClassificationCatalog';
import {
  CONTRACT_INCOME_CLASSIFICATION,
  canChangeContractSetupClassification,
} from '../services/incomeClassificationDefaults';

const router = Router();

const CLASSIFICATION_NOT_AVAILABLE = 'Classification not available for this account';
const SETUP_CLASSIFICATION_LOCKED = 'Setup classification cannot change after the setup income was generated';

interface ContractClassifications {
  mensalidade: number | null;
  implantacao: number | null;
}

/**
 * Classificações das receitas que o contrato gera: as enviadas pelo client,
 * validadas no catálogo da conta do contrato, ou as padrão Contratos ›
 * Mensalidade e › Implantação quando não vierem. Null quando alguma enviada não
 * pertence à conta.
 */
async function resolveContractClassifications(
  requesterId: number,
  accountId: number | null,
  values: { mensalidade: unknown; implantacao: unknown },
): Promise<ContractClassifications | null> {
  const catalog = await resolveIncomeClassificationCatalog(requesterId, accountId);
  if (!catalog) return null;

  const resolve = async (value: unknown, defaultName: string): Promise<number | null | false> => {
    const parsed = parseClassificationId(value);
    if (parsed === undefined || parsed === null) return findDefaultClassificationId(catalog, defaultName);
    if (Number.isNaN(parsed)) return false;
    return (await findCatalogClassification(catalog, parsed)) ? parsed : false;
  };

  const mensalidade = await resolve(values.mensalidade, CONTRACT_INCOME_CLASSIFICATION.mensalidade);
  const implantacao = await resolve(values.implantacao, CONTRACT_INCOME_CLASSIFICATION.implantacao);
  if (mensalidade === false || implantacao === false) return null;
  return { mensalidade, implantacao };
}

function accountWhere(accountId: number | null, paramIndex: number): { clause: string; params: unknown[] } {
  return accountWhereBase(accountId, paramIndex, 'ct');
}

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
  accountId: number | null,
  classificationId: number | null,
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
    const b = i * 9;
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, 'prevista', $${b + 7}, $${b + 8}, $${b + 9})`;
  });

  const params: unknown[] = [];
  for (const row of monthRows) {
    params.push(userId, `Mensalidade - ${clientName}`, monthlyAmount, row.dueDate, row.monthIndex, row.year, contractId, accountId, classificationId);
  }

  await pool.query(
    `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, status, contrato_id, conta_id, classificacao_id)
     VALUES ${valueGroups.join(', ')}`,
    params,
  );

  return monthRows.length;
}

// GET /api/contratos?cliente_id=X&status=ativo
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cliente_id, status, conta_id } = req.query as Record<string, string | undefined>;
    const ownerId = await resolveAccountOwnerId(req.user!.id, conta_id ? parseInt(conta_id) : null);

    let where = 'WHERE ct.usuario_id = $1';
    const params: unknown[] = [ownerId];

    if (cliente_id) {
      where += ` AND ct.cliente_id = $${params.length + 1}`;
      params.push(parseInt(cliente_id));
    }

    if (status) {
      where += ` AND ct.status = $${params.length + 1}`;
      params.push(status);
    }

    const accountId = conta_id ? parseInt(conta_id) : null;
    const { clause: accountClause, params: accountParams } = accountWhere(accountId, params.length + 1);
    where += accountClause;
    params.push(...accountParams);

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
    const { mes, ano, conta_id } = req.query as Record<string, string | undefined>;

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

    const accountId = conta_id ? parseInt(conta_id) : null;
    const ownerId = await resolveAccountOwnerId(req.user!.id, accountId);
    const params: unknown[] = [ownerId, mesNum, anoNum];
    const { clause: accountClause, params: accountParams } = accountWhereBase(accountId, 4, 'c');
    params.push(...accountParams);

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
         AND c.usuario_id = $1${accountClause}
       ORDER BY cl.nome, c.id`,
      params,
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
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);
    const result = await pool.query(
      `SELECT ct.*, cl.nome AS cliente_nome, r.nome AS representante_nome
       FROM contratos ct
       LEFT JOIN clientes cl ON cl.id = ct.cliente_id
       LEFT JOIN representantes r ON r.id = ct.representante_id
       WHERE ct.id = $1 AND ct.usuario_id = $2`,
      [req.params['id'], ownerId],
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
      cliente_id, numero, vencimento,
      num_aditivo, data_aditivo, ajuste, data_inicio_faturamento,
      observacoes, descricao,
      representante_id, conta_id,
      implantacao_parcelas, implantacao_valor_parcela,
      horas_presenciais_valor, horas_presenciais_saldo_ini,
      horas_remotas_valor, horas_remotas_saldo_ini,
      valor_mensal,
      classificacao_mensalidade_id, classificacao_implantacao_id,
    } = req.body as Record<string, unknown>;

    if (!vencimento) {
      res.status(400).json({ success: false, message: 'vencimento is required' });
      return;
    }
    if (!cliente_id) {
      res.status(400).json({ success: false, message: 'cliente_id is required' });
      return;
    }
    if (!(await canWriteToAccount(conta_id ? parseInt(String(conta_id)) : null, req.user!.id))) {
      res.status(400).json({ success: false, message: ACCOUNT_ACCESS_DENIED });
      return;
    }
    const ownerId = await resolveAccountOwnerId(req.user!.id, conta_id ? parseInt(String(conta_id)) : null);

    const classificacoes = await resolveContractClassifications(
      req.user!.id,
      conta_id ? parseInt(String(conta_id)) : null,
      { mensalidade: classificacao_mensalidade_id, implantacao: classificacao_implantacao_id },
    );
    if (!classificacoes) {
      res.status(400).json({ success: false, message: CLASSIFICATION_NOT_AVAILABLE });
      return;
    }

    const hpIni = parseFloat(String(horas_presenciais_saldo_ini ?? 0)) || 0;
    const hrIni = parseFloat(String(horas_remotas_saldo_ini ?? 0)) || 0;

    const result = await pool.query(
      `INSERT INTO contratos
         (usuario_id, cliente_id, numero, vencimento,
          num_aditivo, data_aditivo, ajuste, data_inicio_faturamento, observacoes, descricao,
          representante_id, conta_id, implantacao_parcelas, implantacao_valor_parcela,
          horas_presenciais_valor, horas_presenciais_saldo_ini, horas_presenciais_saldo_atual,
          horas_remotas_valor, horas_remotas_saldo_ini, horas_remotas_saldo_atual,
          valor_mensal, classificacao_mensalidade_id, classificacao_implantacao_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,$17,$18,$18,$19,$20,$21) RETURNING *`,
      [
        ownerId,
        parseInt(String(cliente_id)),
        numero ?? null,
        vencimento,
        num_aditivo ? parseInt(String(num_aditivo)) : 0,
        data_aditivo ?? null,
        ajuste ?? 'NADA CONSTA',
        data_inicio_faturamento ?? null,
        observacoes ?? null,
        descricao ?? null,
        representante_id ? parseInt(String(representante_id)) : null,
        conta_id ? parseInt(String(conta_id)) : null,
        implantacao_parcelas ? parseInt(String(implantacao_parcelas)) : 1,
        parseFloat(String(implantacao_valor_parcela ?? 0)) || 0,
        parseFloat(String(horas_presenciais_valor ?? 0)) || 0,
        hpIni,
        parseFloat(String(horas_remotas_valor ?? 0)) || 0,
        hrIni,
        parseFloat(String(valor_mensal ?? 0)) || 0,
        classificacoes.mensalidade,
        classificacoes.implantacao,
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
      numero, vencimento, num_aditivo, data_aditivo,
      ajuste, data_inicio_faturamento, observacoes, descricao,
      representante_id,
      implantacao_parcelas, implantacao_valor_parcela,
      horas_presenciais_valor, horas_presenciais_saldo_ini,
      horas_remotas_valor, horas_remotas_saldo_ini,
      valor_mensal,
      classificacao_mensalidade_id, classificacao_implantacao_id,
    } = req.body as Record<string, unknown>;
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);

    const atualResult = await pool.query(
      `SELECT conta_id, classificacao_mensalidade_id, classificacao_implantacao_id
       FROM contratos WHERE id = $1 AND usuario_id = $2`,
      [req.params['id'], ownerId],
    );
    const atual = atualResult.rows[0] as {
      conta_id: number | null;
      classificacao_mensalidade_id: number | null;
      classificacao_implantacao_id: number | null;
    } | undefined;
    if (!atual) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    // Campo ausente no corpo mantém a classificação que o contrato já tinha.
    const classificacoes = await resolveContractClassifications(req.user!.id, atual.conta_id, {
      mensalidade: classificacao_mensalidade_id === undefined ? atual.classificacao_mensalidade_id : classificacao_mensalidade_id,
      implantacao: classificacao_implantacao_id === undefined ? atual.classificacao_implantacao_id : classificacao_implantacao_id,
    });
    if (!classificacoes) {
      res.status(400).json({ success: false, message: CLASSIFICATION_NOT_AVAILABLE });
      return;
    }
    if (classificacoes.implantacao !== atual.classificacao_implantacao_id) {
      const implantacaoGerada = await pool.query(
        'SELECT 1 FROM receitas WHERE contrato_id = $1 AND classificacao_id = $2 LIMIT 1',
        [req.params['id'], atual.classificacao_implantacao_id],
      );
      if (!canChangeContractSetupClassification(implantacaoGerada.rows.length > 0, atual.classificacao_implantacao_id, classificacoes.implantacao)) {
        res.status(400).json({ success: false, message: SETUP_CLASSIFICATION_LOCKED });
        return;
      }
    }

    const hpIni = parseFloat(String(horas_presenciais_saldo_ini ?? 0)) || 0;
    const hrIni = parseFloat(String(horas_remotas_saldo_ini ?? 0)) || 0;

    const result = await pool.query(
      `UPDATE contratos
       SET numero = $1, vencimento = $2,
           num_aditivo = $3, data_aditivo = $4, ajuste = $5,
           data_inicio_faturamento = $6, observacoes = $7, descricao = $8,
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
           valor_mensal = $16,
           classificacao_mensalidade_id = $19, classificacao_implantacao_id = $20
       WHERE id = $17 AND usuario_id = $18 RETURNING *`,
      [
        numero ?? null,                                               // $1
        vencimento,                                                   // $2
        num_aditivo ? parseInt(String(num_aditivo)) : 0,             // $3
        data_aditivo ?? null,                                         // $4
        ajuste ?? 'NADA CONSTA',                                      // $5
        data_inicio_faturamento ?? null,                              // $6
        observacoes ?? null,                                          // $7
        descricao ?? null,                                            // $8
        representante_id ? parseInt(String(representante_id)) : null, // $9
        implantacao_parcelas ? parseInt(String(implantacao_parcelas)) : 1, // $10
        parseFloat(String(implantacao_valor_parcela ?? 0)) || 0,     // $11
        parseFloat(String(horas_presenciais_valor ?? 0)) || 0,       // $12
        hpIni,                                                        // $13
        parseFloat(String(horas_remotas_valor ?? 0)) || 0,           // $14
        hrIni,                                                        // $15
        parseFloat(String(valor_mensal ?? 0)) || 0,                  // $16
        req.params['id'],                                             // $17
        ownerId,                                                 // $18
        classificacoes.mensalidade,                                   // $19
        classificacoes.implantacao,                                   // $20
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
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);

    const contractResult = await pool.query(
      `SELECT ct.*, cl.nome AS cliente_nome
       FROM contratos ct
       LEFT JOIN clientes cl ON cl.id = ct.cliente_id
       WHERE ct.id = $1 AND ct.usuario_id = $2`,
      [contractId, ownerId],
    );

    if (contractResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    const contract = contractResult.rows[0] as {
      vencimento: string;
      data_inicio_faturamento: string | null;
      cliente_nome: string;
      conta_id: number | null;
      classificacao_mensalidade_id: number | null;
    };

    if (!contract.data_inicio_faturamento) {
      res.status(400).json({ success: false, message: 'data_inicio_faturamento not set' });
      return;
    }

    // Cancel existing future predicted revenues before regenerating
    await cancelFutureRevenues(contractId, ownerId);

    const count = await gerarPrevistas(
      contractId,
      ownerId,
      contract.cliente_nome,
      contract.data_inicio_faturamento,
      contract.vencimento,
      contract.conta_id,
      contract.classificacao_mensalidade_id,
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
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);

    const result = await pool.query(
      `UPDATE contratos SET status = 'encerrado' WHERE id = $1 AND usuario_id = $2 RETURNING *`,
      [contractId, ownerId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    // Cancel future predicted revenues (só após confirmar que o contrato pertence ao usuário)
    await cancelFutureRevenues(contractId, ownerId);

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
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);
    const {
      novo_numero, novo_vencimento,
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
      [contractId, ownerId],
    );

    if (currentContractResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    const currentContract = currentContractResult.rows[0] as Record<string, unknown>;

    // Close previous contract (cancel future revenues + mark as encerrado)
    await cancelFutureRevenues(contractId, ownerId);
    await pool.query(
      `UPDATE contratos SET status = 'encerrado' WHERE id = $1 AND usuario_id = $2`,
      [contractId, ownerId],
    );

    // Carry financial fields from the previous contract — new period starts with fresh saldo_atual = saldo_ini
    const hpIni = parseFloat(String(currentContract['horas_presenciais_saldo_ini'] ?? 0)) || 0;
    const hrIni = parseFloat(String(currentContract['horas_remotas_saldo_ini'] ?? 0)) || 0;

    // Create new contract copying all financial terms
    const newContractResult = await pool.query(
      `INSERT INTO contratos
         (usuario_id, cliente_id, numero, vencimento,
          num_aditivo, data_aditivo, ajuste, data_inicio_faturamento, observacoes,
          representante_id, conta_id,
          implantacao_parcelas, implantacao_valor_parcela,
          horas_presenciais_valor, horas_presenciais_saldo_ini, horas_presenciais_saldo_atual,
          horas_remotas_valor, horas_remotas_saldo_ini, horas_remotas_saldo_atual,
          valor_mensal, classificacao_mensalidade_id, classificacao_implantacao_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16, $17, $17, $18, $19, $20) RETURNING *`,
      [
        ownerId,                                                                              // $1
        currentContract['cliente_id'],                                                             // $2
        novo_numero ?? currentContract['numero'],                                                   // $3
        novo_vencimento,                                                                           // $4
        novo_num_aditivo ?? (Number(currentContract['num_aditivo'] ?? 0) + 1),                   // $5
        nova_data_aditivo ?? null,                                                                 // $6
        novo_ajuste ?? 'NADA CONSTA',                                                              // $7
        nova_data_inicio_faturamento ?? currentContract['data_inicio_faturamento'],               // $8
        observacoes ?? currentContract['observacoes'],                                             // $9
        currentContract['representante_id'] ?? null,                                              // $10
        currentContract['conta_id'] ?? null,                                                      // $11
        parseFloat(String(currentContract['implantacao_parcelas'] ?? 1)) || 1,                   // $12
        parseFloat(String(currentContract['implantacao_valor_parcela'] ?? 0)) || 0,              // $13
        parseFloat(String(currentContract['horas_presenciais_valor'] ?? 0)) || 0,                // $14
        hpIni,                                                                                     // $15 (saldo_ini + saldo_atual via duplicate param)
        parseFloat(String(currentContract['horas_remotas_valor'] ?? 0)) || 0,                    // $16
        hrIni,                                                                                     // $17 (saldo_ini + saldo_atual via duplicate param)
        parseFloat(String(currentContract['valor_mensal'] ?? 0)) || 0,                           // $18
        currentContract['classificacao_mensalidade_id'] ?? null,                                  // $19
        currentContract['classificacao_implantacao_id'] ?? null,                                  // $20
      ],
    );

    const newContract = newContractResult.rows[0] as Record<string, unknown>;
    const newContractId = newContract['id'] as number;

    // Copy linked services from the previous contract
    await pool.query(
      `INSERT INTO contratos_servicos (contrato_id, servico_id, usuario_id, valor_mensal, implantado, faturando, data_inicio_faturamento)
       SELECT $1, servico_id, usuario_id, valor_mensal, implantado, faturando, data_inicio_faturamento
       FROM contratos_servicos WHERE contrato_id = $2 AND usuario_id = $3`,
      [newContractId, contractId, ownerId],
    );

    // Copy legacy technical services if any exist
    await pool.query(
      `INSERT INTO servicos_tecnicos_contrato (contrato_id, usuario_id, tipo, valor_hora, qtde_contratada, qtde_consumida)
       SELECT $1, usuario_id, tipo, valor_hora, qtde_contratada, 0
       FROM servicos_tecnicos_contrato WHERE contrato_id = $2 AND usuario_id = $3`,
      [newContractId, contractId, ownerId],
    );

    // Generate predicted revenues for the new contract
    if (nova_data_inicio_faturamento ?? currentContract['data_inicio_faturamento']) {
      await gerarPrevistas(
        newContractId,
        ownerId,
        String(currentContract['cliente_nome']),
        String(nova_data_inicio_faturamento ?? currentContract['data_inicio_faturamento']),
        String(novo_vencimento),
        currentContract['conta_id'] as number | null,
        (currentContract['classificacao_mensalidade_id'] as number | null) ?? null,
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
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);
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
      [contratoId, ownerId],
    );

    if (contratoResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contrato não encontrado ou inativo' });
      return;
    }

    const contrato = contratoResult.rows[0] as {
      valor_mensal: string | number;
      cliente_nome: string;
      conta_id: number | null;
      classificacao_mensalidade_id: number | null;
    };

    // Check if a receita already exists for this contract + month
    const receitaResult = await pool.query(
      `SELECT id, status FROM receitas
       WHERE contrato_id = $1
         AND EXTRACT(MONTH FROM data_recebimento) = $2
         AND EXTRACT(YEAR FROM data_recebimento) = $3
         AND usuario_id = $4
         AND status != 'cancelada'`,
      [contratoId, mesNum, anoNum, ownerId],
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
        [existing.id, ownerId],
      );
      resultRow = updated.rows[0] as Record<string, unknown>;
    } else {
      // Create new receita with status faturada
      const dueDate = `${anoNum}-${String(mesNum).padStart(2, '0')}-01`;
      const monthIndex = mesNum - 1;

      // Same source of truth as gerarPrevistas(): sum linked contratos_servicos
      // marked faturando=true. Fall back to valor_mensal only when no service
      // is linked, so contracts billed directly by valor_mensal keep working.
      const servicosResult = await pool.query(
        `SELECT COALESCE(SUM(valor_mensal), 0) AS total
         FROM contratos_servicos
         WHERE contrato_id = $1 AND usuario_id = $2 AND faturando = true`,
        [contratoId, ownerId],
      );
      const somaServicos = parseFloat((servicosResult.rows[0] as { total: string }).total);
      const valor = somaServicos > 0 ? somaServicos : (parseFloat(String(contrato.valor_mensal)) || 0);

      const inserted = await pool.query(
        `INSERT INTO receitas
           (usuario_id, descricao, valor, data_recebimento, mes, ano, status, contrato_id, conta_id, classificacao_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'faturada', $7, $8, $9)
         RETURNING *`,
        [
          ownerId,
          `Mensalidade - ${contrato.cliente_nome}`,
          valor,
          dueDate,
          monthIndex,
          anoNum,
          contratoId,
          contrato.conta_id,
          contrato.classificacao_mensalidade_id,
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
    const ownerId = await resolveAccountOwnerId(req.user!.id, null);

    const contractResult = await pool.query(
      `SELECT ct.*, cl.nome AS cliente_nome
       FROM contratos ct
       LEFT JOIN clientes cl ON cl.id = ct.cliente_id
       WHERE ct.id = $1 AND ct.usuario_id = $2`,
      [contractId, ownerId],
    );

    if (contractResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Contrato não encontrado' });
      return;
    }

    const ct = contractResult.rows[0] as {
      implantacao_parcelas: number | null;
      implantacao_valor_parcela: number | null;
      data_inicio_faturamento: string | null;
      cliente_nome: string;
      conta_id: number | null;
      classificacao_implantacao_id: number | null;
    };

    const parcelas = ct.implantacao_parcelas ?? 1;
    const valorParcela = parseFloat(String(ct.implantacao_valor_parcela ?? 0)) || 0;
    const valorTotal = parcelas * valorParcela;

    if (valorTotal <= 0) {
      res.status(400).json({ success: false, message: 'Contrato sem valor de implantação' });
      return;
    }

    // Contrato sem classificação de implantação (a padrão foi excluída, por
    // exemplo) volta a apontar para a padrão antes de gerar: é por ela que a
    // duplicata é reconhecida.
    let classificacaoImplantacao = ct.classificacao_implantacao_id;
    if (classificacaoImplantacao === null) {
      const classificacoes = await resolveContractClassifications(req.user!.id, ct.conta_id, { mensalidade: null, implantacao: null });
      classificacaoImplantacao = classificacoes?.implantacao ?? null;
      if (classificacaoImplantacao === null) {
        res.status(400).json({ success: false, message: 'Contract has no setup classification' });
        return;
      }
      await pool.query(
        'UPDATE contratos SET classificacao_implantacao_id = $1 WHERE id = $2 AND usuario_id = $3',
        [classificacaoImplantacao, contractId, ownerId],
      );
    }

    // Evitar duplicata
    const existing = await pool.query(
      `SELECT id FROM receitas WHERE contrato_id = $1 AND classificacao_id = $2 AND usuario_id = $3 LIMIT 1`,
      [contractId, classificacaoImplantacao, ownerId],
    );
    if (existing.rows.length > 0) {
      res.json({ success: true, message: 'Receita de implantação já existe', data: existing.rows[0] });
      return;
    }

    const dataRef = ct.data_inicio_faturamento ?? getTodayIsoInTimezone();
    const [ano, mesStr] = dataRef.split('-');
    const mes = parseInt(mesStr!) - 1;

    const result = await pool.query(
      `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, status, contrato_id, classificacao_id, conta_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'prevista', $7, $8, $9)
       RETURNING *`,
      [
        ownerId,
        `Implantação - ${ct.cliente_nome}`,
        valorTotal,
        dataRef,
        mes,
        parseInt(String(ano)),
        contractId,
        classificacaoImplantacao,
        ct.conta_id,
      ],
    );

    res.status(201).json({ success: true, message: 'Receita de implantação criada', data: result.rows[0] });
  } catch (error) {
    console.error('Create implantacao income error:', error);
    res.status(500).json({ success: false, message: 'Failed to create implantacao income' });
  }
});

export default router;
