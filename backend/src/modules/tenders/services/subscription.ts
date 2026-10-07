import { and, count, eq } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { accountMembers } from '../../../db/schema/accountMembers';
import type { TendersDb } from '../collector/database';
import { tenderEnabledAccounts, tenderMemberAccess } from '../db/schema';
import type { TenderAccessType } from '../domains';
import {
  addDays,
  monthlyAmountCents,
  nextPaidUntil,
  PAID_PERIOD_DAYS,
  subscriptionSituation,
  TRIAL_DAYS,
  type SubscriptionSituation,
  type SubscriptionSnapshot,
} from './billing';
import { toBrasiliaIso } from './dates';

// Assinatura do módulo na conta (licitacoes.conta_habilitada, migration 0080):
// o que as telas leem, o início do teste e o que os pagamentos gravam.

type ModuleRow = typeof tenderEnabledAccounts.$inferSelect;

/** Data do banco (timestamptz lido como texto) para Date. */
export function parseDbTimestamp(value: string | null): Date | null {
  const iso = toBrasiliaIso(value);
  return iso ? new Date(iso) : null;
}

export function snapshotOf(row: ModuleRow): SubscriptionSnapshot {
  return {
    active: row.active,
    accessType: row.accessType,
    trialUntil: parseDbTimestamp(row.trialUntil),
    paidUntil: parseDbTimestamp(row.paidUntil),
    recurringId: row.recurringId,
  };
}

export async function readModuleRow(db: TendersDb, accountId: number): Promise<ModuleRow | null> {
  const [row] = await db.select().from(tenderEnabledAccounts).where(eq(tenderEnabledAccounts.accountId, accountId)).limit(1);
  return row ?? null;
}

/** Usuários que contam na cobrança: o titular e os membros ativos com acesso ao módulo. */
export async function countModuleUsers(db: TendersDb, accountId: number): Promise<number> {
  const [row] = await db
    .select({ members: count() })
    .from(tenderMemberAccess)
    .innerJoin(
      accountMembers,
      and(
        eq(accountMembers.accountId, tenderMemberAccess.accountId),
        eq(accountMembers.userId, tenderMemberAccess.userId),
        eq(accountMembers.status, 'ativo'),
      ),
    )
    .where(eq(tenderMemberAccess.accountId, accountId));
  return 1 + (row?.members ?? 0);
}

export interface SubscriptionView {
  accessType: TenderAccessType;
  situation: SubscriptionSituation;
  /** ISO 8601 com o fuso de Brasília. */
  trialUntil: string | null;
  paidUntil: string | null;
  recurring: boolean;
  usersCount: number;
  monthlyAmountCents: number;
}

export async function readSubscription(db: TendersDb, accountId: number, now: Date): Promise<SubscriptionView | null> {
  const row = await readModuleRow(db, accountId);
  if (!row) {
    return null;
  }

  const usersCount = await countModuleUsers(db, accountId);
  return {
    accessType: row.accessType,
    situation: subscriptionSituation(snapshotOf(row), now),
    trialUntil: toBrasiliaIso(row.trialUntil),
    paidUntil: toBrasiliaIso(row.paidUntil),
    recurring: row.recurringId !== null,
    usersCount,
    monthlyAmountCents: monthlyAmountCents(usersCount),
  };
}

/**
 * Começa o teste de 15 dias na conta (cadastro por Licitações ou ativação pelo
 * titular). Um teste por conta: false quando a conta já tem o módulo. Aceita a
 * transação do cadastro, que é do banco do app.
 */
export async function startTenderTrial<TFullSchema extends Record<string, unknown>>(
  executor: PgDatabase<NodePgQueryResultHKT, TFullSchema>,
  accountId: number,
  userId: number,
  now: Date,
): Promise<boolean> {
  const inserted = await executor
    .insert(tenderEnabledAccounts)
    .values({
      accountId,
      active: true,
      enabledBy: userId,
      accessType: 'assinatura',
      trialUntil: addDays(now, TRIAL_DAYS).toISOString(),
      updatedAt: now.toISOString(),
    })
    .onConflictDoNothing()
    .returning({ accountId: tenderEnabledAccounts.accountId });
  return inserted.length > 0;
}

