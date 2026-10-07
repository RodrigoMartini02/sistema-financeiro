// Cadastro de membro/colaborador numa conta: usado pelo FINGERENCE
// (POST /api/account-members) e por Licitações (POST /api/tenders/team). O
// executor é o banco do app ou o do módulo, ou uma transação deles, para os
// testes de banco desfazerem tudo no fim.
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import {
  accountMembers, accounts, jobTitles, memberPermissions, sectors, users, type AccountNameCatalogTable,
} from '../db/schema';
import { isValidCpf, validateDocument } from '../middleware/validation';
import { RequestInputError } from '../utils/requestInput';
import { findAccountAccessWithDocument } from './documentConflicts';
import type { NewMemberInput } from './memberInput';

type MemberDb<TFullSchema extends Record<string, unknown>> = PgDatabase<NodePgQueryResultHKT, TFullSchema>;
type QueryExecutor = Pick<PgDatabase<NodePgQueryResultHKT, Record<string, unknown>>, 'select'>;

export const ALREADY_HAS_ACCESS_MESSAGE = 'Esta pessoa já tem acesso a esta conta';
const EMAIL_IN_USE_MESSAGE = 'Este e-mail já está cadastrado';

/**
 * Documento do membro, quando informado. O colaborador de empresa é pessoa:
 * só CPF. O membro de conta pessoal aceita CPF ou CNPJ, como sempre.
 * Devolve a mensagem de erro quando o documento não vale.
 */
export async function checkMemberDocument(executor: QueryExecutor, accountId: number, cleanDoc: string): Promise<string | null> {
  const [account] = await executor.select({ type: accounts.type }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (account?.type === 'empresa') {
    return isValidCpf(cleanDoc) ? null : 'Informe um CPF válido';
  }
  return validateDocument(cleanDoc) ? null : 'CPF/CNPJ inválido';
}

export interface MemberPlacement {
  sectorId?: number | null;
  jobTitleId?: number | null;
  admissionDate?: string | null;
}

async function isActiveInAccount(
  executor: QueryExecutor,
  table: AccountNameCatalogTable,
  id: number,
  accountId: number,
): Promise<boolean> {
  const [found] = await executor
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.accountId, accountId), eq(table.active, true)))
    .limit(1);
  return found !== undefined;
}

/**
 * Setor, cargo e admissão só existem em conta PJ. Setor e cargo precisam ser
 * desta conta e estar ativos — ou ser os que o colaborador já tem, porque um
 * setor desativado depois continua com quem o usa. Devolve a mensagem de
 * erro, ou null.
 */
export async function checkMemberPlacement(
  executor: QueryExecutor,
  accountId: number,
  placement: MemberPlacement,
  current?: { sectorId: number | null; jobTitleId: number | null },
): Promise<string | null> {
  const values = [placement.sectorId, placement.jobTitleId, placement.admissionDate];
  if (values.every((value) => value === undefined || value === null)) {
    return null;
  }

  const [account] = await executor.select({ type: accounts.type }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (account?.type !== 'empresa') {
    return 'Cargo, setor e admissão só existem em conta de empresa';
  }
  if (placement.sectorId != null && placement.sectorId !== current?.sectorId
    && !(await isActiveInAccount(executor, sectors, placement.sectorId, accountId))) {
    return 'Setor não encontrado nesta conta';
  }
  if (placement.jobTitleId != null && placement.jobTitleId !== current?.jobTitleId
    && !(await isActiveInAccount(executor, jobTitles, placement.jobTitleId, accountId))) {
    return 'Cargo não encontrado nesta conta';
  }
  return null;
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
 * Cria o login do membro (sempre novo) e o vínculo ativo com a conta. Toda
 * permissão do FINGERENCE nasce fechada: o titular libera pela tela de
 * permissões. `withinTransaction` grava junto o que o módulo precisar (ex.: o
 * acesso a Licitações). Cadastro inválido: RequestInputError (400).
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

  const placementError = await checkMemberPlacement(executor, accountId, input);
  if (placementError) {
    throw new RequestInputError(placementError);
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

    await transaction.insert(accountMembers).values({
      accountId,
      userId: member.id,
      status: 'ativo',
      sectorId: input.sectorId,
      jobTitleId: input.jobTitleId,
      admissionDate: input.admissionDate,
    });

    // Toda permissão nasce restritiva (false) — o gestor libera
    // explicitamente pela tela de permissões.
    await transaction.insert(memberPermissions).values({ userId: member.id });

    // Categorias sao da conta, nao do usuario: o membro usa as mesmas do
    // gestor (com a carteira compartilhada, uma copia geraria duas categorias
    // de mesmo nome no mesmo relatorio).

    if (withinTransaction) {
      await withinTransaction(transaction, member.id);
    }

    return member;
  });
}
