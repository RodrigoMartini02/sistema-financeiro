import { Router, Request, Response } from 'express';
import { MercadoPagoConfig, Preference, Payment, PreApproval } from 'mercadopago';
import { pool } from '../db/client';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

const mpClient = new MercadoPagoConfig({ accessToken: process.env['MP_ACCESS_TOKEN']! });

const TRIAL_DAYS = 15;
const BACKEND_URL = process.env['BACKEND_URL'] ?? 'https://sistema-financeiro-backend-o199.onrender.com';
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://sistema-financeiro-kxed.onrender.com';

function planAmount(type: string): number {
  return type === 'anual' ? 422.28 : 4.99;
}

function planLabel(type: string): string {
  return type === 'anual' ? 'Premium' : 'Plus';
}

// GET /api/plans/status
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT tipo, data_cadastro, plano_status, plano_tipo, plano_expiracao FROM usuarios WHERE id = $1',
      [req.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const user = result.rows[0] as Record<string, unknown>;
    const now = new Date();
    const registeredAt = new Date(String(user['data_cadastro']));
    const daysElapsed = Math.floor((now.getTime() - registeredAt.getTime()) / 86400000);
    const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysElapsed);

    if (user['tipo'] === 'master') {
      res.json({ success: true, data: { status: 'ativo', plano_tipo: 'master', plano_expiracao: null, dias_restantes_trial: null, data_cadastro: user['data_cadastro'] } });
      return;
    }

    let status = String(user['plano_status'] ?? 'trial');

    if (status === 'trial' && daysElapsed >= TRIAL_DAYS) {
      status = 'expirado';
      await pool.query(`UPDATE usuarios SET plano_status = 'expirado' WHERE id = $1`, [req.user!.id]);
    }

    if (status === 'ativo' && user['plano_expiracao'] && new Date(String(user['plano_expiracao'])) < now) {
      status = 'expirado';
      await pool.query(`UPDATE usuarios SET plano_status = 'expirado' WHERE id = $1`, [req.user!.id]);
    }

    res.json({
      success: true,
      data: { status, plano_tipo: user['plano_tipo'] ?? null, plano_expiracao: user['plano_expiracao'] ?? null, dias_restantes_trial: status === 'trial' ? trialDaysLeft : null, data_cadastro: user['data_cadastro'] },
    });
  } catch (error) {
    console.error('Get plan status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get plan status' });
  }
});

// GET /api/plans/config
router.get('/config', authenticate, (_req: Request, res: Response): void => {
  res.json({ success: true, public_key: process.env['MP_PUBLIC_KEY'] ?? null });
});

// POST /api/plans/subscribe — card/debit via MercadoPago Preference
router.post('/subscribe', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { tipo, forma_pagamento } = req.body as Record<string, unknown>;

  if (!['mensal', 'anual'].includes(String(tipo))) {
    res.status(400).json({ success: false, message: 'Invalid plan type' });
    return;
  }

  try {
    const preference = new Preference(mpClient);

    const excludedTypes: Array<{ id: string }> = [{ id: 'ticket' }];
    if (forma_pagamento === 'debito') excludedTypes.push({ id: 'credit_card' });
    else if (forma_pagamento === 'cartao') excludedTypes.push({ id: 'debit_card' });

    const result = await preference.create({
      body: {
        items: [{ id: String(tipo), title: `FINGERENCE - Plano ${planLabel(String(tipo))}`, unit_price: planAmount(String(tipo)), quantity: 1, currency_id: 'BRL' }],
        payment_methods: { excluded_payment_types: excludedTypes, installments: String(tipo) === 'anual' && forma_pagamento !== 'debito' ? 12 : 1 },
        external_reference: String(req.user!.id),
        notification_url: `${BACKEND_URL}/api/plans/webhook`,
        back_urls: { success: `${FRONTEND_URL}/dashboard.html`, failure: `${FRONTEND_URL}/dashboard.html` },
        auto_return: 'approved',
      },
    });

    res.json({ success: true, data: { payment_url: result.init_point } });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate payment link' });
  }
});

