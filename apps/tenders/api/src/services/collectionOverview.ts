import { count, desc, inArray } from 'drizzle-orm';
import type { BackfillStopReason } from '../collector/contractRuns';
import { addCalendarDays, brasiliaDate, brasiliaDateTime } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import type { FederalSkipReason } from '../collector/federalMapping';
import { readFederalProgress } from '../collector/federalProgress';
import type { FederalStopReason } from '../collector/federalRuns';
import { readCollectionStatus } from '../collector/repository';
import type { ContractStoreAccess } from '../contractStore/reader';
import { tenderCollectionRuns, type CollectionRunDetails } from '../db/schema';
import type { CollectionRunStatus, CollectionRunType } from '../domains';
import { toBrasiliaIso } from './dates';
import type { Paginated } from './noticeSearch';

// Status e histórico da coleta (escopo, seção 8.4). A próxima execução
// prevista sai da agenda do Cron Job único do Render (`npm run daily-jobs`,
// 09:00 UTC = 06:00 de Brasília), documentada no README do módulo.

type ScheduledRunType = Exclude<CollectionRunType, 'MANUAL'>;

interface DailySlot {
  hour: number;
  minute: number;
  /** 0 = domingo; ausente = todo dia. */
  weekday?: number;
}

const DAILY_JOBS_SLOT: DailySlot = { hour: 6, minute: 0 };

/**
 * Agenda em Brasília: a rotina diária das 06:00 faz a varredura, os lembretes
 * de prazo, a coleta e os avisos dos contratos, a coleta dos vencedores, a
 * carga de contratos e a de vencedores (enquanto houver dias pendentes) e, aos
 * domingos, a limpeza dos editais. A incremental não está agendada, e a
 * limpeza dos contratos saiu (os encerrados ficam na base): o tipo fica só no
 * histórico. Os vencedores só rodam com TENDERS_WINNERS_ENABLED no Cron Job, e
 * os contratos federais, com TENDERS_FEDERAL_ENABLED (o painel não sabe se
 * estão ligadas: sem execução, ele não mostra a próxima).
 */
export const COLLECTION_SCHEDULE: Record<ScheduledRunType, DailySlot[]> = {
  VARREDURA: [DAILY_JOBS_SLOT],
  INCREMENTAL: [],
  LEMBRETES: [DAILY_JOBS_SLOT],
  LIMPEZA: [{ ...DAILY_JOBS_SLOT, weekday: 0 }],
  CONTRATOS_DIARIA: [DAILY_JOBS_SLOT],
  CONTRATOS_CARGA: [DAILY_JOBS_SLOT],
  CONTRATOS_LIMPEZA: [],
  CONTRATOS_AVISOS: [DAILY_JOBS_SLOT],
  VENCEDORES_DIARIA: [DAILY_JOBS_SLOT],
  VENCEDORES_CARGA: [DAILY_JOBS_SLOT],
  FEDERAIS_CARGA: [DAILY_JOBS_SLOT],
  FEDERAIS_CICLO: [DAILY_JOBS_SLOT],
};

const SCHEDULED_RUN_TYPES = Object.keys(COLLECTION_SCHEDULE) as ScheduledRunType[];

const DAYS_TO_LOOK_AHEAD = 8;
const pad = (value: number) => String(value).padStart(2, '0');

/** Próxima execução prevista do tipo, em ISO com o fuso de Brasília; sem agenda, null. */
export function nextScheduledRun(type: ScheduledRunType, now: Date): string | null {
  if (COLLECTION_SCHEDULE[type].length === 0) {
    return null;
  }
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

// Mensagens de erro gravadas antes da parte 7 do plano .plans/licitacoes-base-nacional.md
// citavam a fonte; o titular vê o histórico, então a leitura usa o texto atual.
const LEGACY_ERROR_PREFIXES: ReadonlyArray<[RegExp, string]> = [
  [/^PNCP falhou após/, 'A consulta falhou após'],
  [/^PNCP respondeu HTTP/, 'A consulta recebeu HTTP'],
];

/** Detalhes da execução com as mensagens de erro antigas no texto atual. */
export function neutralRunDetails(details: CollectionRunDetails): CollectionRunDetails {
  if (!Array.isArray(details.errors)) {
    return details;
  }
  return {
    ...details,
    errors: details.errors.map((error) => {
      const message = error['message'];
      if (typeof message !== 'string') {
        return error;
      }
      const neutral = LEGACY_ERROR_PREFIXES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), message);
      return neutral === message ? error : { ...error, message: neutral };
    }),
  };
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
    details: neutralRunDetails(row.details),
  };
}

