import { ContractStoreReader } from '../contractStore/reader';
import type { CheckedContractTerms, ContractStoreState, PendingTermsContract } from '../contractStore/writer';
import { ARCHIVE_DATASETS, type RunArchive } from './archive';
import { assertArchiveHealthy, backfillBlockMinutes, collectionStopReason, DEADLINE_MARGIN_MINUTES, type CollectionLimitReason } from './blockTime';
import { addCalendarDays, brasiliaDate, toPncpDate } from './dates';
import {
  contractExpiryFromTerms,
  mapPncpContract,
  type ContractTermSummary,
  type ContractWithoutExpiryReason,
  type TenderContractRow,
} from './contractMapping';
import { notifyContractExpirations, updateSavedSearchTotals, type ChangedContractExpiry } from './contractNotifications';
import { markBackfillDayCompleted, readCompletedBackfillDays, readLastCompletedDailyDays, readNewestBackfillDay, type BackfillDayCounts } from './contractProgress';
import type { TendersDb } from './database';
import { PNCP_CONTRACT_ENDPOINTS, PncpRequestError, type PncpContractEndpoint, type PncpQueryParams } from './pncpClient';
import { COLLECTOR_LOCK_KEYS } from './repository';
import { CollectorResourceLimitError } from './resourceBudget';
import { RunContractStore, requireStorage } from './runContractStore';
import { withCollectionRun, type CollectorContext, type RunOutcome, type RunTally } from './runs';

// Execuções de contratos (planos .plans/licitacoes-contratos-a-vencer.md e
// .plans/licitacoes-contratos-no-r2.md): coleta diária, carga inicial (um dia de
// publicação por vez, do mais recente para o mais antigo, em blocos com limite de
// tempo) e avisos de vencimento. Todas com a trava própria dos contratos e
// registradas em licitacoes.coleta_execucao. Desde a parte 2 do plano
// .plans/licitacoes-base-nacional.md, todos os tipos e os encerrados ficam na
// base, e não há mais limpeza dos vencidos. A coleta diária (plano
// .plans/licitacoes-contratos-coleta-sem-perda.md) lê cada consulta desde o
// último dia que ela leu sem falha do PNCP, com até 7 dias por execução, e
// depois reconsulta os termos que falharam antes. Todo contrato lido e a
// resposta de cada consulta de termos vão para o arquivo bruto (archive.ts).
//
// Os contratos moram no armazém do R2 (contractStore): a coleta grava nas
// mudanças da execução, e os arquivos só trocam de versão na publicação, no fim
// da coleta diária e a cada 10 dias da carga. Por isso o que a execução leu só
// vale como "lido" depois da publicação: a coleta diária grava as consultas
// como não concluídas se não conseguir publicar, e a carga só marca os dias em
// contrato_carga_dia depois de publicar. Quem favoritou um contrato que mudou
// de vencimento é avisado também só depois da publicação.

/** Contratos que entraram sem vencimento, por motivo, nos detalhes da execução. */
const WITHOUT_EXPIRY_DETAIL_KEYS: Record<ContractWithoutExpiryReason, string> = {
  withoutEndDate: 'withoutEndDate',
  implausibleTerm: 'implausibleTerm',
};

/** Dias seguidos com falha do PNCP que encerram o bloco da carga (o PNCP está fora do ar). */
const MAX_CONSECUTIVE_FAILED_DAYS = 3;

/** A janela da coleta diária vai no máximo até o início + 7 dias; o resto fica para a execução seguinte. */
export const DAILY_MAX_WINDOW_DAYS = 7;
/** Reconsulta dos termos que falharam: contratos por execução. */
export const TERMS_RETRY_LIMIT = 200;
/** Falhas seguidas do PNCP que encerram a reconsulta (o PNCP está fora do ar). */
const MAX_CONSECUTIVE_TERMS_FAILURES = 3;
/** A carga publica o armazém a cada tantos dias concluídos: um processo derrubado perde no máximo esses dias, que ficam pendentes. */
export const BACKFILL_PUBLISH_EVERY_DAYS = 10;

