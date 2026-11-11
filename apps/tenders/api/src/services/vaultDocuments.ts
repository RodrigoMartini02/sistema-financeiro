import { and, asc, count, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { brasiliaDate } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import { tenderDocuments, tenderPeople } from '../db/schema';
import { findDocumentType, type DocumentStatus, type DocumentTypeId, type TenderRole } from '../domains';
import type { ObjectStorage } from '../objectStorage';
import { RequestInputError } from '../utils/requestInput';
import { toBrasiliaIso } from './dates';
import { documentRecencyOrder } from './documentRecency';
import type { DocumentUpload } from './documentUpload';
import { documentStatusOn } from './documentStatus';
import { assertDocumentFields, type DocumentChanges, type DocumentFields, type NewDocumentInput } from './vaultInput';
import { removeDocumentFiles, requireDocumentStorage, signDocumentFileLink, storeDocumentFile } from './vaultFiles';

// Documentos do cofre (item 5, migration 0006): da empresa ou de uma pessoa, com emissão, validade e o arquivo no R2.
// Quem acessa (decisão do plano): os documentos da empresa são de todos com acesso ao módulo; os de pessoa (RG, CNH,
// procuração...) são dado pessoal de terceiros e só o titular os vê (para o colaborador, é como se não existissem: 404).
// Toda leitura e escrita filtra a conta da sessão. A situação (válido, vencendo, vencido) sai da validade e do dia de hoje.

/** Documentos por conta. */
export const MAX_DOCUMENTS_PER_ACCOUNT = 300;

const NOT_FOUND_MESSAGE = 'Documento não encontrado';
const PERSON_NOT_FOUND_MESSAGE = 'Pessoa não encontrada';
const TITULAR_ONLY_MESSAGE = 'Só o titular da conta pode guardar documentos de pessoas.';

/** Quem pede: a conta e a pessoa vêm da sessão (trava do módulo), nunca do pedido. */
export interface VaultActor {
  accountId: number;
  userId: number;
  role: TenderRole;
}

/** O que o cofre usa: o Postgres, o R2 dos arquivos (nulo sem as variáveis `R2_*`) e o relógio. */
export interface VaultDeps {
  db: TendersDb;
  storage: ObjectStorage | null;
  now: () => Date;
}

export interface DocumentView {
  id: number;
  type: DocumentTypeId;
  /** A pessoa do documento; nulo nos documentos da empresa. */
  personId: number | null;
  description: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  fileName: string;
  /** Tipo do arquivo (application/pdf, image/jpeg ou image/png). */
  fileType: string;
  /** Tamanho do arquivo, em bytes. */
  fileSize: number;
  /** Válido, vencendo (até 30 dias) ou vencido, no dia de hoje (Brasília). */
  status: DocumentStatus;
  /** Dias até vencer: 0 no próprio dia, negativo depois; nulo sem validade. */
  daysToExpire: number | null;
  /**
   * O documento vigente do tipo (e da pessoa): nos tipos em que o novo substitui o anterior, só o mais recente é vigente e
   * os outros são histórico; nos demais, todos são vigentes. O resumo e os avisos contam só os vigentes.
   */
  current: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DocumentList {
  items: DocumentView[];
  /** O limite por conta, para a tela mostrar "N de 300". */
  limit: number;
  /** Há R2 configurado: sem ele, o envio e a abertura de arquivos ficam indisponíveis (a tela avisa e desabilita). */
  storageAvailable: boolean;
}

/** As colunas que a API usa; a chave do arquivo no R2 fica de fora, porque nunca sai. */
const viewColumns = {
  id: tenderDocuments.id,
  type: tenderDocuments.type,
  personId: tenderDocuments.personId,
  description: tenderDocuments.description,
  issuedOn: tenderDocuments.issuedOn,
  validUntil: tenderDocuments.validUntil,
  fileName: tenderDocuments.fileName,
  fileType: tenderDocuments.fileType,
  fileSize: tenderDocuments.fileSize,
  createdAt: tenderDocuments.createdAt,
  updatedAt: tenderDocuments.updatedAt,
};

type DocumentViewRow = Pick<
  typeof tenderDocuments.$inferSelect,
  'id' | 'type' | 'personId' | 'description' | 'issuedOn' | 'validUntil' | 'fileName' | 'fileType' | 'fileSize' | 'createdAt' | 'updatedAt'
>;

/** O colaborador só vê os documentos da empresa; o titular vê todos. */
function visibleTo(actor: VaultActor): SQL | undefined {
  const ofAccount = eq(tenderDocuments.accountId, actor.accountId);
  return actor.role === 'TITULAR' ? ofAccount : and(ofAccount, isNull(tenderDocuments.personId));
}

function toView(row: DocumentViewRow, current: boolean, today: string): DocumentView {
  const standing = documentStatusOn(row.validUntil, today);
  return {
    id: row.id,
    type: row.type,
    personId: row.personId,
    description: row.description,
    issuedOn: row.issuedOn,
    validUntil: row.validUntil,
    fileName: row.fileName,
    fileType: row.fileType,
    fileSize: row.fileSize,
    status: standing.status,
    daysToExpire: standing.daysToExpire,
    current,
    createdAt: toBrasiliaIso(row.createdAt),
    updatedAt: toBrasiliaIso(row.updatedAt),
  };
}

/** Os documentos que a pessoa pode ver, agrupados por tipo e pessoa, o mais recente de cada grupo primeiro. */
export async function listDocuments(deps: VaultDeps, actor: VaultActor): Promise<DocumentList> {
  const today = brasiliaDate(deps.now());
  const rows = await deps.db
    .select(viewColumns)
    .from(tenderDocuments)
    .where(visibleTo(actor))
    .orderBy(asc(tenderDocuments.type), asc(tenderDocuments.personId), ...documentRecencyOrder);

  const seenGroups = new Set<string>();
  const items = rows.map((row) => {
    const group = `${row.type}:${row.personId ?? ''}`;
    // Nos tipos em que o novo substitui o anterior, só o primeiro do grupo (o mais recente) é o vigente.
    const current = findDocumentType(row.type)?.latestOnly !== true || !seenGroups.has(group);
    seenGroups.add(group);
    return toView(row, current, today);
  });
  return { items, limit: MAX_DOCUMENTS_PER_ACCOUNT, storageAvailable: deps.storage !== null };
}

/** O documento da conta que a pessoa pode ver, com a chave do arquivo; outro caso (outra conta, de pessoa para colaborador): 404. */
async function findVisibleDocument(db: TendersDb, actor: VaultActor, documentId: number) {
  const [row] = await db
    .select({ ...viewColumns, fileKey: tenderDocuments.fileKey })
    .from(tenderDocuments)
    .where(and(visibleTo(actor), eq(tenderDocuments.id, documentId)))
    .limit(1);
  if (!row) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  return row;
}

async function readDocumentView(deps: VaultDeps, actor: VaultActor, documentId: number): Promise<DocumentView> {
  const view = (await listDocuments(deps, actor)).items.find((item) => item.id === documentId);
  if (!view) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  return view;
}

async function assertPersonInAccount(db: TendersDb, accountId: number, personId: number): Promise<void> {
  const [person] = await db
    .select({ id: tenderPeople.id })
    .from(tenderPeople)
    .where(and(eq(tenderPeople.accountId, accountId), eq(tenderPeople.id, personId)))
    .limit(1);
  if (!person) {
    throw new RequestInputError(PERSON_NOT_FOUND_MESSAGE, 404);
  }
}

/**
 * Guarda um documento: confere o tipo, a pessoa (da conta; só o titular guarda documento de pessoa) e o limite, grava o
 * arquivo no R2 e só então a linha; se a linha falhar, o objeto novo é desfeito. Sem R2 configurado, 503.
 */
export async function createDocument(deps: VaultDeps, actor: VaultActor, input: NewDocumentInput, upload: DocumentUpload): Promise<DocumentView> {
  if (input.type.owner === 'PESSOA') {
    if (actor.role !== 'TITULAR') {
      throw new RequestInputError(TITULAR_ONLY_MESSAGE, 403);
    }
    if (input.personId === null) {
      throw new RequestInputError(PERSON_NOT_FOUND_MESSAGE, 404);
    }
    await assertPersonInAccount(deps.db, actor.accountId, input.personId);
  }
  const [existing] = await deps.db.select({ total: count() }).from(tenderDocuments).where(eq(tenderDocuments.accountId, actor.accountId));
  if ((existing?.total ?? 0) >= MAX_DOCUMENTS_PER_ACCOUNT) {
    throw new RequestInputError(`Esta conta já tem ${MAX_DOCUMENTS_PER_ACCOUNT} documentos. Apague algum para guardar outro.`);
  }

  const storage = requireDocumentStorage(deps.storage);
  const fileKey = await storeDocumentFile(storage, actor.accountId, upload);
  let documentId: number;
  try {
    const [row] = await deps.db
      .insert(tenderDocuments)
      .values({
        accountId: actor.accountId,
        type: input.type.id,
        personId: input.personId,
        description: input.description,
        issuedOn: input.issuedOn,
        validUntil: input.validUntil,
        fileKey,
        fileName: upload.fileName,
        fileType: upload.contentType,
        fileSize: upload.bytes.byteLength,
        createdBy: actor.userId,
      })
      .returning({ id: tenderDocuments.id });
    if (!row) {
      throw new Error('Documento não gravado');
    }
    documentId = row.id;
  } catch (error) {
    await removeDocumentFiles(storage, [fileKey]);
    throw error;
  }
  // Fora do try: com a linha já gravada, o arquivo não pode ser apagado se só a leitura da resposta falhar.
  return readDocumentView(deps, actor, documentId);
}

/**
 * Altera a descrição e as datas e, se vier, troca o arquivo (o objeto novo é gravado antes, e o antigo só sai depois de a
 * linha apontar para o novo). O tipo e a pessoa não mudam. As regras do tipo valem sobre o que ficaria gravado.
 */
export async function updateDocument(
  deps: VaultDeps,
  actor: VaultActor,
  documentId: number,
  changes: DocumentChanges,
  upload: DocumentUpload | null,
): Promise<DocumentView> {
  const current = await findVisibleDocument(deps.db, actor, documentId);
  const merged: DocumentFields = {
    description: changes.description !== undefined ? changes.description : current.description,
    issuedOn: changes.issuedOn !== undefined ? changes.issuedOn : current.issuedOn,
    validUntil: changes.validUntil !== undefined ? changes.validUntil : current.validUntil,
  };
  const type = findDocumentType(current.type);
  if (type) {
    assertDocumentFields(type, merged);
  }

  // Arquivo novo: o objeto vai para o R2 antes da linha (sem R2, 503 e nada muda).
  const storage = upload ? requireDocumentStorage(deps.storage) : null;
  const replacement = upload && storage ? { storage, upload, key: await storeDocumentFile(storage, actor.accountId, upload) } : null;
  try {
    await deps.db
      .update(tenderDocuments)
      .set({
        ...merged,
        ...(replacement
          ? {
              fileKey: replacement.key,
              fileName: replacement.upload.fileName,
              fileType: replacement.upload.contentType,
              fileSize: replacement.upload.bytes.byteLength,
            }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(tenderDocuments.accountId, actor.accountId), eq(tenderDocuments.id, documentId)));
  } catch (error) {
    if (replacement) {
      await removeDocumentFiles(replacement.storage, [replacement.key]);
    }
    throw error;
  }
  if (replacement) {
    // A linha já aponta para o objeto novo: o antigo é lixo.
    await removeDocumentFiles(replacement.storage, [current.fileKey]);
  }
  return readDocumentView(deps, actor, documentId);
}

/** Apaga o documento (e os avisos dele, por cascata) e, depois, o arquivo no R2. */
export async function deleteDocument(deps: VaultDeps, actor: VaultActor, documentId: number): Promise<void> {
  const current = await findVisibleDocument(deps.db, actor, documentId);
  await deps.db.delete(tenderDocuments).where(and(eq(tenderDocuments.accountId, actor.accountId), eq(tenderDocuments.id, documentId)));
  await removeDocumentFiles(deps.storage, [current.fileKey]);
}

export interface DocumentLink {
  url: string;
  expiresInSeconds: number;
  fileName: string;
}

/** O link de abertura do arquivo, de vida curta, direto do R2; a chave não sai. Sem R2, 503. */
export async function documentLink(deps: VaultDeps, actor: VaultActor, documentId: number): Promise<DocumentLink> {
  const current = await findVisibleDocument(deps.db, actor, documentId);
  const link = await signDocumentFileLink(requireDocumentStorage(deps.storage), current.fileKey);
  return { ...link, fileName: current.fileName };
}
