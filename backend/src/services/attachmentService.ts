// Anexos de despesas, receitas, contratos e produtos (plano .plans/unificar-anexos-no-r2.md): os
// metadados ficam na tabela `anexos` e o arquivo no R2. O arquivo vai para o R2 antes de a linha ser
// gravada: se o banco falhar, o arquivo é apagado; na ordem inversa, uma falha deixaria uma linha
// apontando para um arquivo que não existe. Na exclusão é o contrário: a linha sai primeiro e o
// arquivo depois, para nunca sobrar uma linha sem arquivo.
import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, inArray, isNull, lt, max, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { attachments, expenses, incomes, type Attachment, type NewAttachment } from '../db/schema';
import type { ObjectStorage } from '../modules/tenders/objectStorage';
import { RequestInputError } from '../utils/requestInput';
import { prepareAttachment, type AttachmentUpload } from './attachmentFile';
import {
  diffAttachmentIds, toAttachmentView, type AttachmentOwner, type AttachmentOwnerSet, type AttachmentView,
} from './attachmentModel';
import { MAX_PENDING_ATTACHMENTS_PER_USER, PENDING_ATTACHMENT_TTL_MS, type AttachmentOwnerType } from './attachmentRules';
import { putAttachmentObject, removeStoredObjects } from './attachmentStorage';
import { isUuid } from './catalogo';

/** O `db` ou a transação dele, para os passos que o chamador quer dentro da mesma transação. */
export type AttachmentExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export const ATTACHMENT_NOT_AVAILABLE_MESSAGE = 'Anexo inválido ou já utilizado';
export const TOO_MANY_PENDING_ATTACHMENTS_MESSAGE =
  'Há muitos anexos aguardando o lançamento ser salvo. Salve o lançamento ou tente de novo mais tarde';

const SWEEP_BATCH_SIZE = 200;

type OwnerColumns = Pick<NewAttachment, 'expenseId' | 'incomeId' | 'contractId' | 'productId'>;

/** Sem dono: o envio ainda espera o lançamento ser salvo. */
const HAS_NO_OWNER = and(
  isNull(attachments.expenseId),
  isNull(attachments.incomeId),
  isNull(attachments.contractId),
  isNull(attachments.productId),
) as SQL;

function ownerColumns(owner: AttachmentOwner | undefined): OwnerColumns {
  switch (owner?.type) {
    case 'expense':
      return { expenseId: owner.id };
    case 'income':
      return { incomeId: owner.id };
    case 'contract':
      return { contractId: owner.id };
    case 'product':
      return { productId: owner.id };
    default:
      return {};
  }
}

function ownerCondition(owner: AttachmentOwner): SQL {
  switch (owner.type) {
    case 'expense':
      return eq(attachments.expenseId, owner.id);
    case 'income':
      return eq(attachments.incomeId, owner.id);
    case 'contract':
      return eq(attachments.contractId, owner.id);
    case 'product':
      return eq(attachments.productId, owner.id);
  }
}

function ownersCondition(owners: AttachmentOwnerSet): SQL {
  switch (owners.type) {
    case 'expense':
      return inArray(attachments.expenseId, [...owners.ids]);
    case 'income':
      return inArray(attachments.incomeId, [...owners.ids]);
    case 'contract':
      return inArray(attachments.contractId, [...owners.ids]);
    case 'product':
      return inArray(attachments.productId, [...owners.ids]);
  }
}

function ownerIdOfRow(attachment: Attachment, type: AttachmentOwnerType): number | string | null {
  switch (type) {
    case 'expense':
      return attachment.expenseId;
    case 'income':
      return attachment.incomeId;
    case 'contract':
      return attachment.contractId;
    case 'product':
      return attachment.productId;
  }
}

