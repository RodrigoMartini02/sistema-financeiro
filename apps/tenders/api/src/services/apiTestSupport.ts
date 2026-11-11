import { randomUUID } from 'node:crypto';
import { accountMembers, accounts } from '../db/identity';
import type { TendersDb } from '../collector/database';
import { createTestUser } from '../collector/dbTestSupport';
import { tenderEnabledAccounts, tenderMemberAccess } from '../db/schema';

// Apoio dos testes de banco da API (*.db.test.ts), junto do dbTestSupport do
// coletor. Tudo roda dentro da transação desfeita de cada teste.

/** Palavra única para a busca achar só os editais do teste (a base local tem editais reais). */
export function uniqueToken(prefix = 'zqx'): string {
  return `${prefix}${randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

/** E-mail único para o teste de acesso (cada execução usa o seu, a base local pode ter outros). */
export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@exemplo.test`;
}

/** CNPJ com os dígitos verificadores certos, a partir de um número: o mesmo número dá sempre o mesmo CNPJ. */
export function testCnpj(seed: number): string {
  const base = `${String(seed).padStart(8, '0')}0001`;
  const checkDigit = (digits: string): number => {
    const weights = digits.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...digits].reduce((total, char, index) => total + Number(char) * weights[index]!, 0);
    return sum % 11 < 2 ? 0 : 11 - (sum % 11);
  };
  const first = checkDigit(base);
  return `${base}${first}${checkDigit(`${base}${first}`)}`;
}

/** CPF com os dígitos verificadores certos, a partir de um número: o mesmo número dá sempre o mesmo CPF (use sementes variadas). */
export function testCpf(seed: number): string {
  const base = String(seed).padStart(9, '0').slice(-9);
  const checkDigit = (digits: string): number => {
    const sum = [...digits].reduce((total, char, index) => total + Number(char) * (digits.length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder >= 10 ? 0 : remainder;
  };
  const first = checkDigit(base);
  return `${base}${first}${checkDigit(`${base}${first}`)}`;
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
