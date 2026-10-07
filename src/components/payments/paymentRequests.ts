import { apiRequest } from '../../services/apiClient';
import { createMercadoPago, type MercadoPagoInstance } from '../../utils/mercadoPagoSdk';

// Pagamento das assinaturas da plataforma (FINGERENCE e Licitações), pelo
// Mercado Pago da plataforma. Cada assinatura informa os próprios endereços e o
// corpo comum dos pedidos.

/** Endereços (FINGERENCE: /planos/...; Licitações: /tenders/billing/...). */
export interface PaymentEndpoints {
  pix: string;
  card: string;
  checkout: string;
  recurring: string;
}

/** Vai em todo pedido: { tipo } no FINGERENCE, { accountId } em Licitações. */
export type PaymentRequestBody = Record<string, string | number>;

export interface PixData {
  payment_id: number;
  qr_code: string;
  qr_code_base64: string;
}

export interface CheckoutData {
  payment_url?: string;
}

/** POST de pagamento. Recusa e erro chegam como exceção, com a mensagem do servidor. */
export function postPayment<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'POST', body: JSON.stringify(body) });
}

let mercadoPagoPromise: Promise<MercadoPagoInstance | null> | null = null;

/** Biblioteca do Mercado Pago com a chave pública da plataforma; sem chave, o cartão fica indisponível. */
export function loadPlatformMercadoPago(): Promise<MercadoPagoInstance | null> {
  mercadoPagoPromise ??= (async () => {
    try {
      const config = await apiRequest<{ public_key?: string | null }>('/planos/config');
      const publicKey = config.public_key ?? null;
      if (!publicKey) {
        return null;
      }
      return await createMercadoPago(publicKey);
    } catch (error) {
      console.warn('[MP SDK] Falha ao carregar:', error);
      return null;
    }
  })();
  return mercadoPagoPromise;
}
