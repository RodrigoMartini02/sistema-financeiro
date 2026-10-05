import { timingSafeEqual } from 'crypto';
import { Router, Request, Response } from 'express';
import { processPlanLifecycle } from '../services/plan-lifecycle';
import { processExpenseAlerts } from '../services/expenseAlerts';
import { topUpOpenEndedContracts } from '../services/contractIncomes';
import { processFixedIncomes } from '../services/fixedIncomes';

const router = Router();

function hasValidCronSecret(providedSecret: string | undefined, envVarName: string): boolean {
  const configuredSecret = process.env[envVarName];
  if (!configuredSecret || !providedSecret) {
    return false;
  }

  const configuredBuffer = Buffer.from(configuredSecret);
  const providedBuffer = Buffer.from(providedSecret);

  return configuredBuffer.length === providedBuffer.length
    && timingSafeEqual(configuredBuffer, providedBuffer);
}

router.post('/plan-lifecycle', async (req: Request, res: Response): Promise<void> => {
  if (!hasValidCronSecret(req.header('x-billing-cron-secret') ?? undefined, 'BILLING_CRON_SECRET')) {
    res.status(401).json({ success: false, message: 'Access denied.' });
    return;
  }

  try {
    const result = await processPlanLifecycle();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[internal jobs] Plan lifecycle failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Failed to process plan lifecycle.' });
  }
});

router.post('/expense-alerts', async (req: Request, res: Response): Promise<void> => {
  if (!hasValidCronSecret(req.header('x-expense-alerts-cron-secret') ?? undefined, 'EXPENSE_ALERTS_CRON_SECRET')) {
    res.status(401).json({ success: false, message: 'Access denied.' });
    return;
  }

  // A mesma rotina diária lança as receitas fixas do dia (e manda o push) e
  // completa os contratos sem prazo: sem agendamento nem segredo novos no Render.
  try {
    const result = await processExpenseAlerts();
    const fixedIncomes = await processFixedIncomes();
    const contractIncomes = await topUpOpenEndedContracts({ all: true });
    res.json({ success: true, data: { ...result, fixedIncomes, contractIncomes } });
  } catch (error) {
    console.error('[internal jobs] Expense alerts failed:', (error as Error).message);
    res.status(500).json({ success: false, message: 'Failed to process expense alerts.' });
  }
});

export default router;
