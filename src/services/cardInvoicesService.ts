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

/** Fatura vencida e em aberto no sistema (GET /card-invoices/overdue). */
export interface OverdueInvoice {
  card: { id: number; name: string; ownerName: string | null };
  /** 1º dia do mês da fatura, 'AAAA-MM-01'. */
  invoiceMonth: string;
  dueDate: string;
  openTotal: number;
  itemCount: number;
}

export interface InvoiceBatchResult {
  paid: Array<{ cardId: number; invoiceMonthStart: string; paymentId: number }>;
  failed: Array<{ cardId: number; invoiceMonthStart: string; message: string }>;
}

/** As faturas vencidas e em aberto dos cartões que a pessoa pode pagar, da mais antiga para a mais nova. */
export async function fetchOverdueInvoices(accountId: number | null): Promise<OverdueInvoice[]> {
  const id = accountId ?? getActiveAccountId();
  return apiRequest<OverdueInvoice[]>(`/card-invoices/overdue${id ? `?conta_id=${id}` : ''}`);
}

/** Quita no total as faturas da lista, cada uma na sua data de pagamento. As que falharem vêm em `failed`. */
export async function payInvoicesInFull(
  items: Array<{ cardId: number; invoiceMonth: string; paymentDate: string }>,
): Promise<InvoiceBatchResult> {
  return apiRequest<InvoiceBatchResult>('/card-invoices/payments/batch', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}