/** A última execução da carga de contratos, lida dos detalhes que ela grava no fim. */
export interface BackfillRunView {
  from: string;
  to: string;
  totalDays: number;
  /** Dias da faixa ainda sem carga, ao fim da execução. */
  pendingDays: number;
  stoppedBy: BackfillStopReason | null;
  finished: boolean;
}

export interface ContractsOverview {
  /** Contratos na versão do armazém em uso; null = o armazém ainda não tem cópia pronta, ou nenhuma publicação. */
  contracts: number | null;
  /** Com vencimento de hoje em diante, na data da contagem (`countedOn`); null como acima. */
  activeContracts: number | null;
  /** Dia (AAAA-MM-DD, Brasília) em que a última publicação contou os vigentes; null como acima. */
  countedOn: string | null;
  backfill: {
    completedDays: number;
    /** Dia de publicação mais antigo já carregado. */
    oldestDay: string | null;
    /** null: a carga ainda não rodou, ou a última execução não terminou. */
    lastRun: BackfillRunView | null;
  };
}

export interface WinnersOverview {
  /** Linhas (licitação e fornecedor) na versão do armazém em uso; null = sem cópia pronta, ou sem nenhum vencedor publicado. */
  rows: number | null;
  backfill: {
    completedDays: number;
    /** Dia de resultado mais antigo já carregado. */
    oldestDay: string | null;
    /** null: a carga ainda não rodou, ou a última execução não terminou. */
    lastRun: BackfillRunView | null;
  };
}

/** A última execução da carga ou do ciclo dos contratos federais, lida dos detalhes que ela grava. */
export interface FederalRunView {
  stoppedBy: FederalStopReason | null;
  /** Órgãos que a carga concluiu ou que o ciclo leu nesta execução. */
  agencies: number | null;
  /** Linhas lidas que não viraram contrato, por motivo (o PNCP já tem, excluída, recente demais, órgão sem CNPJ). */
  skipped: Record<FederalSkipReason, number> | null;
  /** Janelas que a fonte não entregou completas, mesmo depois das releituras. */
  incompleteWindows: number | null;
}

export interface FederalOverview {
  /** Órgãos federais da lista da fonte. */
  agencies: number;
  /** Órgãos com contrato na fonte (entram no ciclo semanal). */
  withData: number;
  withoutData: number;
  /** Órgãos que a carga ainda não mediu. */
  notMeasured: number;
  /** Órgãos que a carga já leu até o ano de início. */
  loaded: number;
  /** Ano de início da última carga (TENDERS_FEDERAL_FROM); sem carga ainda, o padrão. */
  fromYear: number;
  /** A inclusão mais recente que a fonte tem (ISO, Brasília); null sem leitura. A fonte pode ficar semanas sem dado novo. */
  sourceUntil: string | null;
  load: FederalRunView | null;
  cycle: FederalRunView | null;
}

export interface CollectionStatusView {
  latestRuns: CollectionRunView[];
  /** null: tipo sem agenda (a incremental). */
  nextRuns: Record<ScheduledRunType, string | null>;
  totals: { notices: number; openNotices: number };
  contracts: ContractsOverview;
  winners: WinnersOverview;
  federal: FederalOverview;
}

const BACKFILL_STOP_REASONS: readonly BackfillStopReason[] = ['time', 'pncp'];
const FEDERAL_STOP_REASONS: readonly FederalStopReason[] = ['time', 'source'];
const FEDERAL_SKIP_REASONS: readonly FederalSkipReason[] = ['withPncpNumber', 'excluded', 'recent', 'agencyWithoutCnpj', 'termEndsBeforeStart', 'pncpTwin'];
/** O padrão de TENDERS_FEDERAL_FROM, para o painel antes da primeira carga. */
const DEFAULT_FEDERAL_FROM_YEAR = 2021;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const numberOf = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Detalhes da carga (`backfill`) ou do ciclo (`cycle`) dos federais gravados pela execução (federalRuns.ts); sem o bloco
 * (execução em andamento, ou de outro tipo), null.
 */
