import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

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
router.get('/anual', authenticate, async (req: Request, res: Response): Promise<void> => {
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
        SELECT mes, SUM(valor_final) AS total
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

export default router;