export const BACKFILL_NOT_STARTED = 'carga não iniciada: R2 não configurado';
export const BACKFILL_FINISHED = 'carga concluída: nenhum dia pendente';
export const BACKFILL_NO_TIME = 'sem tempo na rotina para a carga de contratos';

/** Por que o bloco da carga parou antes de terminar os dias pendentes. */
export type BackfillStopReason = CollectionLimitReason | 'pncp';

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
  /** Contratos com falha do PNCP nos termos: a reconsulta da mesma execução os pula. */
  failedTerms: string[];
  stoppedBy: CollectionLimitReason | null;
}

/** O que a consulta dos termos precisa do contrato (na coleta e na reconsulta). */
type ContractTermsKey = Pick<TenderContractRow, 'pncpControlNumber' | 'agencyCnpj' | 'contractYear' | 'contractSequence' | 'originalTermEnd'>;

type TermsCheck = { ok: true; expiresOn: string | null; amendments: ContractTermSummary[] } | { ok: false };

/**
 * Consulta e interpreta os termos de um contrato. Sem termos no PNCP (404),
 * vale o fim original. Termo fora do formato conta erro; aditivo de prazo sem
 * a data nova conta à parte. Falha do PNCP conta erro e devolve `ok: false`.
 * A resposta vai para o arquivo bruto com o número de controle (`null` no 404).
 */
async function checkContractTerms(
  context: CollectorContext,
  tally: RunTally,
  archive: RunArchive,
  contract: ContractTermsKey,
): Promise<TermsCheck> {
  try {
    const terms = await context.termsPncp.fetchContractTerms({
      agencyCnpj: contract.agencyCnpj,
      year: contract.contractYear,
      sequence: contract.contractSequence,
    });
    await archive.append(ARCHIVE_DATASETS.contractTerms, [terms], { controlNumber: contract.pncpControlNumber });
    assertArchiveHealthy(archive);
    // Sem data de fim (null), o vencimento só sai dos termos.
    const originalTermEnd = contract.originalTermEnd ?? null;
    if (terms === null) {
      tally.addDetailCount('termsNotFound', 1);
      return { ok: true, expiresOn: originalTermEnd, amendments: [] };
    }
    const expiry = contractExpiryFromTerms(originalTermEnd, terms);
    for (const reason of expiry.invalidTerms) {
      tally.addError({ kind: 'term', controlNumber: contract.pncpControlNumber, reason });
    }
    tally.addDetailCount('termsWithoutEndDate', expiry.undatedTerms);
    return { ok: true, expiresOn: expiry.expiresOn, amendments: expiry.amendments };
  } catch (error) {
    if (!(error instanceof PncpRequestError)) {
      throw error;
    }
    tally.addError({ kind: 'terms', controlNumber: contract.pncpControlNumber, ...error.details, message: error.message });
    return { ok: false };
  }
}

/**
 * Vencimento do contrato. Sem sinal de alteração, vale o fim original e os
 * termos não são consultados. Com o sinal, os termos são consultados se o
 * contrato não está gravado ou se a data de atualização global mudou desde a
 * última conferência; senão, vale o que já foi conferido. Falha do PNCP nos
 * termos conta erro e mantém o que estava gravado (ou o fim original, sem
 * marcar a conferência): a reconsulta da coleta diária tenta de novo depois.
 */
