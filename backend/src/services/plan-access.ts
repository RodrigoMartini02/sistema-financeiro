export const PLAN_STATUS = {
  trial: 'trial',
  active: 'ativo',
  expired: 'expirado',
} as const;

export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

export const TRIAL_DURATION_DAYS = 15;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface PlanAccessSnapshot {
  userType: string | null;
  planStatus: string | null;
  planExpiration: Date | string | null;
  createdAt: Date | string | null;
}
export interface EffectivePlanAccess {
  status: PlanStatus;
  trialDaysLeft: number | null;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function parseBrasiliaTimestamp(value: Date | string | null): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  const normalized = value.trim().replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasTimezone ? normalized : `${normalized}-03:00`);

  return isValidDate(parsed) ? parsed : null;
}

function normalizePlanStatus(value: string | null): PlanStatus {
  if (value === PLAN_STATUS.active || value === PLAN_STATUS.expired) {
    return value;
  }

  return PLAN_STATUS.trial;
}

export function getEffectivePlanAccess(
  snapshot: PlanAccessSnapshot,
  now: Date = new Date(),
): EffectivePlanAccess {
  if (snapshot.userType === 'master') {
    return { status: PLAN_STATUS.active, trialDaysLeft: null };
  }

  const storedStatus = normalizePlanStatus(snapshot.planStatus);

  if (storedStatus === PLAN_STATUS.expired) {
    return { status: PLAN_STATUS.expired, trialDaysLeft: null };
  }

  if (storedStatus === PLAN_STATUS.trial) {
    const createdAt = parseBrasiliaTimestamp(snapshot.createdAt);
    if (!createdAt) {
      return { status: PLAN_STATUS.trial, trialDaysLeft: null };
    }

    const elapsedDays = Math.floor((now.getTime() - createdAt.getTime()) / DAY_IN_MS);
    const trialDaysLeft = Math.max(0, TRIAL_DURATION_DAYS - elapsedDays);

    if (elapsedDays >= TRIAL_DURATION_DAYS) {
      return { status: PLAN_STATUS.expired, trialDaysLeft: null };
    }

    return { status: PLAN_STATUS.trial, trialDaysLeft };
  }

  const planExpiration = parseBrasiliaTimestamp(snapshot.planExpiration);
  if (planExpiration && planExpiration.getTime() <= now.getTime()) {
    return { status: PLAN_STATUS.expired, trialDaysLeft: null };
  }

  return { status: PLAN_STATUS.active, trialDaysLeft: null };
}
