import { randomUUID } from 'node:crypto';
import { accountMembers } from '../../../db/schema/accountMembers';
import { accounts } from '../../../db/schema/accounts';
import type { TendersDb } from '../collector/database';
import { createTestUser } from '../collector/dbTestSupport';
import { tenderEnabledAccounts, tenderMemberAccess } from '../db/schema';

// Apoio dos testes de banco da API (*.db.test.ts), junto do dbTestSupport do
// coletor. Tudo roda dentro da transação desfeita de cada teste.

/** Palavra única para a busca achar só os editais do teste (a base local tem editais reais). */
export function uniqueToken(prefix = 'zqx'): string {
  return `${prefix}${randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

export interface TestAccount {
  accountId: number;
  ownerId: number;
}

export function requesterOf(account: TestAccount): { accountId: number; userId: number } {
  return { accountId: account.accountId, userId: account.ownerId };
}

/** Colaborador ativo da conta; `access` concede o acesso ao módulo (acesso_membro). */
export async function addAccountMember(
  tx: TendersDb,
  account: TestAccount,
  label: string,
  options: { access: boolean; status?: 'ativo' | 'inativo' },
): Promise<number> {
  const userId = await createTestUser(tx, label);
  await tx.insert(accountMembers).values({ accountId: account.accountId, userId, status: options.status ?? 'ativo' });
  if (options.access) {
    await tx.insert(tenderMemberAccess).values({ accountId: account.accountId, userId, grantedBy: account.ownerId });
  }
  return userId;
}

/** Outra conta do mesmo titular (ex.: pessoal e empresa), habilitada ou não. */
export async function addOwnedAccount(
  tx: TendersDb,
  ownerId: number,
  options: { enabled: boolean; isDefault?: boolean; name?: string },
): Promise<number> {
  const [account] = await tx
    .insert(accounts)
    .values({ userId: ownerId, name: options.name ?? 'Outra conta', type: 'empresa', isDefault: options.isDefault ?? false })
    .returning({ id: accounts.id });
  if (!account) {
    throw new Error('conta de teste não criada');
  }
  if (options.enabled) {
    await tx.insert(tenderEnabledAccounts).values({ accountId: account.id, active: true });
  }
  return account.id;
}
