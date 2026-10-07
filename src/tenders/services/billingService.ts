import type { PaymentEndpoints } from '../../components/payments/paymentRequests';
import type { TenderActivation, TenderBilling, TenderSubscription } from '../types';
import { tendersRequest } from './tendersApi';

// Assinatura e ativação do módulo (titular). Ficam fora da trava do módulo: a
// conta pode estar vencida ou ainda sem o módulo.

/** Pagamentos pelo diálogo comum de assinatura (src/components/payments). */
export const TENDERS_PAYMENT_ENDPOINTS: PaymentEndpoints = {
  pix: '/tenders/billing/pix',
  card: '/tenders/billing/card',
  checkout: '/tenders/billing/checkout',
  recurring: '/tenders/billing/recurring',
};

export function fetchBilling(accountId: number): Promise<TenderBilling> {
  return tendersRequest<TenderBilling>(`/billing?accountId=${accountId}`);
}

/** Para a assinatura recorrente; o acesso vai até o fim do teste ou do período pago. */
export function cancelRecurringSubscription(accountId: number): Promise<TenderSubscription> {
  return tendersRequest<TenderSubscription>('/billing/cancel', { method: 'POST', body: JSON.stringify({ accountId }) });
}

export function fetchActivation(): Promise<TenderActivation> {
  return tendersRequest<TenderActivation>('/activation');
}

/** Começa o teste de 15 dias na conta escolhida. */
export function activateTenders(accountId: number): Promise<unknown> {
  return tendersRequest<unknown>('/activation', { method: 'POST', body: JSON.stringify({ accountId }) });
}
