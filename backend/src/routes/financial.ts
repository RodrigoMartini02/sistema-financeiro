import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate, requireActivePlan } from '../middleware/auth';

const router = Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MONTHLY_RATE = 1.17;

interface SelicCache {
  monthly_rate: number;
  annual_rate: number;
  date: string;
  timestamp: number;
}

let selicCache: SelicCache | null = null;

function calcAnnualRate(monthlyRate: number): number {
  return (Math.pow(1 + monthlyRate / 100, 12) - 1) * 100;
}

// GET /api/financial/selic — public, no auth required
router.get('/selic', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (selicCache && Date.now() - selicCache.timestamp < CACHE_TTL_MS) {
      res.json({
        success: true,
        taxa_mensal: selicCache.monthly_rate,
        taxa_anual: selicCache.annual_rate,
        data: selicCache.date,
        fonte: 'cache',
      });
      return;
    }

    const bcbUrl = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados/ultimos/1?formato=json';
    const response = await fetch(bcbUrl, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      throw new Error(`BCB returned status ${response.status}`);
    }

    const dados = (await response.json()) as Array<{ valor: string; data: string }>;

    if (!Array.isArray(dados) || dados.length === 0) {
      throw new Error('Unexpected BCB response');
    }

    const monthly_rate = parseFloat(dados[0]!.valor);
    const annual_rate = calcAnnualRate(monthly_rate);
    const date = dados[0]!.data;

    selicCache = { monthly_rate, annual_rate, date, timestamp: Date.now() };

    res.json({ success: true, taxa_mensal: monthly_rate, taxa_anual: annual_rate, data: date, fonte: 'bcb' });
  } catch (err) {
    console.warn('[financial] Failed to fetch Selic from BCB:', (err as Error).message);

    const monthly_rate = selicCache ? selicCache.monthly_rate : DEFAULT_MONTHLY_RATE;
    const annual_rate = selicCache ? selicCache.annual_rate : calcAnnualRate(DEFAULT_MONTHLY_RATE);
    const date = selicCache ? selicCache.date : null;

    res.json({ success: true, taxa_mensal: monthly_rate, taxa_anual: annual_rate, data: date, fonte: 'fallback' });
  }
});

