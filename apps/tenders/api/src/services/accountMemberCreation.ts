// Cadastro de colaborador numa conta, usado por Licitações (POST /api/tenders/team). Cópia enxuta do
// `services/accountMemberCreation.ts` de Finanças (os dois backends são independentes): sem permissões de tela
// do FINGERENCE. Em Licitações toda conta é de empresa (CNPJ), então a regra "só PJ" é imposta aqui no código, além
// do CHECK do banco: o colaborador é pessoa (só CPF) e leva os dados de trabalho (setor, cargo e admissão). O executor
// é o banco do módulo ou uma transação dele, para os testes de banco desfazerem tudo no fim.
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { accountMembers, accounts, users } from '../db/identity';
import { isValidCpf } from '../middleware/validation';
import { RequestInputError } from '../utils/requestInput';
import { findAccountAccessWithDocument, type QueryExecutor } from './documentConflicts';
import type { NewMemberInput } from './memberInput';

type MemberDb<TFullSchema extends Record<string, unknown>> = PgDatabase<NodePgQueryResultHKT, TFullSchema>;

export const ALREADY_HAS_ACCESS_MESSAGE = 'Esta pessoa já tem acesso a esta conta';
export const EMAIL_IN_USE_MESSAGE = 'Este e-mail já está cadastrado';
export const INVALID_CPF_MESSAGE = 'Informe um CPF válido';
const COMPANY_ONLY_MESSAGE = 'Licitações aceita somente conta de empresa (CNPJ)';

/** A conta precisa existir e ser de empresa; o app só chega aqui com a conta já resolvida pela trava do módulo. */
async function assertCompanyAccount(executor: QueryExecutor, accountId: number): Promise<void> {
  const [account] = await executor.select({ type: accounts.type }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (account?.type !== 'empresa') {
    throw new RequestInputError(COMPANY_ONLY_MESSAGE);
  }
}

/**
 * Confere o CPF do colaborador: valido, e sem outro acesso ativo da conta com o mesmo documento. Na edição,
 * `ignoredUserId` é o próprio colaborador.
 */
export async function assertMemberDocument(
  executor: QueryExecutor,
  accountId: number,
  document: string,
  ignoredUserId?: number,
): Promise<void> {
  if (!isValidCpf(document)) {
    throw new RequestInputError(INVALID_CPF_MESSAGE);
  }
  if (await findAccountAccessWithDocument(executor, accountId, document, ignoredUserId)) {
    throw new RequestInputError(ALREADY_HAS_ACCESS_MESSAGE);
  }
}

export interface CreatedAccountMember {
  id: number;
  name: string;
  lastName: string | null;
  email: string;
  document: string | null;
  phone: string | null;
  type: string | null;
  status: string | null;
}

/**
 * Cria o login do colaborador (sempre novo) e o vínculo ativo com a conta, já com os dados de trabalho.
 * `withinTransaction` grava junto o que o módulo precisar (o acesso a Licitações). Cadastro inválido:
 * RequestInputError (400).
 */
export async function createAccountMember<TFullSchema extends Record<string, unknown>>(
  executor: MemberDb<TFullSchema>,
  accountId: number,
  input: NewMemberInput,
  withinTransaction?: (transaction: MemberDb<TFullSchema>, memberId: number) => Promise<void>,
): Promise<CreatedAccountMember> {
  await assertCompanyAccount(executor, accountId);

  const [emailInUse] = await executor.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (emailInUse) {
    throw new RequestInputError(EMAIL_IN_USE_MESSAGE);
  }

  if (input.document) {
    await assertMemberDocument(executor, accountId, input.document);
  }

  const hashedPassword = await bcrypt.hash(input.password, 10);

  return executor.transaction(async (transaction) => {
    const [member] = await transaction
      .insert(users)
      .values({
        name: input.name,
        lastName: input.lastName,
        email: input.email,
        document: input.document,
        password: hashedPassword,
        phone: input.phone,
        type: 'membro',
        status: 'ativo',
      })
      .returning({
        id: users.id, name: users.name, lastName: users.lastName, email: users.email, document: users.document,
        phone: users.phone, type: users.type, status: users.status,
      });

    if (!member) {
      throw new Error('Member insert returned no row');
    }

    await transaction.insert(accountMembers).values({
      accountId,
      userId: member.id,
      status: 'ativo',
      sector: input.sector,
      jobTitle: input.jobTitle,
      admissionDate: input.admissionDate,
    });

    if (withinTransaction) {
      await withinTransaction(transaction, member.id);
    }

    return member;
  });
}
