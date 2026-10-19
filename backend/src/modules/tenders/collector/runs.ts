import type { Pool } from 'pg';
import type { CollectionRunDetails } from '../db/schema';
import type { CollectionRunStatus, CollectionRunType } from '../domains';
import type { ObjectStorage } from '../objectStorage';
import { ARCHIVE_DATASETS, RunArchive } from './archive';
import type { CollectorConfig } from './config';
import type { TendersDb } from './database';
import { addCalendarDays, brasiliaDate, brasiliaDateTime, toPncpDate } from './dates';
import { errorMessage, type CollectorLogger } from './logger';
import { mapPncpRecord, type TenderNoticeRow } from './mapping';
import { notifyChangedNotices, notifyNewNotices, notifyNewNoticesCollectedSince, notifyUpcomingDeadlines } from './notifications';
import { PncpRequestError, type PncpClient, type PncpEndpoint, type PncpQueryParams } from './pncpClient';
import {
  COLLECTOR_LOCK_KEYS,
  deleteExpiredNotices,
  finishCollectionRun,
  readCollectionStatus,
  startCollectionRun,
  tryAcquireCollectorLock,
  upsertNoticePage,
  type CollectionRunSummary,
} from './repository';

// Orquestração das execuções do coletor: varredura, incremental, coleta
// manual, lembretes, limpeza e reprocessamento. Cada execução fica registrada
// em licitacoes.coleta_execucao, com o resumo do arquivo bruto quando passa
// por ele (archive.ts).

export interface CollectorContext {
  db: TendersDb;
  pool: Pool;
  /** Consulta de contratações (editais). */
  pncp: PncpClient;
  /** Consulta de contratos, com o tamanho de página dos contratos. */
  contractsPncp: PncpClient;
  /** Termos dos contratos na API principal, com ritmo próprio (PNCP_TERMS_INTERVAL_MS). */
  termsPncp: PncpClient;
  /** R2 (arquivo bruto e armazém de contratos), na pasta do ambiente; null quando as variáveis do R2 não estão definidas. */
  storage: ObjectStorage | null;
  config: CollectorConfig;
  logger: CollectorLogger;
  now: () => Date;
}

export type RunOutcome =
  | { skipped: true; reason: string }
  | ({ skipped: false; runId: number } & CollectionRunSummary);

const MAX_ERROR_DETAILS = 50;
const NOTICE_RETENTION_MONTHS = 12;

/** Contadores de uma execução. Erros vão para os detalhes até um limite, e o excedente só é contado. */
export class RunTally {
  recordsRead = 0;
  newCount = 0;
  updatedCount = 0;
  notificationCount = 0;
  errorCount = 0;
  readonly details: CollectionRunDetails = {};
  private readonly errors: Array<Record<string, unknown>> = [];
  private omittedErrors = 0;

  constructor(private readonly requestsAtStart: number) {}

  /** Soma um contador nos detalhes (ex.: registros ignorados por motivo). */
  addDetailCount(key: string, amount: number): void {
    if (amount <= 0) {
      return;
    }
    const previous = typeof this.details[key] === 'number' ? this.details[key] : 0;
    this.details[key] = previous + amount;
  }

  addError(detail: Record<string, unknown>): void {
    this.errorCount += 1;
    if (this.errors.length < MAX_ERROR_DETAILS) {
      this.errors.push(detail);
      return;
    }
    this.omittedErrors += 1;
  }

  /** Sem erro: sucesso. Com erro mas com registros lidos: parcial. Só erros: falha. */
  resolveStatus(): CollectionRunStatus {
    if (this.errorCount === 0) {
      return 'SUCESSO';
    }
    return this.recordsRead > 0 ? 'PARCIAL' : 'FALHA';
  }

  summarize(status: CollectionRunStatus, requestsNow: number): CollectionRunSummary {
    return {
      status,
      requestCount: requestsNow - this.requestsAtStart,
      recordsRead: this.recordsRead,
      newCount: this.newCount,
      updatedCount: this.updatedCount,
      notificationCount: this.notificationCount,
      errorCount: this.errorCount,
      details: {
        ...this.details,
        ...(this.errors.length > 0 ? { errors: this.errors } : {}),
        ...(this.omittedErrors > 0 ? { omittedErrors: this.omittedErrors } : {}),
      },
    };
  }
}

/**
 * Uma execução registrada em coleta_execucao, com a trava da chave. A contagem
 * de requisições é a do cliente de editais; os contratos passam a soma dos deles.
 * O arquivo bruto da execução recebe o que ela ler; o que sobrar na memória é
 * enviado no fim, mesmo depois de uma falha, e a falha no envio conta erro.
 */
