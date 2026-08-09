import { timingSafeEqual } from 'crypto';
import { Router, Request, Response } from 'express';
import { processPlanLifecycle } from '../services/plan-lifecycle';

const router = Router();

function hasValidCronSecret(providedSecret: string | undefined): boolean {
  const configuredSecret = process.env['BILLING_CRON_SECRET'];
  if (!configuredSecret || !providedSecret) {
    return false;
  }

  const configuredBuffer = Buffer.from(configuredSecret);
  const providedBuffer = Buffer.from(providedSecret);

  return configuredBuffer.length === providedBuffer.length
    && timingSafeEqual(configuredBuffer, providedBuffer);
}

router.post('/plan-lifecycle', async (req: Request, res: Response): Promise<void> => {
  if (!hasValidCronSecret(req.header('x-billing-cron-secret') ?? undefined)) {
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

export default router;
