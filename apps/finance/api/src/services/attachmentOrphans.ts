// Confere a pasta `anexos/` do R2 com a tabela `anexos`. A exclusão em cascata no banco não avisa o R2, e uma falha ao
// apagar o arquivo só fica no log: esta conferência é a rede de segurança que acha o que sobrou
// (scripts/attachments.ts, comando `orphans`).
import { asc } from 'drizzle-orm';
import { db } from '../db/client';
import { attachments } from '../db/schema';
import type { ObjectStorage } from './objectStorage';
import type { AttachmentExecutor } from './attachmentService';
import { attachmentStorageKey } from './attachmentStorage';

export interface AttachmentOrphanReport {
  /** Arquivos em `anexos/` no R2 para os quais nenhuma linha aponta. */
  objectsWithoutRow: string[];
  /** Linhas cujo arquivo não está no R2. */
  rowsWithoutObject: Array<{ id: string; key: string }>;
}

/**
 * Compara a pasta `anexos/` do R2 com a tabela `anexos`. Um envio em andamento aparece por instantes como arquivo sem
 * linha (o arquivo vai primeiro): quem apaga confere duas vezes, com uma pausa entre elas.
 */
export async function findAttachmentOrphans(storage: ObjectStorage, executor: AttachmentExecutor = db): Promise<AttachmentOrphanReport> {
  const keys = await storage.listKeys(attachmentStorageKey(''));
  const rows = await executor
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
  const rowKeys = new Set(rows.map((row) => row.storageKey));
  const objectKeys = new Set(keys);
  return {
    objectsWithoutRow: keys.filter((key) => !rowKeys.has(key)),
    rowsWithoutObject: rows.filter((row) => !objectKeys.has(row.storageKey)).map((row) => ({ id: row.id, key: row.storageKey })),
  };
}