/** Cada pessoa tem um teto de envios pendentes: sem ele, um cliente com defeito encheria o R2 em 24 horas. */
async function assertCanHoldAnotherPendingAttachment(userId: number): Promise<void> {
  const [pending] = await db
    .select({ total: count() })
    .from(attachments)
    .where(and(eq(attachments.uploadedBy, userId), HAS_NO_OWNER));
  if ((pending?.total ?? 0) >= MAX_PENDING_ATTACHMENTS_PER_USER) {
    throw new RequestInputError(TOO_MANY_PENDING_ATTACHMENTS_MESSAGE, 429);
  }
}

async function nextProductPosition(productId: string): Promise<number> {
  const [last] = await db
    .select({ position: max(attachments.position) })
    .from(attachments)
    .where(eq(attachments.productId, productId));
  return last?.position === null || last?.position === undefined ? 0 : last.position + 1;
}

export interface SaveAttachmentInput {
  /** Quem enviou: só ele enxerga e reivindica um envio pendente. */
  uploadedBy: number;
  ownerType: AttachmentOwnerType;
  /**
   * Contrato e produto já existem no envio, e o anexo nasce vinculado a eles. Despesa e receita ficam
   * pendentes (sem dono) até o lançamento ser salvo e reivindicar o anexo.
   */
  owner?: AttachmentOwner;
  file: AttachmentUpload;
}

/** Confere o arquivo pelas regras do tipo de dono, guarda no R2 e grava a linha. */
export async function saveAttachment(storage: ObjectStorage, input: SaveAttachmentInput): Promise<AttachmentView> {
  if (input.owner && input.owner.type !== input.ownerType) {
    throw new Error('The attachment owner does not match the owner type');
  }
  if (!input.owner) {
    await assertCanHoldAnotherPendingAttachment(input.uploadedBy);
  }
  const prepared = await prepareAttachment(input.ownerType, input.file);
  const id = randomUUID();
  const storageKey = await putAttachmentObject(storage, id, prepared);
  try {
    const position = input.owner?.type === 'product' ? await nextProductPosition(input.owner.id) : 0;
    const [row] = await db
      .insert(attachments)
      .values({
        id,
        uploadedBy: input.uploadedBy,
        ownerType: input.ownerType,
        ...ownerColumns(input.owner),
        originalName: prepared.originalName,
        contentType: prepared.contentType,
        size: prepared.content.length,
        storageKey,
        position,
      })
      .returning();
    return toAttachmentView(row!);
  } catch (error) {
    await removeStoredObjects(storage, [storageKey]);
    throw error;
  }
}

export interface LinkAttachmentsInput {
  /** Quem está salvando o lançamento: só reivindica o que ele mesmo enviou. */
  requesterId: number;
  owner: AttachmentOwner;
  attachmentIds: readonly string[];
}

/**
 * Vincula ao dono os envios pendentes que o pedido reivindica. Cada id precisa ser um envio pendente
 * do próprio solicitante, para o mesmo tipo de dono; qualquer outro recusa o pedido inteiro (a
 * transação do chamador desfaz o resto).
 */
export async function linkPendingAttachments(executor: AttachmentExecutor, input: LinkAttachmentsInput): Promise<void> {
  if (input.attachmentIds.length === 0) {
    return;
  }
  const linked = await executor
    .update(attachments)
    .set(ownerColumns(input.owner))
    .where(
      and(
        inArray(attachments.id, [...input.attachmentIds]),
        eq(attachments.uploadedBy, input.requesterId),
        eq(attachments.ownerType, input.owner.type),
        HAS_NO_OWNER,
      ),
    )
    .returning({ id: attachments.id });
  if (linked.length !== input.attachmentIds.length) {
    throw new RequestInputError(ATTACHMENT_NOT_AVAILABLE_MESSAGE);
  }
}

/**
 * Deixa o dono com exatamente os anexos de `attachmentIds`: desvincula e apaga os que saíram da lista
 * e vincula os pendentes que entraram. Devolve as chaves dos arquivos apagados, para o chamador
 * removê-los do R2 (removeStoredObjects) depois de a transação confirmar.
 */
