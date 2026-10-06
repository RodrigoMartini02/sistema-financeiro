import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { accountMembers } from '../../../db/schema/accountMembers';
import { accounts } from '../../../db/schema/accounts';
import type { TendersDb } from '../collector/database';
import { tenderEnabledAccounts, tenderMemberAccess } from '../db/schema';
import type { TenderRole } from '../domains';

// Conta da requisição e as duas travas do módulo (escopo, seção 11):
// 1. a conta precisa estar habilitada pelo admin da plataforma;
// 2. o titular sempre tem acesso; o colaborador precisa de linha em acesso_membro.
// A conta nunca vem livre do app: o `accountId` enviado é só uma escolha,
// validada aqui contra as contas da pessoa.

export interface TenderAccount {
  id: number;
  name: string;
  type: 'pessoal' | 'empresa';
}

export interface TenderAccess {
  account: TenderAccount;
  userId: number;
  role: TenderRole;
  isPlatformAdmin: boolean;
  /** Contas habilitadas em que a pessoa pode usar o módulo (o titular troca entre elas). */
  availableAccounts: TenderAccount[];
}

export interface TenderRequester {
  id: number;
  type: 'membro' | 'titular' | 'admin';
}

export type TenderAccessResult =
  | { allowed: true; access: TenderAccess }
  | { allowed: false; reason: 'notFound' | 'memberWithoutAccess' };

const NOT_FOUND: TenderAccessResult = { allowed: false, reason: 'notFound' };

/** Contas ativas e habilitadas no módulo; a marcada como padrão vem primeiro, depois a mais antiga. */
async function findEnabledAccounts(db: TendersDb, condition: SQL | undefined): Promise<TenderAccount[]> {
  return db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .innerJoin(
      tenderEnabledAccounts,
      and(eq(tenderEnabledAccounts.accountId, accounts.id), eq(tenderEnabledAccounts.active, true)),
    )
    .where(and(condition, sql`coalesce(${accounts.active}, true)`))
    .orderBy(desc(accounts.isDefault), asc(accounts.id));
}

/**
 * Resolve a conta da requisição e confere as travas.
 * - Membro ativo de uma conta: usa sempre a conta do vínculo (mesma precedência
 *   do app de finanças); outro `accountId` dá "não encontrada".
 * - Titular: a conta pedida, se for dele e estiver habilitada; sem pedido, a
 *   habilitada marcada como padrão ou a mais antiga.
 */
export async function resolveTenderAccess(
  db: TendersDb,
  requester: TenderRequester,
  requestedAccountId: number | null,
): Promise<TenderAccessResult> {
  const isPlatformAdmin = requester.type === 'admin';
  const [membership] = await db
    .select({ accountId: accountMembers.accountId })
    .from(accountMembers)
    .where(and(eq(accountMembers.userId, requester.id), eq(accountMembers.status, 'ativo')))
    .limit(1);

  if (membership) {
    if (requestedAccountId !== null && requestedAccountId !== membership.accountId) {
      return NOT_FOUND;
    }
    const [account] = await findEnabledAccounts(db, eq(accounts.id, membership.accountId));
    if (!account) {
      return NOT_FOUND;
    }
    const [grant] = await db
      .select({ userId: tenderMemberAccess.userId })
      .from(tenderMemberAccess)
      .where(and(eq(tenderMemberAccess.accountId, account.id), eq(tenderMemberAccess.userId, requester.id)))
      .limit(1);
    if (!grant) {
      return { allowed: false, reason: 'memberWithoutAccess' };
    }
    return {
      allowed: true,
      access: { account, userId: requester.id, role: 'COLABORADOR', isPlatformAdmin, availableAccounts: [account] },
    };
  }

  const ownedAccounts = await findEnabledAccounts(db, eq(accounts.userId, requester.id));
  const account =
    requestedAccountId === null ? ownedAccounts[0] : ownedAccounts.find((owned) => owned.id === requestedAccountId);
  if (!account) {
    return NOT_FOUND;
  }
  return {
    allowed: true,
    access: { account, userId: requester.id, role: 'TITULAR', isPlatformAdmin, availableAccounts: ownedAccounts },
  };
}