// POST /api/plans/pix
router.post('/pix', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { tipo } = req.body as { tipo: unknown };

  if (!['mensal', 'anual'].includes(String(tipo))) {
    res.status(400).json({ success: false, message: 'Invalid plan type' });
    return;
  }

  try {
    const userResult = await pool.query('SELECT email, nome FROM usuarios WHERE id = $1', [req.user!.id]);
    const user = userResult.rows[0] as { email: string };

    const payment = new Payment(mpClient);
    const expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const pdt = await payment.create({
      body: {
        transaction_amount: planAmount(String(tipo)),
        payment_method_id: 'pix',
        payer: { email: user.email },
        description: `FINGERENCE - Plano ${planLabel(String(tipo))}`,
        external_reference: String(req.user!.id),
        notification_url: `${BACKEND_URL}/api/plans/webhook`,
        date_of_expiration: expiration,
      },
    });

    const pixData = ((pdt as unknown as Record<string, unknown>)?.['point_of_interaction'] as Record<string, unknown> | undefined)?.['transaction_data'] as Record<string, unknown> | undefined;

    if (!pixData?.['qr_code']) {
      throw new Error('QR Code not returned by MercadoPago');
    }

    res.json({ success: true, data: { payment_id: pdt.id, qr_code: pixData['qr_code'], qr_code_base64: pixData['qr_code_base64'] } });
  } catch (error) {
    console.error('PIX error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate PIX' });
  }
});

// POST /api/plans/pay-card — transparent checkout
router.post('/pay-card', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { tipo, card_token, installments, cpf } = req.body as Record<string, unknown>;

  if (!['mensal', 'anual'].includes(String(tipo))) {
    res.status(400).json({ success: false, message: 'Invalid plan type' });
    return;
  }
  if (!card_token) {
    res.status(400).json({ success: false, message: 'Card token missing' });
    return;
  }

  try {
    const userResult = await pool.query('SELECT email FROM usuarios WHERE id = $1', [req.user!.id]);
    const user = userResult.rows[0] as { email: string };

    const payment = new Payment(mpClient);
    const pdt = await payment.create({
      body: {
        transaction_amount: planAmount(String(tipo)),
        token: String(card_token),
        installments: parseInt(String(installments)) || 1,
        payment_method_id: null as unknown as string,
        payer: { email: user.email, identification: cpf ? { type: 'CPF', number: String(cpf).replace(/\D/g, '') } : undefined },
        description: `FINGERENCE - Plano ${planLabel(String(tipo))}`,
        external_reference: String(req.user!.id),
        notification_url: `${BACKEND_URL}/api/plans/webhook`,
      },
    });

    if (pdt.status === 'approved') {
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + (String(tipo) === 'anual' ? 365 : 30));
      await pool.query(
        `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2, plano_inicio = NOW(), payment_id_anual = $3 WHERE id = $4`,
        [tipo, expiration, String(tipo) === 'anual' ? String(pdt.id) : null, req.user!.id],
      );
      res.json({ success: true, message: 'Payment approved!' });
    } else if (pdt.status === 'in_process' || pdt.status === 'pending') {
      res.json({ success: false, message: 'Payment under review. You will be notified when approved.' });
    } else {
      const detail = (pdt as unknown as Record<string, unknown>)['status_detail'] ?? pdt.status;
      res.json({ success: false, message: `Payment declined (${detail}). Check your card details.` });
    }
  } catch (error) {
    console.error('Pay card error:', error);
    res.status(500).json({ success: false, message: 'Failed to process payment' });
  }
});