export function federalRunView(details: CollectionRunDetails | undefined, block: 'backfill' | 'cycle'): FederalRunView | null {
  const section = details?.[block];
  if (!isRecord(section)) {
    return null;
  }
  const metrics = isRecord(details?.['metrics']) ? details['metrics'] : {};
  const skipped = isRecord(metrics['skipped']) ? metrics['skipped'] : null;
  return {
    stoppedBy: FEDERAL_STOP_REASONS.find((reason) => reason === section['stoppedBy']) ?? null,
    agencies: numberOf(block === 'backfill' ? section['agenciesCompleted'] : section['agenciesRead']),
    skipped: skipped === null ? null : (Object.fromEntries(FEDERAL_SKIP_REASONS.map((reason) => [reason, numberOf(skipped[reason]) ?? 0])) as Record<FederalSkipReason, number>),
    incompleteWindows: numberOf(metrics['incompleteWindows']),
  };
}

/** Data e hora de Brasília sem fuso do Postgres ("2026-09-03 14:05:28") em ISO com o fuso; vazia, null. */
function brasiliaLocalIso(value: string | null): string | null {
  return value === null ? null : `${value.replace(' ', 'T')}-03:00`;
}

/** Detalhes da carga gravados pela execução (contractRuns.ts); fora do formato, null. */
export function backfillRunView(details: CollectionRunDetails | undefined): BackfillRunView | null {
  const backfill = details?.['backfill'];
  if (backfill === null || typeof backfill !== 'object') {
    return null;
  }
  const values = backfill as Record<string, unknown>;
  const { from, to, totalDays, pendingAfter, stoppedBy, finished } = values;
  if (typeof from !== 'string' || typeof to !== 'string' || typeof totalDays !== 'number' || typeof pendingAfter !== 'number') {
    return null;
  }
  const stopReason = BACKFILL_STOP_REASONS.find((reason) => reason === stoppedBy) ?? null;
  return { from, to, totalDays, pendingDays: pendingAfter, stoppedBy: stopReason, finished: finished === true };
}

export async function readCollectionOverview(db: TendersDb, contractStore: ContractStoreAccess, now: Date): Promise<CollectionStatusView> {
  const status = await readCollectionStatus(db);
  const lastBackfill = status.latestRuns.find((run) => run.type === 'CONTRATOS_CARGA');
  const lastWinnersBackfill = status.latestRuns.find((run) => run.type === 'VENCEDORES_CARGA');
  const lastFederalLoad = status.latestRuns.find((run) => run.type === 'FEDERAIS_CARGA');
  const lastFederalCycle = status.latestRuns.find((run) => run.type === 'FEDERAIS_CICLO');
  const federalBackfill = lastFederalLoad?.details['backfill'];
  const federalFromYear = (isRecord(federalBackfill) ? numberOf(federalBackfill['fromYear']) : null) ?? DEFAULT_FEDERAL_FROM_YEAR;
  const federal = await readFederalProgress(db, federalFromYear);
  // Os totais de contratos e de vencedores vêm do manifesto do armazém (versão em uso), não de uma consulta: o
  // endpoint de status nunca abre o DuckDB.
  const stored = contractStore.status();
  return {
    latestRuns: status.latestRuns.map(toRunView),
    nextRuns: Object.fromEntries(SCHEDULED_RUN_TYPES.map((type) => [type, nextScheduledRun(type, now)])) as Record<
      ScheduledRunType,
      string | null
    >,
    totals: status.totals,
    contracts: {
      contracts: stored.totals?.contracts ?? null,
      activeContracts: stored.totals?.active ?? null,
      countedOn: stored.today,
      backfill: {
        completedDays: status.contracts.backfill.completedDays,
        oldestDay: status.contracts.backfill.oldestDay,
        lastRun: backfillRunView(lastBackfill?.details),
      },
    },
    winners: {
      rows: stored.winners?.rows ?? null,
      backfill: {
        completedDays: status.winners.backfill.completedDays,
        oldestDay: status.winners.backfill.oldestDay,
        lastRun: backfillRunView(lastWinnersBackfill?.details),
      },
    },
    federal: {
      agencies: federal.agencies,
      withData: federal.withData,
      withoutData: federal.withoutData,
      notMeasured: federal.notMeasured,
      loaded: federal.loaded,
      fromYear: federalFromYear,
      sourceUntil: brasiliaLocalIso(federal.lastInclusion),
      load: federalRunView(lastFederalLoad?.details, 'backfill'),
      cycle: federalRunView(lastFederalCycle?.details, 'cycle'),
    },
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
