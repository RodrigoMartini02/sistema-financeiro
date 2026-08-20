import { Router, Request, Response } from 'express';
import { query } from 'express-validator';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { generateReportPdf, formatDate, type ReportRow } from '../services/reportPdf';

const router = Router();

const TIPO_VALUES = ['todos', 'despesas', 'receitas'] as const;
const STATUS_VALUES = ['todos', 'pago', 'pendente'] as const;

function profileWhere(tableAlias: string, profileId: number | null, paramIndex: number): { clause: string; params: unknown[] } {
  if (!profileId) return { clause: '', params: [] };
  return {
    clause: ` AND (${tableAlias}.perfil_id = $${paramIndex} OR (${tableAlias}.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $${paramIndex} AND p.tipo = 'pessoal' AND p.usuario_id = ${tableAlias}.usuario_id)))`,
    params: [profileId],
  };
}

interface DespesaRow {
  descricao: string;
  categoria_nome: string | null;
  forma_pagamento: string | null;
  data_vencimento: string;
  data_compra: string | null;
  data_pagamento: string | null;
  valor_original: string | null;
  valor_final: string | null;
  valor_pago: string | null;
  pago: boolean | null;
  parcela_atual: number | null;
  numero_parcelas: number | null;
  numero_nf: string | null;
  data_emissao_nf: string | null;
}

interface ReceitaRow {
  descricao: string;
  tipo_receita: string | null;
  data_recebimento: string;
  valor: string | null;
  cliente: string | null;
  representante_nome: string | null;
}

async function fetchDespesas(
  userId: number,
  dataInicio: string,
  dataFim: string,
  profileId: number | null,
  formaFiltro: string | undefined,
  statusFiltro: (typeof STATUS_VALUES)[number],
): Promise<DespesaRow[]> {
  let where = 'WHERE d.usuario_id = $1 AND d.data_vencimento >= $2 AND d.data_vencimento <= $3';
  const params: unknown[] = [userId, dataInicio, dataFim];
  let paramIndex = 4;

  if (formaFiltro && formaFiltro !== 'todos') {
    where += ` AND d.forma_pagamento = $${paramIndex}`;
    params.push(formaFiltro);
    paramIndex += 1;
  }

  if (statusFiltro === 'pago') {
    where += ' AND d.pago = true';
  } else if (statusFiltro === 'pendente') {
    where += ' AND d.pago = false';
  }

  const { clause: profileClause, params: profileParams } = profileWhere('d', profileId, paramIndex);
  where += profileClause;
  params.push(...profileParams);

  const result = await pool.query<DespesaRow>(
    `SELECT d.descricao, c.nome AS categoria_nome, d.forma_pagamento,
            d.data_vencimento, d.data_compra, d.data_pagamento,
            d.valor_original, d.valor_final, d.valor_pago, d.pago,
            d.parcela_atual, d.numero_parcelas, d.numero_nf, d.data_emissao_nf
     FROM despesas d
     LEFT JOIN categorias c ON d.categoria_id = c.id
     ${where}
     ORDER BY d.data_vencimento ASC`,
    params,
  );

  return result.rows;
}

async function fetchReceitas(
  userId: number,
  dataInicio: string,
  dataFim: string,
  profileId: number | null,
): Promise<ReceitaRow[]> {
  const { clause: profileClause, params: profileParams } = profileWhere('r', profileId, 4);
  const where = `WHERE r.usuario_id = $1 AND r.data_recebimento >= $2 AND r.data_recebimento <= $3 AND r.status = 'ativa'${profileClause}`;
  const params: unknown[] = [userId, dataInicio, dataFim, ...profileParams];

  const result = await pool.query<ReceitaRow>(
    `SELECT r.descricao, r.tipo_receita, r.data_recebimento, r.valor, r.cliente, rep.nome AS representante_nome
     FROM receitas r
     LEFT JOIN representantes rep ON rep.id = r.representante_id
     ${where}
     ORDER BY r.data_recebimento ASC`,
    params,
  );

  return result.rows;
}