async function resolveContractExpiry(
  context: CollectorContext,
  tally: RunTally,
  archive: RunArchive,
  row: TenderContractRow,
  hasChangeSignal: boolean,
  previous: ContractStoreState | undefined,
  counts: QueryCounts,
): Promise<TenderContractRow> {
  if (!hasChangeSignal) {
    return { ...row, expiresOn: row.originalTermEnd, amendments: null, amendmentsReference: null };
  }

  const reference = row.pncpGlobalUpdatedAt ?? null;
  if (previous && previous.amendmentsReference !== null && previous.amendmentsReference === reference?.slice(0, 19)) {
    return { ...row, expiresOn: previous.expiresOn, amendments: previous.amendments, amendmentsReference: reference };
  }

  const check = await checkContractTerms(context, tally, archive, row);
  if (check.ok) {
    counts.termsChecked += 1;
    return { ...row, expiresOn: check.expiresOn, amendments: check.amendments, amendmentsReference: reference };
  }
  counts.failedTerms.push(row.pncpControlNumber);
  if (previous) {
    return { ...row, expiresOn: previous.expiresOn, amendments: previous.amendments, amendmentsReference: previous.amendmentsReference };
  }
  return { ...row, expiresOn: row.originalTermEnd, amendments: null, amendmentsReference: null };
}

/**
 * Uma página de contratos, na sequência do plano: mapear e validar; ler o que
 * já está gravado (uma consulta para a página); consultar os termos de quem
 * precisa; calcular o vencimento; gravar nas mudanças da execução. Entram todos,
 * de qualquer tipo, vigentes ou encerrados; os sem vencimento são contados à
 * parte. Quem favoritou um contrato que mudou de vencimento recebe
 * CONTRATO_ALTERADO depois da publicação.
 */
async function collectContractPage(
  context: CollectorContext,
  tally: RunTally,
  archive: RunArchive,
  store: RunContractStore,
  records: unknown[],
  counts: QueryCounts,
  stopAt?: number,
): Promise<void> {
  const withoutExpiry: Record<ContractWithoutExpiryReason, number> = { withoutEndDate: 0, implausibleTerm: 0 };
  const candidates: Array<{ row: TenderContractRow; hasChangeSignal: boolean }> = [];
  for (const record of records) {
    const mapped = mapPncpContract(record);
    if (!mapped.ok) {
      tally.addError({ kind: 'record', controlNumber: mapped.controlNumber, reason: mapped.reason });
      continue;
    }
    if (mapped.withoutExpiry) {
      withoutExpiry[mapped.withoutExpiry] += 1;
    }
    candidates.push(mapped);
  }

  const stored = await store.writer.readStates(candidates.map((candidate) => candidate.row.pncpControlNumber));
  const rows: TenderContractRow[] = [];
  for (const { row, hasChangeSignal } of candidates) {
    // Uma página pode exigir centenas de consultas de termos; não consumir a margem de publicação dentro dela.
    if (stopAt !== undefined && context.now().getTime() >= stopAt) {
      counts.completed = false;
      counts.stoppedBy = 'time';
      break;
    }
    const previous = stored.get(row.pncpControlNumber);
    const resolved = await resolveContractExpiry(context, tally, archive, row, hasChangeSignal, previous, counts);
    rows.push(resolved);
  }

  const result = await store.writer.upsert(rows);
  for (const row of rows) {
    const previous = stored.get(row.pncpControlNumber);
    if (result.changedKeys.has(row.pncpControlNumber) && previous && previous.expiresOn !== row.expiresOn) {
      store.noteExpiryChange({ controlNumber: row.pncpControlNumber, expiresOn: row.expiresOn, contractObject: row.contractObject });
    }
  }
  tally.newCount += result.insertedCount;
  tally.updatedCount += result.updatedCount;
  counts.storedCount += rows.length;
  for (const reason of Object.keys(withoutExpiry) as ContractWithoutExpiryReason[]) {
    tally.addDetailCount(WITHOUT_EXPIRY_DETAIL_KEYS[reason], withoutExpiry[reason]);
  }
}

/**
 * Percorre uma consulta de contratos. Toda página lida vai para o arquivo
 * bruto, inclusive os registros que não entram na base. Falha do PNCP encerra
 * só a consulta; falha do armazém ou do banco, a execução.
 */
