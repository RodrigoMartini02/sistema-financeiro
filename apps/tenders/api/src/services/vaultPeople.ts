import { and, asc, count, eq, isNotNull, sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { tenderDocuments, tenderPeople } from '../db/schema';
import type { PersonRole } from '../domains';
import type { ObjectStorage } from '../objectStorage';
import { isUniqueViolation } from '../utils/dbErrors';
import { RequestInputError } from '../utils/requestInput';
import { toBrasiliaIso } from './dates';
import type { PersonChanges, PersonInput } from './vaultInput';
import { removeDocumentFiles } from './vaultFiles';

// Pessoas ligadas à empresa (item 5, migration 0006): sócios, representantes, procuradores e responsáveis técnicos, com o
// CPF (único na conta) e os papéis. É dado pessoal de terceiros: só o titular da conta lê e altera (as rotas conferem; aqui
// toda leitura e escrita filtra a conta, que vem da sessão e nunca do pedido).

/** Pessoas por conta. */
export const MAX_PEOPLE_PER_ACCOUNT = 50;

const NOT_FOUND_MESSAGE = 'Pessoa não encontrada';
const DUPLICATE_CPF_MESSAGE = 'Já existe uma pessoa com este CPF nesta conta';
const SAVE_FAILED_MESSAGE = 'Não foi possível salvar a pessoa agora.';

export interface PersonView {
  id: number;
  name: string;
  /** Só os 11 dígitos; a tela põe a máscara. */
  cpf: string;
  roles: PersonRole[];
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  /** Quantos documentos a pessoa tem no cofre (a tela avisa antes de apagar). */
  documentCount: number;
  createdAt: string | null;
}

export interface PersonList {
  items: PersonView[];
  /** O limite por conta, para a tela mostrar "N de 50". */
  limit: number;
}

type PersonRow = typeof tenderPeople.$inferSelect;

function toView(row: PersonRow, documentCount: number): PersonView {
  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf,
    roles: row.roles,
    jobTitle: row.jobTitle,
    email: row.email,
    phone: row.phone,
    documentCount,
    createdAt: toBrasiliaIso(row.createdAt),
  };
}

function ownPerson(accountId: number, personId: number) {
  return and(eq(tenderPeople.accountId, accountId), eq(tenderPeople.id, personId));
}

async function findOwnPerson(db: TendersDb, accountId: number, personId: number): Promise<PersonRow> {
  const [row] = await db.select().from(tenderPeople).where(ownPerson(accountId, personId)).limit(1);
  if (!row) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  return row;
}

async function assertCpfFree(db: TendersDb, accountId: number, cpf: string, exceptPersonId: number | null): Promise<void> {
  const [existing] = await db
    .select({ id: tenderPeople.id })
    .from(tenderPeople)
    .where(and(eq(tenderPeople.accountId, accountId), eq(tenderPeople.cpf, cpf)))
    .limit(1);
  if (existing && existing.id !== exceptPersonId) {
    throw new RequestInputError(DUPLICATE_CPF_MESSAGE);
  }
}

/**
 * Roda uma escrita de pessoa sem deixar o CPF ir para o log. O erro do Drizzle traz a consulta com os valores (nome e CPF de
 * terceiros), e a rota registra os erros inesperados: aqui o erro de pedido segue como está, o CPF repetido (corrida entre dois
 * pedidos) vira a mensagem de sempre e qualquer outra falha é registrada só com o código do Postgres e o nome da restrição.
 */
async function writingPerson<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RequestInputError) {
      throw error;
    }
    if (isUniqueViolation(error)) {
      throw new RequestInputError(DUPLICATE_CPF_MESSAGE);
    }
    const cause = (error as { cause?: { code?: string; constraint?: string } } | null)?.cause;
    console.error(`Vault person ${operation} failed:`, { code: cause?.code, constraint: cause?.constraint });
    throw new RequestInputError(SAVE_FAILED_MESSAGE, 500);
  }
}

