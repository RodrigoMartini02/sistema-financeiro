// Quem já usa um CPF/CNPJ numa conta. Cópia enxuta do `services/documentConflicts.ts` de Finanças (os dois
// backends são independentes). Na mesma conta, a mesma pessoa não ganha dois acessos.
import { and, eq, ne } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { accountMembers, accounts, users } from '../db/identity';

/** O banco do módulo, ou uma transação dele: só a leitura. */
export type QueryExecutor = Pick<PgDatabase<NodePgQueryResultHKT, Record<string, unknown>>, 'select'>;

/**
 * Algum acesso próprio (titular ou admin) já usa o documento. O documento é único entre os acessos próprios
 * (índice usuarios_documento_acesso_proprio_unique) e pode repetir em acesso de colaborador, que é um login
 * separado criado pelo titular.
 */
export async function findOwnLoginWithDocument(executor: QueryExecutor, document: string): Promise<boolean> {
  const [found] = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.document, document), ne(users.type, 'membro')))
    .limit(1);
  return found !== undefined;
}

/**
 * O documento já é do titular da conta ou de alguém com vínculo ativo nela. Na edição, `ignoredUserId` é o usuário
 * editado: o documento que ele já tem não conta como conflito.
 */
export async function findAccountAccessWithDocument(
  executor: QueryExecutor,
  accountId: number,
  document: string,
  ignoredUserId?: number,
): Promise<boolean> {
  const [owner] = await executor
    .select({ id: users.id })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(
      eq(accounts.id, accountId),
      eq(users.document, document),
      ignoredUserId === undefined ? undefined : ne(users.id, ignoredUserId),
    ))
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
      ignoredUserId === undefined ? undefined : ne(users.id, ignoredUserId),
    ))
    .limit(1);
  return member !== undefined;
}
