import { and, asc, eq, sql } from 'drizzle-orm';
import { accountMembers } from '../../../db/schema/accountMembers';
import { accounts } from '../../../db/schema/accounts';
import { users } from '../../../db/schema/users';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { tenderEnabledAccounts, tenderMemberAccess } from '../db/schema';
import { toBrasiliaIso } from './dates';

// Acesso da equipe ao módulo (titular) e habilitação de conta (admin da
// plataforma). Colaboradores são os vínculos ativos da conta em conta_membros.

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

  const rows = await teamQuery(db, accountId);
  const updated = rows.find((row) => row.userId === memberUserId);
  if (!updated) {
    throw new RequestInputError(MEMBER_NOT_FOUND, 404);
  }
  return toMemberView(updated);
}

export interface EnabledAccountView {
  accountId: number;
  accountName: string;
  active: boolean;
  changedAt: string | null;
}

/** Habilita ou desabilita o módulo numa conta (admin da plataforma). Conta inexistente: 404. */
export async function setAccountEnabled(
  db: TendersDb,
  adminId: number,
  accountId: number,
  active: boolean,
): Promise<EnabledAccountView> {
  const [account] = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) {
    throw new RequestInputError('Conta não encontrada', 404);
  }
  const [saved] = await db
    .insert(tenderEnabledAccounts)
    .values({ accountId, active, enabledBy: adminId })
    .onConflictDoUpdate({
      target: tenderEnabledAccounts.accountId,
      set: { active, enabledBy: adminId, enabledAt: sql`now()` },
    })
    .returning();
  return {
    accountId: account.id,
    accountName: account.name,
    active: saved?.active ?? active,
    changedAt: toBrasiliaIso(saved?.enabledAt),
  };
}