async function collectContractQuery(
  context: CollectorContext,
  tally: RunTally,
  archive: RunArchive,
  store: RunContractStore,
  endpoint: PncpContractEndpoint,
  params: PncpQueryParams,
  stopAt?: number,
): Promise<QueryCounts> {
  const counts: QueryCounts = { completed: true, recordsRead: 0, storedCount: 0, termsChecked: 0, failedTerms: [], stoppedBy: null };
  const pages = context.contractsPncp.pages(endpoint, params);
  try {
    while (true) {
      counts.stoppedBy = await collectionStopReason(context, stopAt, store.canContinue);
      if (counts.stoppedBy !== null) {
        counts.completed = false;
        break;
      }
      const next = await pages.next();
      if (next.done) {
        break;
      }
      const page = next.value;
      tally.recordsRead += page.records.length;
      counts.recordsRead += page.records.length;
      await archive.append(ARCHIVE_DATASETS.contracts, page.records);
      assertArchiveHealthy(archive);
      await collectContractPage(context, tally, archive, store, page.records, counts, stopAt);
      context.logger.debug('Página de contratos gravada', {
        endpoint,
        params,
        page: page.pageNumber,
        remainingPages: page.remainingPages,
      });
      if (counts.stoppedBy !== null || page.remainingPages <= 0 || page.records.length === 0) {
        break;
      }
    }
  } catch (error) {
    if (error instanceof CollectorResourceLimitError) {
      counts.completed = false;
      counts.stoppedBy = 'disk';
      context.logger.info('Consulta de contratos pausada pelo orçamento de disco', { endpoint });
    } else if (error instanceof PncpRequestError) {
      counts.completed = false;
      tally.addError({ kind: 'request', params, ...error.details, message: error.message });
      context.logger.warn('Consulta de contratos ao PNCP interrompida', { endpoint, params, error });
    } else {
      throw error;
    }
  } finally {
    await pages.return(undefined);
  }
  tally.addDetailCount('termsChecked', counts.termsChecked);
  return counts;
}

/** Janela de uma consulta da coleta diária (dias AAAA-MM-DD, Brasília, inclusive). */
export interface DailyWindow {
  from: string;
  to: string;
}

/**
 * Janela da coleta diária de uma consulta: do último dia que ela leu sem falha
 * do PNCP (sem ele, ou se for depois de ontem, ontem) até hoje, com no máximo
 * DAILY_MAX_WINDOW_DAYS dias depois do início. Num dia normal, de ontem a
 * hoje; depois de uma parada longa, a execução seguinte continua do fim desta.
 */
export function dailyContractWindow(today: string, lastCompletedDay: string | null): DailyWindow {
  const yesterday = addCalendarDays(today, -1);
  const from = lastCompletedDay !== null && lastCompletedDay < yesterday ? lastCompletedDay : yesterday;
  const latestEnd = addCalendarDays(from, DAILY_MAX_WINDOW_DAYS);
  return { from, to: latestEnd < today ? latestEnd : today };
}

/** Uma consulta da coleta diária nos detalhes da execução: de onde a próxima continua. */
export interface DailyQueryDetail extends DailyWindow {
  endpoint: PncpContractEndpoint;
  /** Sem interrupção do PNCP, e com o que foi lido publicado no armazém. Erro de registro ou de termos não conta. */
  completed: boolean;
  recordsRead: number;
}

/** A reconsulta dos termos nos detalhes da execução. */
export interface TermsRetryDetail {
  /** Contratos com termos pendentes antes da reconsulta. */
  pendingAtStart: number;
  /** Contratos com os termos consultados de novo, com ou sem sucesso. */
  checked: number;
  /** Conferidos e gravados: deixam de estar pendentes. */
  resolved: number;
  /** Conferidos com vencimento diferente do gravado. */
  expiryChanged: number;
  failed: number;
  /** Parou depois de MAX_CONSECUTIVE_TERMS_FAILURES falhas seguidas. */
  stoppedByFailures: boolean;
  stoppedByLimit: CollectionLimitReason | null;
}

