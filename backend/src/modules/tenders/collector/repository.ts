import type { Pool } from 'pg';
import { and, count, desc, eq, getTableColumns, inArray, isNull, lt, notExists, sql } from 'drizzle-orm';
import {
  tenderCollectionRuns,
  tenderNotices,
  tenderNotifications,
  tenderTrackings,
  type CollectionRunDetails,
} from '../db/schema';
import type { CollectionRunStatus, CollectionRunType } from '../domains';
import type { TendersDb } from './database';
import type { TenderNoticeRow } from './mapping';

/** Chaves do pg_try_advisory_lock: uma para as coletas, outra para lembretes, limpeza e reprocessamento. */
export const COLLECTOR_LOCK_KEYS = {
  collection: 7_274_001,
  maintenance: 7_274_002,
} as const;

export interface CollectorLock {
  release(): Promise<void>;
}

/**
 * Lock de sessão do Postgres numa conexão dedicada durante toda a execução.
 * SQL direto no client do pg: o lock pertence à conexão, e o Drizzle sobre o
 * pool não garante a mesma conexão entre consultas.
 */
export async function tryAcquireCollectorLock(pool: Pool, key: number): Promise<CollectorLock | null> {
  const client = await pool.connect();
  let acquired = false;
  try {
    const result = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1) AS acquired', [key]);
    acquired = result.rows[0]?.acquired === true;
  } finally {
    if (!acquired) {
      client.release();
    }
  }
  if (!acquired) {
    return null;
  }

  return {
    async release() {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [key]);
      } finally {
        client.release();
      }
    },
  };
}

// Colunas regravadas quando o edital muda; o número de controle é a chave, e
// as datas de coleta têm regra própria.
const NOT_REFRESHED_FIELDS = new Set(['id', 'pncpControlNumber', 'firstCollectedAt', 'lastCollectedAt', 'searchVector']);
const REFRESH_FROM_EXCLUDED = Object.fromEntries(
  Object.entries(getTableColumns(tenderNotices))
    .filter(([field]) => !NOT_REFRESHED_FIELDS.has(field))
    .map(([field, column]) => [field, sql.raw(`excluded."${column.name}"`)]),
);

export interface NoticePageResult {
  insertedIds: number[];
  updatedIds: number[];
  unchangedCount: number;
}

/** O mesmo edital duas vezes na página quebraria o ON CONFLICT DO UPDATE: fica o último. */
function keepLastByControlNumber(rows: TenderNoticeRow[]): TenderNoticeRow[] {
  return [...new Map(rows.map((row) => [row.pncpControlNumber, row])).values()];
}

/**
 * Grava uma página numa transação. Novo entra; existente com hash ou data de
 * atualização diferente é regravado; igual só tem a última coleta atualizada.
 * `xmax = 0` no RETURNING separa as linhas inseridas das atualizadas.
 */
export async function upsertNoticePage(db: TendersDb, rows: TenderNoticeRow[]): Promise<NoticePageResult> {
  const uniqueRows = keepLastByControlNumber(rows);
  if (uniqueRows.length === 0) {
    return { insertedIds: [], updatedIds: [], unchangedCount: 0 };
  }

  return db.transaction(async (tx) => {
    const changed = await tx
      .insert(tenderNotices)
      .values(uniqueRows)
      .onConflictDoUpdate({
        target: tenderNotices.pncpControlNumber,
        set: { ...REFRESH_FROM_EXCLUDED, lastCollectedAt: sql`now()` },
        setWhere: sql`${tenderNotices.payloadHash} IS DISTINCT FROM excluded."hash_payload"
          OR ${tenderNotices.pncpUpdatedAt} IS DISTINCT FROM excluded."data_atualizacao_pncp"`,
      })
      .returning({
        id: tenderNotices.id,
        controlNumber: tenderNotices.pncpControlNumber,
        inserted: sql<boolean>`(xmax = 0)`,
      });

    const changedNumbers = new Set(changed.map((row) => row.controlNumber));
    const unchangedNumbers = uniqueRows
      .map((row) => row.pncpControlNumber)
      .filter((controlNumber) => !changedNumbers.has(controlNumber));
    if (unchangedNumbers.length > 0) {
      await tx
        .update(tenderNotices)
        .set({ lastCollectedAt: sql`now()` })
        .where(inArray(tenderNotices.pncpControlNumber, unchangedNumbers));
    }

    return {
      insertedIds: changed.filter((row) => row.inserted).map((row) => row.id),
      updatedIds: changed.filter((row) => !row.inserted).map((row) => row.id),
      unchangedCount: unchangedNumbers.length,
    };
  });
}

export interface CollectionRunSummary {
  status: CollectionRunStatus;
  requestCount: number;
  recordsRead: number;
  newCount: number;
  updatedCount: number;
  notificationCount: number;
  errorCount: number;
  details: CollectionRunDetails;
}

export async function startCollectionRun(db: TendersDb, type: CollectionRunType): Promise<number> {
  const [run] = await db
    .insert(tenderCollectionRuns)
    .values({ type, status: 'EXECUTANDO' })
    .returning({ id: tenderCollectionRuns.id });
  if (!run) {
    throw new Error('Não foi possível registrar o início da execução');
  }
  return run.id;
}

export async function finishCollectionRun(db: TendersDb, runId: number, summary: CollectionRunSummary): Promise<void> {
  await db
    .update(tenderCollectionRuns)
    .set({ ...summary, finishedAt: sql`now()` })
    .where(eq(tenderCollectionRuns.id, runId));
}

/** Última execução de cada tipo e os totais de editais, para o comando `status`. */
export async function readCollectionStatus(db: TendersDb) {
  const latestRuns = await db
    .selectDistinctOn([tenderCollectionRuns.type])
    .from(tenderCollectionRuns)
    .orderBy(tenderCollectionRuns.type, desc(tenderCollectionRuns.startedAt));

  const [totals] = await db
    .select({
      notices: count(),
      openNotices: sql<number>`count(*) FILTER (WHERE ${tenderNotices.proposalClosesAt} IS NULL OR ${tenderNotices.proposalClosesAt} > now())`.mapWith(Number),
    })
    .from(tenderNotices);

  return { latestRuns, totals: totals ?? { notices: 0, openNotices: 0 } };
}

/**
 * Retenção: apaga editais encerrados há mais de `retentionMonths` meses que não
 * tenham acompanhamento em nenhuma conta nem notificação não lida.
 */
export async function deleteExpiredNotices(db: TendersDb, retentionMonths: number): Promise<number> {
  const result = await db.delete(tenderNotices).where(
    and(
      lt(tenderNotices.proposalClosesAt, sql`now() - make_interval(months => ${retentionMonths})`),
      notExists(
        db
          .select({ found: sql`1` })
          .from(tenderTrackings)
          .where(eq(tenderTrackings.noticeId, tenderNotices.id)),
      ),
      notExists(
        db
          .select({ found: sql`1` })
          .from(tenderNotifications)
          .where(and(eq(tenderNotifications.noticeId, tenderNotices.id), isNull(tenderNotifications.readAt))),
      ),
    ),
  );
  return result.rowCount ?? 0;
}
