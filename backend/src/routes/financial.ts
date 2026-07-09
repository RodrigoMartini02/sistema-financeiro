import { Router, Request, Response } from 'express';

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

export default router;