/**
 * Reconsulta dos termos que falharam antes (na coleta diária ou na carga): até
 * `limit` contratos, da atualização global mais antiga para a mais nova, menos
 * os que falharam nesta execução. Para depois de 3 falhas seguidas do PNCP.
 * Grava nas mudanças da execução no fim, e a publicação leva ao armazém; o que
 * continuar pendente fica para amanhã. Como na coleta, quem favoritou um
 * contrato que mudou de vencimento recebe CONTRATO_ALTERADO.
 */
async function retryPendingTerms(
  context: CollectorContext,
  tally: RunTally,
  archive: RunArchive,
  store: RunContractStore,
  limit: number,
  failedInThisRun: string[],
  stopAt?: number,
): Promise<CollectionLimitReason | null> {
  const summary: TermsRetryDetail = {
    pendingAtStart: await store.writer.countPendingTerms(),
    checked: 0,
    resolved: 0,
    expiryChanged: 0,
    failed: 0,
    stoppedByFailures: false,
    stoppedByLimit: null,
  };
  tally.details['termsRetry'] = summary;
  if (summary.pendingAtStart === 0) {
    return null;
  }

  const pending = await store.writer.readPendingTerms(limit, failedInThisRun);
  const checked: CheckedContractTerms[] = [];
  const expiryChanges: ChangedContractExpiry[] = [];
  let consecutiveFailures = 0;
  for (const contract of pending) {
    summary.stoppedByLimit = await collectionStopReason(context, stopAt, store.canContinue);
    if (summary.stoppedByLimit !== null) {
      break;
    }
    summary.checked += 1;
    const check = await checkContractTerms(context, tally, archive, contract);
    assertArchiveHealthy(archive);
    if (!check.ok) {
      summary.failed += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_TERMS_FAILURES) {
        summary.stoppedByFailures = true;
        break;
      }
      continue;
    }
    consecutiveFailures = 0;
    checked.push({ pncpControlNumber: contract.pncpControlNumber, expiresOn: check.expiresOn, amendments: check.amendments });
    if (check.expiresOn !== contract.expiresOn) {
      expiryChanges.push(changedExpiryOf(contract, check.expiresOn));
    }
  }

  try {
    await store.writer.saveCheckedTerms(checked);
  } catch (error) {
    if (!(error instanceof CollectorResourceLimitError)) {
      throw error;
    }
    summary.stoppedByLimit = 'disk';
    context.logger.info('Reconsulta de termos pausada pelo orçamento de disco', { checked: summary.checked });
    return 'disk';
  }
  for (const change of expiryChanges) {
    store.noteExpiryChange(change);
  }
  summary.resolved = checked.length;
  summary.expiryChanged = expiryChanges.length;
  tally.updatedCount += checked.length;
  context.logger.info('Reconsulta dos termos de contratos', { ...summary });
  return summary.stoppedByLimit;
}

function changedExpiryOf(contract: PendingTermsContract, expiresOn: string | null): ChangedContractExpiry {
  return { controlNumber: contract.pncpControlNumber, expiresOn, contractObject: contract.contractObject };
}

export interface DailyOptions {
  /** Contratos da reconsulta dos termos; sem ele, TERMS_RETRY_LIMIT. */
  termsRetryLimit?: number;
  /** Prazo global da rotina; a coleta deixa a margem de publicação antes dele. */
  deadlineAt?: number;
}

/**
 * Coleta diária: os contratos publicados e os atualizados, cada consulta na
 * sua janela (dailyContractWindow), a reconsulta dos termos que falharam antes e,
 * no fim, a publicação no armazém. Cada consulta entra nos detalhes assim que
 * termina; se a execução falhar antes de publicar, as consultas ficam como não
 * concluídas e a próxima relê as mesmas janelas (o que se leu não foi para o
 * armazém). Processo derrubado não grava detalhes, e a próxima relê desde a
 * última execução completa.
 */
