import { Router, Request, Response } from 'express';
import { MercadoPagoConfig, Preference, Payment, PreApproval } from 'mercadopago';
import { pool } from '../db/client';
import { authenticate, requireAdmin } from '../middleware/auth';
import { requireNotAccountMember } from '../middleware/permissions';
import {
  activateRecurringPlanAfterApprovedPayment,
  expireRecurringPlanAfterSubscriptionStopped,
  expireRecurringPlanAfterRejectedPayment,
  getRequesterPlanStatus,
} from '../services/plan-lifecycle';
import type { PlanTier } from '../services/plan-access';
import {
  buildPaymentReference,
  ONE_TIME_PLAN_DAYS,
  parsePaymentReference,
  parsePlanChoice,
  PLAN_OFFERS,
} from '../services/planPayments';

const router = Router();

const mpClient = new MercadoPagoConfig({ accessToken: process.env['MP_ACCESS_TOKEN']! });

const BACKEND_URL = process.env['BACKEND_URL'] ?? 'https://sistema-financeiro-backend-o199.onrender.com';
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://sistema-financeiro-kxed.onrender.com';

const INVALID_PLAN_MESSAGE = 'Invalid plan type';

function paymentDescription(plan: PlanTier): string {
  return `FINGERENCE - Plano ${PLAN_OFFERS[plan].label}`;
}

function oneTimePlanExpiration(days: number = ONE_TIME_PLAN_DAYS): Date {
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + days);
  return expiration;
}

