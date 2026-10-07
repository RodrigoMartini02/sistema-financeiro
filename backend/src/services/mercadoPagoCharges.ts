// Cobranças da plataforma no Mercado Pago: assinaturas do FINGERENCE
// (routes/plans.ts) e de Licitações (modules/tenders/routes/billing.ts). As
// lojas da vitrine cobram na conta delas (mercadoPagoAccounts.ts).
import { MercadoPagoConfig, Payment, PreApproval, Preference } from 'mercadopago';

let client: MercadoPagoConfig | null = null;

/** Lido na primeira cobrança, depois de o .env estar carregado. */
function mercadoPagoClient(): MercadoPagoConfig {
  client ??= new MercadoPagoConfig({ accessToken: process.env['MP_ACCESS_TOKEN']! });
  return client;
}

/** Pix e link de checkout expiram em 30 minutos. */
const PIX_EXPIRATION_MS = 30 * 60 * 1000;
/** A assinatura recorrente começa logo depois de criada. */
const RECURRING_START_DELAY_S = 30;

interface ChargeBase {
  amount: number;
  description: string;
  /** external_reference: o webhook acha o módulo e o dono por ela. */
  reference: string;
  notificationUrl: string;
}

export interface PixCharge {
  paymentId: number | undefined;
  qrCode: string;
  qrCodeBase64: string | undefined;
}

export async function createPixCharge(input: ChargeBase & { payerEmail: string }): Promise<PixCharge> {
  const payment = await new Payment(mercadoPagoClient()).create({
    body: {
      transaction_amount: input.amount,
      payment_method_id: 'pix',
      payer: { email: input.payerEmail },
      description: input.description,
      external_reference: input.reference,
      notification_url: input.notificationUrl,
      date_of_expiration: new Date(Date.now() + PIX_EXPIRATION_MS).toISOString(),
    },
  });

  const pixData = ((payment as unknown as Record<string, unknown>)?.['point_of_interaction'] as Record<string, unknown> | undefined)?.['transaction_data'] as Record<string, unknown> | undefined;
  if (!pixData?.['qr_code']) {
    throw new Error('QR Code not returned by MercadoPago');
  }

  return {
    paymentId: payment.id,
    qrCode: String(pixData['qr_code']),
    qrCodeBase64: pixData['qr_code_base64'] === undefined ? undefined : String(pixData['qr_code_base64']),
  };
}

export interface CardCharge {
  id: number | undefined;
  status: string | undefined;
  statusDetail: string | undefined;
}

/** Cartão avulso (checkout transparente), sempre em uma parcela. */
export async function chargeCard(input: ChargeBase & { payerEmail: string; cardToken: string; cpf: string | null }): Promise<CardCharge> {
  const payment = await new Payment(mercadoPagoClient()).create({
    body: {
      transaction_amount: input.amount,
      token: input.cardToken,
      installments: 1,
      payment_method_id: null as unknown as string,
      payer: {
        email: input.payerEmail,
        identification: input.cpf ? { type: 'CPF', number: input.cpf.replace(/\D/g, '') } : undefined,
      },
      description: input.description,
      external_reference: input.reference,
      notification_url: input.notificationUrl,
    },
  });

  const detail = (payment as unknown as Record<string, unknown>)['status_detail'];
  return { id: payment.id, status: payment.status, statusDetail: detail === undefined ? undefined : String(detail) };
}

export type CheckoutPaymentType = 'cartao' | 'debito';

/** Link do checkout do Mercado Pago, só com o meio escolhido (crédito ou débito). */
export async function createCheckoutLink(
  input: ChargeBase & { itemId: string; backUrl: string; paymentType: CheckoutPaymentType | null },
): Promise<string | undefined> {
  const excludedTypes: Array<{ id: string }> = [{ id: 'ticket' }];
  if (input.paymentType === 'debito') {
    excludedTypes.push({ id: 'credit_card' });
  } else if (input.paymentType === 'cartao') {
    excludedTypes.push({ id: 'debit_card' });
  }

  const preference = await new Preference(mercadoPagoClient()).create({
    body: {
      items: [{ id: input.itemId, title: input.description, unit_price: input.amount, quantity: 1, currency_id: 'BRL' }],
      payment_methods: { excluded_payment_types: excludedTypes, installments: 1 },
      external_reference: input.reference,
      notification_url: input.notificationUrl,
      back_urls: { success: input.backUrl, failure: input.backUrl },
      auto_return: 'approved',
    },
  });
  return preference.init_point;
}

export interface RecurringCharge {
  id: string | undefined;
  status: string | undefined;
}

/** Assinatura recorrente mensal no cartão. */
export async function createRecurring(
  input: ChargeBase & { payerEmail: string; cardToken: string; backUrl: string },
): Promise<RecurringCharge> {
  const preApproval = new PreApproval(mercadoPagoClient());
  const startDate = new Date();
  startDate.setSeconds(startDate.getSeconds() + RECURRING_START_DELAY_S);

  const result = await preApproval.create({
    body: {
      reason: input.description,
      external_reference: input.reference,
      payer_email: input.payerEmail,
      card_token_id: input.cardToken,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        start_date: startDate.toISOString(),
        transaction_amount: input.amount,
        currency_id: 'BRL',
      },
      back_url: input.backUrl,
      notification_url: input.notificationUrl,
      status: 'authorized',
    } as unknown as Parameters<typeof preApproval.create>[0]['body'],
  });
  return { id: result.id, status: result.status };
}

export async function cancelRecurring(recurringId: string): Promise<void> {
  await new PreApproval(mercadoPagoClient()).update({ id: recurringId, body: { status: 'cancelled' } });
}

/** Novo valor da assinatura recorrente: vale a partir da próxima cobrança. */
export async function updateRecurringAmount(recurringId: string, amount: number): Promise<void> {
  const preApproval = new PreApproval(mercadoPagoClient());
  await preApproval.update({
    id: recurringId,
    body: { auto_recurring: { transaction_amount: amount, currency_id: 'BRL' } } as unknown as Parameters<typeof preApproval.update>[0]['body'],
  });
}

export interface PaymentInfo {
  id: number | undefined;
  status: string | undefined;
  statusDetail: string | undefined;
  externalReference: string | undefined;
  /** Cobrança gerada por uma assinatura recorrente. */
  recurringId: string | undefined;
}

export async function getPayment(paymentId: string): Promise<PaymentInfo> {
  const payment = await new Payment(mercadoPagoClient()).get({ id: paymentId });
  const raw = payment as unknown as Record<string, unknown>;
  return {
    id: payment.id,
    status: payment.status,
    statusDetail: raw['status_detail'] === undefined ? undefined : String(raw['status_detail']),
    externalReference: payment.external_reference,
    recurringId: raw['preapproval_id'] ? String(raw['preapproval_id']) : undefined,
  };
}

export interface RecurringInfo {
  id: string | undefined;
  status: string | undefined;
  externalReference: string | undefined;
}

export async function getRecurring(recurringId: string): Promise<RecurringInfo> {
  const subscription = await new PreApproval(mercadoPagoClient()).get({ id: recurringId });
  return { id: subscription.id, status: subscription.status, externalReference: subscription.external_reference };
}
