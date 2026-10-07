import { apiRequest, getActiveAccountId } from './apiClient';
import type { CardInvoice, InvoicePaymentInput } from '../types/finance';

/** Faturas do mês ('AAAA-MM') dos cartões de crédito que a pessoa pode pagar. */
export async function fetchCardInvoices(accountId: number | null, invoiceMonth: string): Promise<CardInvoice[]> {
  const params = new URLSearchParams({ invoice_month: invoiceMonth });
  const id = accountId ?? getActiveAccountId();
  if (id) params.set('conta_id', String(id));
  return apiRequest<CardInvoice[]>(`/card-invoices?${params}`);
}

/** "Pagar fatura": total, parcial ou parcelado. Devolve a fatura atualizada. */
export async function payCardInvoice(input: InvoicePaymentInput): Promise<CardInvoice | null> {
  return apiRequest<CardInvoice | null>('/card-invoices/payments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Desfaz o pagamento da fatura; o registro fica como estornado. Devolve a fatura atualizada. */
export async function undoInvoicePayment(paymentId: number): Promise<CardInvoice | null> {
  return apiRequest<CardInvoice | null>(`/card-invoices/payments/${paymentId}`, { method: 'DELETE' });
}