export async function withCollectionRun(
  context: CollectorContext,
  type: CollectionRunType,
  lockKey: number,
  work: (tally: RunTally, archive: RunArchive) => Promise<void>,
  requestCount: () => number = () => context.pncp.requestCount,
): Promise<RunOutcome> {
  const lock = await tryAcquireCollectorLock(context.pool, lockKey);
  if (!lock) {
    const reason = 'coleta já em execução';
    context.logger.warn('Execução não iniciada: coleta já em execução', { type });
    return { skipped: true, reason };
  }

  try {
    const runId = await startCollectionRun(context.db, type);
    const tally = new RunTally(requestCount());
    const archive = new RunArchive({
      storage: context.storage,
      runId,
      day: brasiliaDate(context.now()),
      now: context.now,
      logger: context.logger,
      onFailure: (failure) => tally.addError({ kind: 'archive', ...failure }),
    });
    context.logger.info('Execução iniciada', { runId, type });

    let status: CollectionRunStatus;
    try {
      await work(tally, archive);
      await archive.flush();
      status = tally.resolveStatus();
    } catch (error) {
      tally.addError({ kind: 'fatal', message: errorMessage(error) });
      status = 'FALHA';
      context.logger.error('Execução interrompida', { runId, type, error });
      await archive.flush();
    }

    const archiveSummary = archive.summary();
    if (archiveSummary) {
      tally.details['archive'] = archiveSummary;
    }
    const summary = tally.summarize(status, requestCount());
    await finishCollectionRun(context.db, runId, summary);
    const { details, ...counters } = summary;
    context.logger.info('Execução finalizada', { runId, type, ...counters, omittedErrors: details.omittedErrors });
    return { skipped: false, runId, ...summary };
  } finally {
    await lock.release();
  }
}

interface CollectionQuery {
  endpoint: PncpEndpoint;
  params: PncpQueryParams;
}

/** Uma consulta por modalidade (e por UF, quando PNCP_STATES restringe a coleta). */
function queriesByModalityAndState(
  config: CollectorConfig,
  endpoint: PncpEndpoint,
  baseParams: PncpQueryParams,
): CollectionQuery[] {
  const states: Array<string | null> = config.pncp.states.length > 0 ? config.pncp.states : [null];
  return config.pncp.modalities.flatMap((modality) =>
    states.map((state) => ({
      endpoint,
      params: { ...baseParams, codigoModalidadeContratacao: modality, ...(state ? { uf: state } : {}) },
    })),
  );
}

/** Por que a coleta não grava um registro: sem prazo de proposta ou já encerrado. */
export type NoticeSkipReason = 'withoutDeadline' | 'closed';

const SKIP_DETAIL_KEYS: Record<NoticeSkipReason, string> = {
  withoutDeadline: 'skippedWithoutDeadline',
  closed: 'skippedClosed',
};

/**
 * Registro que a coleta não grava. Sem data de encerramento de proposta, o
 * edital não recebe proposta (ex.: dispensa sem disputa): fica sempre de fora.
 * Já encerrado: só a incremental ignora (a varredura só traz abertos).
 */
export function noticeSkipReason(row: TenderNoticeRow, nowInBrasilia: string, skipClosed: boolean): NoticeSkipReason | null {
  if (!row.proposalClosesAt) {
    return 'withoutDeadline';
  }
  if (skipClosed && row.proposalClosesAt <= nowInBrasilia) {
    return 'closed';
  }
  return null;
}

/**
 * Percorre uma consulta: valida e grava cada página e gera as notificações
 * dela logo em seguida (se a execução cair no meio, o que já entrou foi
 * notificado). No arquivo bruto, só os editais novos ou alterados. Falha do
 * PNCP encerra só esta consulta; falha do banco interrompe a execução.
 */
async function collectQuery(
  context: CollectorContext,
  tally: RunTally,
  archive: RunArchive,
  query: CollectionQuery,
  options: { skipClosed: boolean; maxPages?: number },
): Promise<void> {
  const nowInBrasilia = brasiliaDateTime(context.now());
  const skipped: Record<NoticeSkipReason, number> = { withoutDeadline: 0, closed: 0 };

  try {
    for await (const page of context.pncp.pages(query.endpoint, query.params, { maxPages: options.maxPages })) {
      tally.recordsRead += page.records.length;
      const rows: TenderNoticeRow[] = [];
      const rawByControlNumber = new Map<string, unknown>();
      for (const record of page.records) {
        const mapped = mapPncpRecord(record);
        if (!mapped.ok) {
          tally.addError({ kind: 'record', controlNumber: mapped.controlNumber, reason: mapped.reason });
          continue;
        }
        const skipReason = noticeSkipReason(mapped.row, nowInBrasilia, options.skipClosed);
        if (skipReason) {
          skipped[skipReason] += 1;
          continue;
        }
        rows.push(mapped.row);
        rawByControlNumber.set(mapped.row.pncpControlNumber, record);
      }

      const result = await upsertNoticePage(context.db, rows);
      await archive.append(
        ARCHIVE_DATASETS.notices,
        result.changedControlNumbers.map((controlNumber) => rawByControlNumber.get(controlNumber)),
      );
      tally.newCount += result.insertedIds.length;
      tally.updatedCount += result.updatedIds.length;
      tally.notificationCount += await notifyNewNotices(context.db, result.insertedIds);
      tally.notificationCount += await notifyChangedNotices(context.db, result.updatedIds);
      context.logger.debug('Página gravada', {
        endpoint: query.endpoint,
        params: query.params,
        page: page.pageNumber,
        remainingPages: page.remainingPages,
        inserted: result.insertedIds.length,
        updated: result.updatedIds.length,
      });
    }
  } catch (error) {
    if (!(error instanceof PncpRequestError)) {
      throw error;
    }
    tally.addError({ kind: 'request', params: query.params, ...error.details, message: error.message });
    context.logger.warn('Consulta ao PNCP interrompida', { endpoint: query.endpoint, params: query.params, error });
  }

  for (const reason of Object.keys(skipped) as NoticeSkipReason[]) {
    tally.addDetailCount(SKIP_DETAIL_KEYS[reason], skipped[reason]);
  }
}

