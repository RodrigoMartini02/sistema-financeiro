import { count, desc, inArray } from 'drizzle-orm';
import { addCalendarDays, brasiliaDate, brasiliaDateTime } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import { readCollectionStatus } from '../collector/repository';
import { tenderCollectionRuns, type CollectionRunDetails } from '../db/schema';
import type { CollectionRunStatus, CollectionRunType } from '../domains';
import { toBrasiliaIso } from './dates';
import type { Paginated } from './noticeSearch';

// Status e histórico da coleta (escopo, seção 8.4). A próxima execução
// prevista sai da agenda documentada no README (Render Cron Jobs), em horário
// de Brasília; enquanto os Cron Jobs não existirem, é só a previsão da agenda.

type ScheduledRunType = Exclude<CollectionRunType, 'MANUAL'>;

interface DailySlot {
  hour: number;
  minute: number;
  /** 0 = domingo; ausente = todo dia. */
  weekday?: number;
}

/** Agenda do README em Brasília: varredura 03:00; incremental 07:00 a 21:00 a cada 2 h; lembretes aos 15 min; limpeza domingo 04:00. */
export const COLLECTION_SCHEDULE: Record<ScheduledRunType, DailySlot[]> = {
  VARREDURA: [{ hour: 3, minute: 0 }],
  INCREMENTAL: [7, 9, 11, 13, 15, 17, 19, 21].map((hour) => ({ hour, minute: 0 })),
  LEMBRETES: Array.from({ length: 24 }, (_, hour) => ({ hour, minute: 15 })),
  LIMPEZA: [{ hour: 4, minute: 0, weekday: 0 }],
};

const DAYS_TO_LOOK_AHEAD = 8;
const pad = (value: number) => String(value).padStart(2, '0');

/** Próxima execução prevista do tipo, em ISO com o fuso de Brasília. */
export function nextScheduledRun(type: ScheduledRunType, now: Date): string {
  const nowInBrasilia = brasiliaDateTime(now);
  const today = brasiliaDate(now);
  for (let offset = 0; offset < DAYS_TO_LOOK_AHEAD; offset += 1) {
    const date = addCalendarDays(today, offset);
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
    for (const slot of COLLECTION_SCHEDULE[type]) {
      if (slot.weekday !== undefined && slot.weekday !== weekday) {
        continue;
      }
      const candidate = `${date}T${pad(slot.hour)}:${pad(slot.minute)}:00`;
      if (candidate > nowInBrasilia) {
        return `${candidate}-03:00`;
      }
    }
  }
  throw new Error(`agenda sem próxima execução para ${type}`);
}

export interface CollectionRunView {
  id: number;
  type: CollectionRunType;
  status: CollectionRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  requestCount: number;
  recordsRead: number;
  newCount: number;
  updatedCount: number;
  notificationCount: number;
  errorCount: number;
  details: CollectionRunDetails;
}

function toRunView(row: typeof tenderCollectionRuns.$inferSelect): CollectionRunView {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    startedAt: toBrasiliaIso(row.startedAt),
    finishedAt: toBrasiliaIso(row.finishedAt),
    requestCount: row.requestCount,
    recordsRead: row.recordsRead,
    newCount: row.newCount,
    updatedCount: row.updatedCount,
    notificationCount: row.notificationCount,
    errorCount: row.errorCount,
    details: row.details,
  };
}

export interface CollectionStatusView {
  latestRuns: CollectionRunView[];
  nextRuns: Record<ScheduledRunType, string>;
  totals: { notices: number; openNotices: number };
}

export async function readCollectionOverview(db: TendersDb, now: Date): Promise<CollectionStatusView> {
  const status = await readCollectionStatus(db);
  return {
    latestRuns: status.latestRuns.map(toRunView),
    nextRuns: {
      VARREDURA: nextScheduledRun('VARREDURA', now),
      INCREMENTAL: nextScheduledRun('INCREMENTAL', now),
      LEMBRETES: nextScheduledRun('LEMBRETES', now),
      LIMPEZA: nextScheduledRun('LIMPEZA', now),
    },
    totals: status.totals,
  };
}

export async function listCollectionRuns(db: TendersDb, page: number, perPage: number): Promise<Paginated<CollectionRunView>> {
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(tenderCollectionRuns)
      .orderBy(desc(tenderCollectionRuns.startedAt), desc(tenderCollectionRuns.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ total: count() }).from(tenderCollectionRuns),
  ]);
  const total = totals[0]?.total ?? 0;
  return { items: rows.map(toRunView), page, perPage, total, totalPages: Math.ceil(total / perPage) };
}

const DATA_RUN_TYPES: CollectionRunType[] = ['VARREDURA', 'INCREMENTAL'];

/** Fim da última coleta de dados que gravou editais, e se a mais recente falhou (aviso em âmbar). */
export async function readLastDataUpdate(db: TendersDb): Promise<{ lastUpdateAt: string | null; lastRunFailed: boolean }> {
  const runs = await db
    .select({ status: tenderCollectionRuns.status, finishedAt: tenderCollectionRuns.finishedAt })
    .from(tenderCollectionRuns)
    .where(inArray(tenderCollectionRuns.type, DATA_RUN_TYPES))
    .orderBy(desc(tenderCollectionRuns.startedAt))
    .limit(50);
  const lastSuccessful = runs.find((run) => (run.status === 'SUCESSO' || run.status === 'PARCIAL') && run.finishedAt);
  return {
    lastUpdateAt: toBrasiliaIso(lastSuccessful?.finishedAt),
    lastRunFailed: runs[0]?.status === 'FALHA',
  };
}