// GET /api/plans/status — para membro ativo, o plano do titular da conta.
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const planStatus = await getRequesterPlanStatus(req.user!.id);
    if (!planStatus) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const isAdmin = planStatus.userType === 'admin';
    res.json({
      success: true,
      data: {
        status: planStatus.status,
        plano_tipo: isAdmin ? 'admin' : planStatus.planType,
        // Nível do plano pago; nulo para o admin e para quem nunca assinou.
        plano_nivel: isAdmin || !planStatus.planType ? null : planStatus.planTier,
        recursos_premium: planStatus.premiumFeatures,
        plano_expiracao: planStatus.planExpiration,
        dias_restantes_trial: planStatus.trialDaysLeft,
        data_cadastro: planStatus.createdAt,
        isAccountMember: planStatus.isAccountMember,
      },
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
router.post('/subscribe', authenticate, requireNotAccountMember, async (req: Request, res: Response): Promise<void> => {
  const { tipo, forma_pagamento } = req.body as Record<string, unknown>;
  const plan = parsePlanChoice(tipo);

  if (!plan) {
    res.status(400).json({ success: false, message: INVALID_PLAN_MESSAGE });
    return;
  }

  try {
    const preference = new Preference(mpClient);

    const excludedTypes: Array<{ id: string }> = [{ id: 'ticket' }];
    if (forma_pagamento === 'debito') excludedTypes.push({ id: 'credit_card' });
    else if (forma_pagamento === 'cartao') excludedTypes.push({ id: 'debit_card' });

    const result = await preference.create({
      body: {
        items: [{ id: plan, title: paymentDescription(plan), unit_price: PLAN_OFFERS[plan].amount, quantity: 1, currency_id: 'BRL' }],
        payment_methods: { excluded_payment_types: excludedTypes, installments: 1 },
        external_reference: buildPaymentReference(req.user!.id, plan),
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
router.post('/pix', authenticate, requireNotAccountMember, async (req: Request, res: Response): Promise<void> => {
  const { tipo } = req.body as { tipo: unknown };
  const plan = parsePlanChoice(tipo);

  if (!plan) {
    res.status(400).json({ success: false, message: INVALID_PLAN_MESSAGE });
    return;
  }

  try {
    const userResult = await pool.query('SELECT email, nome FROM usuarios WHERE id = $1', [req.user!.id]);
    const user = userResult.rows[0] as { email: string };

    const payment = new Payment(mpClient);
    const expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const pdt = await payment.create({
      body: {
        transaction_amount: PLAN_OFFERS[plan].amount,
        payment_method_id: 'pix',
        payer: { email: user.email },
        description: paymentDescription(plan),
        external_reference: buildPaymentReference(req.user!.id, plan),
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
router.post('/pay-card', authenticate, requireNotAccountMember, async (req: Request, res: Response): Promise<void> => {
  const { tipo, card_token, cpf } = req.body as Record<string, unknown>;
  const plan = parsePlanChoice(tipo);

  if (!plan) {
    res.status(400).json({ success: false, message: INVALID_PLAN_MESSAGE });
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
        transaction_amount: PLAN_OFFERS[plan].amount,
        token: String(card_token),
        installments: 1,
        payment_method_id: null as unknown as string,
        payer: { email: user.email, identification: cpf ? { type: 'CPF', number: String(cpf).replace(/\D/g, '') } : undefined },
        description: paymentDescription(plan),
        external_reference: buildPaymentReference(req.user!.id, plan),
        notification_url: `${BACKEND_URL}/api/plans/webhook`,
      },
    });

    if (pdt.status === 'approved') {
      await pool.query(
        `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2, plano_inicio = NOW(), payment_id_anual = NULL, preapproval_id = NULL WHERE id = $3`,
        [plan, oneTimePlanExpiration(), req.user!.id],
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
router.post('/subscribe-recurring', authenticate, requireNotAccountMember, async (req: Request, res: Response): Promise<void> => {
  const { tipo, card_token } = req.body as Record<string, unknown>;
  const plan = parsePlanChoice(tipo);

  if (!plan) {
    res.status(400).json({ success: false, message: INVALID_PLAN_MESSAGE });
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

    const result = await preApproval.create({
      body: {
        reason: paymentDescription(plan),
        external_reference: buildPaymentReference(req.user!.id, plan),
        payer_email: user.email,
        card_token_id: String(card_token),
        auto_recurring: { frequency: 1, frequency_type: 'months', start_date: startDate.toISOString(), transaction_amount: PLAN_OFFERS[plan].amount, currency_id: 'BRL' },
        back_url: FRONTEND_URL,
        notification_url: `${BACKEND_URL}/api/plans/webhook`,
        status: 'authorized',
      } as unknown as Parameters<typeof preApproval.create>[0]['body'],
    });

    if (result.status === 'authorized') {
      await pool.query(
        `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = NULL, preapproval_id = $2, plano_inicio = NOW(), payment_id_anual = NULL WHERE id = $3`,
        [plan, result.id, req.user!.id],
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

// POST /api/plans/cancel — o acesso termina na hora, sem reembolso (só mensal).
router.post('/cancel', authenticate, requireNotAccountMember, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT preapproval_id FROM usuarios WHERE id = $1', [req.user!.id]);
    const user = result.rows[0] as { preapproval_id: string | null } | undefined;
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (user.preapproval_id) {
      try {
        const preApproval = new PreApproval(mpClient);
        await preApproval.update({ id: user.preapproval_id, body: { status: 'cancelled' } });
      } catch (e) {
        console.warn('Could not cancel preapproval on MP:', (e as Error).message);
      }
    }

    await pool.query(
      `UPDATE usuarios SET plano_status = 'expirado', preapproval_id = NULL, payment_id_anual = NULL WHERE id = $1`,
      [req.user!.id],
    );

    res.json({ success: true, message: 'Subscription cancelled.' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
});

// POST /api/plans/activate — manual activation (admin/test)
router.post('/activate', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { tipo, dias } = req.body as { tipo: unknown; dias: unknown };
  const plan = parsePlanChoice(tipo);

  if (!plan) {
    res.status(400).json({ success: false, message: 'Invalid type' });
    return;
  }

  const requestedDays = dias === undefined ? ONE_TIME_PLAN_DAYS : Number(dias);
  if (!Number.isInteger(requestedDays) || requestedDays <= 0) {
    res.status(400).json({ success: false, message: 'Invalid days' });
    return;
  }

  const expiration = oneTimePlanExpiration(requestedDays);

  await pool.query(
    `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2, preapproval_id = NULL WHERE id = $3`,
    [plan, expiration, req.user!.id],
  );

  res.json({ success: true, message: 'Plan manually activated', expiracao: expiration });
});

// POST /api/plans/webhook — MercadoPago callback, public. O usuário e o plano
// vêm da referência gravada no pagamento (parsePaymentReference), nunca do corpo.
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
        const reference = parsePaymentReference(pdt.external_reference);
        if (!reference) {
          console.warn(`[Webhook] Approved payment ${pdt.id} without a valid plan reference`);
          return;
        }

        await pool.query(
          `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2, plano_inicio = NOW(), payment_id_anual = NULL, preapproval_id = NULL WHERE id = $3`,
          [reference.plan, oneTimePlanExpiration(), reference.userId],
        );
        console.log(`[Webhook] Plan ${reference.plan} activated (one-time payment) for user ${reference.userId}`);
      }
    }

    if (eventType === 'subscription_preapproval' || action === 'subscription_preapproval.updated') {
      const preApproval = new PreApproval(mpClient);
      const sub = await preApproval.get({ id: resourceId as string });
      const reference = parsePaymentReference(sub.external_reference);
      if (!reference) {
        console.warn(`[Webhook] Subscription ${sub.id} without a valid plan reference`);
        return;
      }

      if (sub.status === 'authorized') {
        await pool.query(
          `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = NULL, preapproval_id = $2 WHERE id = $3 AND preapproval_id = $2`,
          [reference.plan, sub.id, reference.userId],
        );
        console.log(`[Webhook] Subscription ${sub.id} authorized for user ${reference.userId}`);
      } else if (sub.status === 'cancelled' || sub.status === 'paused') {
        const wasExpired = await expireRecurringPlanAfterSubscriptionStopped(reference.userId, String(sub.id));
        if (!wasExpired) {
          return;
        }
        console.log(`[Webhook] Subscription ${sub.id} ${sub.status} — user ${reference.userId} blocked`);
      }
    }

    if (eventType === 'subscription_authorized_payment') {
      const payment = new Payment(mpClient);
      const pdt = await payment.get({ id: resourceId as string });
      const preapprovalId = (pdt as unknown as Record<string, unknown>)['preapproval_id'];
      const reference = parsePaymentReference(pdt.external_reference);

      if (pdt.status === 'approved' && reference && preapprovalId) {
        const wasReactivated = await activateRecurringPlanAfterApprovedPayment(
          reference.userId,
          String(preapprovalId),
        );
        if (wasReactivated) {
          console.log(`[Webhook] Recurring charge approved for user ${reference.userId}`);
        }
      } else if (pdt.status === 'rejected' && reference && preapprovalId) {
        const wasExpired = await expireRecurringPlanAfterRejectedPayment(
          reference.userId,
          String(pdt.id),
          String(preapprovalId),
        );
        if (wasExpired) {
          console.warn(`[Webhook] Recurring charge rejected and access blocked for user ${reference.userId}: ${(pdt as unknown as Record<string, unknown>)['status_detail']}`);
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Error processing event:', (err as Error).message);
  }
});

export default router;
