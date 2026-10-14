import { addCalendarDays, brasiliaDate, toPncpDate } from './dates';
import { contractExpiryFromTerms, mapPncpContract, type ContractSkipReason, type TenderContractRow } from './contractMapping';
import { notifyChangedContractExpiry, notifyContractExpirations } from './contractNotifications';
import {
  databaseSizeMb,
  deleteExpiredContracts,
  markBackfillDayCompleted,
  readCompletedBackfillDays,
  readNewestBackfillDay,
  readStoredContracts,
  upsertContractPage,
  type StoredContractState,
} from './contractRepository';
import type { TendersDb } from './database';
import { PncpRequestError, type PncpContractEndpoint, type PncpQueryParams } from './pncpClient';
import { COLLECTOR_LOCK_KEYS } from './repository';
import { withCollectionRun, type CollectorContext, type RunOutcome, type RunTally } from './runs';

// Execuções de contratos (plano .plans/licitacoes-contratos-a-vencer.md):
// coleta diária (publicados e atualizados de ontem a hoje), carga inicial (um
// dia de publicação por vez, do mais recente para o mais antigo, em blocos com
// limite de tempo e de espaço), limpeza dos vencidos e avisos de vencimento
// (parte B). Todas com a trava própria dos contratos e registradas em
// licitacoes.coleta_execucao.

const SKIP_DETAIL_KEYS: Record<ContractSkipReason, string> = {
  notInitialTerm: 'skippedNotInitialTerm',
  shortTerm: 'skippedShortTerm',
  withoutEndDate: 'skippedWithoutEndDate',
  implausibleTerm: 'skippedImplausibleTerm',
  expired: 'skippedExpired',
};

/** Dias seguidos com falha do PNCP que encerram o bloco da carga (o PNCP está fora do ar). */
const MAX_CONSECUTIVE_FAILED_DAYS = 3;

export const BACKFILL_NOT_STARTED = 'carga não iniciada: limite de espaço não definido';
export const BACKFILL_FINISHED = 'carga concluída: nenhum dia pendente';

/** Por que o bloco da carga parou antes de terminar os dias pendentes. */
export type BackfillStopReason = 'time' | 'space' | 'pncp';

/** Requisições dos dois clientes de contratos (consulta e termos), para o registro da execução. */
function contractRequests(context: CollectorContext): number {
  return context.contractsPncp.requestCount + context.termsPncp.requestCount;
}

interface QueryCounts {
  /** Falso quando o PNCP falhou no meio da consulta: o dia da carga fica pendente. */
  completed: boolean;
  recordsRead: number;
  storedCount: number;
  termsChecked: number;
}

/**
 * Vencimento do contrato. Sem sinal de alteração, vale o fim original e os
 * termos não são consultados. Com o sinal, os termos são consultados se o
 * contrato não está gravado ou se a data de atualização global mudou desde a
 * última conferência; senão, vale o que já foi conferido. Falha do PNCP nos
 * termos conta erro e mantém o que estava gravado (ou o fim original, sem
 * marcar a conferência, para tentar de novo depois).
 */
