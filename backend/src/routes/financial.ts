import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate, requireActivePlan } from '../middleware/auth';
import { resolveDashboardScope } from '../utils/dashboardScope';

const router = Router();

async function fetchAporteInicial(userId: number, accountId: number | null): Promise<number> {
  if (!accountId) return 0;
  const result = await pool.query(
    `SELECT aporte_inicial FROM contas WHERE id = $1 AND usuario_id = $2`,
    [accountId, userId],
  );
  const raw = (result.rows[0] as { aporte_inicial: string | null } | undefined)?.aporte_inicial;
  return raw ? parseFloat(raw) : 0;
}

// GET /api/financial/anual?ano=2026
router.get('/anual', authenticate, requireActivePlan, async (req: Request, res: Response): Promise<void> => {
  try {
    const { ano: anoQ, conta_id } = req.query as Record<string, string | undefined>;
    const ano = parseInt(anoQ ?? '');
    if (!ano || ano < 2000 || ano > 2100) {
      res.status(400).json({ success: false, message: 'Parâmetro ano inválido' });
      return;
    }

    const userId = req.user!.id;
    const accountId = conta_id ? parseInt(conta_id) : null;

    const result = await pool.query(
      `SELECT
        gs.mes,
        COALESCE(r.total, 0)::float AS receitas,
        COALESCE(d.total, 0)::float AS despesas,
        COALESCE(m.saldo_final, COALESCE(r.total, 0) - COALESCE(d.total, 0))::float AS saldo_final,
        COALESCE(p.total, 0)::float AS receitas_previstas
      FROM generate_series(0, 11) AS gs(mes)
      LEFT JOIN (
        SELECT mes, SUM(valor) AS total
        FROM receitas
        WHERE ano = $1 AND usuario_id = $2 AND status = 'ativa'
          AND ($3::int IS NULL OR conta_id = $3 OR (conta_id IS NULL AND EXISTS (
            SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
          )))
        GROUP BY mes
      ) r ON r.mes = gs.mes
      LEFT JOIN (
        SELECT mes, SUM(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END) AS total
        FROM despesas
        WHERE ano = $1 AND usuario_id = $2 AND status = 'ativa'
          AND ($3::int IS NULL OR conta_id = $3 OR (conta_id IS NULL AND EXISTS (
            SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
          )))
        GROUP BY mes
      ) d ON d.mes = gs.mes
      LEFT JOIN (
        SELECT DISTINCT ON (mes) mes, saldo_final
        FROM meses
        WHERE ano = $1 AND usuario_id = $2
          AND ($3::int IS NULL OR conta_id = $3 OR (conta_id IS NULL AND EXISTS (
            SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
          )))
        ORDER BY mes, conta_id NULLS LAST
      ) m ON m.mes = gs.mes
      LEFT JOIN (
        SELECT mes, SUM(valor) AS total
        FROM receitas
        WHERE ano = $1 AND usuario_id = $2 AND status IN ('prevista', 'faturada')
          AND ($3::int IS NULL OR conta_id = $3 OR (conta_id IS NULL AND EXISTS (
            SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
          )))
        GROUP BY mes
      ) p ON p.mes = gs.mes
      ORDER BY gs.mes`,
      [ano, userId, accountId],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Dashboard anual error:', error);
    res.status(500).json({ success: false, message: 'Failed to load annual data' });
  }
});

// GET /api/financial/panorama?de_mes=&de_ano=&ate_mes=&ate_ano=&conta_id=
// Todos os parâmetros de período são opcionais — ausência de todos = todo o histórico do usuário.
router.get('/panorama', authenticate, requireActivePlan, async (req: Request, res: Response): Promise<void> => {
  try {
    const { de_mes, de_ano, ate_mes, ate_ano, conta_id, membro_id } = req.query as Record<string, string | undefined>;

    const deMes = de_mes !== undefined ? parseInt(de_mes) : null;
    const deAno = de_ano !== undefined ? parseInt(de_ano) : null;
    const ateMes = ate_mes !== undefined ? parseInt(ate_mes) : null;
    const ateAno = ate_ano !== undefined ? parseInt(ate_ano) : null;

    const deInformado = deAno !== null;
    const ateInformado = ateAno !== null;

    if (deInformado && (Number.isNaN(deAno) || deAno! < 2000 || deAno! > 2100 || (deMes !== null && (Number.isNaN(deMes) || deMes < 0 || deMes > 11)))) {
      res.status(400).json({ success: false, message: 'Parâmetro de período inicial inválido' });
      return;
    }
    if (ateInformado && (Number.isNaN(ateAno) || ateAno! < 2000 || ateAno! > 2100 || (ateMes !== null && (Number.isNaN(ateMes) || ateMes < 0 || ateMes > 11)))) {
      res.status(400).json({ success: false, message: 'Parâmetro de período final inválido' });
      return;
    }

    // Data-limite absoluta de cada extremo, para comparar (ano, mes) como um único valor ordenável.
    const deChave = deInformado ? deAno! * 12 + (deMes ?? 0) : null;
    const ateChave = ateInformado ? ateAno! * 12 + (ateMes ?? 11) : null;

    if (deChave !== null && ateChave !== null && deChave > ateChave) {
      res.status(400).json({ success: false, message: 'Período inicial não pode ser depois do período final' });
      return;
    }

    const userId = req.user!.id;
    const accountId = conta_id ? parseInt(conta_id) : null;

    // Escopo do painel: a familia inteira, ou um membro especifico. O membro
    // pedido vem do cliente e so passa se a carteira permitir enxerga-lo.
    const membroId = membro_id !== undefined ? parseInt(membro_id) : null;
    if (membroId !== null && Number.isNaN(membroId)) {
      res.status(400).json({ success: false, message: 'Parâmetro de membro inválido' });
      return;
    }
    const escopo = await resolveDashboardScope(userId, accountId, membroId);
    if (escopo === null) {
      res.status(400).json({ success: false, message: 'Membro não disponível' });
      return;
    }

    // $1 passou a ser uma LISTA de usuarios (= ANY). O $2 continua sendo um id
    // unico: ele so aparece dentro do contaFiltro, para resgatar registros com
    // conta_id nulo, que pertencem a conta pessoal do dono. Nesse resgate o
    // dono da conta e sempre quem esta olhando, nao o autor do lancamento.
    const contaFiltro = `($3::int IS NULL OR conta_id = $3 OR (conta_id IS NULL AND EXISTS (
      SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
    )))`;

    // Intervalo comparado como (ano * 12 + mes), cobrindo o mês inteiro em cada extremo.
    const periodoFiltro = `(ano * 12 + mes) BETWEEN COALESCE($4::int, -2147483648) AND COALESCE($5::int, 2147483647)`;

    const params = [escopo, userId, accountId, deChave, ateChave];

    const [totaisResult, categoriaResult, formaResult, origemResult, anteriorResult, despesasDetalheResult, cartaoResult, emAbertoResult] = await Promise.all([
      pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN origem = 'receita' THEN valor ELSE 0 END), 0)::float AS receitas,
          COALESCE(SUM(CASE WHEN origem = 'despesa' THEN valor ELSE 0 END), 0)::float AS despesas,
          COUNT(*) FILTER (WHERE origem = 'receita')::int AS total_receitas,
          COUNT(*) FILTER (WHERE origem = 'despesa')::int AS total_despesas,
          MIN(data)::text AS primeira_data,
          MAX(data)::text AS ultima_data
        FROM (
          SELECT valor, data_recebimento AS data, 'receita' AS origem
          FROM receitas
          WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodoFiltro} AND ${contaFiltro}
          UNION ALL
          SELECT CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END AS valor, data_vencimento AS data, 'despesa' AS origem
          FROM despesas
          WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodoFiltro} AND ${contaFiltro}
        ) t`,
        params,
      ),
      pool.query(
        `SELECT COALESCE(c.nome, 'Sem categoria') AS categoria, SUM(CASE WHEN d.pago THEN COALESCE(d.valor_pago, d.valor_original) ELSE d.valor_original END)::float AS total
         FROM despesas d
         LEFT JOIN categorias c ON d.categoria_id = c.id
         WHERE d.usuario_id = ANY($1) AND d.status = 'ativa' AND (d.ano * 12 + d.mes) BETWEEN COALESCE($4::int, -2147483648) AND COALESCE($5::int, 2147483647)
           AND ($3::int IS NULL OR d.conta_id = $3 OR (d.conta_id IS NULL AND EXISTS (
             SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
           )))
         GROUP BY c.nome
         ORDER BY total DESC`,
        params,
      ),
      pool.query(
        `SELECT COALESCE(forma_pagamento, 'dinheiro') AS forma_pagamento, SUM(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END)::float AS total
         FROM despesas
         WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodoFiltro} AND ${contaFiltro}
         GROUP BY forma_pagamento
         ORDER BY total DESC`,
        params,
      ),
      pool.query(
        `SELECT CASE WHEN contrato_id IS NOT NULL THEN 'contrato' ELSE 'avulsa' END AS origem, SUM(valor)::float AS total
         FROM receitas
         WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodoFiltro} AND ${contaFiltro}
         GROUP BY (contrato_id IS NOT NULL)`,
        params,
      ),
      // No modo "todo o período" (deChave null) o filtro já cobre desde sempre — não
      // há "antes" a consultar, então o saldo anterior é resolvido depois só com o
      // aporte inicial da conta, sem query aqui. Quando deChave existe, a query usa
      // índices de parâmetro próprios ($1 = userId, $3 = accountId) — não reaproveita
      // o `contaFiltro` do escopo externo, que assume $2 = userId vindo de `params`;
      // aqui $2 é `deChave`, não userId.
      deChave === null
        ? Promise.resolve({ rows: [{ saldo_anterior: 0, eh_inicio_historico: true }] })
        : pool.query(
            `SELECT COALESCE(SUM(CASE WHEN origem = 'receita' THEN valor ELSE -valor END), 0)::float AS saldo_anterior,
              NOT EXISTS (
                SELECT 1 FROM receitas WHERE usuario_id = ANY($1) AND status = 'ativa' AND (ano * 12 + mes) < $2::int
                  AND ($3::int IS NULL OR conta_id = $3 OR (conta_id IS NULL AND EXISTS (
                    SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $4
                  )))
                UNION ALL
                SELECT 1 FROM despesas WHERE usuario_id = ANY($1) AND status = 'ativa' AND (ano * 12 + mes) < $2::int
                  AND ($3::int IS NULL OR conta_id = $3 OR (conta_id IS NULL AND EXISTS (
                    SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $4
                  )))
              ) AS eh_inicio_historico
             FROM (
               SELECT valor, 'receita' AS origem
               FROM receitas
               WHERE usuario_id = ANY($1) AND status = 'ativa' AND (ano * 12 + mes) < $2::int
                 AND ($3::int IS NULL OR conta_id = $3 OR (conta_id IS NULL AND EXISTS (
                   SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $4
                 )))
               UNION ALL
               SELECT CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END AS valor, 'despesa' AS origem
               FROM despesas
               WHERE usuario_id = ANY($1) AND status = 'ativa' AND (ano * 12 + mes) < $2::int
                 AND ($3::int IS NULL OR conta_id = $3 OR (conta_id IS NULL AND EXISTS (
                   SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $4
                 )))
             ) t`,
            [escopo, deChave, accountId, userId],
          ),
      pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN valor_original IS NOT NULL AND (CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END - valor_original) > 0 THEN (CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END - valor_original) ELSE 0 END), 0)::float AS juros,
          COALESCE(SUM(CASE WHEN valor_original IS NOT NULL AND (CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END - valor_original) < 0 THEN ABS(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END - valor_original) ELSE 0 END), 0)::float AS descontos,
          COALESCE(SUM(CASE WHEN recorrente THEN (CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END) ELSE 0 END), 0)::float AS fixas,
          COALESCE(SUM(CASE WHEN NOT recorrente THEN (CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END) ELSE 0 END), 0)::float AS variaveis,
          -- Parcela contratada e compromisso, nao gasto flexivel: sai de dentro
          -- de "variaveis" para a tela poder mostrar o que de fato da para cortar.
          COALESCE(SUM(CASE WHEN parcelado AND NOT recorrente THEN (CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END) ELSE 0 END), 0)::float AS parceladas,
          COALESCE(SUM(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE 0 END), 0)::float AS pagas,
          COALESCE(SUM(CASE WHEN NOT pago THEN valor_original ELSE 0 END), 0)::float AS pendentes
        FROM despesas
        WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodoFiltro} AND ${contaFiltro}`,
        params,
      ),
      // Gasto por cartao. O join com cartoes so alcanca cartao do proprio
      // escopo, porque a despesa ja esta filtrada por usuario e conta.
      pool.query(
        `SELECT c.nome AS cartao, SUM(CASE WHEN d.pago THEN COALESCE(d.valor_pago, d.valor_original) ELSE d.valor_original END)::float AS total
         FROM despesas d
         JOIN cartoes c ON c.id = d.cartao_id
         WHERE d.usuario_id = ANY($1) AND d.status = 'ativa'
           AND (d.ano * 12 + d.mes) BETWEEN COALESCE($4::int, -2147483648) AND COALESCE($5::int, 2147483647)
           AND ($3::int IS NULL OR d.conta_id = $3 OR (d.conta_id IS NULL AND EXISTS (
             SELECT 1 FROM contas pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
           )))
         GROUP BY c.nome
         ORDER BY total DESC`,
        params,
      ),
      // Vencidas e a vencer sao ABSOLUTAS: nao passam pelo filtro de periodo.
      // Uma conta vencida em agosto continua vencida quando se olha dezembro —
      // filtra-la por periodo a esconderia de quem mais precisa ve-la.
      pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN data_vencimento < CURRENT_DATE THEN valor_original ELSE 0 END), 0)::float AS vencido_total,
          COUNT(*) FILTER (WHERE data_vencimento < CURRENT_DATE)::int AS vencido_quantidade,
          COALESCE(SUM(CASE WHEN data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 THEN valor_original ELSE 0 END), 0)::float AS a_vencer_total,
          COUNT(*) FILTER (WHERE data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)::int AS a_vencer_quantidade
         FROM despesas
         WHERE usuario_id = ANY($1) AND status = 'ativa' AND pago = false AND ${contaFiltro}`,
        [escopo, userId, accountId],
      ),
    ]);

    const totaisPrevia = totaisResult.rows[0] as { primeira_data: string | null };

    // Granularidade da série: mês se o intervalo tiver até 24 meses, ano caso contrário.
    // No modo "todo o período" (sem de/ate), o intervalo real é calculado a partir da
    // primeira data com lançamento até hoje, em vez de assumir 'ano' incondicionalmente.
    let totalMesesNoIntervalo: number | null;
    if (deChave !== null && ateChave !== null) {
      totalMesesNoIntervalo = ateChave - deChave + 1;
    } else if (totaisPrevia.primeira_data) {
      const primeira = new Date(totaisPrevia.primeira_data);
      const primeiraChave = primeira.getFullYear() * 12 + primeira.getMonth();
      const hojeChave = new Date().getFullYear() * 12 + new Date().getMonth();
      totalMesesNoIntervalo = hojeChave - primeiraChave + 1;
    } else {
      totalMesesNoIntervalo = null;
    }
    const granularidade: 'mes' | 'ano' = totalMesesNoIntervalo !== null && totalMesesNoIntervalo <= 24 ? 'mes' : 'ano';

    const serieResult = granularidade === 'mes'
      ? await pool.query(
          `SELECT
            ano, mes,
            COALESCE(SUM(CASE WHEN origem = 'receita' THEN valor ELSE 0 END), 0)::float AS receitas,
            COALESCE(SUM(CASE WHEN origem = 'despesa' THEN valor ELSE 0 END), 0)::float AS despesas
          FROM (
            SELECT ano, mes, valor, 'receita' AS origem
            FROM receitas
            WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodoFiltro} AND ${contaFiltro}
            UNION ALL
            SELECT ano, mes, CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END AS valor, 'despesa' AS origem
            FROM despesas
            WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodoFiltro} AND ${contaFiltro}
          ) t
          GROUP BY ano, mes
          ORDER BY ano, mes`,
          params,
        )
      : await pool.query(
          `SELECT
            ano, NULL::int AS mes,
            COALESCE(SUM(CASE WHEN origem = 'receita' THEN valor ELSE 0 END), 0)::float AS receitas,
            COALESCE(SUM(CASE WHEN origem = 'despesa' THEN valor ELSE 0 END), 0)::float AS despesas
          FROM (
            SELECT ano, valor, 'receita' AS origem
            FROM receitas
            WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodoFiltro} AND ${contaFiltro}
            UNION ALL
            SELECT ano, CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END AS valor, 'despesa' AS origem
            FROM despesas
            WHERE usuario_id = ANY($1) AND status = 'ativa' AND ${periodoFiltro} AND ${contaFiltro}
          ) t
          GROUP BY ano
          ORDER BY ano`,
          params,
        );

    const totais = totaisResult.rows[0] as {
      receitas: number; despesas: number; total_receitas: number; total_despesas: number;
      primeira_data: string | null; ultima_data: string | null;
    };
    const despesasDetalhe = despesasDetalheResult.rows[0] as {
      juros: number; descontos: number; fixas: number; variaveis: number;
      parceladas: number; pagas: number; pendentes: number;
    };

    // Aplica o aporte inicial da conta (saldo de abertura) uma única vez, quando o
    // período filtrado começa no início real do histórico da conta — nunca em
    // "buracos" no meio do histórico, para não contar o aporte mais de uma vez.
    const anterior = anteriorResult.rows[0] as { saldo_anterior: number; eh_inicio_historico: boolean };
    const saldoAnterior = anterior.eh_inicio_historico
      ? anterior.saldo_anterior + await fetchAporteInicial(userId, accountId)
      : anterior.saldo_anterior;

    res.json({
      success: true,
      data: {
        receitas: totais.receitas,
        despesas: totais.despesas,
        saldoAnterior,
        saldoFinal: saldoAnterior + totais.receitas - totais.despesas,
        totalLancamentos: totais.total_receitas + totais.total_despesas,
        primeiraData: totais.primeira_data,
        ultimaData: totais.ultima_data,
        porCategoria: categoriaResult.rows,
        porFormaPagamento: formaResult.rows,
        porOrigem: origemResult.rows,
        porCartao: cartaoResult.rows,
        emAberto: emAbertoResult.rows[0],
        granularidade,
        serie: serieResult.rows,
        despesasDetalhe,
      },
    });
  } catch (error) {
    console.error('Dashboard panorama error:', error);
    res.status(500).json({ success: false, message: 'Failed to load panorama data' });
  }
});

export default router;
