import type { PaymentEndpoints } from '@ui/payments/paymentRequests';
import type { BillingHistory, TenderBilling, TenderSubscription } from '../types';
import { tendersRequest } from './tendersApi';

// Assinatura da empresa (titular). Fica fora da trava para permitir a renovação
// mesmo depois de vencer o teste ou o período pago.

/** Pagamentos pelo diálogo comum de assinatura (packages/ui, pasta payments). */
export const TENDERS_PAYMENT_ENDPOINTS: PaymentEndpoints = {
  pix: '/tenders/billing/pix',
  card: '/tenders/billing/card',
  checkout: '/tenders/billing/checkout',
  recurring: '/tenders/billing/recurring',
};

export function fetchBilling(accountId: number): Promise<TenderBilling> {
  return tendersRequest<TenderBilling>(`/billing?accountId=${accountId}`);
}

/** Pagamentos, recusas, ativação e cancelamentos da assinatura da conta (até 200, do mais recente ao mais antigo). */
export function fetchBillingHistory(accountId: number): Promise<BillingHistory> {
  return tendersRequest<BillingHistory>(`/billing/history?accountId=${accountId}`);
}

/** Para a assinatura recorrente; o acesso vai até o fim do teste ou do período pago. */
export function cancelRecurringSubscription(accountId: number): Promise<TenderSubscription> {
  return tendersRequest<TenderSubscription>('/billing/cancel', { method: 'POST', body: JSON.stringify({ accountId }) });
}
