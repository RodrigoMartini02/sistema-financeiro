// A cópia dos anexos antigos de despesas e receitas (coluna jsonb `anexos`, com o arquivo em base64) para a tabela
// `anexos` e o R2 (plano .plans/unificar-anexos-no-r2.md, etapa C). O banco e o R2 chegam por parâmetro: o script
// scripts/attachments.ts passa os reais, e o teste, os do schema temporário e o simulado na memória.
//
//   migrateLegacyEntries   copia (ou, sem `apply`, só mede). Antes de copiar, guarda o JSON original no R2 (backup).
//   verifyLegacyEntries    confere, item a item, a linha, o dono, o tamanho e o conteúdo guardado no R2.
//   findAttachmentOrphans  arquivos do R2 sem linha no banco e linhas sem arquivo.
//
// A coluna antiga não é tocada: quem a apaga é a migration 0095, que só roda depois de tudo conferido.
import { gzipSync } from 'node:zlib';
import type { Pool } from 'pg';
import type { ObjectStorage } from '../modules/tenders/objectStorage';
import { prepareLegacyAttachment, type LegacyAttachmentCopy, type LegacyAttachmentResult, type LegacyEntryType } from './attachmentLegacy';
import { attachmentStorageKey, putAttachmentObject, removeStoredObjects } from './attachmentStorage';

/** Só o `query` do pool do banco: o script passa o pool real, o teste, o do schema temporário. */
export type LegacyDatabase = Pick<Pool, 'query'>;

/** Pasta (dentro da pasta do ambiente no R2) do backup do JSON original; fora de `anexos/`, que é só de arquivos. */
export const LEGACY_BACKUP_PREFIX = 'backups/anexos-jsonb/';

export const LEGACY_ENTRY_TYPES: readonly LegacyEntryType[] = ['expense', 'income'];

const ENTRY_SOURCES: Record<LegacyEntryType, { table: string; ownerColumn: string }> = {
  expense: { table: 'despesas', ownerColumn: 'despesa_id' },
  income: { table: 'receitas', ownerColumn: 'receita_id' },
};

// Linhas lidas por vez: cada uma pode ter vários MB de base64.
const ENTRY_PAGE_SIZE = 5;
const FOREIGN_KEY_VIOLATION = '23503';

export interface LegacyEntry {
  type: LegacyEntryType;
  id: number;
  userId: number | null;
  createdAt: Date | null;
  items: unknown[];
}

export interface LegacyItemIssue {
  type: LegacyEntryType;
  entryId: number;
  position: number;
  name: string | null;
  reason: string;
}

interface EntryRow {
  id: number;
  usuario_id: number | null;
  data_criacao: string | Date | null;
  anexos: unknown;
}

function toDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function userFilter(userIds: readonly number[] | undefined, params: unknown[]): string {
  if (userIds === undefined) return '';
  params.push([...userIds]);
  return ` AND usuario_id = ANY($${params.length}::int[])`;
}

/** Ids dos lançamentos que ainda têm alguma coisa na lista antiga. */
async function listEntryIds(db: LegacyDatabase, type: LegacyEntryType, userIds: readonly number[] | undefined): Promise<number[]> {
  const params: unknown[] = [];
  const { rows } = await db.query<{ id: number }>(
    `SELECT id FROM ${ENTRY_SOURCES[type].table}
      WHERE anexos IS NOT NULL AND jsonb_typeof(anexos) = 'array' AND jsonb_array_length(anexos) > 0${userFilter(userIds, params)}
      ORDER BY id`,
    params,
  );
  return rows.map((row) => row.id);
}

async function readEntries(db: LegacyDatabase, type: LegacyEntryType, ids: readonly number[]): Promise<LegacyEntry[]> {
  const { rows } = await db.query<EntryRow>(
    `SELECT id, usuario_id, data_criacao, anexos FROM ${ENTRY_SOURCES[type].table} WHERE id = ANY($1::int[]) ORDER BY id`,
    [[...ids]],
  );
  return rows.map((row) => ({
    type,
    id: row.id,
    userId: row.usuario_id,
    createdAt: toDate(row.data_criacao),
    items: Array.isArray(row.anexos) ? row.anexos : [],
  }));
}