async function resolveContractExpiry(
  context: CollectorContext,
  tally: RunTally,
  row: TenderContractRow,
  hasChangeSignal: boolean,
  previous: StoredContractState | undefined,
  counts: QueryCounts,
): Promise<TenderContractRow> {
  if (!hasChangeSignal) {
    return { ...row, expiresOn: row.originalTermEnd, amendments: null, amendmentsReference: null };
  }

  const reference = row.pncpGlobalUpdatedAt ?? null;
  if (previous && previous.amendmentsReference !== null && previous.amendmentsReference === reference?.slice(0, 19)) {
    return { ...row, expiresOn: previous.expiresOn, amendments: previous.amendments, amendmentsReference: reference };
  }

  try {
    const terms = await context.termsPncp.fetchContractTerms({
      agencyCnpj: row.agencyCnpj,
      year: row.contractYear,
      sequence: row.contractSequence,
    });
    counts.termsChecked += 1;
    if (terms === null) {
      tally.addDetailCount('termsNotFound', 1);
      return { ...row, expiresOn: row.originalTermEnd, amendments: [], amendmentsReference: reference };
    }
    const expiry = contractExpiryFromTerms(row.originalTermEnd, terms);
    for (const reason of expiry.invalidTerms) {
      tally.addError({ kind: 'term', controlNumber: row.pncpControlNumber, reason });
    }
    tally.addDetailCount('termsWithoutEndDate', expiry.undatedTerms);
    return { ...row, expiresOn: expiry.expiresOn, amendments: expiry.amendments, amendmentsReference: reference };
  } catch (error) {
    if (!(error instanceof PncpRequestError)) {
      throw error;
    }
    tally.addError({ kind: 'terms', controlNumber: row.pncpControlNumber, ...error.details, message: error.message });
    if (previous) {
      return { ...row, expiresOn: previous.expiresOn, amendments: previous.amendments, amendmentsReference: previous.amendmentsReference };
    }
    return { ...row, expiresOn: row.originalTermEnd, amendments: null, amendmentsReference: null };
  }
}

/**
 * Uma página de contratos, na sequência do plano: mapear e validar; tirar os
 * que não são termo inicial e os curtos; ler o que já está gravado (uma
 * consulta para a página); consultar os termos de quem precisa; calcular o
 * vencimento; tirar os vencidos que não estão gravados; gravar. O vencido já
 * gravado é atualizado, e a limpeza o tira. Quem favoritou um contrato que
 * mudou de vencimento recebe CONTRATO_ALTERADO.
 */
async function collectContractPage(
  context: CollectorContext,
  tally: RunTally,
  records: unknown[],
  today: string,
  counts: QueryCounts,
): Promise<void> {
  const skipped: Record<ContractSkipReason, number> = { notInitialTerm: 0, shortTerm: 0, withoutEndDate: 0, implausibleTerm: 0, expired: 0 };
  const candidates: Array<{ row: TenderContractRow; hasChangeSignal: boolean }> = [];
  for (const record of records) {
    const mapped = mapPncpContract(record);
    if (mapped.ok === 'skipped') {
      skipped[mapped.reason] += 1;
      continue;
    }
    if (!mapped.ok) {
      tally.addError({ kind: 'record', controlNumber: mapped.controlNumber, reason: mapped.reason });
      continue;
    }
    candidates.push(mapped);
  }

  const stored = await readStoredContracts(
    context.db,
    candidates.map((candidate) => candidate.row.pncpControlNumber),
  );
  const rows: TenderContractRow[] = [];
  const expiryChanged: string[] = [];
  for (const { row, hasChangeSignal } of candidates) {
    const previous = stored.get(row.pncpControlNumber);
    const resolved = await resolveContractExpiry(context, tally, row, hasChangeSignal, previous, counts);
    if (!previous && resolved.expiresOn < today) {
      skipped.expired += 1;
      continue;
    }
    if (previous && previous.expiresOn !== resolved.expiresOn) {
      expiryChanged.push(resolved.pncpControlNumber);
    }
    rows.push(resolved);
  }

  const result = await upsertContractPage(context.db, rows);
  tally.newCount += result.insertedCount;
  tally.updatedCount += result.updatedCount;
  tally.notificationCount += await notifyChangedContractExpiry(context.db, expiryChanged);
  counts.storedCount += rows.length;
  for (const reason of Object.keys(skipped) as ContractSkipReason[]) {
    tally.addDetailCount(SKIP_DETAIL_KEYS[reason], skipped[reason]);
  }
}

