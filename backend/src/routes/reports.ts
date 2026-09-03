import { Router, Request, Response } from 'express';
import { query } from 'express-validator';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { generateReportPdf, formatDate, type DespesaReportRow, type ReceitaReportRow } from '../services/reportPdf';
import { accountWhere as accountWhereBase } from '../utils/accountFilter';

const router = Router();

const TIPO_VALUES = ['todos', 'despesas', 'receitas'] as const;
const STATUS_VALUES = ['todos', 'pago', 'pendente'] as const;

function accountWhere(tableAlias: string, accountId: number | null, paramIndex: number): { clause: string; params: unknown[] } {
  return accountWhereBase(accountId, paramIndex, tableAlias);
}

interface DespesaRow {
  descricao: string;
  categoria_nome: string | null;
  forma_pagamento: string | null;
  data_vencimento: string;
  data_compra: string | null;
  valor_final: string | null;
  pago: boolean | null;
  recorrente: boolean | null;
  parcela_atual: number | null;
  numero_parcelas: number | null;
}

interface ReceitaRow {
  descricao: string;
  tipo_receita: string | null;
  data_recebimento: string;
  status: string | null;
  valor: string | null;
  valor_comissao: string | null;
  cliente: string | null;
  representante_nome: string | null;
}

async function fetchDespesas(
  userId: number,
  dataInicio: string,
  dataFim: string,
  accountId: number | null,
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

  const { clause: accountClause, params: accountParams } = accountWhere('d', accountId, paramIndex);
  where += accountClause;
  params.push(...accountParams);

  const result = await pool.query<DespesaRow>(
    `SELECT d.descricao, c.nome AS categoria_nome, d.forma_pagamento,
            d.data_vencimento, d.data_compra, d.valor_final, d.pago,
            d.recorrente, d.parcela_atual, d.numero_parcelas
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
  accountId: number | null,
): Promise<ReceitaRow[]> {
  const { clause: accountClause, params: accountParams } = accountWhere('r', accountId, 4);
  const where = `WHERE r.usuario_id = $1 AND r.data_recebimento >= $2 AND r.data_recebimento <= $3 AND r.status != 'cancelada'${accountClause}`;
  const params: unknown[] = [userId, dataInicio, dataFim, ...accountParams];

  const result = await pool.query<ReceitaRow>(
    `SELECT r.descricao, r.tipo_receita, r.data_recebimento, r.status,
            r.valor, r.valor_comissao, r.cliente, rep.nome AS representante_nome
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
      const { data_inicio, data_fim, tipo, forma, status, conta_id } = req.query as Record<string, string | undefined>;

      if (data_inicio! > data_fim!) {
        res.status(400).json({ success: false, message: 'data_inicio must not be after data_fim' });
        return;
      }

      const tipoFiltro = (tipo as (typeof TIPO_VALUES)[number] | undefined) ?? 'todos';
      const statusFiltro = (status as (typeof STATUS_VALUES)[number] | undefined) ?? 'todos';
      const accountId = conta_id ? parseInt(conta_id) : null;
      const userId = req.user!.id;

      const [despesas, receitas] = await Promise.all([
        tipoFiltro !== 'receitas'
          ? fetchDespesas(userId, data_inicio!, data_fim!, accountId, forma, statusFiltro)
          : Promise.resolve([]),
        tipoFiltro !== 'despesas'
          ? fetchReceitas(userId, data_inicio!, data_fim!, accountId)
          : Promise.resolve([]),
      ]);

      const despesaRows: DespesaReportRow[] = despesas.map((d) => ({
        descricao: d.descricao,
        categoria: d.categoria_nome,
        formaPagamento: d.forma_pagamento,
        dataVencimento: d.data_vencimento,
        dataCompra: d.data_compra,
        valorFinal: d.valor_final ? parseFloat(d.valor_final) : null,
        pago: d.pago === true,
        recorrente: d.recorrente === true,
        parcelaAtual: d.parcela_atual,
        numeroParcelas: d.numero_parcelas,
      }));

      const receitaRows: ReceitaReportRow[] = receitas.map((r) => ({
        descricao: r.descricao,
        tipoReceita: r.tipo_receita,
        dataRecebimento: r.data_recebimento,
        status: r.status,
        cliente: r.cliente,
        representante: r.representante_nome,
        valor: r.valor ? parseFloat(r.valor) : null,
        valorComissao: r.valor_comissao ? parseFloat(r.valor_comissao) : null,
      }));

      const periodoLabel = `${formatDate(data_inicio!)} a ${formatDate(data_fim!)}`;
      const filtrosParts: string[] = [];
      if (tipoFiltro !== 'todos') filtrosParts.push(tipoFiltro === 'despesas' ? 'Só despesas' : 'Só receitas');
      if (forma && forma !== 'todos') filtrosParts.push(`Forma: ${forma}`);
      if (statusFiltro !== 'todos') filtrosParts.push(statusFiltro === 'pago' ? 'Pagas' : 'Pendentes');
      const filtrosLabel = filtrosParts.length > 0 ? filtrosParts.join(' · ') : 'Sem filtros adicionais';

      const pdfBuffer = await generateReportPdf({ periodoLabel, filtrosLabel, despesas: despesaRows, receitas: receitaRows });

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
