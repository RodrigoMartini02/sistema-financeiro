import { desc, eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { tenderBillingHistory } from '../db/schema';
import type { BillingCancelOrigin, BillingEventStatus, BillingEventType, BillingMethod } from '../domains';
import { toBrasiliaIso } from './dates';
import type { PaymentInfo } from './mercadoPagoCharges';

// Histórico de cobrança da assinatura (item 1B, migration 0004): um registro por pagamento aprovado ou recusado,
// assinatura recorrente ativada e assinatura recorrente cancelada. Quem muda a assinatura (services/subscription.ts)
// grava o evento na mesma transação; a tela só lê. Nada de dado de cartão ou do pagador é guardado.

/** Quantos eventos a tela recebe: os mais recentes. */
export const BILLING_HISTORY_LIMIT = 200;

/** `pagamento_id` e `detalhe` são varchar(40) e varchar(100). */
const MAX_PAYMENT_ID_LENGTH = 40;
const MAX_DETAIL_LENGTH = 100;

const CARD_PAYMENT_TYPES: readonly string[] = ['credit_card', 'debit_card'];

/** O que um pagamento do Mercado Pago informa para o histórico: o valor em centavos e o meio. */
export interface PaymentDetails {
  amountCents: number | null;
  method: BillingMethod | null;
}

/**
 * Valor e meio de um pagamento. Recorrente é a cobrança mensal da assinatura; Pix e cartão (crédito ou débito) são
 * os pagamentos avulsos. Outro tipo de pagamento fica sem meio, e valor ausente fica sem valor.
 */
export function describePayment(
  info: Pick<PaymentInfo, 'amount' | 'paymentTypeId' | 'paymentMethodId' | 'recurringId'>,
): PaymentDetails {
  const amountCents = typeof info.amount === 'number' && Number.isFinite(info.amount) ? Math.round(info.amount * 100) : null;
  if (info.recurringId) {
    return { amountCents, method: 'RECORRENTE' };
  }
  if (info.paymentMethodId === 'pix') {
    return { amountCents, method: 'PIX' };
  }
  if (info.paymentTypeId !== undefined && CARD_PAYMENT_TYPES.includes(info.paymentTypeId)) {
    return { amountCents, method: 'CARTAO' };
  }
  return { amountCents, method: null };
}

export interface NewBillingEvent {
  accountId: number;
  type: BillingEventType;
  status: BillingEventStatus;
  occurredAt: Date;
  method?: BillingMethod | null;
  origin?: BillingCancelOrigin | null;
  amountCents?: number | null;
  users?: number | null;
  paymentId?: string | null;
  recurringId?: string | null;
  /** Código da recusa no Mercado Pago. */
  detail?: string | null;
}

/**
 * Grava um evento. Aceita a transação de quem muda a assinatura. Devolve `false` quando o mesmo pagamento já tinha
 * sido gravado com o mesmo status (o aviso do Mercado Pago veio de novo): nada é gravado.
 */
export async function recordBillingEvent(db: TendersDb, event: NewBillingEvent): Promise<boolean> {
  const inserted = await db
    .insert(tenderBillingHistory)
    .values({
      accountId: event.accountId,
      type: event.type,
      status: event.status,
      method: event.method ?? null,
      origin: event.origin ?? null,
      amountCents: event.amountCents ?? null,
      users: event.users ?? null,
      paymentId: event.paymentId?.slice(0, MAX_PAYMENT_ID_LENGTH) ?? null,
      recurringId: event.recurringId ?? null,
      detail: event.detail?.slice(0, MAX_DETAIL_LENGTH) ?? null,
      occurredAt: event.occurredAt.toISOString(),
    })
    .onConflictDoNothing()
    .returning({ id: tenderBillingHistory.id });
  return inserted.length > 0;
}

/**
 * Pagamento recusado. Fica fora da transação de qualquer mudança na assinatura e nunca lança: uma falha ao gravar o
 * histórico é registrada com a conta e não derruba a resposta ao titular nem o tratamento do aviso.
 */
export async function recordRefusedPayment(
  db: TendersDb,
  input: { accountId: number; paymentId: string | undefined; details: PaymentDetails; detail: string | undefined; now: Date },
): Promise<boolean> {
  try {
    return await recordBillingEvent(db, {
      accountId: input.accountId,
      type: 'PAGAMENTO',
      status: 'RECUSADO',
      occurredAt: input.now,
      method: input.details.method,
      amountCents: input.details.amountCents,
      paymentId: input.paymentId ?? null,
      detail: input.detail ?? null,
    });
  } catch (error) {
    console.error('Tender billing refusal record failed:', { accountId: input.accountId, error: (error as Error).message });
    return false;
  }
}

type BillingEventRow = Pick<
  typeof tenderBillingHistory.$inferSelect,
  'id' | 'type' | 'status' | 'method' | 'origin' | 'amountCents' | 'users' | 'occurredAt'
>;

/** O evento como a API devolve. Os identificadores do Mercado Pago e o código da recusa não saem. */
export interface BillingEventView {
  id: number;
  type: BillingEventType;
  status: BillingEventStatus;
  method: BillingMethod | null;
  origin: BillingCancelOrigin | null;
  amountCents: number | null;
  users: number | null;
  /** ISO 8601 com o fuso de Brasília. */
  occurredAt: string;
}

export function toBillingEventView(row: BillingEventRow): BillingEventView {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    method: row.method,
    origin: row.origin,
    amountCents: row.amountCents,
    users: row.users,
    occurredAt: toBrasiliaIso(row.occurredAt) ?? row.occurredAt,
  };
}

/** Os eventos mais recentes da conta, do mais novo para o mais antigo (até `BILLING_HISTORY_LIMIT`). */
export async function listBillingEvents(db: TendersDb, accountId: number): Promise<BillingEventView[]> {
  const rows = await db
    .select({
      id: tenderBillingHistory.id,
      type: tenderBillingHistory.type,
      status: tenderBillingHistory.status,
      method: tenderBillingHistory.method,
      origin: tenderBillingHistory.origin,
      amountCents: tenderBillingHistory.amountCents,
      users: tenderBillingHistory.users,
      occurredAt: tenderBillingHistory.occurredAt,
    })
    .from(tenderBillingHistory)
    .where(eq(tenderBillingHistory.accountId, accountId))
    .orderBy(desc(tenderBillingHistory.occurredAt), desc(tenderBillingHistory.id))
    .limit(BILLING_HISTORY_LIMIT);
  return rows.map(toBillingEventView);
}
