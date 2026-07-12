import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

const PAYPAL_MODE = process.env['PAYPAL_MODE'] ?? 'sandbox';
const PAYPAL_CLIENT_ID = process.env['PAYPAL_CLIENT_ID'];
const PAYPAL_SECRET = process.env['PAYPAL_CLIENT_SECRET'];
const PAYPAL_BASE = PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://sistema-financeiro-kxed.onrender.com';

async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Failed to obtain PayPal access token');
  return data.access_token;
}

async function fetchCaptureDetails(captureId: string): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE}/v2/payments/captures/${captureId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

async function activatePlan(userId: number, planType: string, paypalOrderId: string): Promise<void> {
  const daysToAdd = planType === 'anual' ? 365 : 30;
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + daysToAdd);
  await pool.query(
    `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2,
     plano_inicio = NOW(), payment_id_anual = $3
     WHERE id = $4`,
    [planType, expiration, paypalOrderId, userId],
  );
}

// GET /api/paypal/config — public
router.get('/config', (_req: Request, res: Response): void => {
  if (!PAYPAL_CLIENT_ID) {
    res.status(503).json({ success: false, message: 'PayPal not configured' });
    return;
  }
  res.json({ success: true, clientId: PAYPAL_CLIENT_ID, mode: PAYPAL_MODE });
});

// POST /api/paypal/create-order
router.post('/create-order', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { tipo } = req.body as { tipo: unknown };

  if (!['mensal', 'anual'].includes(String(tipo))) {
    res.status(400).json({ success: false, message: 'Invalid plan type' });
    return;
  }

  if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
    res.status(503).json({ success: false, message: 'PayPal not configured on server' });
    return;
  }

  const amount = String(tipo) === 'mensal' ? '4.99' : '422.28';
  const description = `FINGERENCE - Plano ${String(tipo) === 'mensal' ? 'Mensal' : 'Anual'}`;

  try {
    const token = await getAccessToken();

    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: `${req.user!.id}_${tipo}`, description, amount: { currency_code: 'BRL', value: amount } }],
        application_context: { brand_name: 'FINGERENCE', locale: 'pt-BR', return_url: `${FRONTEND_URL}/app.html`, cancel_url: `${FRONTEND_URL}/app.html` },
      }),
    });

    const order = (await orderRes.json()) as { id?: string };
    if (!order.id) {
      console.error('[PayPal] Error creating order:', order);
      res.status(500).json({ success: false, message: 'Failed to create PayPal order' });
      return;
    }

    res.json({ success: true, orderID: order.id });
  } catch (error) {
    console.error('[PayPal] create-order error:', error);
    res.status(500).json({ success: false, message: 'Internal error processing PayPal' });
  }
});

// POST /api/paypal/capture-order
router.post('/capture-order', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { orderID, tipo } = req.body as { orderID: unknown; tipo: unknown };

  if (!orderID || !['mensal', 'anual'].includes(String(tipo))) {
    res.status(400).json({ success: false, message: 'Invalid data' });
    return;
  }

  try {
    const token = await getAccessToken();

    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    const capture = (await captureRes.json()) as Record<string, unknown>;

    if (capture['status'] !== 'COMPLETED') {
      console.error('[PayPal] Capture not completed:', capture);
      res.status(400).json({ success: false, message: 'Payment not approved by PayPal' });
      return;
    }

    const units = capture['purchase_units'] as Array<Record<string, unknown>> | undefined;
    const captures = (units?.[0]?.['payments'] as Record<string, unknown> | undefined)?.['captures'] as Array<Record<string, unknown>> | undefined;
    const captured = parseFloat(String((captures?.[0]?.['amount'] as Record<string, unknown> | undefined)?.['value'] ?? 0));
    const confirmedType = captured >= 200 ? 'anual' : 'mensal';

    await activatePlan(req.user!.id, confirmedType, String(orderID));
    console.log(`[PayPal] Plan ${confirmedType} activated for user ${req.user!.id} (order: ${orderID})`);

    res.json({ success: true, message: 'Plan activated successfully!', tipo: confirmedType });
  } catch (error) {
    console.error('[PayPal] capture-order error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm PayPal payment' });
  }
});

// POST /api/paypal/webhook — public, responds quickly
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  res.sendStatus(200);

  const body = req.body as Record<string, unknown>;
  const eventType = body['event_type'];
  const resource = body['resource'] as Record<string, unknown> | undefined;

  if (!eventType || !resource) return;

  try {
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const captureId = String(resource['id'] ?? '');
      if (!captureId) return;

      // Nunca confiar nos dados do corpo do webhook — reconsultar a API da
      // PayPal para confirmar que a captura é real antes de ativar o plano.
      const capture = await fetchCaptureDetails(captureId);
      if (!capture || capture['status'] !== 'COMPLETED') {
        console.warn(`[PayPal Webhook] Captura ${captureId} não confirmada como COMPLETED na API da PayPal`);
        return;
      }

      const relatedIds = (capture['supplementary_data'] as Record<string, unknown> | undefined)?.['related_ids'] as Record<string, unknown> | undefined;
      const orderId = String(relatedIds?.['order_id'] ?? capture['id']);
      const amount = parseFloat(String((capture['amount'] as Record<string, unknown> | undefined)?.['value'] ?? 0));
      const refId = String(capture['custom_id'] ?? (capture['purchase_units'] as Array<Record<string, unknown>> | undefined)?.[0]?.['reference_id'] ?? '');
      const userId = refId.split('_')[0];

      if (!userId) return;

      const planType = amount >= 200 ? 'anual' : 'mensal';
      await activatePlan(parseInt(userId), planType, orderId);
      console.log(`[PayPal Webhook] Plan ${planType} activated for user ${userId} (captura confirmada na API da PayPal)`);
    }
  } catch (error) {
    console.error('[PayPal Webhook] Error:', error);
  }
});

export default router;