export function runContractsDaily(context: CollectorContext, options: DailyOptions = {}): Promise<RunOutcome> {
  return withCollectionRun(
    context,
    'CONTRATOS_DIARIA',
    COLLECTOR_LOCK_KEYS.contracts,
    async (tally, archive, runId) => {
      const today = brasiliaDate(context.now());
      const lastCompleted = await readLastCompletedDailyDays(context.db);
      const windows = PNCP_CONTRACT_ENDPOINTS.map((endpoint) => ({
        endpoint,
        ...dailyContractWindow(today, lastCompleted[endpoint] ?? null),
      }));
      const froms = windows.map((window) => window.from).sort();
      const tos = windows.map((window) => window.to).sort();
      const queries: DailyQueryDetail[] = [];
      tally.details['today'] = today;
      tally.details['period'] = { dataInicial: toPncpDate(froms[0] ?? today), dataFinal: toPncpDate(tos.at(-1) ?? today) };
      tally.details['queries'] = queries;

      const store = await RunContractStore.open(context, tally, runId, today);
      const stopAt = options.deadlineAt === undefined ? undefined : options.deadlineAt - DEADLINE_MARGIN_MINUTES * 60_000;
      const eligibleQueries: DailyQueryDetail[] = [];
      try {
        const failedTerms: string[] = [];
        let stoppedBy: CollectionLimitReason | null = null;
        for (const { endpoint, from, to } of windows) {
          const params = { dataInicial: toPncpDate(from), dataFinal: toPncpDate(to) };
          const counts = await collectContractQuery(context, tally, archive, store, endpoint, params, stopAt);
          const query: DailyQueryDetail = { endpoint, from, to, completed: false, recordsRead: counts.recordsRead };
          queries.push(query);
          if (counts.completed) {
            eligibleQueries.push(query);
          }
          failedTerms.push(...counts.failedTerms);
          stoppedBy = counts.stoppedBy;
          if (stoppedBy !== null) {
            break;
          }
        }
        if (stoppedBy === null) {
          stoppedBy = await retryPendingTerms(context, tally, archive, store, options.termsRetryLimit ?? TERMS_RETRY_LIMIT, failedTerms, stopAt);
        }
        tally.details['stoppedBy'] = stoppedBy;
        await store.publish(archive, async () => {
          for (const query of eligibleQueries) {
            query.completed = true;
          }
        });
      } finally {
        await store.close();
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
  /** Instante (ms) em que a rotina inteira precisa ter acabado: o bloco usa só o tempo que sobra, menos a folga. */
  deadlineAt?: number;
  /** Dias concluídos entre as publicações; sem ele, BACKFILL_PUBLISH_EVERY_DAYS. */
  publishEveryDays?: number;
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

interface CompletedDay {
  day: string;
  counts: BackfillDayCounts;
}

/**
 * Carga inicial: um dia de publicação por vez, do mais recente para o mais
 * antigo, retomável. O armazém é publicado a cada BACKFILL_PUBLISH_EVERY_DAYS dias
 * concluídos e no fim do bloco, e os dias só são marcados em contrato_carga_dia
 * depois da publicação: um dia com falha do PNCP, ou que a execução não chegou a
 * publicar, fica pendente para a próxima. Antes de cada dia, confere o tempo do
 * bloco e para ao esgotá-lo, com o motivo nos detalhes. O bloco usa só o tempo que
 * sobra da rotina diária (`deadlineAt`), menos a folga. Sem o R2, sem dia
 * pendente ou sem tempo na rotina, não roda.
 */
export async function runContractsBackfill(context: CollectorContext, options: BackfillOptions = {}): Promise<RunOutcome> {
  if (!context.storage) {
    context.logger.warn('Carga de contratos não iniciada', { reason: BACKFILL_NOT_STARTED });
    return { skipped: true, reason: BACKFILL_NOT_STARTED };
  }
  const maxMinutes = backfillBlockMinutes(options.maxMinutes ?? context.config.contracts.backfillMinutes, options.deadlineAt, context.now().getTime());
  if (maxMinutes === null) {
    context.logger.warn('Carga de contratos sem tempo na rotina', { deadlineAt: options.deadlineAt });
    return { skipped: true, reason: BACKFILL_NO_TIME };
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
    async (tally, archive, runId) => {
      const startedAt = context.now().getTime();
      const stopAt = startedAt + maxMinutes * 60_000;
      const { from, to } = range;
      const publishEveryDays = options.publishEveryDays ?? BACKFILL_PUBLISH_EVERY_DAYS;
      const pendingDays = await pendingBackfillDays(context.db, range);

      let daysCompleted = 0;
      let failedDays = 0;
      let consecutiveFailures = 0;
      let stoppedBy: BackfillStopReason | null = null;
      let awaitingPublication: CompletedDay[] = [];

      const store = await RunContractStore.open(context, tally, runId, brasiliaDate(context.now()));
      const publishAndMarkDays = async () => {
        await store.publish(archive, async () => {
          for (const { day, counts } of awaitingPublication) {
            await markBackfillDayCompleted(context.db, day, counts);
            daysCompleted += 1;
            context.logger.info('Dia da carga de contratos concluído', { day, ...counts });
          }
        });
        awaitingPublication = [];
      };

      try {
        for (const day of pendingDays) {
          stoppedBy = await collectionStopReason(context, stopAt, store.canContinue);
          if (stoppedBy !== null) {
            break;
          }

          const pncpDay = toPncpDate(day);
          const counts = await collectContractQuery(context, tally, archive, store, 'contratos', { dataInicial: pncpDay, dataFinal: pncpDay }, stopAt);
          if (counts.stoppedBy !== null) {
            stoppedBy = counts.stoppedBy;
            break;
          }
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
          awaitingPublication.push({
            day,
            counts: { recordsRead: counts.recordsRead, storedCount: counts.storedCount, termsChecked: counts.termsChecked },
          });
          if (awaitingPublication.length >= publishEveryDays) {
            await publishAndMarkDays();
          }
        }
        // As sobras do bloco, e o que dias interrompidos já gravaram nas mudanças.
        if (store.canContinue) {
          await publishAndMarkDays();
        }
      } finally {
        // Também numa falha: os dias que chegaram a ser publicados e marcados ficam registrados.
        const pendingAfter = pendingDays.length - daysCompleted;
        tally.details['backfill'] = {
          from,
          to,
          maxMinutes,
          publishEveryDays,
          totalDays: daysFromNewestToOldest(from, to).length,
          pendingAtStart: pendingDays.length,
          daysCompleted,
          failedDays,
          pendingAfter,
          stoppedBy,
          finished: pendingAfter === 0,
        };
        await store.close();
      }
    },
    () => contractRequests(context),
  );
}

/**
 * Avisos de vencimento do dia (Brasília): 90 e 30 dias, para favoritos e buscas
 * salvas com Notificar, e o total "vigentes agora" de todas as buscas salvas.
 * Lê o armazém publicado (a cópia que a coleta deixou na pasta de trabalho, ou
 * baixada do R2); sem cópia pronta, a execução falha e os avisos esperam a seguinte.
 */
export function runContractReminders(context: CollectorContext): Promise<RunOutcome> {
  return withCollectionRun(context, 'CONTRATOS_AVISOS', COLLECTOR_LOCK_KEYS.contracts, async (tally) => {
    const today = brasiliaDate(context.now());
    tally.details['today'] = today;
    const reader = await ContractStoreReader.create({
      storage: requireStorage(context),
      directory: context.contractWorkDirectory,
      logger: context.logger,
    });
    try {
      await reader.refresh();
      if (!reader.status().ready) {
        throw new Error('O armazém de contratos não respondeu: os avisos ficam para a próxima execução');
      }
      const notificationContext = { db: context.db, contractStore: reader, now: context.now, logger: context.logger };
      tally.notificationCount += await notifyContractExpirations(notificationContext, today);
      tally.details['savedSearchTotals'] = { ...(await updateSavedSearchTotals(notificationContext)) };
    } finally {
      await reader.close();
    }
  });
}