/** Data final da varredura: hoje (Brasília) + PNCP_HORIZON_DAYS, no formato do PNCP. */
export function sweepFinalDate(now: Date, horizonDays: number): string {
  return toPncpDate(addCalendarDays(brasiliaDate(now), horizonDays));
}

/** Varredura: todas as contratações com proposta em aberto e com prazo, por modalidade (e UF). */
export function runSweep(context: CollectorContext): Promise<RunOutcome> {
  return withCollectionRun(context, 'VARREDURA', COLLECTOR_LOCK_KEYS.collection, async (tally, archive) => {
    const dataFinal = sweepFinalDate(context.now(), context.config.pncp.horizonDays);
    tally.details['dataFinal'] = dataFinal;
    for (const query of queriesByModalityAndState(context.config, 'proposta', { dataFinal })) {
      await collectQuery(context, tally, archive, query, { skipClosed: false });
    }
  });
}

/** Incremental: publicadas e atualizadas de ontem a hoje (Brasília), ignorando as encerradas e as sem prazo. */
export function runIncremental(context: CollectorContext): Promise<RunOutcome> {
  return withCollectionRun(context, 'INCREMENTAL', COLLECTOR_LOCK_KEYS.collection, async (tally, archive) => {
    const today = brasiliaDate(context.now());
    const period = { dataInicial: toPncpDate(addCalendarDays(today, -1)), dataFinal: toPncpDate(today) };
    tally.details['period'] = period;
    const queries = [
      ...queriesByModalityAndState(context.config, 'publicacao', period),
      ...queriesByModalityAndState(context.config, 'atualizacao', period),
    ];
    for (const query of queries) {
      await collectQuery(context, tally, archive, query, { skipClosed: true });
    }
  });
}

/** Coleta manual para depuração: uma modalidade (e UF), com limite de páginas. */
export function runManualCollect(
  context: CollectorContext,
  options: { modality: number; state: string | null; maxPages: number | null },
): Promise<RunOutcome> {
  return withCollectionRun(context, 'MANUAL', COLLECTOR_LOCK_KEYS.collection, async (tally, archive) => {
    const dataFinal = sweepFinalDate(context.now(), context.config.pncp.horizonDays);
    const params: PncpQueryParams = {
      dataFinal,
      codigoModalidadeContratacao: options.modality,
      ...(options.state ? { uf: options.state } : {}),
    };
    tally.details['command'] = 'collect';
    tally.details['params'] = params;
    await collectQuery(context, tally, archive, { endpoint: 'proposta', params }, {
      skipClosed: false,
      ...(options.maxPages !== null ? { maxPages: options.maxPages } : {}),
    });
  });
}

/** Lembretes de prazo (PRAZO_3D e PRAZO_1D) dos acompanhamentos "Vou participar". */
export function runDeadlineReminders(context: CollectorContext): Promise<RunOutcome> {
  return withCollectionRun(context, 'LEMBRETES', COLLECTOR_LOCK_KEYS.maintenance, async (tally) => {
    tally.notificationCount += await notifyUpcomingDeadlines(context.db);
  });
}

/**
 * Retenção semanal: editais encerrados há mais de 12 meses e editais sem prazo
 * de proposta, desde que sem acompanhamento nem notificação não lida.
 */
export function runCleanup(context: CollectorContext): Promise<RunOutcome> {
  return withCollectionRun(context, 'LIMPEZA', COLLECTOR_LOCK_KEYS.maintenance, async (tally) => {
    tally.details['retentionMonths'] = NOTICE_RETENTION_MONTHS;
    tally.details['removedNotices'] = await deleteExpiredNotices(context.db, NOTICE_RETENTION_MONTHS);
  });
}

/** Reavalia NOVO_EDITAL dos editais coletados desde a data; o índice único impede duplicar. */
export function runReprocessNotifications(context: CollectorContext, sinceDate: string): Promise<RunOutcome> {
  return withCollectionRun(context, 'MANUAL', COLLECTOR_LOCK_KEYS.maintenance, async (tally) => {
    tally.details['command'] = 'reprocess-notifications';
    tally.details['since'] = sinceDate;
    tally.notificationCount += await notifyNewNoticesCollectedSince(context.db, sinceDate);
  });
}

export function readStatus(context: CollectorContext) {
  return readCollectionStatus(context.db);
}