// GET /api/financial/anual?ano=2026
router.get('/anual', authenticate, requireActivePlan, async (req: Request, res: Response): Promise<void> => {
  try {
    const { ano: anoQ, perfil_id } = req.query as Record<string, string | undefined>;
    const ano = parseInt(anoQ ?? '');
    if (!ano || ano < 2000 || ano > 2100) {
      res.status(400).json({ success: false, message: 'Parâmetro ano inválido' });
      return;
    }

    const userId = req.user!.id;
    const perfilId = perfil_id ? parseInt(perfil_id) : null;

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
          AND ($3::int IS NULL OR perfil_id = $3 OR (perfil_id IS NULL AND EXISTS (
            SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
          )))
        GROUP BY mes
      ) r ON r.mes = gs.mes
      LEFT JOIN (
        SELECT mes, SUM(COALESCE(valor_final, valor_original)) AS total
        FROM despesas
        WHERE ano = $1 AND usuario_id = $2
          AND ($3::int IS NULL OR perfil_id = $3 OR (perfil_id IS NULL AND EXISTS (
            SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
          )))
        GROUP BY mes
      ) d ON d.mes = gs.mes
      LEFT JOIN (
        SELECT DISTINCT ON (mes) mes, saldo_final
        FROM meses
        WHERE ano = $1 AND usuario_id = $2
          AND ($3::int IS NULL OR perfil_id = $3 OR (perfil_id IS NULL AND EXISTS (
            SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
          )))
        ORDER BY mes, perfil_id NULLS LAST
      ) m ON m.mes = gs.mes
      LEFT JOIN (
        SELECT mes, SUM(valor) AS total
        FROM receitas
        WHERE ano = $1 AND usuario_id = $2 AND status IN ('prevista', 'faturada')
          AND ($3::int IS NULL OR perfil_id = $3 OR (perfil_id IS NULL AND EXISTS (
            SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
          )))
        GROUP BY mes
      ) p ON p.mes = gs.mes
      ORDER BY gs.mes`,
      [ano, userId, perfilId],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Dashboard anual error:', error);
    res.status(500).json({ success: false, message: 'Failed to load annual data' });
  }
});

// GET /api/financial/panorama?de_mes=&de_ano=&ate_mes=&ate_ano=&perfil_id=
// Todos os parâmetros de período são opcionais — ausência de todos = todo o histórico do usuário.
router.get('/panorama', authenticate, requireActivePlan, async (req: Request, res: Response): Promise<void> => {
  try {
    const { de_mes, de_ano, ate_mes, ate_ano, perfil_id } = req.query as Record<string, string | undefined>;

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
    const perfilId = perfil_id ? parseInt(perfil_id) : null;

    const perfilFiltro = `($3::int IS NULL OR perfil_id = $3 OR (perfil_id IS NULL AND EXISTS (
      SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
    )))`;

    // Intervalo comparado como (ano * 12 + mes), cobrindo o mês inteiro em cada extremo.
    const periodoFiltro = `(ano * 12 + mes) BETWEEN COALESCE($4::int, -2147483648) AND COALESCE($5::int, 2147483647)`;

    const params = [userId, userId, perfilId, deChave, ateChave];

    const [totaisResult, categoriaResult, formaResult, origemResult, anteriorResult, despesasDetalheResult] = await Promise.all([
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
          WHERE usuario_id = $1 AND status = 'ativa' AND ${periodoFiltro} AND ${perfilFiltro}
          UNION ALL
          SELECT COALESCE(valor_final, valor_original) AS valor, data_vencimento AS data, 'despesa' AS origem
          FROM despesas
          WHERE usuario_id = $1 AND status = 'ativa' AND ${periodoFiltro} AND ${perfilFiltro}
        ) t`,
        params,
      ),
      pool.query(
        `SELECT COALESCE(c.nome, 'Sem categoria') AS categoria, SUM(COALESCE(d.valor_final, d.valor_original))::float AS total
         FROM despesas d
         LEFT JOIN categorias c ON d.categoria_id = c.id
         WHERE d.usuario_id = $1 AND d.status = 'ativa' AND (d.ano * 12 + d.mes) BETWEEN COALESCE($4::int, -2147483648) AND COALESCE($5::int, 2147483647)
           AND ($3::int IS NULL OR d.perfil_id = $3 OR (d.perfil_id IS NULL AND EXISTS (
             SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
           )))
         GROUP BY c.nome
         ORDER BY total DESC`,
        params,
      ),
      pool.query(
        `SELECT COALESCE(forma_pagamento, 'dinheiro') AS forma_pagamento, SUM(COALESCE(valor_final, valor_original))::float AS total
         FROM despesas
         WHERE usuario_id = $1 AND status = 'ativa' AND ${periodoFiltro} AND ${perfilFiltro}
         GROUP BY forma_pagamento
         ORDER BY total DESC`,
        params,
      ),
      pool.query(
        `SELECT CASE WHEN contrato_id IS NOT NULL THEN 'contrato' ELSE 'avulsa' END AS origem, SUM(valor)::float AS total
         FROM receitas
         WHERE usuario_id = $1 AND status = 'ativa' AND ${periodoFiltro} AND ${perfilFiltro}
         GROUP BY (contrato_id IS NOT NULL)`,
        params,
      ),
      deChave === null
        ? Promise.resolve({ rows: [{ saldo_anterior: 0 }] })
        : pool.query(
            `SELECT COALESCE(SUM(CASE WHEN origem = 'receita' THEN valor ELSE -valor END), 0)::float AS saldo_anterior
             FROM (
               SELECT valor, 'receita' AS origem
               FROM receitas
               WHERE usuario_id = $1 AND status = 'ativa' AND (ano * 12 + mes) < $2::int AND ${perfilFiltro}
               UNION ALL
               SELECT COALESCE(valor_final, valor_original) AS valor, 'despesa' AS origem
               FROM despesas
               WHERE usuario_id = $1 AND status = 'ativa' AND (ano * 12 + mes) < $2::int AND ${perfilFiltro}
             ) t`,
            [userId, deChave, perfilId],
          ),
      pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN valor_original IS NOT NULL AND (COALESCE(valor_final, valor_original) - valor_original) > 0 THEN (COALESCE(valor_final, valor_original) - valor_original) ELSE 0 END), 0)::float AS juros,
          COALESCE(SUM(CASE WHEN valor_original IS NOT NULL AND (COALESCE(valor_final, valor_original) - valor_original) < 0 THEN ABS(COALESCE(valor_final, valor_original) - valor_original) ELSE 0 END), 0)::float AS descontos,
          COALESCE(SUM(CASE WHEN recorrente THEN COALESCE(valor_final, valor_original) ELSE 0 END), 0)::float AS fixas,
          COALESCE(SUM(CASE WHEN NOT recorrente THEN COALESCE(valor_final, valor_original) ELSE 0 END), 0)::float AS variaveis,
          COALESCE(SUM(CASE WHEN tipo_despesa = 'opex' THEN COALESCE(valor_final, valor_original) ELSE 0 END), 0)::float AS opex,
          COALESCE(SUM(CASE WHEN tipo_despesa = 'capex' THEN COALESCE(valor_final, valor_original) ELSE 0 END), 0)::float AS capex,
          COALESCE(SUM(CASE WHEN pago THEN COALESCE(valor_final, valor_original) ELSE 0 END), 0)::float AS pagas,
          COALESCE(SUM(CASE WHEN NOT pago THEN COALESCE(valor_final, valor_original) ELSE 0 END), 0)::float AS pendentes
        FROM despesas
        WHERE usuario_id = $1 AND status = 'ativa' AND ${periodoFiltro} AND ${perfilFiltro}`,
        params,
      ),
    ]);

    // Granularidade da série: mês se o intervalo tiver até 24 meses, ano caso contrário ou "todo o período".
    const totalMesesNoIntervalo = deChave !== null && ateChave !== null ? ateChave - deChave + 1 : null;
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
            WHERE usuario_id = $1 AND status = 'ativa' AND ${periodoFiltro} AND ${perfilFiltro}
            UNION ALL
            SELECT ano, mes, COALESCE(valor_final, valor_original) AS valor, 'despesa' AS origem
            FROM despesas
            WHERE usuario_id = $1 AND status = 'ativa' AND ${periodoFiltro} AND ${perfilFiltro}
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
            WHERE usuario_id = $1 AND status = 'ativa' AND ${periodoFiltro} AND ${perfilFiltro}
            UNION ALL
            SELECT ano, COALESCE(valor_final, valor_original) AS valor, 'despesa' AS origem
            FROM despesas
            WHERE usuario_id = $1 AND status = 'ativa' AND ${periodoFiltro} AND ${perfilFiltro}
          ) t
          GROUP BY ano
          ORDER BY ano`,
          params,
        );

    const totais = totaisResult.rows[0] as {
      receitas: number; despesas: number; total_receitas: number; total_despesas: number;
      primeira_data: string | null; ultima_data: string | null;
    };
    const saldoAnterior = (anteriorResult.rows[0] as { saldo_anterior: number }).saldo_anterior;
    const despesasDetalhe = despesasDetalheResult.rows[0] as {
      juros: number; descontos: number; fixas: number; variaveis: number;
      opex: number; capex: number; pagas: number; pendentes: number;
    };

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
