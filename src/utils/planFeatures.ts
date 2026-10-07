// Recursos do Premium e nome do plano, a partir de GET /planos/status
// (.plans/planos-starter-premium.md). A trava de verdade fica no backend
// (403 PLAN_UPGRADE_REQUIRED); aqui é só o que a tela mostra.

export const PLAN_TIER = {
  starter: 'starter',
  premium: 'premium',
} as const;

export type PlanTier = (typeof PLAN_TIER)[keyof typeof PLAN_TIER];

const PLAN_TIER_LABEL: Record<PlanTier, string> = {
  [PLAN_TIER.starter]: 'Starter',
  [PLAN_TIER.premium]: 'Premium',
};

/** Campos de GET /planos/status usados aqui. */
export interface PlanFeaturesSource {
  plano_tipo?: string | null;
  plano_nivel?: PlanTier | null;
  recursos_premium?: boolean;
}

/**
 * Recursos do Premium liberados. Só trava quando o servidor diz que não: a
 * resposta sem o campo (backend anterior a esta versão) e a demonstração, que
 * não tem esse endereço, seguem liberadas.
 */
export function hasPremiumFeatures(status: PlanFeaturesSource | null | undefined): boolean {
  return status?.recursos_premium !== false;
}

/** Nível do plano pago, com os valores antigos de `plano_tipo` (mensal = Starter, anual = Premium). */
export function planTierOf(status: PlanFeaturesSource): PlanTier {
  if (status.plano_nivel) {
    return status.plano_nivel;
  }

  if (status.plano_tipo === PLAN_TIER.premium || status.plano_tipo === 'anual') {
    return PLAN_TIER.premium;
  }

  return PLAN_TIER.starter;
}

/** Nome do plano ativo na tela de assinatura. */
export function activePlanLabel(status: PlanFeaturesSource): string {
  if (status.plano_tipo === 'admin') {
    return 'Admin';
  }

  return PLAN_TIER_LABEL[planTierOf(status)];
}

/**
 * Por que o app fica bloqueado: teste ainda não começado (cadastro feito por
 * Licitações), plano vencido, ou membro de um titular sem Premium (equipe é do
 * Premium).
 */
export type PlanGateReason = 'notStarted' | 'expired' | 'teamNotInPlan';

export function planGateReason(
  status: PlanFeaturesSource & { status: string; isAccountMember?: boolean },
): PlanGateReason | null {
  if (status.status === 'sem_teste') {
    return 'notStarted';
  }

  if (status.status === 'expirado') {
    return 'expired';
  }

  if (status.isAccountMember === true && !hasPremiumFeatures(status)) {
    return 'teamNotInPlan';
  }

  return null;
}