// POST /api/plans/subscribe-recurring
router.post('/subscribe-recurring', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { tipo, card_token } = req.body as Record<string, unknown>;

  if (!['mensal', 'anual'].includes(String(tipo))) {
    res.status(400).json({ success: false, message: 'Invalid plan type' });
    return;
  }
  if (!card_token) {
    res.status(400).json({ success: false, message: 'Card token missing' });
    return;
  }

  try {
    const userResult = await pool.query('SELECT email, preapproval_id FROM usuarios WHERE id = $1', [req.user!.id]);
    const user = userResult.rows[0] as { email: string; preapproval_id: string | null };

    if (user.preapproval_id) {
      try {
        const preApproval = new PreApproval(mpClient);
        await preApproval.update({ id: user.preapproval_id, body: { status: 'cancelled' } });
      } catch (e) {
        console.warn('Could not cancel previous subscription:', (e as Error).message);
      }
    }

    const preApproval = new PreApproval(mpClient);
    const startDate = new Date();
    startDate.setSeconds(startDate.getSeconds() + 30);

    const frequency = String(tipo) === 'mensal' ? 1 : 12;

    const result = await preApproval.create({
      body: {
        reason: `FINGERENCE - Plano ${planLabel(String(tipo))}`,
        external_reference: String(req.user!.id),
        payer_email: user.email,
        card_token_id: String(card_token),
        auto_recurring: { frequency, frequency_type: 'months', start_date: startDate.toISOString(), transaction_amount: planAmount(String(tipo)), currency_id: 'BRL' },
        back_url: FRONTEND_URL,
        notification_url: `${BACKEND_URL}/api/plans/webhook`,
        status: 'authorized',
      } as unknown as Parameters<typeof preApproval.create>[0]['body'],
    });

    if (result.status === 'authorized') {
      await pool.query(
        `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = NULL, preapproval_id = $2, plano_inicio = NOW(), payment_id_anual = NULL WHERE id = $3`,
        [tipo, result.id, req.user!.id],
      );
      res.json({ success: true, message: 'Subscription created! Your plan is active.' });
    } else {
      res.json({ success: false, message: `Subscription not authorized (${result.status})` });
    }
  } catch (error) {
    console.error('Subscribe recurring error:', error);
    res.status(500).json({ success: false, message: 'Failed to create subscription' });
  }
});

// GET /api/plans/cancel/preview
router.get('/cancel/preview', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT plano_tipo, plano_inicio, preapproval_id, payment_id_anual FROM usuarios WHERE id = $1',
      [req.user!.id],
    );
    const user = result.rows[0] as Record<string, unknown>;

    if (!user || user['plano_tipo'] !== 'anual') {
      res.json({ success: true, data: { reembolso: 0, meses_restantes: 0, elegivel: false } });
      return;
    }

    const inicio = user['plano_inicio'] ? new Date(String(user['plano_inicio'])) : null;
    if (!inicio) {
      res.json({ success: true, data: { reembolso: 0, meses_restantes: 0, elegivel: false } });
      return;
    }

    const monthsUsed = Math.floor((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    const monthsLeft = Math.max(0, 12 - monthsUsed);
    const ANNUAL_VALUE = 422.28;
    const FEE = 0.15;
    const refund = parseFloat(((monthsLeft / 12) * ANNUAL_VALUE * (1 - FEE)).toFixed(2));

    res.json({
      success: true,
      data: { elegivel: monthsLeft > 0 && (!!user['payment_id_anual'] || !!user['preapproval_id']), meses_usados: monthsUsed, meses_restantes: monthsLeft, reembolso: refund, tem_payment_id: !!user['payment_id_anual'] },
    });
  } catch (error) {
    console.error('Cancel preview error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate refund' });
  }
});

