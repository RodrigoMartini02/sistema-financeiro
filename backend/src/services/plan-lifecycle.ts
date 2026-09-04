import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { planNotificationEvents, users } from '../db/schema';
import {
  getEffectivePlanAccess,
  PLAN_STATUS,
  type EffectivePlanAccess,
  type PlanAccessSnapshot,
  type PlanStatus,
} from './plan-access';

export const PLAN_NOTIFICATION_EVENT = {
  expired: 'plan_expired',
  recurringPaymentRejected: 'recurring_payment_rejected',
} as const;

export interface PlanStatusResult extends EffectivePlanAccess {
  planType: string | null;
  planExpiration: Date | string | null;
  createdAt: Date | string | null;
  userType: string | null;
}

export interface PlanLifecycleResult {
  expiredTrials: number;
  expiredPaidPlans: number;
  createdNotifications: number;
  sentNotifications: number;
  failedNotifications: number;
  skippedNotifications: number;
}

type PlanRecord = PlanAccessSnapshot & {
  id: number;
  name: string;
  email: string;
  planType: string | null;
};

function planCycleReference(planExpiration: Date | string): string {
  const normalized = typeof planExpiration === 'string'
    ? planExpiration.trim().replace(' ', 'T')
    : planExpiration.toISOString();

  return `plan-expiration:${normalized}`;
}

function recurringPaymentCycleReference(paymentId: string): string {
  return `recurring-payment:${paymentId}`;
}

function planLabel(planType: string | null): string {
  return planType === 'anual' ? 'Premium' : 'Plus';
}

function frontendUrl(): string {
  return process.env['FRONTEND_URL'] ?? 'https://fin-gerence.com.br';
}

function asPlanSnapshot(record: PlanRecord): PlanAccessSnapshot {
  return {
    userType: record.userType,
    planStatus: record.planStatus,
    planExpiration: record.planExpiration,
    createdAt: record.createdAt,
  };
}

export async function getPlanStatusForUser(userId: number): Promise<PlanStatusResult | null> {
  const [user] = await db
    .select({
      userType: users.type,
      planStatus: users.planStatus,
      planType: users.planType,
      planExpiration: users.planExpiration,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return null;
  }

  return {
    ...getEffectivePlanAccess(user),
    planType: user.planType,
    planExpiration: user.planExpiration,
    createdAt: user.createdAt,
    userType: user.userType,
  };
}

async function expirePlanRecord(record: PlanRecord): Promise<{
  expired: boolean;
  notificationCreated: boolean;
}> {
  const effectiveAccess = getEffectivePlanAccess(asPlanSnapshot(record));
  if (effectiveAccess.status !== PLAN_STATUS.expired) {
    return { expired: false, notificationCreated: false };
  }

  const storedStatus = record.planStatus === PLAN_STATUS.active
    ? PLAN_STATUS.active
    : PLAN_STATUS.trial;
  const conditions = [eq(users.id, record.id), eq(users.planStatus, storedStatus)];

  if (storedStatus === PLAN_STATUS.active && record.planExpiration) {
    conditions.push(sql`${users.planExpiration} = ${record.planExpiration}`);
  }

  return db.transaction(async (transaction) => {
    const [expiredUser] = await transaction
      .update(users)
      .set({ planStatus: PLAN_STATUS.expired, updatedAt: new Date() })
      .where(and(...conditions))
      .returning({ id: users.id });

    if (!expiredUser) {
      return { expired: false, notificationCreated: false };
    }

    if (storedStatus !== PLAN_STATUS.active || !record.planExpiration) {
      return { expired: true, notificationCreated: false };
    }

    const notificationResult = await transaction
      .insert(planNotificationEvents)
      .values({
        userId: record.id,
        eventType: PLAN_NOTIFICATION_EVENT.expired,
        cycleReference: planCycleReference(record.planExpiration),
        planType: record.planType,
      })
      .onConflictDoNothing()
      .returning({ id: planNotificationEvents.id });

    return { expired: true, notificationCreated: notificationResult.length > 0 };
  });
}

export async function expireRecurringPlanAfterRejectedPayment(
  userId: number,
  paymentId: string,
  preapprovalId: string,
): Promise<boolean> {
  return db.transaction(async (transaction) => {
    const [expiredUser] = await transaction
      .update(users)
      .set({ planStatus: PLAN_STATUS.expired, updatedAt: new Date() })
      .where(and(
        eq(users.id, userId),
        eq(users.planStatus, PLAN_STATUS.active),
        eq(users.preapprovalId, preapprovalId),
      ))
      .returning({ id: users.id, planType: users.planType });

    if (!expiredUser) {
      return false;
    }

    await transaction
      .insert(planNotificationEvents)
      .values({
        userId,
        eventType: PLAN_NOTIFICATION_EVENT.recurringPaymentRejected,
        cycleReference: recurringPaymentCycleReference(paymentId),
        planType: expiredUser.planType,
      })
      .onConflictDoNothing();

    return true;
  });
}

export async function activateRecurringPlanAfterApprovedPayment(
  userId: number,
  preapprovalId: string,
): Promise<boolean> {
  const [reactivatedUser] = await db
    .update(users)
    .set({
      planStatus: PLAN_STATUS.active,
      planExpiration: null,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, userId), eq(users.preapprovalId, preapprovalId)))
    .returning({ id: users.id });

  return Boolean(reactivatedUser);
}

