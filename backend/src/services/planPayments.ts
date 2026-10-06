import { PLAN_TIER, type PlanTier } from './plan-access';

// Ofertas do FINGERENCE e a referência gravada nos pagamentos do Mercado Pago
// (.plans/planos-starter-premium.md). Só mensal: o plano anual saiu.

export interface PlanOffer {
  amount: number;
  label: string;
}

export const PLAN_OFFERS: Record<PlanTier, PlanOffer> = {
  [PLAN_TIER.starter]: { amount: 4.99, label: 'Starter' },
  [PLAN_TIER.premium]: { amount: 9.99, label: 'Premium' },
};

/** Dias de acesso de um pagamento avulso (Pix ou cartão sem recorrência). */
export const ONE_TIME_PLAN_DAYS = 30;

// `mensal` é o Plus antigo: aceito como Starter para o app aberto no navegador
// antes da publicação não quebrar ao assinar.
const LEGACY_STARTER_CHOICE = 'mensal';

export function parsePlanChoice(value: unknown): PlanTier | null {
  if (value === PLAN_TIER.starter || value === LEGACY_STARTER_CHOICE) {
    return PLAN_TIER.starter;
  }

  if (value === PLAN_TIER.premium) {
    return PLAN_TIER.premium;
  }

  return null;
}

// Referência do pagamento: módulo, titular e plano. Pagamentos e assinaturas
// criados antes desta versão trazem só o id do usuário e eram sempre do Plus
// (o anual não tinha assinante), por isso a forma antiga vale como Starter.
const PAYMENT_REFERENCE_MODULE = 'fin';
const PAYMENT_REFERENCE_PATTERN = new RegExp(
  `^${PAYMENT_REFERENCE_MODULE}:(\\d+):(${Object.values(PLAN_TIER).join('|')})$`,
);
const LEGACY_PAYMENT_REFERENCE_PATTERN = /^\d+$/;

export interface PaymentReference {
  userId: number;
  plan: PlanTier;
}

export function buildPaymentReference(userId: number, plan: PlanTier): string {
  return `${PAYMENT_REFERENCE_MODULE}:${userId}:${plan}`;
}

function toUserId(digits: string): number | null {
  const userId = Number(digits);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export function parsePaymentReference(value: unknown): PaymentReference | null {
  if (typeof value !== 'string') {
    return null;
  }

  const reference = value.trim();
  const match = PAYMENT_REFERENCE_PATTERN.exec(reference);
  if (match) {
    const userId = toUserId(match[1]!);
    return userId === null ? null : { userId, plan: match[2] as PlanTier };
  }

  if (LEGACY_PAYMENT_REFERENCE_PATTERN.test(reference)) {
    const userId = toUserId(reference);
    return userId === null ? null : { userId, plan: PLAN_TIER.starter };
  }

  return null;
}