/** Percorre uma consulta de contratos. Falha do PNCP encerra só a consulta; falha do banco, a execução. */
async function collectContractQuery(
  context: CollectorContext,
  tally: RunTally,
  endpoint: PncpContractEndpoint,
  params: PncpQueryParams,
  today: string,
): Promise<QueryCounts> {
  const counts: QueryCounts = { completed: true, recordsRead: 0, storedCount: 0, termsChecked: 0 };
  try {
    for await (const page of context.contractsPncp.pages(endpoint, params)) {
      tally.recordsRead += page.records.length;
      counts.recordsRead += page.records.length;
      await collectContractPage(context, tally, page.records, today, counts);
      context.logger.debug('Página de contratos gravada', {
        endpoint,
        params,
        page: page.pageNumber,
        remainingPages: page.remainingPages,
      });
    }
  } catch (error) {
    if (!(error instanceof PncpRequestError)) {
      throw error;
    }
    counts.completed = false;
    tally.addError({ kind: 'request', params, ...error.details, message: error.message });
    context.logger.warn('Consulta de contratos ao PNCP interrompida', { endpoint, params, error });
  }
  tally.addDetailCount('termsChecked', counts.termsChecked);
  return counts;
}

/** Coleta diária: contratos publicados e atualizados de ontem a hoje (Brasília). */
export function runContractsDaily(context: CollectorContext): Promise<RunOutcome> {
  return withCollectionRun(
    context,
    'CONTRATOS_DIARIA',
    COLLECTOR_LOCK_KEYS.contracts,
    async (tally) => {
      const today = brasiliaDate(context.now());
      const period = { dataInicial: toPncpDate(addCalendarDays(today, -1)), dataFinal: toPncpDate(today) };
      tally.details['period'] = period;
      for (const endpoint of ['contratos', 'contratos-atualizacao'] as const) {
        await collectContractQuery(context, tally, endpoint, period, today);
      }
    },
    () => contractRequests(context),
  );
}

/** Dias de `to` até `from` (AAAA-MM-DD), do mais recente para o mais antigo. */
export function daysFromNewestToOldest(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = to; day >= from; day = addCalendarDays(day, -1)) {
    days.push(day);
  }
  return days;
}

export interface BackfillOptions {
  /** Dia mais antigo; sem ele, TENDERS_CONTRACTS_BACKFILL_FROM. */
  from?: string;
  /** Dia mais recente; sem ele, ontem. */
  to?: string;
  /** Tempo do bloco; sem ele, TENDERS_CONTRACTS_BACKFILL_MINUTES. */
  maxMinutes?: number;
  /** Limite de tamanho do banco; sem ele, TENDERS_CONTRACTS_MAX_DB_MB. */
  maxDbMb?: number;
}

interface BackfillRange {
  from: string;
  to: string;
}

/**
 * Faixa da carga: do dia mais antigo configurado até o mais recente. Na
 * primeira execução, o mais recente é ontem; depois, fica fixo no dia mais
 * recente já carregado (os dias seguintes são da coleta diária).
 */
async function backfillRange(context: CollectorContext, options: BackfillOptions): Promise<BackfillRange> {
  const from = options.from ?? context.config.contracts.backfillFrom;
  const to = options.to ?? (await readNewestBackfillDay(context.db)) ?? addCalendarDays(brasiliaDate(context.now()), -1);
  return { from, to };
}

async function pendingBackfillDays(db: TendersDb, range: BackfillRange): Promise<string[]> {
  const completed = await readCompletedBackfillDays(db, range.from, range.to);
  return daysFromNewestToOldest(range.from, range.to).filter((day) => !completed.has(day));
}

/**
 * Carga inicial: um dia de publicação por vez, do mais recente para o mais
 * antigo, retomável. O dia só é marcado ao terminar; um dia com falha do PNCP
 * fica pendente para a próxima execução. Antes de cada dia, confere o tempo do
 * bloco e o tamanho do banco, e para no primeiro limite, com o motivo nos
 * detalhes. Sem limite de espaço definido, ou sem dia pendente, não roda.
 */
