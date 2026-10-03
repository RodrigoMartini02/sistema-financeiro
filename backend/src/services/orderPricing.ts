// Regras puras do pedido da vitrine: situações, totais, o disponível com a
// separação dos pedidos pendentes e a tradução da situação do pagamento no
// Mercado Pago. Sem acesso ao banco, para poder ser testado isoladamente.
import { roundCents } from '../utils/requestInput';

export const ORDER_STATUSES = [
  'aguardando_pagamento', 'pago', 'enviado', 'pronto_retirada', 'entregue', 'recusado', 'expirado', 'estornado',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PAYMENT_METHODS = ['pix', 'cartao'] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

export const DELIVERY_TYPES = ['retirada', 'entrega'] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

/** Por quanto tempo os itens de um pedido pendente ficam separados (e o Pix vale). */
export const RESERVATION_MINUTES = 30;

/** Situações de pedido já pago: o estorno desfaz as receitas a partir delas. */
export const PAID_ORDER_STATUSES: readonly OrderStatus[] = ['pago', 'enviado', 'pronto_retirada', 'entregue'];

export interface OrderLinePrice {
  /** Preço cheio do produto. */
  originalPrice: number;
  /** Preço com desconto, o que o cliente paga. */
  unitPrice: number;
  quantity: number;
}

export interface OrderTotals {
  subtotal: number;
  /** Quanto o cliente economiza com os descontos dos produtos. */
  discount: number;
  deliveryFee: number;
  total: number;
}

export function lineSubtotal(line: OrderLinePrice): number {
  return roundCents(line.unitPrice * line.quantity);
}

export function calculateOrderTotals(lines: OrderLinePrice[], deliveryFee: number): OrderTotals {
  const subtotal = roundCents(lines.reduce((sum, line) => sum + lineSubtotal(line), 0));
  const discount = roundCents(lines.reduce((sum, line) => sum + (line.originalPrice - line.unitPrice) * line.quantity, 0));
  const fee = roundCents(deliveryFee);
  return { subtotal, discount, deliveryFee: fee, total: roundCents(subtotal + fee) };
}

/**
 * Quanto ainda dá para vender do produto: o saldo menos o que está separado em
 * pedidos pendentes. Sem controle de estoque, não há limite (null).
 */
export function availableQuantity(stock: number, reserved: number, tracksStock: boolean): number | null {
  if (!tracksStock) {
    return null;
  }
  return Math.max(0, Math.floor(stock - reserved));
}

/**
 * Situação do pedido a partir da situação do pagamento no Mercado Pago; null
 * quando o pagamento ainda não decidiu nada (pendente, em análise).
 */
export function orderStatusFromPayment(paymentStatus: string, statusDetail?: string | null): OrderStatus | null {
  switch (paymentStatus) {
    case 'approved':
      return 'pago';
    case 'rejected':
      return 'recusado';
    case 'cancelled':
      return statusDetail === 'expired' ? 'expirado' : 'recusado';
    case 'refunded':
    case 'charged_back':
      return 'estornado';
    default:
      return null;
  }
}

/**
 * O que a loja pode mudar à mão: pago → enviado (entrega) ou pronto para
 * retirada (retirada) → entregue. O resto vem só do pagamento.
 */
export function canChangeOrderStatus(from: OrderStatus, to: OrderStatus, deliveryType: DeliveryType): boolean {
  const handover: OrderStatus = deliveryType === 'entrega' ? 'enviado' : 'pronto_retirada';
  if (from === 'pago') {
    return to === handover || to === 'entregue';
  }
  return from === handover && to === 'entregue';
}

/** O valor pago confere com o total do pedido (centavos). */
export function paymentMatchesTotal(paidAmount: number, orderTotal: number): boolean {
  return Math.abs(roundCents(paidAmount) - roundCents(orderTotal)) < 0.005;
}