/**
 * Pagamento avulso aprovado (Pix, cartão ou checkout): soma 30 dias a partir do
 * maior entre agora, o fim do teste e o pago até. O mesmo pagamento avisado de
 * novo é ignorado.
 */
export async function applyOneTimePayment(db: TendersDb, accountId: number, paymentId: string, now: Date): Promise<boolean> {
  return db.transaction(async (transaction) => {
    const [row] = await transaction
      .select()
      .from(tenderEnabledAccounts)
      .where(eq(tenderEnabledAccounts.accountId, accountId))
      .for('update')
      .limit(1);
    if (!row || row.lastPaymentId === paymentId) {
      return false;
    }

    const paidUntil = nextPaidUntil({
      now,
      trialUntil: parseDbTimestamp(row.trialUntil),
      paidUntil: parseDbTimestamp(row.paidUntil),
    });
    await transaction
      .update(tenderEnabledAccounts)
      .set({
        paidUntil: paidUntil.toISOString(),
        billedUsers: await countModuleUsers(transaction, accountId),
        lastPaymentId: paymentId,
        updatedAt: now.toISOString(),
      })
      .where(eq(tenderEnabledAccounts.accountId, accountId));
    return true;
  });
}

/** Cobrança aprovada da assinatura recorrente da conta: o período vale 30 dias a partir de agora. */
export async function applyRecurringCharge(
  db: TendersDb,
  accountId: number,
  recurringId: string,
  paymentId: string,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (transaction) => {
    const [row] = await transaction
      .select()
      .from(tenderEnabledAccounts)
      .where(eq(tenderEnabledAccounts.accountId, accountId))
      .for('update')
      .limit(1);
    if (!row || row.recurringId !== recurringId || row.lastPaymentId === paymentId) {
      return false;
    }

    await transaction
      .update(tenderEnabledAccounts)
      .set({
        paidUntil: addDays(now, PAID_PERIOD_DAYS).toISOString(),
        billedUsers: await countModuleUsers(transaction, accountId),
        lastPaymentId: paymentId,
        updatedAt: now.toISOString(),
      })
      .where(eq(tenderEnabledAccounts.accountId, accountId));
    return true;
  });
}

/** Assinatura recorrente criada e autorizada para a conta. */
export async function setRecurring(db: TendersDb, accountId: number, recurringId: string, billedUsers: number, now: Date): Promise<void> {
  await db
    .update(tenderEnabledAccounts)
    .set({ recurringId, billedUsers, updatedAt: now.toISOString() })
    .where(eq(tenderEnabledAccounts.accountId, accountId));
}

/**
 * Recorrente encerrado (cancelado, pausado ou cobrança recusada): a conta segue
 * até o fim do teste ou do período pago. Com `recurringId`, só se ainda for o
 * da conta (um aviso antigo não apaga uma assinatura nova).
 */
export async function clearRecurring(db: TendersDb, accountId: number, recurringId: string | null, now: Date): Promise<boolean> {
  const condition = recurringId === null
    ? eq(tenderEnabledAccounts.accountId, accountId)
    : and(eq(tenderEnabledAccounts.accountId, accountId), eq(tenderEnabledAccounts.recurringId, recurringId));
  const updated = await db
    .update(tenderEnabledAccounts)
    .set({ recurringId: null, updatedAt: now.toISOString() })
    .where(condition)
    .returning({ accountId: tenderEnabledAccounts.accountId });
  return updated.length > 0;
}

/** Usuários contados no valor atual da assinatura recorrente. */
export async function setBilledUsers(db: TendersDb, accountId: number, billedUsers: number, now: Date): Promise<void> {
  await db
    .update(tenderEnabledAccounts)
    .set({ billedUsers, updatedAt: now.toISOString() })
    .where(eq(tenderEnabledAccounts.accountId, accountId));
}
