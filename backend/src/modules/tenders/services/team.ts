import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { accountMembers } from '../../../db/schema/accountMembers';
import { accounts } from '../../../db/schema/accounts';
import { users } from '../../../db/schema/users';
import { createAccountMember } from '../../../services/accountMemberCreation';
import type { NewMemberInput } from '../../../services/memberInput';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { tenderEnabledAccounts, tenderMemberAccess } from '../db/schema';
import type { TenderAccessType } from '../domains';
import { subscriptionSituation, type SubscriptionSituation } from './billing';
import { toBrasiliaIso } from './dates';
import { snapshotOf } from './subscription';

// Usuários do módulo (titular) e cortesia das contas (admin da plataforma).
// Colaboradores são os vínculos ativos da conta em conta_membros.

export interface TeamMemberView {
  userId: number;
  name: string;
  email: string;
  hasAccess: boolean;
  grantedAt: string | null;
}

const MEMBER_NOT_FOUND = 'Colaborador não encontrado nesta conta';

function teamQuery(db: TendersDb, accountId: number) {
  return db
    .select({
      userId: accountMembers.userId,
      name: users.name,
      email: users.email,
      grantedAt: tenderMemberAccess.grantedAt,
    })
    .from(accountMembers)
    .innerJoin(users, eq(users.id, accountMembers.userId))
    .leftJoin(
      tenderMemberAccess,
      and(eq(tenderMemberAccess.accountId, accountMembers.accountId), eq(tenderMemberAccess.userId, accountMembers.userId)),
    )
    .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.status, 'ativo')))
    .orderBy(asc(users.name), asc(accountMembers.userId));
}

function toMemberView(row: { userId: number; name: string; email: string; grantedAt: string | null }): TeamMemberView {
  return { ...row, hasAccess: row.grantedAt !== null, grantedAt: toBrasiliaIso(row.grantedAt) };
}

export async function listTeam(db: TendersDb, accountId: number): Promise<TeamMemberView[]> {
  const rows = await teamQuery(db, accountId);
  return rows.map(toMemberView);
}

async function readTeamMember(db: TendersDb, accountId: number, memberUserId: number): Promise<TeamMemberView> {
  const rows = await teamQuery(db, accountId);
  const member = rows.find((row) => row.userId === memberUserId);
  if (!member) {
    throw new RequestInputError(MEMBER_NOT_FOUND, 404);
  }
  return toMemberView(member);
}

/** Concede ou retira o acesso de um colaborador ativo da conta. */
export async function setTeamMemberAccess(
  db: TendersDb,
  accountId: number,
  titularId: number,
  memberUserId: number,
  hasAccess: boolean,
): Promise<TeamMemberView> {
  const [member] = await db
    .select({ userId: accountMembers.userId })
    .from(accountMembers)
    .where(
      and(eq(accountMembers.accountId, accountId), eq(accountMembers.userId, memberUserId), eq(accountMembers.status, 'ativo')),
    )
    .limit(1);
  if (!member) {
    throw new RequestInputError(MEMBER_NOT_FOUND, 404);
  }

  if (hasAccess) {
    await db
      .insert(tenderMemberAccess)
      .values({ accountId, userId: memberUserId, grantedBy: titularId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(tenderMemberAccess)
      .where(and(eq(tenderMemberAccess.accountId, accountId), eq(tenderMemberAccess.userId, memberUserId)));
  }

  return readTeamMember(db, accountId, memberUserId);
}

/**
 * Usuário novo do módulo: o login (sempre novo), o vínculo com a conta e o
 * acesso a Licitações, juntos. No FINGERENCE ele nasce sem nenhuma tela
 * liberada (createAccountMember).
 */
export async function createTeamMember(
  db: TendersDb,
  accountId: number,
  titularId: number,
  input: NewMemberInput,
): Promise<TeamMemberView> {
  const created = await createAccountMember(db, accountId, input, async (transaction, memberId) => {
    await transaction.insert(tenderMemberAccess).values({ accountId, userId: memberId, grantedBy: titularId });
  });
  return readTeamMember(db, accountId, created.id);
}

export interface CourtesyChangeView {
  accountId: number;
  accountName: string;
  courtesy: boolean;
  changedAt: string | null;
}

/**
 * Cortesia do módulo numa conta (admin da plataforma). Ligada: a conta usa sem
 * cobrança e sem limite de usuários. Desligada: a conta segue pela assinatura
 * (teste, período pago ou recorrente; sem nada disso, fica vencida). Conta
 * inexistente: 404.
 */
export async function setAccountCourtesy(
  db: TendersDb,
  adminId: number,
  accountId: number,
  courtesy: boolean,
  now: Date,
): Promise<CourtesyChangeView> {
  const [account] = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) {
    throw new RequestInputError('Conta não encontrada', 404);
  }

  const accessType: TenderAccessType = courtesy ? 'cortesia' : 'assinatura';
  const [saved] = await db
    .insert(tenderEnabledAccounts)
    .values({ accountId, active: true, enabledBy: adminId, accessType, updatedAt: now.toISOString() })
    .onConflictDoUpdate({
      target: tenderEnabledAccounts.accountId,
      set: { active: true, enabledBy: adminId, accessType, updatedAt: now.toISOString() },
    })
    .returning();
  return {
    accountId: account.id,
    accountName: account.name,
    courtesy: saved?.accessType === 'cortesia',
    changedAt: toBrasiliaIso(saved?.updatedAt),
  };
}

export interface TenderAccountAdminView {
  accountId: number;
  accountName: string;
  accountType: 'pessoal' | 'empresa';
  ownerName: string;
  ownerEmail: string;
  /** Cortesia ligada (conta sem linha em conta_habilitada, ou desligada: false). */
  courtesy: boolean;
  /** Situação no módulo; nula para conta que nunca teve o módulo. */
  situation: SubscriptionSituation | null;
  trialUntil: string | null;
  paidUntil: string | null;
  /** Última mudança no módulo; nula se a conta nunca teve o módulo. */
  changedAt: string | null;
}

/**
 * Contas ativas da plataforma e a situação de cada uma no módulo (tela do
 * admin). Ordem: com o módulo primeiro, depois PJ, depois o nome da conta.
 */
export async function listAccountsForTenders(db: TendersDb, now: Date): Promise<TenderAccountAdminView[]> {
  const hasModule = sql<boolean>`coalesce(${tenderEnabledAccounts.active}, false)`;
  const rows = await db
    .select({
      accountId: accounts.id,
      accountName: accounts.name,
      accountType: accounts.type,
      ownerName: users.name,
      ownerEmail: users.email,
      module: tenderEnabledAccounts,
    })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .leftJoin(tenderEnabledAccounts, eq(tenderEnabledAccounts.accountId, accounts.id))
    .where(sql`coalesce(${accounts.active}, true)`)
    .orderBy(desc(hasModule), desc(eq(accounts.type, 'empresa')), asc(accounts.name), asc(accounts.id));

  return rows.map(({ module, ...row }) => ({
    ...row,
    courtesy: module !== null && module.active && module.accessType === 'cortesia',
    situation: module === null ? null : subscriptionSituation(snapshotOf(module), now),
    trialUntil: toBrasiliaIso(module?.trialUntil),
    paidUntil: toBrasiliaIso(module?.paidUntil),
    changedAt: toBrasiliaIso(module?.updatedAt),
  }));
}