export async function replaceOwnerAttachments(executor: AttachmentExecutor, input: LinkAttachmentsInput): Promise<string[]> {
  const current = await executor
    .select({ id: attachments.id })
    .from(attachments)
    .where(ownerCondition(input.owner));
  const { toLink, toRemove } = diffAttachmentIds(
    current.map((row) => row.id),
    input.attachmentIds,
  );
  let removedKeys: string[] = [];
  if (toRemove.length > 0) {
    const removed = await executor
      .delete(attachments)
      .where(and(ownerCondition(input.owner), inArray(attachments.id, toRemove)))
      .returning({ storageKey: attachments.storageKey });
    removedKeys = removed.map((row) => row.storageKey);
  }
  await linkPendingAttachments(executor, { ...input, attachmentIds: toLink });
  return removedKeys;
}

/** Anexos de vários donos do mesmo tipo numa consulta só, agrupados pelo id do dono e na ordem de exibição. */
export async function listAttachmentsByOwners(
  owners: AttachmentOwnerSet,
  executor: AttachmentExecutor = db,
): Promise<Map<number | string, AttachmentView[]>> {
  const byOwner = new Map<number | string, AttachmentView[]>();
  if (owners.ids.length === 0) {
    return byOwner;
  }
  const rows = await executor
    .select()
    .from(attachments)
    .where(ownersCondition(owners))
    .orderBy(asc(attachments.position), asc(attachments.createdAt), asc(attachments.id));
  for (const row of rows) {
    const ownerId = ownerIdOfRow(row, owners.type);
    if (ownerId === null) {
      continue;
    }
    const list = byOwner.get(ownerId) ?? [];
    list.push(toAttachmentView(row));
    byOwner.set(ownerId, list);
  }
  return byOwner;
}

/**
 * Chaves dos arquivos dos donos, para apagá-los do R2 quando os donos forem excluídos. As linhas saem
 * sozinhas com o dono (exclusão em cascata no banco), mas o arquivo no R2 não: quem exclui o dono
 * chama isto antes, e removeStoredObjects depois de a exclusão confirmar.
 */
export async function collectAttachmentKeys(owners: AttachmentOwnerSet, executor: AttachmentExecutor = db): Promise<string[]> {
  if (owners.ids.length === 0) {
    return [];
  }
  const rows = await executor.select({ storageKey: attachments.storageKey }).from(attachments).where(ownersCondition(owners));
  return rows.map((row) => row.storageKey);
}

/**
 * Acrescenta `attachments` (só os metadados, nunca o arquivo) a cada linha de uma lista de despesas ou receitas, numa
 * consulta só para a lista inteira. Linhas lidas com `SELECT d.*` podem trazer a coluna antiga `anexos` (o
 * base64 de antes da migração): ela sai da resposta.
 */
export async function withEntryAttachments<Row extends { id: number }>(
  type: 'expense' | 'income',
  rows: readonly Row[],
): Promise<Array<Omit<Row, 'anexos'> & { attachments: AttachmentView[] }>> {
  const byEntry = await listAttachmentsByOwners({ type, ids: rows.map((row) => row.id) });
  return rows.map((row) => {
    const { anexos: _legacyAttachments, ...rest } = row as Row & { anexos?: unknown };
    return { ...rest, attachments: byEntry.get(row.id) ?? [] } as Omit<Row, 'anexos'> & { attachments: AttachmentView[] };
  });
}

/** Chaves dos anexos de todas as despesas e receitas de uma pessoa: o reset dos dados financeiros apaga as linhas. */
export async function collectUserEntryAttachmentKeys(userId: number, executor: AttachmentExecutor = db): Promise<string[]> {
  const ofExpenses = await executor
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .innerJoin(expenses, eq(expenses.id, attachments.expenseId))
    .where(eq(expenses.userId, userId));
  const ofIncomes = await executor
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .innerJoin(incomes, eq(incomes.id, attachments.incomeId))
    .where(eq(incomes.userId, userId));
  return [...ofExpenses, ...ofIncomes].map((row) => row.storageKey);
}

