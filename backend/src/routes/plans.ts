import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate, requireAdmin } from '../middleware/auth';
import { requireNotAccountMember } from '../middleware/permissions';
import {
  activateRecurringPlanAfterApprovedPayment,
  expireRecurringPlanAfterSubscriptionStopped,
  expireRecurringPlanAfterRejectedPayment,
  getRequesterPlanStatus,
  startDeferredTrial,
} from '../services/plan-lifecycle';
import type { PlanTier } from '../services/plan-access';
import {
  buildPaymentReference,
  ONE_TIME_PLAN_DAYS,
  parsePaymentReference,
  parsePlanChoice,
  PLAN_OFFERS,
} from '../services/planPayments';
import {
  cancelRecurring,
  chargeCard,
  createCheckoutLink,
  createPixCharge,
  createRecurring,
  getPayment,
  getRecurring,
  type CheckoutPaymentType,
} from '../services/mercadoPagoCharges';

const router = Router();

const BACKEND_URL = process.env['BACKEND_URL'] ?? 'https://sistema-financeiro-backend-o199.onrender.com';
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://sistema-financeiro-kxed.onrender.com';
const NOTIFICATION_URL = `${BACKEND_URL}/api/plans/webhook`;

const INVALID_PLAN_MESSAGE = 'Invalid plan type';

function paymentDescription(plan: PlanTier): string {
  return `FINGERENCE - Plano ${PLAN_OFFERS[plan].label}`;
}

function oneTimePlanExpiration(days: number = ONE_TIME_PLAN_DAYS): Date {
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + days);
  return expiration;
}

function readCheckoutPaymentType(value: unknown): CheckoutPaymentType | null {
  return value === 'cartao' || value === 'debito' ? value : null;
}

async function readPayerEmail(userId: number): Promise<string> {
  const userResult = await pool.query('SELECT email FROM usuarios WHERE id = $1', [userId]);
  return (userResult.rows[0] as { email: string }).email;
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

// POST /api/plans/start-trial — começa o teste de 15 dias de quem se cadastrou
// por Licitações (sem_teste). Uma vez só; o membro usa o plano do titular.
router.post('/start-trial', authenticate, requireNotAccountMember, async (req: Request, res: Response): Promise<void> => {
  try {
    const started = await startDeferredTrial(req.user!.id);
    if (!started) {
      res.status(409).json({ success: false, message: 'O teste grátis já foi usado ou o plano já está ativo.' });
      return;
    }
    res.json({ success: true, message: 'Teste grátis de 15 dias iniciado.' });
  } catch (error) {
    console.error('Start trial error:', error);
    res.status(500).json({ success: false, message: 'Não foi possível começar o teste agora.' });
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
    const paymentUrl = await createCheckoutLink({
      itemId: plan,
      description: paymentDescription(plan),
      amount: PLAN_OFFERS[plan].amount,
      reference: buildPaymentReference(req.user!.id, plan),
      notificationUrl: NOTIFICATION_URL,
      backUrl: `${FRONTEND_URL}/dashboard.html`,
      paymentType: readCheckoutPaymentType(forma_pagamento),
    });

    res.json({ success: true, data: { payment_url: paymentUrl } });
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
    const pix = await createPixCharge({
      amount: PLAN_OFFERS[plan].amount,
      description: paymentDescription(plan),
      reference: buildPaymentReference(req.user!.id, plan),
      notificationUrl: NOTIFICATION_URL,
      payerEmail: await readPayerEmail(req.user!.id),
    });

    res.json({ success: true, data: { payment_id: pix.paymentId, qr_code: pix.qrCode, qr_code_base64: pix.qrCodeBase64 } });
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
    const payment = await chargeCard({
      amount: PLAN_OFFERS[plan].amount,
      cardToken: String(card_token),
      cpf: cpf ? String(cpf) : null,
      payerEmail: await readPayerEmail(req.user!.id),
      description: paymentDescription(plan),
      reference: buildPaymentReference(req.user!.id, plan),
      notificationUrl: NOTIFICATION_URL,
    });

    if (payment.status === 'approved') {
      await pool.query(
        `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2, plano_inicio = NOW(), payment_id_anual = NULL, preapproval_id = NULL WHERE id = $3`,
        [plan, oneTimePlanExpiration(), req.user!.id],
      );
      res.json({ success: true, message: 'Payment approved!' });
    } else if (payment.status === 'in_process' || payment.status === 'pending') {
      res.json({ success: false, message: 'Payment under review. You will be notified when approved.' });
    } else {
      res.json({ success: false, message: `Payment declined (${payment.statusDetail ?? payment.status}). Check your card details.` });
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
        await cancelRecurring(user.preapproval_id);
      } catch (e) {
        console.warn('Could not cancel previous subscription:', (e as Error).message);
      }
    }

    const result = await createRecurring({
      amount: PLAN_OFFERS[plan].amount,
      description: paymentDescription(plan),
      reference: buildPaymentReference(req.user!.id, plan),
      notificationUrl: NOTIFICATION_URL,
      payerEmail: user.email,
      cardToken: String(card_token),
      backUrl: FRONTEND_URL,
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
        await cancelRecurring(user.preapproval_id);
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
      const payment = await getPayment(String(resourceId));

      if (payment.status === 'approved') {
        const reference = parsePaymentReference(payment.externalReference);
        if (!reference) {
          console.warn(`[Webhook] Approved payment ${payment.id} without a valid plan reference`);
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
      const subscription = await getRecurring(String(resourceId));
      const reference = parsePaymentReference(subscription.externalReference);
      if (!reference) {
        console.warn(`[Webhook] Subscription ${subscription.id} without a valid plan reference`);
        return;
      }

      if (subscription.status === 'authorized') {
        await pool.query(
          `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = NULL, preapproval_id = $2 WHERE id = $3 AND preapproval_id = $2`,
          [reference.plan, subscription.id, reference.userId],
        );
        console.log(`[Webhook] Subscription ${subscription.id} authorized for user ${reference.userId}`);
      } else if (subscription.status === 'cancelled' || subscription.status === 'paused') {
        const wasExpired = await expireRecurringPlanAfterSubscriptionStopped(reference.userId, String(subscription.id));
        if (!wasExpired) {
          return;
        }
        console.log(`[Webhook] Subscription ${subscription.id} ${subscription.status} — user ${reference.userId} blocked`);
      }
    }

    if (eventType === 'subscription_authorized_payment') {
      const payment = await getPayment(String(resourceId));
      const reference = parsePaymentReference(payment.externalReference);

      if (payment.status === 'approved' && reference && payment.recurringId) {
        const wasReactivated = await activateRecurringPlanAfterApprovedPayment(reference.userId, payment.recurringId);
        if (wasReactivated) {
          console.log(`[Webhook] Recurring charge approved for user ${reference.userId}`);
        }
      } else if (payment.status === 'rejected' && reference && payment.recurringId) {
        const wasExpired = await expireRecurringPlanAfterRejectedPayment(reference.userId, String(payment.id), payment.recurringId);
        if (wasExpired) {
          console.warn(`[Webhook] Recurring charge rejected and access blocked for user ${reference.userId}: ${payment.statusDetail}`);
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Error processing event:', (err as Error).message);
  }
});

export default router;
