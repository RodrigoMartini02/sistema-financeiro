import type { TenderAccessType } from '../domains';

// Preço, prazos e situação da assinatura do módulo (plano
// .plans/licitacoes-produto.md). Valores em centavos, para não acumular erro de
// arredondamento; o Mercado Pago recebe em reais.

export const TENDERS_PRICE = {
  baseCents: 499,
  /** A base cobre o titular e mais 1. */
  includedUsers: 2,
  extraUserCents: 299,
} as const;

export const TRIAL_DAYS = 15;
export const PAID_PERIOD_DAYS = 30;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Valor do mês para a quantidade de usuários (o titular e quem tem acesso). */
export function monthlyAmountCents(usersCount: number): number {
  const extraUsers = Math.max(0, usersCount - TENDERS_PRICE.includedUsers);
  return TENDERS_PRICE.baseCents + extraUsers * TENDERS_PRICE.extraUserCents;
}

export function centsToAmount(cents: number): number {
  return cents / 100;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_IN_MS);
}

export interface PaidPeriodInput {
  now: Date;
  trialUntil: Date | null;
  paidUntil: Date | null;
}

/**
 * Novo fim do período de um pagamento avulso (Pix, cartão ou checkout): 30 dias
 * contados do maior entre agora, o fim do teste e o fim do que já está pago,
 * para ninguém perder dias pagando antes.
 */
export function nextPaidUntil({ now, trialUntil, paidUntil }: PaidPeriodInput): Date {
  const start = [now, trialUntil, paidUntil]
    .filter((date): date is Date => date !== null)
    .reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest));
  return addDays(start, PAID_PERIOD_DAYS);
}

export const SUBSCRIPTION_SITUATIONS = ['cortesia', 'teste', 'paga', 'recorrente', 'vencida', 'desligada'] as const;
export type SubscriptionSituation = (typeof SUBSCRIPTION_SITUATIONS)[number];

export interface SubscriptionSnapshot {
  active: boolean;
  accessType: TenderAccessType;
  trialUntil: Date | null;
  paidUntil: Date | null;
  recurringId: string | null;
}

/**
 * Situação mostrada na tela. A mesma regra de acesso de
 * licitacoes.fn_conta_com_acesso (migration 0080): só "vencida" e "desligada"
 * ficam sem acesso.
 */
export function subscriptionSituation(snapshot: SubscriptionSnapshot, now: Date): SubscriptionSituation {
  if (!snapshot.active) {
    return 'desligada';
  }
  if (snapshot.accessType === 'cortesia') {
    return 'cortesia';
  }
  if (snapshot.recurringId) {
    return 'recorrente';
  }
  if (snapshot.paidUntil && snapshot.paidUntil.getTime() > now.getTime()) {
    return 'paga';
  }
  if (snapshot.trialUntil && snapshot.trialUntil.getTime() > now.getTime()) {
    return 'teste';
  }
  return 'vencida';
}

export function situationHasAccess(situation: SubscriptionSituation): boolean {
  return situation !== 'vencida' && situation !== 'desligada';
}

// Referência gravada no pagamento do Mercado Pago: módulo e conta. O webhook do
// FINGERENCE usa `fin:` e ignora esta.
const PAYMENT_REFERENCE_PATTERN = /^lic:(\d+)$/;

export function buildTendersPaymentReference(accountId: number): string {
  return `lic:${accountId}`;
}

export function parseTendersPaymentReference(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = PAYMENT_REFERENCE_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const accountId = Number(match[1]);
  return Number.isSafeInteger(accountId) && accountId > 0 ? accountId : null;
}