router.get(
  '/pdf',
  authenticate,
  [
    query('data_inicio').isISO8601().withMessage('Invalid start date'),
    query('data_fim').isISO8601().withMessage('Invalid end date'),
    query('tipo').optional().isIn(TIPO_VALUES).withMessage('Invalid tipo filter'),
    query('status').optional().isIn(STATUS_VALUES).withMessage('Invalid status filter'),
    validate,
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { data_inicio, data_fim, tipo, forma, status, perfil_id } = req.query as Record<string, string | undefined>;

      if (data_inicio! > data_fim!) {
        res.status(400).json({ success: false, message: 'data_inicio must not be after data_fim' });
        return;
      }

      const tipoFiltro = (tipo as (typeof TIPO_VALUES)[number] | undefined) ?? 'todos';
      const statusFiltro = (status as (typeof STATUS_VALUES)[number] | undefined) ?? 'todos';
      const profileId = perfil_id ? parseInt(perfil_id) : null;
      const userId = req.user!.id;

      const [despesas, receitas] = await Promise.all([
        tipoFiltro !== 'receitas'
          ? fetchDespesas(userId, data_inicio!, data_fim!, profileId, forma, statusFiltro)
          : Promise.resolve([]),
        tipoFiltro !== 'despesas'
          ? fetchReceitas(userId, data_inicio!, data_fim!, profileId)
          : Promise.resolve([]),
      ]);

      const rows: ReportRow[] = [
        ...despesas.map((d): ReportRow => ({
          tipo: 'despesa',
          descricao: d.descricao,
          categoria: d.categoria_nome,
          formaPagamento: d.forma_pagamento,
          dataVencimento: d.data_vencimento,
          dataCompra: d.data_compra,
          dataPagamento: d.data_pagamento,
          dataRecebimento: null,
          valorOriginal: d.valor_original ? parseFloat(d.valor_original) : null,
          valorFinal: d.valor_final ? parseFloat(d.valor_final) : null,
          valorPago: d.valor_pago ? parseFloat(d.valor_pago) : null,
          pago: d.pago,
          parcelaAtual: d.parcela_atual,
          numeroParcelas: d.numero_parcelas,
          cliente: null,
          representante: null,
          numeroNf: d.numero_nf,
          dataEmissaoNf: d.data_emissao_nf,
        })),
        ...receitas.map((r): ReportRow => ({
          tipo: 'receita',
          descricao: r.descricao,
          categoria: r.tipo_receita,
          formaPagamento: null,
          dataVencimento: null,
          dataCompra: null,
          dataPagamento: null,
          dataRecebimento: r.data_recebimento,
          valorOriginal: r.valor ? parseFloat(r.valor) : null,
          valorFinal: null,
          valorPago: null,
          pago: null,
          parcelaAtual: null,
          numeroParcelas: null,
          cliente: r.cliente,
          representante: r.representante_nome,
          numeroNf: null,
          dataEmissaoNf: null,
        })),
      ];

      const periodoLabel = `${formatDate(data_inicio!)} a ${formatDate(data_fim!)}`;
      const filtrosParts: string[] = [];
      if (tipoFiltro !== 'todos') filtrosParts.push(tipoFiltro === 'despesas' ? 'Só despesas' : 'Só receitas');
      if (forma && forma !== 'todos') filtrosParts.push(`Forma: ${forma}`);
      if (statusFiltro !== 'todos') filtrosParts.push(statusFiltro === 'pago' ? 'Pagas' : 'Pendentes');
      const filtrosLabel = filtrosParts.length > 0 ? filtrosParts.join(' · ') : 'Sem filtros adicionais';

      const pdfBuffer = await generateReportPdf({ periodoLabel, filtrosLabel, rows });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-${data_inicio}-a-${data_fim}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Generate report PDF error:', error);
      res.status(500).json({ success: false, message: 'Erro ao gerar relatório em PDF' });
    }
  },
);

export default router;