/**
 * Chaves dos anexos que "Excluir o ano" apaga: despesas e receitas do ano que não vieram de uma fixa (as da fixa
 * ficam canceladas, com a competência ocupada, e os anexos delas continuam).
 */
export async function collectYearEntryAttachmentKeys(userId: number, year: number, executor: AttachmentExecutor = db): Promise<string[]> {
  const ofExpenses = await executor
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .innerJoin(expenses, eq(expenses.id, attachments.expenseId))
    .where(and(eq(expenses.userId, userId), eq(expenses.year, year), isNull(expenses.fixedExpenseId)));
  const ofIncomes = await executor
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .innerJoin(incomes, eq(incomes.id, attachments.incomeId))
    .where(and(eq(incomes.userId, userId), eq(incomes.year, year), isNull(incomes.fixedClassificationId)));
  return [...ofExpenses, ...ofIncomes].map((row) => row.storageKey);
}

export async function findAttachment(attachmentId: string): Promise<Attachment | null> {
  if (!isUuid(attachmentId)) {
    return null;
  }
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId)).limit(1);
  return attachment ?? null;
}

/** Apaga a linha do anexo e devolve a chave do arquivo, para removê-lo do R2 em seguida. */
export async function deleteAttachmentRow(executor: AttachmentExecutor, attachmentId: string): Promise<string | null> {
  const [removed] = await executor
    .delete(attachments)
    .where(eq(attachments.id, attachmentId))
    .returning({ storageKey: attachments.storageKey });
  return removed?.storageKey ?? null;
}

export interface SweepResult {
  /** Envios pendentes apagados (linha e arquivo). */
  removed: number;
  /** Arquivos que o R2 não conseguiu apagar: a linha já saiu, o arquivo sobra até a conferência de órfãos. */
  failedObjects: number;
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
// Quando a última varredura saiu, nesta instância do servidor: uma por hora no máximo.
let lastSweepAt = 0;

/**
 * Depois de um envio, varre os pendentes vencidos — no máximo uma vez por hora, sem atrasar a resposta
 * e sem derrubar o envio se a varredura falhar (o erro fica no log; a próxima hora tenta de novo).
 */
export function sweepPendingAttachmentsIfDue(storage: ObjectStorage, now = Date.now()): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) {
    return;
  }
  lastSweepAt = now;
  sweepPendingAttachments(storage)
    .then((result) => {
      if (result.removed > 0 || result.failedObjects > 0) {
        console.log('Pending attachments swept:', result);
      }
    })
    .catch((error: unknown) => {
      console.error('Pending attachments sweep error:', error);
    });
}

/**
 * Apaga os envios pendentes que ninguém reivindicou em 24 horas (a pessoa abandonou o lançamento).
 * Em lotes, do mais antigo para o mais novo. A linha sai primeiro, só enquanto continua sem dono, para
 * não apagar o arquivo de um anexo que acabou de ser vinculado.
 */
export async function sweepPendingAttachments(storage: ObjectStorage, now = new Date()): Promise<SweepResult> {
  const cutoff = new Date(now.getTime() - PENDING_ATTACHMENT_TTL_MS);
  const stale = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(HAS_NO_OWNER, lt(attachments.createdAt, cutoff)))
    .orderBy(asc(attachments.createdAt))
    .limit(SWEEP_BATCH_SIZE);
  if (stale.length === 0) {
    return { removed: 0, failedObjects: 0 };
  }
  const removed = await db
    .delete(attachments)
    .where(and(inArray(attachments.id, stale.map((row) => row.id)), HAS_NO_OWNER))
    .returning({ storageKey: attachments.storageKey });
  const failedObjects = await removeStoredObjects(storage, removed.map((row) => row.storageKey));
  return { removed: removed.length, failedObjects };
}
