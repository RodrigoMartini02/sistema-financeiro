import bcrypt from 'bcryptjs';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { accountMembers, accounts, users } from '../db/identity';
import { EMAIL_IN_USE_MESSAGE, assertMemberDocument, createAccountMember } from './accountMemberCreation';
import type { MemberUpdateInput, NewMemberInput } from './memberInput';
import { RequestInputError } from '../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { tenderEnabledAccounts, tenderMemberAccess } from '../db/schema';
import type { TenderAccessType } from '../domains';
import { subscriptionSituation, type SubscriptionSituation } from './billing';
import { toBrasiliaIso } from './dates';
import { snapshotOf } from './subscription';

// Usuários do módulo (titular) e cortesia das contas (admin da plataforma).
// Colaboradores são os vínculos ativos da conta em conta_membros.

/** O colaborador como a API devolve: sem a chave da foto, que vira o link assinado (`photoUrl`) na rota. */
export interface TeamMemberView {
  userId: number;
  name: string;
  lastName: string | null;
  email: string;
  /** Só os dígitos do CPF; o titular precisa dele para editar. */
  document: string | null;
  phone: string | null;
  /** Códigos das listas padrão (domains.ts). */
  sector: string | null;
  jobTitle: string | null;
  /** AAAA-MM-DD. */
  admissionDate: string | null;
  hasAccess: boolean;
  grantedAt: string | null;
  photoUrl: string | null;
}

/** O colaborador como o serviço lê do banco: com a chave da foto no R2, que não sai da API. */
export interface TeamMemberRecord extends Omit<TeamMemberView, 'photoUrl'> {
  photoKey: string | null;
}

export function toTeamMemberView({ photoKey: _photoKey, ...record }: TeamMemberRecord, photoUrl: string | null): TeamMemberView {
  return { ...record, photoUrl };
}

const MEMBER_NOT_FOUND = 'Colaborador não encontrado nesta conta';

function teamQuery(db: TendersDb, accountId: number) {
  return db
    .select({
      userId: accountMembers.userId,
      name: users.name,
      lastName: users.lastName,
      email: users.email,
      document: users.document,
      phone: users.phone,
      sector: accountMembers.sector,
      jobTitle: accountMembers.jobTitle,
      admissionDate: accountMembers.admissionDate,
      photoKey: users.photoKey,
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

function toMemberRecord({ grantedAt, ...row }: Awaited<ReturnType<typeof teamQuery>>[number]): TeamMemberRecord {
  return { ...row, hasAccess: grantedAt !== null, grantedAt: toBrasiliaIso(grantedAt) };
}

export async function listTeam(db: TendersDb, accountId: number): Promise<TeamMemberRecord[]> {
  const rows = await teamQuery(db, accountId);
  return rows.map(toMemberRecord);
}

export async function readTeamMember(db: TendersDb, accountId: number, memberUserId: number): Promise<TeamMemberRecord> {
  const rows = await teamQuery(db, accountId);
  const member = rows.find((row) => row.userId === memberUserId);
  if (!member) {
    throw new RequestInputError(MEMBER_NOT_FOUND, 404);
  }
  return toMemberRecord(member);
}

/** O usuário precisa ser colaborador ativo da conta; de outra conta, inativo ou o próprio titular: 404. */
export async function assertTeamMember(db: TendersDb, accountId: number, memberUserId: number): Promise<void> {
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
}

/** Concede ou retira o acesso de um colaborador ativo da conta. */
export async function setTeamMemberAccess(
  db: TendersDb,
  accountId: number,
  titularId: number,
  memberUserId: number,
  hasAccess: boolean,
): Promise<TeamMemberRecord> {
  await assertTeamMember(db, accountId, memberUserId);

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
 * Usuário novo do módulo: o login (sempre novo), o vínculo com a conta, os dados de
 * trabalho e o acesso a Licitações, juntos. A identidade é só de Licitações:
 * nada é criado em Finanças.
 */
export async function createTeamMember(
  db: TendersDb,
  accountId: number,
  titularId: number,
  input: NewMemberInput,
): Promise<TeamMemberRecord> {
  const created = await createAccountMember(db, accountId, input, async (transaction, memberId) => {
    await transaction.insert(tenderMemberAccess).values({ accountId, userId: memberId, grantedBy: titularId });
  });
  return readTeamMember(db, accountId, created.id);
}

/**
 * Edita o colaborador (só o titular, que a rota confere). Campo ausente mantém o valor; e-mail e CPF não podem ser
 * de outro acesso; senha nova só quando informada. O valor da assinatura não muda: a edição não mexe no acesso.
 */
export async function updateTeamMember(
  db: TendersDb,
  accountId: number,
  memberUserId: number,
  input: MemberUpdateInput,
): Promise<TeamMemberRecord> {
  await assertTeamMember(db, accountId, memberUserId);

  if (input.email !== undefined) {
    const [emailInUse] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, input.email), ne(users.id, memberUserId)))
      .limit(1);
    if (emailInUse) {
      throw new RequestInputError(EMAIL_IN_USE_MESSAGE);
    }
  }
  if (input.document) {
    await assertMemberDocument(db, accountId, input.document, memberUserId);
  }
  const hashedPassword = input.newPassword === undefined ? undefined : await bcrypt.hash(input.newPassword, 10);

  const personChanges = {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.document === undefined ? {} : { document: input.document }),
    ...(input.phone === undefined ? {} : { phone: input.phone }),
    ...(hashedPassword === undefined ? {} : { password: hashedPassword }),
  };
  const workChanges = {
    ...(input.sector === undefined ? {} : { sector: input.sector }),
    ...(input.jobTitle === undefined ? {} : { jobTitle: input.jobTitle }),
    ...(input.admissionDate === undefined ? {} : { admissionDate: input.admissionDate }),
  };

  await db.transaction(async (transaction) => {
    if (Object.keys(personChanges).length > 0) {
      await transaction.update(users).set(personChanges).where(eq(users.id, memberUserId));
    }
    if (Object.keys(workChanges).length > 0) {
      await transaction
        .update(accountMembers)
        .set(workChanges)
        .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.userId, memberUserId)));
    }
  });
  return readTeamMember(db, accountId, memberUserId);
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
  accountType: 'empresa';
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
 * admin). Ordem: com o módulo primeiro, depois o nome da conta.
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
    .orderBy(desc(hasModule), asc(accounts.name), asc(accounts.id));

  return rows.map(({ module, ...row }) => ({
    ...row,
    courtesy: module !== null && module.active && module.accessType === 'cortesia',
    situation: module === null ? null : subscriptionSituation(snapshotOf(module), now),
    trialUntil: toBrasiliaIso(module?.trialUntil),
    paidUntil: toBrasiliaIso(module?.paidUntil),
    changedAt: toBrasiliaIso(module?.updatedAt),
  }));
}
