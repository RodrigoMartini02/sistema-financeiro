// Preços mostrados no site público. Os que valem na cobrança ficam no backend
// (services/planPayments.ts e modules/tenders/services/billing.ts): mudar um
// exige mudar o outro.

export const FREE_TRIAL_DAYS = 15;

export const FINANCE_PLAN_PRICES_CENTS = {
  starter: 499,
  premium: 999,
} as const;

export const TENDERS_PRICE = {
  baseCents: 499,
  /** A base cobre o titular e mais (includedUsers - 1). */
  includedUsers: 2,
  extraUserCents: 299,
} as const;

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatPriceCents(cents: number): string {
  return BRL.format(cents / 100);
}
