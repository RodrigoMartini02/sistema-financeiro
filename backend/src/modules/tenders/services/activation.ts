import { and, asc, desc, eq, notExists, sql } from 'drizzle-orm';
import { accountMembers } from '../../../db/schema/accountMembers';
import { accounts } from '../../../db/schema/accounts';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { tenderEnabledAccounts } from '../db/schema';
import type { TenderAccount, TenderRequester } from './access';
import { startTenderTrial } from './subscription';

// Ativação do módulo pelo titular de uma conta (15 dias grátis): quem já usa o
// FINGERENCE começa Licitações sem depender do admin. Um teste por conta.

const ACCOUNT_NOT_FOUND = 'Conta não encontrada';
const TITULAR_ONLY = 'Só o titular da conta pode ativar Licitações.';
const TRIAL_ALREADY_USED = 'O teste de Licitações já foi usado nesta conta. Assine para continuar.';

/** Membro ou colaborador ativo de alguma conta: não ativa nem assina (o plano é do titular). */
export async function isAccountMember(db: TendersDb, userId: number): Promise<boolean> {
  const [membership] = await db
    .select({ accountId: accountMembers.accountId })
    .from(accountMembers)
    .where(and(eq(accountMembers.userId, userId), eq(accountMembers.status, 'ativo')))
    .limit(1);
  return membership !== undefined;
}

/** Contas ativas do titular que ainda não têm o módulo: a padrão primeiro, depois a mais antiga. Membro: nenhuma. */
export async function listActivatableAccounts(db: TendersDb, requester: TenderRequester): Promise<TenderAccount[]> {
  if (requester.type === 'membro' || (await isAccountMember(db, requester.id))) {
    return [];
  }

  return db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .where(and(
      eq(accounts.userId, requester.id),
      sql`coalesce(${accounts.active}, true)`,
      notExists(
        db.select({ accountId: tenderEnabledAccounts.accountId })
          .from(tenderEnabledAccounts)
          .where(eq(tenderEnabledAccounts.accountId, accounts.id)),
      ),
    ))
    .orderBy(desc(accounts.isDefault), asc(accounts.id));
}

/** Começa o teste na conta escolhida pelo titular. */
export async function activateModule(
  db: TendersDb,
  requester: TenderRequester,
  accountId: number,
  now: Date,
): Promise<TenderAccount> {
  if (requester.type === 'membro' || (await isAccountMember(db, requester.id))) {
    throw new RequestInputError(TITULAR_ONLY, 403);
  }

  const [account] = await db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, requester.id), sql`coalesce(${accounts.active}, true)`))
    .limit(1);
  if (!account) {
    throw new RequestInputError(ACCOUNT_NOT_FOUND, 404);
  }

  if (!(await startTenderTrial(db, account.id, requester.id, now))) {
    throw new RequestInputError(TRIAL_ALREADY_USED, 409);
  }
  return account;
}
