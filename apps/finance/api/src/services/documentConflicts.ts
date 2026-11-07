// Quem já usa um CPF/CNPJ. O documento é único entre os acessos próprios
// (titular e admin — índice usuarios_documento_acesso_proprio_unique, migration
// 0059) e pode repetir em acesso de membro/colaborador, que é um login
// separado. Na mesma conta, porém, a mesma pessoa não ganha dois acessos.
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { db } from '../db/client';
import { accountMembers, accounts, users } from '../db/schema';

type QueryExecutor = Pick<typeof db, 'select'>;

/** Algum acesso próprio (titular ou admin), fora `exceptUserId`, já usa o documento. */
export async function findOwnLoginWithDocument(
  executor: QueryExecutor,
  document: string,
  exceptUserId?: number,
): Promise<boolean> {
  const conditions = [eq(users.document, document), or(isNull(users.type), ne(users.type, 'membro'))];
  if (exceptUserId !== undefined) {
    conditions.push(ne(users.id, exceptUserId));
  }

  const [found] = await executor.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
  return found !== undefined;
}

/** O documento já é do titular da conta ou de alguém com vínculo ativo nela (fora `exceptUserId`). */
export async function findAccountAccessWithDocument(
  executor: QueryExecutor,
  accountId: number,
  document: string,
  exceptUserId?: number,
): Promise<boolean> {
  const exceptUser = exceptUserId !== undefined ? [ne(users.id, exceptUserId)] : [];

  const [owner] = await executor
    .select({ id: users.id })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.id, accountId), eq(users.document, document), ...exceptUser))
    .limit(1);
  if (owner) {
    return true;
  }

  const [member] = await executor
    .select({ id: users.id })
    .from(accountMembers)
    .innerJoin(users, eq(users.id, accountMembers.userId))
    .where(and(
      eq(accountMembers.accountId, accountId),
      eq(accountMembers.status, 'ativo'),
      eq(users.document, document),
      ...exceptUser,
    ))
    .limit(1);
  return member !== undefined;
}