export async function runContractsBackfill(context: CollectorContext, options: BackfillOptions = {}): Promise<RunOutcome> {
  const maxDbMb = options.maxDbMb ?? context.config.contracts.maxDatabaseMb;
  if (maxDbMb === null) {
    context.logger.warn('Carga de contratos não iniciada', { reason: BACKFILL_NOT_STARTED });
    return { skipped: true, reason: BACKFILL_NOT_STARTED };
  }
  const range = await backfillRange(context, options);
  if ((await pendingBackfillDays(context.db, range)).length === 0) {
    context.logger.info('Carga de contratos sem dia pendente', { ...range });
    return { skipped: true, reason: BACKFILL_FINISHED };
  }

  return withCollectionRun(
    context,
    'CONTRATOS_CARGA',
    COLLECTOR_LOCK_KEYS.contracts,
    async (tally) => {
      const startedAt = context.now().getTime();
      const today = brasiliaDate(context.now());
      const { from, to } = range;
      const maxMinutes = options.maxMinutes ?? context.config.contracts.backfillMinutes;
      const pendingDays = await pendingBackfillDays(context.db, range);

      let daysCompleted = 0;
      let failedDays = 0;
      let consecutiveFailures = 0;
      let stoppedBy: BackfillStopReason | null = null;
      let databaseMb: number | null = null;

      for (const day of pendingDays) {
        if ((context.now().getTime() - startedAt) / 60_000 >= maxMinutes) {
          stoppedBy = 'time';
          break;
        }
        databaseMb = Math.round(await databaseSizeMb(context.db));
        if (databaseMb >= maxDbMb) {
          stoppedBy = 'space';
          break;
        }

        const pncpDay = toPncpDate(day);
        const counts = await collectContractQuery(context, tally, 'contratos', { dataInicial: pncpDay, dataFinal: pncpDay }, today);
        if (!counts.completed) {
          failedDays += 1;
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILED_DAYS) {
            stoppedBy = 'pncp';
            break;
          }
          continue;
        }
        consecutiveFailures = 0;
        await markBackfillDayCompleted(context.db, day, {
          recordsRead: counts.recordsRead,
          storedCount: counts.storedCount,
          termsChecked: counts.termsChecked,
        });
        daysCompleted += 1;
        context.logger.info('Dia da carga de contratos concluído', { day, ...counts });
      }

      const pendingAfter = pendingDays.length - daysCompleted;
      tally.details['backfill'] = {
        from,
        to,
        maxMinutes,
        maxDbMb,
        totalDays: daysFromNewestToOldest(from, to).length,
        pendingAtStart: pendingDays.length,
        daysCompleted,
        failedDays,
        pendingAfter,
        stoppedBy,
        databaseMb,
        finished: pendingAfter === 0,
      };
    },
    () => contractRequests(context),
  );
}

/** Avisos de vencimento do dia (Brasília): 90 e 30 dias, para favoritos e buscas salvas com Notificar. */
export function runContractReminders(context: CollectorContext): Promise<RunOutcome> {
  return withCollectionRun(context, 'CONTRATOS_AVISOS', COLLECTOR_LOCK_KEYS.contracts, async (tally) => {
    const today = brasiliaDate(context.now());
    tally.details['today'] = today;
    tally.notificationCount += await notifyContractExpirations(context.db, today);
  });
}

/** Limpeza diária: apaga os contratos com vencimento antes de hoje (Brasília), menos os favoritados. */
export function runContractsCleanup(context: CollectorContext): Promise<RunOutcome> {
  return withCollectionRun(
    context,
    'CONTRATOS_LIMPEZA',
    COLLECTOR_LOCK_KEYS.contracts,
    async (tally) => {
      const today = brasiliaDate(context.now());
      tally.details['expiredBefore'] = today;
      tally.details['removedContracts'] = await deleteExpiredContracts(context.db, today);
    },
    () => contractRequests(context),
  );
}
