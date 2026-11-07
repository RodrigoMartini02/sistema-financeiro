// Cadastro de colaborador numa conta, usado por Licitações (POST /api/tenders/team). Cópia enxuta do
// `services/accountMemberCreation.ts` de Finanças (os dois backends são independentes): sem permissões de tela
// do FINGERENCE e sem setor, cargo e admissão. O executor é o banco do módulo ou uma transação dele, para os
// testes de banco desfazerem tudo no fim.
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { accountMembers, accounts, users } from '../db/identity';
import { isValidCpf, validateDocument } from '../middleware/validation';
import { RequestInputError } from '../utils/requestInput';
import { findAccountAccessWithDocument, type QueryExecutor } from './documentConflicts';
import type { NewMemberInput } from './memberInput';

type MemberDb<TFullSchema extends Record<string, unknown>> = PgDatabase<NodePgQueryResultHKT, TFullSchema>;

const ALREADY_HAS_ACCESS_MESSAGE = 'Esta pessoa já tem acesso a esta conta';
const EMAIL_IN_USE_MESSAGE = 'Este e-mail já está cadastrado';

/**
 * Documento do membro, quando informado. O colaborador de empresa é pessoa: só CPF. O de conta pessoal aceita CPF
 * ou CNPJ. Devolve a mensagem de erro quando o documento não vale.
 */
async function checkMemberDocument(executor: QueryExecutor, accountId: number, cleanDoc: string): Promise<string | null> {
  const [account] = await executor.select({ type: accounts.type }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (account?.type === 'empresa') {
    return isValidCpf(cleanDoc) ? null : 'Informe um CPF válido';
  }
  return validateDocument(cleanDoc) ? null : 'CPF/CNPJ inválido';
}

export interface CreatedAccountMember {
  id: number;
  name: string;
  lastName: string | null;
  email: string;
  document: string | null;
  telefone: string | null;
  dataNascimento: string | null;
  type: string | null;
  status: string | null;
}

/**
 * Cria o login do colaborador (sempre novo) e o vínculo ativo com a conta. `withinTransaction` grava junto o que o
 * módulo precisar (o acesso a Licitações). Cadastro inválido: RequestInputError (400).
 */
export async function createAccountMember<TFullSchema extends Record<string, unknown>>(
  executor: MemberDb<TFullSchema>,
  accountId: number,
  input: NewMemberInput,
  withinTransaction?: (transaction: MemberDb<TFullSchema>, memberId: number) => Promise<void>,
): Promise<CreatedAccountMember> {
  const [emailInUse] = await executor.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (emailInUse) {
    throw new RequestInputError(EMAIL_IN_USE_MESSAGE);
  }

  if (input.document) {
    const documentError = await checkMemberDocument(executor, accountId, input.document);
    if (documentError) {
      throw new RequestInputError(documentError);
    }
    if (await findAccountAccessWithDocument(executor, accountId, input.document)) {
      throw new RequestInputError(ALREADY_HAS_ACCESS_MESSAGE);
    }
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
        telefone: input.telefone,
        dataNascimento: input.dataNascimento,
        type: 'membro',
        status: 'ativo',
      })
      .returning({
        id: users.id, name: users.name, lastName: users.lastName, email: users.email, document: users.document,
        telefone: users.telefone, dataNascimento: users.dataNascimento, type: users.type, status: users.status,
      });

    if (!member) {
      throw new Error('Member insert returned no row');
    }

    await transaction.insert(accountMembers).values({ accountId, userId: member.id, status: 'ativo' });

    if (withinTransaction) {
      await withinTransaction(transaction, member.id);
    }

    return member;
  });
}
