import { and, eq, inArray, notExists, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { accountMembers, accounts, planNotificationEvents, users } from '../db/schema';
import {
  getEffectivePlanAccess,
  hasPremiumFeatures,
  PLAN_STATUS,
  planTier,
  TRIAL_DURATION_DAYS,
  type EffectivePlanAccess,
  type PlanAccessSnapshot,
  type PlanStatus,
  type PlanTier,
} from './plan-access';

export const PLAN_NOTIFICATION_EVENT = {
  expired: 'plan_expired',
  recurringPaymentRejected: 'recurring_payment_rejected',
  trialExpired: 'trial_expired',
} as const;

export interface PlanStatusResult extends EffectivePlanAccess {
  planType: string | null;
  planTier: PlanTier;
  /** Recursos do Premium liberados (admin, teste grátis ou Premium ativo). */
  premiumFeatures: boolean;
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

// Trial nao tem data de expiracao propria (e calculado a partir de createdAt
// + TRIAL_DURATION_DAYS) e um usuario so passa por ele uma vez na vida —
// o id do usuario ja e suficiente para o dedupe.
function trialCycleReference(userId: number): string {
  return `trial-expiration:${userId}`;
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

  const effectiveAccess = getEffectivePlanAccess(user);
  return {
    ...effectiveAccess,
    planType: user.planType,
    planTier: planTier(user.planType),
    premiumFeatures: hasPremiumFeatures({
      userType: user.userType,
      status: effectiveAccess.status,
      planType: user.planType,
    }),
    planExpiration: user.planExpiration,
    createdAt: user.createdAt,
    userType: user.userType,
  };
}

export interface PlanHolder {
  holderId: number;
  /** Membro ativo de uma conta: o plano que vale é o do titular dela. */
  isAccountMember: boolean;
}

/**
 * De quem é o plano que vale para o usuário: o do titular da conta, quando ele
 * é membro ou colaborador ativo dela (conta_membros), ou o dele mesmo. O membro
 * nasce com teste próprio, que não deve bloqueá-lo enquanto o titular paga.
 */
export async function resolvePlanHolder(userId: number): Promise<PlanHolder> {
  const [membership] = await db
    .select({ ownerId: accounts.userId })
    .from(accountMembers)
    .innerJoin(accounts, eq(accounts.id, accountMembers.accountId))
    .where(and(eq(accountMembers.userId, userId), eq(accountMembers.status, 'ativo')))
    .limit(1);

  if (!membership) {
    return { holderId: userId, isAccountMember: false };
  }
  return { holderId: membership.ownerId, isAccountMember: true };
}

export interface RequesterPlanStatus extends PlanStatusResult {
  /** Dono do plano: o próprio usuário ou o titular da conta de que ele é membro. */
  holderId: number;
  isAccountMember: boolean;
}

/** Status do plano que vale para quem faz o pedido (ver resolvePlanHolder). */
export async function getRequesterPlanStatus(userId: number): Promise<RequesterPlanStatus | null> {
  const holder = await resolvePlanHolder(userId);
  const planStatus = await getPlanStatusForUser(holder.holderId);
  if (!planStatus) {
    return null;
  }
  return { ...planStatus, holderId: holder.holderId, isAccountMember: holder.isAccountMember };
}

/** Conta Padrão do dono do plano: a única liberada no Starter. */
export async function isHolderDefaultAccount(holderId: number, accountId: number): Promise<boolean> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, holderId), eq(accounts.isDefault, true)))
    .limit(1);
  return account !== undefined;
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

    if (storedStatus === PLAN_STATUS.trial) {
      const trialNotificationResult = await transaction
        .insert(planNotificationEvents)
        .values({
          userId: record.id,
          eventType: PLAN_NOTIFICATION_EVENT.trialExpired,
          cycleReference: trialCycleReference(record.id),
          planType: record.planType,
        })
        .onConflictDoNothing()
        .returning({ id: planNotificationEvents.id });

      return { expired: true, notificationCreated: trialNotificationResult.length > 0 };
    }

    if (!record.planExpiration) {
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

/**
 * Começa o teste de 15 dias do FINGERENCE de quem se cadastrou por Licitações
 * (`sem_teste`). Uma vez só: fora de `sem_teste`, nada muda e devolve false.
 * As datas saem do relógio do banco, no fuso de Brasília como o resto do plano.
 */
export async function startDeferredTrial(userId: number): Promise<boolean> {
  const [startedUser] = await db
    .update(users)
    .set({
      planStatus: PLAN_STATUS.trial,
      planStart: sql`now()`,
      planExpiration: sql`now() + make_interval(days => ${TRIAL_DURATION_DAYS})`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(users.id, userId), eq(users.planStatus, PLAN_STATUS.notStarted)))
    .returning({ id: users.id });

  return Boolean(startedUser);
}

// Um so template para os dois motivos de bloqueio (plano pago vencido e
// teste gratuito encerrado) — conta gratuita do EmailJS limita a 2
// templates no total. Texto generico o bastante para servir aos dois casos,
// sem mencionar "regularizar pagamento" (nao se aplica a quem nunca pagou).
async function sendAccessSuspendedEmail(params: { email: string; name: string }): Promise<void> {
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
        assunto: 'Seu acesso foi suspenso',
        link_planos: `${frontendUrl()}/app.html?planos=1`,
        sistema_nome: 'FINGERENCE',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`EmailJS returned status ${response.status}`);
  }
}

async function skipPendingNotification(eventId: number, reason: string): Promise<void> {
  await db
    .update(planNotificationEvents)
    .set({ status: 'skipped', lastError: reason, updatedAt: new Date() })
    .where(and(eq(planNotificationEvents.id, eventId), eq(planNotificationEvents.status, 'pending')));
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
      userId: users.id,
      name: users.name,
      email: users.email,
      userType: users.type,
      planStatus: users.planStatus,
      planExpiration: users.planExpiration,
      createdAt: users.createdAt,
      memberAccountId: accountMembers.accountId,
    })
    .from(planNotificationEvents)
    .innerJoin(users, eq(planNotificationEvents.userId, users.id))
    .leftJoin(accountMembers, and(eq(accountMembers.userId, users.id), eq(accountMembers.status, 'ativo')))
    .where(eq(planNotificationEvents.status, 'pending'));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of pendingEvents) {
    // Aviso criado antes de o membro seguir o plano do titular: o acesso dele
    // não depende mais do próprio cadastro, então o e-mail não vale.
    if (event.memberAccountId !== null) {
      await skipPendingNotification(event.id, 'Account member: the plan follows the account owner.');
      skipped += 1;
      continue;
    }

    const effectiveAccess = getEffectivePlanAccess({
      userType: event.userType,
      planStatus: event.planStatus,
      planExpiration: event.planExpiration,
      createdAt: event.createdAt,
    });

    if (effectiveAccess.status !== PLAN_STATUS.expired) {
      await skipPendingNotification(event.id, 'Plan was reactivated before notification dispatch.');
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
      await sendAccessSuspendedEmail({ email: event.email, name: event.name });
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
    .where(and(
      inArray(users.planStatus, [PLAN_STATUS.trial, PLAN_STATUS.active]),
      // Membro ativo usa o plano do titular (resolvePlanHolder): o teste
      // próprio dele não expira nem gera e-mail de acesso suspenso.
      notExists(
        db
          .select({ id: accountMembers.id })
          .from(accountMembers)
          .where(and(eq(accountMembers.userId, users.id), eq(accountMembers.status, 'ativo'))),
      ),
    ));

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
