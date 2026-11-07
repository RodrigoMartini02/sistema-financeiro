// Cobranças do pedido da vitrine no Mercado Pago, sempre com o cliente (token)
// da loja: o dinheiro cai na conta dela. Isolado num objeto para o roteiro de
// teste poder trocar por um simulado; as rotas usam `mercadoPagoGateway`.
import { Payment, type MercadoPagoConfig } from 'mercadopago';
import type { PaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes';

export interface ChargeRequest {
  orderId: string;
  description: string;
  amount: number;
  payer: { email: string; firstName: string; cpf: string };
  /** Nulo em ambiente local: o Mercado Pago só aceita endereço público. */
  notificationUrl: string | null;
}

export interface PixCharge {
  paymentId: string;
  status: string;
  statusDetail: string | null;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: Date;
}

export interface CardCharge {
  paymentId: string;
  status: string;
  statusDetail: string | null;
}

/** O que importa do pagamento para decidir a situação do pedido. */
export interface PaymentSnapshot {
  paymentId: string;
  status: string;
  statusDetail: string | null;
  externalReference: string | null;
  amount: number;
}

export interface OrderPaymentGateway {
  createPix(config: MercadoPagoConfig, request: ChargeRequest & { expiresAt: Date }): Promise<PixCharge>;
  createCard(config: MercadoPagoConfig, request: ChargeRequest & { cardToken: string; paymentMethodId: string | null }): Promise<CardCharge>;
  getPayment(config: MercadoPagoConfig, paymentId: string): Promise<PaymentSnapshot>;
}

function requirePaymentId(response: PaymentResponse): string {
  if (response.id === undefined || response.id === null) {
    throw new Error('Mercado Pago payment response without id');
  }
  return String(response.id);
}

function payerOf(request: ChargeRequest) {
  return {
    email: request.payer.email,
    first_name: request.payer.firstName,
    identification: { type: 'CPF', number: request.payer.cpf },
  };
}

export const mercadoPagoGateway: OrderPaymentGateway = {
  async createPix(config, request) {
    const response = await new Payment(config).create({
      body: {
        transaction_amount: request.amount,
        payment_method_id: 'pix',
        description: request.description,
        external_reference: request.orderId,
        payer: payerOf(request),
        date_of_expiration: request.expiresAt.toISOString(),
        ...(request.notificationUrl ? { notification_url: request.notificationUrl } : {}),
      },
      requestOptions: { idempotencyKey: `pedido-${request.orderId}` },
    });
    const transactionData = response.point_of_interaction?.transaction_data;
    if (!transactionData?.qr_code || !transactionData.qr_code_base64) {
      throw new Error('Mercado Pago did not return the Pix QR code');
    }
    return {
      paymentId: requirePaymentId(response),
      status: response.status ?? 'pending',
      statusDetail: response.status_detail ?? null,
      qrCode: transactionData.qr_code,
      qrCodeBase64: transactionData.qr_code_base64,
      expiresAt: response.date_of_expiration ? new Date(response.date_of_expiration) : request.expiresAt,
    };
  },

  async createCard(config, request) {
    const response = await new Payment(config).create({
      body: {
        transaction_amount: request.amount,
        token: request.cardToken,
        installments: 1,
        description: request.description,
        external_reference: request.orderId,
        payer: payerOf(request),
        ...(request.paymentMethodId ? { payment_method_id: request.paymentMethodId } : {}),
        ...(request.notificationUrl ? { notification_url: request.notificationUrl } : {}),
      },
      requestOptions: { idempotencyKey: `pedido-${request.orderId}` },
    });
    return {
      paymentId: requirePaymentId(response),
      status: response.status ?? 'pending',
      statusDetail: response.status_detail ?? null,
    };
  },

  async getPayment(config, paymentId) {
    const response = await new Payment(config).get({ id: paymentId });
    return {
      paymentId: requirePaymentId(response),
      status: response.status ?? 'pending',
      statusDetail: response.status_detail ?? null,
      externalReference: response.external_reference ?? null,
      amount: Number(response.transaction_amount ?? 0),
    };
  },
};