export async function expireRecurringPlanAfterSubscriptionStopped(
  userId: number,
  preapprovalId: string,
): Promise<boolean> {
  const [expiredUser] = await db
    .update(users)
    .set({
      planStatus: PLAN_STATUS.expired,
      preapprovalId: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(users.id, userId),
      eq(users.planStatus, PLAN_STATUS.active),
      eq(users.preapprovalId, preapprovalId),
    ))
    .returning({ id: users.id });

  return Boolean(expiredUser);
}

async function sendExpirationEmail(params: {
  email: string;
  name: string;
  planType: string | null;
}): Promise<void> {
  const serviceId = process.env['EMAILJS_SERVICE_ID'];
  const templateId = process.env['EMAILJS_TEMPLATE_COBRANCA_ID'];
  const userId = process.env['EMAILJS_USER_ID'];

  if (!serviceId || !templateId || !userId) {
    throw new Error('Email service not configured');
  }

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: frontendUrl(),
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: userId,
      template_params: {
        to_email: params.email,
        to_name: params.name,
        assunto: 'Seu plano venceu - regularize para continuar usando',
        dias_restantes: 0,
        tipo_plano: planLabel(params.planType),
        link_renovacao: `${frontendUrl()}/app.html?planos=1`,
        sistema_nome: 'FINGERENCE',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`EmailJS returned status ${response.status}`);
  }
}

async function dispatchPendingPlanNotifications(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const pendingEvents = await db
    .select({
      id: planNotificationEvents.id,
      attempts: planNotificationEvents.attempts,
      planType: planNotificationEvents.planType,
      userId: users.id,
      name: users.name,
      email: users.email,
      userType: users.type,
      planStatus: users.planStatus,
      planExpiration: users.planExpiration,
      createdAt: users.createdAt,
    })
    .from(planNotificationEvents)
    .innerJoin(users, eq(planNotificationEvents.userId, users.id))
    .where(eq(planNotificationEvents.status, 'pending'));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of pendingEvents) {
    const effectiveAccess = getEffectivePlanAccess({
      userType: event.userType,
      planStatus: event.planStatus,
      planExpiration: event.planExpiration,
      createdAt: event.createdAt,
    });

    if (effectiveAccess.status !== PLAN_STATUS.expired) {
      await db
        .update(planNotificationEvents)
        .set({
          status: 'skipped',
          lastError: 'Plan was reactivated before notification dispatch.',
          updatedAt: new Date(),
        })
        .where(and(eq(planNotificationEvents.id, event.id), eq(planNotificationEvents.status, 'pending')));
      skipped += 1;
      continue;
    }

    const [claimedEvent] = await db
      .update(planNotificationEvents)
      .set({
        status: 'processing',
        attempts: event.attempts + 1,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(planNotificationEvents.id, event.id), eq(planNotificationEvents.status, 'pending')))
      .returning({ id: planNotificationEvents.id });

    if (!claimedEvent) {
      continue;
    }

    try {
      await sendExpirationEmail({ email: event.email, name: event.name, planType: event.planType });
      await db
        .update(planNotificationEvents)
        .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(eq(planNotificationEvents.id, event.id));
      sent += 1;
      console.log(`[plan lifecycle] Notification ${event.id} sent for user ${event.userId}`);
    } catch (error) {
      await db
        .update(planNotificationEvents)
        .set({
          status: 'failed',
          lastError: (error as Error).message.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(planNotificationEvents.id, event.id));
      failed += 1;
      console.error(`[plan lifecycle] Notification ${event.id} failed for user ${event.userId}`);
    }
  }

  return { sent, failed, skipped };
}

export async function processPlanLifecycle(): Promise<PlanLifecycleResult> {
  const candidates = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      userType: users.type,
      planStatus: users.planStatus,
      planType: users.planType,
      planExpiration: users.planExpiration,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(inArray(users.planStatus, [PLAN_STATUS.trial, PLAN_STATUS.active]));

  let expiredTrials = 0;
  let expiredPaidPlans = 0;
  let createdNotifications = 0;

  for (const candidate of candidates) {
    if (candidate.userType === 'admin') {
      continue;
    }

    const result = await expirePlanRecord(candidate);
    if (!result.expired) {
      continue;
    }

    if (candidate.planStatus === PLAN_STATUS.trial) {
      expiredTrials += 1;
    } else {
      expiredPaidPlans += 1;
    }

    if (result.notificationCreated) {
      createdNotifications += 1;
    }
  }

  const notificationResult = await dispatchPendingPlanNotifications();

  return {
    expiredTrials,
    expiredPaidPlans,
    createdNotifications,
    sentNotifications: notificationResult.sent,
    failedNotifications: notificationResult.failed,
    skippedNotifications: notificationResult.skipped,
  };
}

export function isPlanAccessActive(status: PlanStatus): boolean {
  return status === PLAN_STATUS.trial || status === PLAN_STATUS.active;
}