/** Linhas cujo `anexos` não é uma lista (nunca escrito pelo sistema): a cópia não as entende, e o relatório avisa. */
async function countNotAList(db: LegacyDatabase, userIds: readonly number[] | undefined): Promise<number> {
  let total = 0;
  for (const type of LEGACY_ENTRY_TYPES) {
    const params: unknown[] = [];
    const { rows } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM ${ENTRY_SOURCES[type].table}
        WHERE anexos IS NOT NULL AND jsonb_typeof(anexos) NOT IN ('array', 'null')${userFilter(userIds, params)}`,
      params,
    );
    total += Number(rows[0]?.total ?? 0);
  }
  return total;
}

async function forEachEntryPage(
  db: LegacyDatabase,
  userIds: readonly number[] | undefined,
  handler: (entries: LegacyEntry[]) => Promise<void>,
): Promise<void> {
  for (const type of LEGACY_ENTRY_TYPES) {
    const ids = await listEntryIds(db, type, userIds);
    for (let start = 0; start < ids.length; start += ENTRY_PAGE_SIZE) {
      await handler(await readEntries(db, type, ids.slice(start, start + ENTRY_PAGE_SIZE)));
    }
  }
}

interface PreparedItem {
  entry: LegacyEntry;
  position: number;
  name: string | null;
  result: LegacyAttachmentResult;
}

function itemName(item: unknown): string | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
  const name = (item as Record<string, unknown>)['nome'];
  return typeof name === 'string' ? name : null;
}

async function prepareEntries(entries: readonly LegacyEntry[]): Promise<PreparedItem[]> {
  const prepared: PreparedItem[] = [];
  for (const entry of entries) {
    for (const [index, item] of entry.items.entries()) {
      const position = index + 1;
      const result = await prepareLegacyAttachment(entry.type, entry.id, position, item, entry.createdAt);
      prepared.push({ entry, position, name: itemName(item), result });
    }
  }
  return prepared;
}

function issueOf(item: PreparedItem, reason: string): LegacyItemIssue {
  return { type: item.entry.type, entryId: item.entry.id, position: item.position, name: item.name, reason };
}

function copyIdsOf(prepared: readonly PreparedItem[]): string[] {
  return prepared.flatMap((item) => (item.result.ok ? [item.result.copy.id] : []));
}

async function findExistingAttachmentIds(db: LegacyDatabase, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await db.query<{ id: string }>('SELECT id FROM anexos WHERE id = ANY($1::uuid[])', [[...ids]]);
  return new Set(rows.map((row) => row.id));
}

export interface LegacyMigrationOptions {
  db: LegacyDatabase;
  storage: ObjectStorage;
  /** false: só mede e confere o que seria copiado, sem gravar nada (nem no R2, nem no banco). */
  apply: boolean;
  /** Só os lançamentos dessas pessoas. */
  userIds?: readonly number[];
  /** Nome da pasta do backup desta rodada; o padrão é o instante atual. */
  runStamp?: string;
}

export interface LegacyMigrationReport {
  /** Lançamentos com alguma coisa na lista antiga. */
  entries: number;
  items: number;
  /** Bytes dos itens que dá para copiar. */
  bytes: number;
  largestBytes: number;
  contentTypes: Record<string, number>;
  /** Itens que já tinham sido copiados em outra rodada. */
  alreadyCopied: number;
  /** Itens gravados nesta rodada (ou, sem `apply`, que seriam gravados). */
  copied: number;
  /** Lançamentos excluídos no meio da cópia: o item não tem mais onde ficar. */
  entriesGone: number;
  /** Itens copiados só para baixar: o conteúdo não passa na conferência de tipo de hoje. */
  unchecked: LegacyItemIssue[];
  /** Itens que não dá para copiar (sem nome, sem conteúdo, conteúdo que não é base64). Ficam só no backup. */
  invalid: LegacyItemIssue[];
  notAList: number;
  /** Chaves dos arquivos de backup gravados nesta rodada. */
  backupParts: string[];
}

/** Grava o JSON original dos lançamentos no R2, antes de qualquer cópia deles. Devolve a chave do arquivo. */
async function backupEntries(storage: ObjectStorage, runStamp: string, entries: readonly LegacyEntry[]): Promise<string> {
  const first = entries[0]!;
  const key = `${LEGACY_BACKUP_PREFIX}${runStamp}/${first.type}-${first.id}.jsonl.gz`;
  const lines = entries.map((entry) => JSON.stringify({ tipo: entry.type, id: entry.id, usuarioId: entry.userId, anexos: entry.items }));
  await storage.putObject(key, gzipSync(`${lines.join('\n')}\n`), 'application/gzip');
  return key;
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION;
}

/**
 * Grava o arquivo no R2 e a linha no banco. O arquivo vai primeiro: se o banco falhar, ele é apagado. Rodar de novo é
 * seguro (mesmo id, mesmo conteúdo). Devolve false quando o lançamento deixou de existir no meio da cópia.
 */
async function copyItem(db: LegacyDatabase, storage: ObjectStorage, entry: LegacyEntry, copy: LegacyAttachmentCopy): Promise<boolean> {
  const key = await putAttachmentObject(storage, copy.id, copy);
  try {
    await db.query(
      `INSERT INTO anexos (id, usuario_id, tipo_dono, ${ENTRY_SOURCES[entry.type].ownerColumn}, nome_original, tipo_conteudo, tamanho, chave, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING`,
      [copy.id, entry.userId, entry.type, entry.id, copy.originalName, copy.contentType, copy.content.length, key, copy.createdAt],
    );
    return true;
  } catch (error) {
    await removeStoredObjects(storage, [key]);
    if (isForeignKeyViolation(error)) return false;
    throw error;
  }
}

/** Copia os anexos da lista antiga para a tabela `anexos` e o R2. Nunca descarta um item em silêncio: o que não dá para copiar volta no relatório. */
export async function migrateLegacyEntries(options: LegacyMigrationOptions): Promise<LegacyMigrationReport> {
  const { db, storage, apply } = options;
  const runStamp = options.runStamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const report: LegacyMigrationReport = {
    entries: 0, items: 0, bytes: 0, largestBytes: 0, contentTypes: {}, alreadyCopied: 0, copied: 0, entriesGone: 0,
    unchecked: [], invalid: [], notAList: await countNotAList(db, options.userIds), backupParts: [],
  };

  await forEachEntryPage(db, options.userIds, async (entries) => {
    const prepared = await prepareEntries(entries);
    const existing = await findExistingAttachmentIds(db, copyIdsOf(prepared));
    const pending: Array<{ entry: LegacyEntry; copy: LegacyAttachmentCopy }> = [];
    // Entram no backup os lançamentos com item por copiar e os com item que não dá para copiar (este só existe no JSON).
    const backedUp = new Set<LegacyEntry>();

    report.entries += entries.length;
    for (const item of prepared) {
      report.items += 1;
      if (!item.result.ok) {
        report.invalid.push(issueOf(item, item.result.reason));
        backedUp.add(item.entry);
        continue;
      }
      const { copy } = item.result;
      report.bytes += copy.content.length;
      report.largestBytes = Math.max(report.largestBytes, copy.content.length);
      report.contentTypes[copy.contentType] = (report.contentTypes[copy.contentType] ?? 0) + 1;
      if (copy.unchecked) {
        report.unchecked.push(issueOf(item, 'o conteúdo não bate com o tipo aceito hoje; copiado só para baixar'));
      }
      if (existing.has(copy.id)) {
        report.alreadyCopied += 1;
      } else {
        pending.push({ entry: item.entry, copy });
        backedUp.add(item.entry);
      }
    }

    if (!apply) {
      report.copied += pending.length;
      return;
    }
    if (backedUp.size > 0) {
      report.backupParts.push(await backupEntries(storage, runStamp, [...backedUp]));
    }
    for (const { entry, copy } of pending) {
      if (await copyItem(db, storage, entry, copy)) {
        report.copied += 1;
      } else {
        report.entriesGone += 1;
      }
    }
  });
  return report;
}

export interface LegacyVerifyOptions {
  db: LegacyDatabase;
  storage: ObjectStorage;
  userIds?: readonly number[];
}

export interface LegacyVerifyReport {
  entries: number;
  items: number;
  /** Itens com linha, dono, tamanho e conteúdo no R2 iguais aos do original. */
  verified: number;
  /** Itens que deviam estar copiados e não estão certos: bloqueiam a migration 0095. */
  problems: LegacyItemIssue[];
  /** Itens que não dá para copiar: depois da 0095, só existem no backup. */
  notCopyable: LegacyItemIssue[];
  /** Arquivos de backup do JSON original que existem no R2 (de todas as rodadas). */
  backupParts: number;
}

interface CopiedRow {
  id: string;
  tipo_dono: string;
  despesa_id: number | null;
  receita_id: number | null;
  tamanho: number;
  chave: string;
}

async function readCopiedRows(db: LegacyDatabase, ids: readonly string[]): Promise<Map<string, CopiedRow>> {
  if (ids.length === 0) return new Map();
  const { rows } = await db.query<CopiedRow>(
    'SELECT id, tipo_dono, despesa_id, receita_id, tamanho, chave FROM anexos WHERE id = ANY($1::uuid[])',
    [[...ids]],
  );
  return new Map(rows.map((row) => [row.id, row]));
}

/** Confere cada item da lista antiga contra o que foi copiado: a linha, o dono, o tamanho e o conteúdo no R2. */
export async function verifyLegacyEntries(options: LegacyVerifyOptions): Promise<LegacyVerifyReport> {
  const { db, storage } = options;
  const report: LegacyVerifyReport = { entries: 0, items: 0, verified: 0, problems: [], notCopyable: [], backupParts: 0 };

  await forEachEntryPage(db, options.userIds, async (entries) => {
    const prepared = await prepareEntries(entries);
    const rows = await readCopiedRows(db, copyIdsOf(prepared));
    report.entries += entries.length;
    for (const item of prepared) {
      report.items += 1;
      if (!item.result.ok) {
        report.notCopyable.push(issueOf(item, item.result.reason));
        continue;
      }
      const { copy } = item.result;
      const row = rows.get(copy.id);
      if (!row) {
        report.problems.push(issueOf(item, 'sem linha na tabela anexos'));
        continue;
      }
      const ownerId = item.entry.type === 'expense' ? row.despesa_id : row.receita_id;
      const matches = row.tipo_dono === item.entry.type && ownerId === item.entry.id
        && row.tamanho === copy.content.length && row.chave === attachmentStorageKey(copy.id);
      if (!matches) {
        report.problems.push(issueOf(item, 'a linha em anexos não bate com o original (dono, tipo, tamanho ou chave)'));
        continue;
      }
      const stored = await storage.getObject(row.chave);
      if (stored === null) {
        report.problems.push(issueOf(item, 'arquivo ausente no R2'));
        continue;
      }
      if (!Buffer.from(stored).equals(copy.content)) {
        report.problems.push(issueOf(item, 'o conteúdo no R2 é diferente do original'));
        continue;
      }
      report.verified += 1;
    }
  });
  report.backupParts = (await storage.listKeys(LEGACY_BACKUP_PREFIX)).length;
  return report;
}

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
export async function findAttachmentOrphans(db: LegacyDatabase, storage: ObjectStorage): Promise<AttachmentOrphanReport> {
  const keys = await storage.listKeys(attachmentStorageKey(''));
  const { rows } = await db.query<{ id: string; chave: string }>('SELECT id, chave FROM anexos');
  const rowKeys = new Set(rows.map((row) => row.chave));
  const objectKeys = new Set(keys);
  return {
    objectsWithoutRow: keys.filter((key) => !rowKeys.has(key)),
    rowsWithoutObject: rows.filter((row) => !objectKeys.has(row.chave)).map((row) => ({ id: row.id, key: row.chave })),
  };
}