/** Os documentos de cada pessoa da conta, numa consulta só. */
async function countDocumentsByPerson(db: TendersDb, accountId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ personId: tenderDocuments.personId, total: count() })
    .from(tenderDocuments)
    .where(and(eq(tenderDocuments.accountId, accountId), isNotNull(tenderDocuments.personId)))
    .groupBy(tenderDocuments.personId);
  return new Map(rows.flatMap((row) => (row.personId === null ? [] : [[row.personId, row.total] as const])));
}

/** As pessoas da conta, em ordem alfabética. */
export async function listPeople(db: TendersDb, accountId: number): Promise<PersonList> {
  const [rows, documentCounts] = await Promise.all([
    db.select().from(tenderPeople).where(eq(tenderPeople.accountId, accountId)).orderBy(asc(tenderPeople.name), asc(tenderPeople.id)),
    countDocumentsByPerson(db, accountId),
  ]);
  return { items: rows.map((row) => toView(row, documentCounts.get(row.id) ?? 0)), limit: MAX_PEOPLE_PER_ACCOUNT };
}

/** Cadastra a pessoa na conta (o limite é de 50 e o CPF é único na conta). */
export function createPerson(
  db: TendersDb,
  actor: { accountId: number; userId: number },
  input: PersonInput,
): Promise<PersonView> {
  return writingPerson('create', async () => {
    const [existing] = await db.select({ total: count() }).from(tenderPeople).where(eq(tenderPeople.accountId, actor.accountId));
    if ((existing?.total ?? 0) >= MAX_PEOPLE_PER_ACCOUNT) {
      throw new RequestInputError(`Esta conta já tem ${MAX_PEOPLE_PER_ACCOUNT} pessoas cadastradas. Apague alguma para cadastrar outra.`);
    }
    await assertCpfFree(db, actor.accountId, input.cpf, null);
    const [row] = await db
      .insert(tenderPeople)
      .values({ accountId: actor.accountId, createdBy: actor.userId, ...input })
      .returning();
    if (!row) {
      throw new Error('Pessoa não gravada');
    }
    return toView(row, 0);
  });
}

/** Altera os campos que vieram; o CPF novo não pode ser de outra pessoa da conta. Pessoa de outra conta: não encontrada. */
export function updatePerson(db: TendersDb, accountId: number, personId: number, changes: PersonChanges): Promise<PersonView> {
  return writingPerson('update', async () => {
    const current = await findOwnPerson(db, accountId, personId);
    if (changes.cpf !== undefined && changes.cpf !== current.cpf) {
      await assertCpfFree(db, accountId, changes.cpf, personId);
    }
    const [row] = await db
      .update(tenderPeople)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(ownPerson(accountId, personId))
      .returning();
    if (!row) {
      throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
    }
    const documentCounts = await countDocumentsByPerson(db, accountId);
    return toView(row, documentCounts.get(row.id) ?? 0);
  });
}

/**
 * Apaga a pessoa e, junto, os documentos dela (a chave composta cuida da cascata) e os avisos desses documentos. Os arquivos
 * saem do R2 só depois: as chaves são colhidas antes de apagar as linhas (AGENT.md, "Arquivos Persistentes").
 */
export async function deletePerson(
  deps: { db: TendersDb; storage: ObjectStorage | null },
  accountId: number,
  personId: number,
): Promise<{ removedDocuments: number }> {
  await findOwnPerson(deps.db, accountId, personId);
  const files = await deps.db
    .select({ fileKey: tenderDocuments.fileKey })
    .from(tenderDocuments)
    .where(and(eq(tenderDocuments.accountId, accountId), eq(tenderDocuments.personId, personId)));
  await deps.db.delete(tenderPeople).where(ownPerson(accountId, personId));
  await removeDocumentFiles(
    deps.storage,
    files.map((file) => file.fileKey),
  );
  return { removedDocuments: files.length };
}