// POST /api/plans/cancel
router.post('/cancel', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT plano_tipo, plano_inicio, preapproval_id, payment_id_anual FROM usuarios WHERE id = $1',
      [req.user!.id],
    );
    const user = result.rows[0] as Record<string, unknown>;
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (user['preapproval_id']) {
      try {
        const preApproval = new PreApproval(mpClient);
        await preApproval.update({ id: String(user['preapproval_id']), body: { status: 'cancelled' } });
      } catch (e) {
        console.warn('Could not cancel preapproval on MP:', (e as Error).message);
      }
    }

    let refundAmount = 0;
    let refundError: string | null = null;

    if (user['plano_tipo'] === 'anual' && user['payment_id_anual'] && user['plano_inicio']) {
      const inicio = new Date(String(user['plano_inicio']));
      const monthsUsed = Math.floor((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      const monthsLeft = Math.max(0, 12 - monthsUsed);

      if (monthsLeft > 0) {
        const refund = parseFloat(((monthsLeft / 12) * 422.28 * 0.85).toFixed(2));
        try {
          const payment = new Payment(mpClient);
          type RefundMethod = (opts: { id: string; body: { amount: number } }) => Promise<Record<string, unknown>>;
          const refundResult = await (payment as unknown as { refund: RefundMethod }).refund({ id: String(user['payment_id_anual']), body: { amount: refund } });
          refundAmount = refund;
          console.log(`[Cancel] Refund of R$${refund} for user ${req.user!.id}. Refund ID: ${refundResult['id']}`);
        } catch (e) {
          console.error('[Cancel] Failed to process refund on MP:', (e as Error).message);
          refundError = 'Refund not processed automatically. Contact support.';
        }
      }
    }

    await pool.query(
      `UPDATE usuarios SET plano_status = 'expirado', preapproval_id = NULL, payment_id_anual = NULL WHERE id = $1`,
      [req.user!.id],
    );

    res.json({
      success: true,
      message: refundAmount > 0 ? `Subscription cancelled. Refund of R$${refundAmount.toFixed(2)} processed.` : 'Subscription cancelled.',
      reembolso: refundAmount,
      aviso: refundError,
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
});

// POST /api/plans/activate — manual activation (admin/test)
router.post('/activate', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { tipo, dias } = req.body as { tipo: unknown; dias: unknown };

  if (!['mensal', 'anual'].includes(String(tipo))) {
    res.status(400).json({ success: false, message: 'Invalid type' });
    return;
  }

  const expiration = new Date();
  expiration.setDate(expiration.getDate() + (dias ? parseInt(String(dias)) : String(tipo) === 'anual' ? 365 : 30));

  await pool.query(
    `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2 WHERE id = $3`,
    [tipo, expiration, req.user!.id],
  );

  res.json({ success: true, message: 'Plan manually activated', expiracao: expiration });
});

// POST /api/plans/webhook — MercadoPago callback, public
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  res.sendStatus(200);

  const body = req.body as Record<string, unknown>;
  const action = body['action'];
  const data = body['data'] as Record<string, unknown> | undefined;
  const eventType = body['type'] ?? (req.query['type'] as string | undefined);
  const resourceId = data?.['id'] ?? (req.query['data.id'] as string | undefined);

  if (!resourceId) return;

  try {
    if (eventType === 'payment' || action === 'payment.created' || action === 'payment.updated') {
      const payment = new Payment(mpClient);
      const pdt = await payment.get({ id: resourceId as string });

      if (pdt.status === 'approved') {
        const userId = pdt.external_reference;
        const planType = parseFloat(String((pdt as unknown as Record<string, unknown>)['transaction_amount'])) >= 200 ? 'anual' : 'mensal';
        const daysToAdd = planType === 'anual' ? 365 : 30;
        const expiration = new Date();
        expiration.setDate(expiration.getDate() + daysToAdd);

        await pool.query(
          `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2, plano_inicio = NOW(), payment_id_anual = $3 WHERE id = $4`,
          [planType, expiration, planType === 'anual' ? String(pdt.id) : null, userId],
        );
        console.log(`[Webhook] Plan ${planType} activated (one-time payment) for user ${userId}`);
      }
    }

    if (eventType === 'subscription_preapproval' || action === 'subscription_preapproval.updated') {
      const preApproval = new PreApproval(mpClient);
      const sub = await preApproval.get({ id: resourceId as string });
      const userId = sub.external_reference;

      if (sub.status === 'authorized') {
        const planType = parseFloat(String(((sub as unknown as Record<string, unknown>)?.['auto_recurring'] as Record<string, unknown> | undefined)?.['transaction_amount'])) >= 200 ? 'anual' : 'mensal';
        await pool.query(
          `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = NULL, preapproval_id = $2 WHERE id = $3`,
          [planType, sub.id, userId],
        );
        console.log(`[Webhook] Subscription ${sub.id} authorized for user ${userId}`);
      } else if (sub.status === 'cancelled' || sub.status === 'paused') {
        await pool.query(`UPDATE usuarios SET plano_status = 'expirado', preapproval_id = NULL WHERE id = $1`, [userId]);
        console.log(`[Webhook] Subscription ${sub.id} ${sub.status} — user ${userId} blocked`);
      }
    }

    if (eventType === 'subscription_authorized_payment') {
      const payment = new Payment(mpClient);
      const pdt = await payment.get({ id: resourceId as string });

      if (pdt.status === 'approved' && pdt.external_reference) {
        await pool.query(`UPDATE usuarios SET plano_status = 'ativo', plano_expiracao = NULL WHERE id = $1`, [pdt.external_reference]);
        console.log(`[Webhook] Recurring charge approved for user ${pdt.external_reference}`);
      } else if (pdt.status === 'rejected' && pdt.external_reference) {
        console.warn(`[Webhook] Recurring charge rejected for user ${pdt.external_reference}: ${(pdt as unknown as Record<string, unknown>)['status_detail']}`);
      }
    }
  } catch (err) {
    console.error('[Webhook] Error processing event:', (err as Error).message);
  }
});

export default router;
