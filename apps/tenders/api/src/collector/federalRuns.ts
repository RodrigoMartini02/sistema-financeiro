import { AGENCIES_ENDPOINT, CONTRACTS_BY_END_ENDPOINT, CONTRACTS_BY_START_ENDPOINT, UNITS_ENDPOINT, type ComprasGovEndpoint, type ComprasGovWindow } from './comprasGovClient';
import type { ContractUpsertResult } from '../contractStore/writer';
import { ARCHIVE_DATASETS, type RunArchive } from './archive';
import { assertArchiveHealthy, backfillBlockMinutes, collectionStopReason, type CollectionLimitReason } from './blockTime';
import type { TenderContractRow } from './contractMapping';
import { addCalendarDays, brasiliaDate } from './dates';
import {
  federalRecentFrom,
  inclusionOf,
  isLaterRegistration,
  mapFederalContract,
  parseFederalAgency,
  parseFederalUnit,
  pncpAgencyCnpjOf,
  resolveAgencyCnpj,
  type FederalAgency,
  type FederalMappingContext,
  type FederalSkipReason,
  type FederalUnit,
} from './federalMapping';
import {
  markFederalCycle,
  markFederalLoad,
  markFederalRemeasure,
  readAllFederalAgencies,
  readCycleAgencies,
  readFederalAgency,
  readFederalProgress,
  readLoadAgencies,
  readRemeasureAgencies,
  syncFederalAgencies,
  type FederalAgencyState,
  type FederalReadMark,
} from './federalProgress';
import { readFederal } from './federalSource';
import { maskPersonDocument } from './resultMapping';
import { COLLECTOR_LOCK_KEYS } from './repository';
import { CollectorResourceLimitError } from './resourceBudget';
import { RunContractStore } from './runContractStore';
import { withCollectionRun, type CollectorContext, type RunOutcome, type RunTally } from './runs';

// Execuções dos contratos federais do Compras.gov.br (plano .plans/licitacoes-contratos-federais.md): a carga (por órgão
// e ano de início da vigência, do ano atual para trás) e o ciclo de 7 dias (os vigentes pelo fim da vigência e os
// iniciados nos últimos 120 dias, só nos órgãos com contrato na fonte). As duas gravam no armazém de contratos do R2, com
// a trava dos contratos, e ficam registradas em licitacoes.coleta_execucao com o arquivo bruto (CPF mascarado).
//
// O que a execução leu só vale como "lido" depois da publicação: o andamento de cada órgão (federalProgress.ts) só é
// gravado depois de o armazém publicar, e o arquivo bruto é descarregado antes de publicar. Cada janela (órgão e ano, ou
// órgão e faixa do ciclo) só vale quando traz todas as linhas que a fonte anunciou (federalSource.ts). Falha da fonte
// encerra só a janela (e o órgão); falha do armazém ou do banco, a execução. Fonte sem dado novo não é falha: o módulo de
// contratos do Compras.gov.br está parado desde o começo de setembro de 2026, e o ciclo termina com sucesso, mostrando
// até quando a fonte tem dado.

/** Janelas lidas entre as publicações do armazém: processo derrubado perde só essas, que ficam pendentes. */
export const FEDERAL_PUBLISH_EVERY_WINDOWS = 25;
/** Janelas seguidas com falha da fonte que encerram o bloco (a fonte está fora do ar). */
const MAX_CONSECUTIVE_FAILED_WINDOWS = 3;
/** Contratos mapeados por consulta de estado e gravação no armazém: limita a memória e o tamanho da consulta de busca. */
const UPSERT_BATCH_SIZE = 500;
/** Acima desta fração de linhas inválidas (com pelo menos 100 lidas numa janela), a execução falha: provável mudança de formato. */
export const FEDERAL_MAX_INVALID_RATIO = 0.05;
const MIN_ROWS_FOR_INVALID_RATIO = 100;
/** O ciclo lê os vigentes desde tantos dias atrás (o que venceu há pouco ainda interessa a quem favoritou). */
const CYCLE_LOOKBACK_DAYS = 30;
/** O ciclo lê os contratos iniciados nos últimos tantos dias. */
const CYCLE_RECENT_DAYS = 120;
/** O ciclo procura vigentes até esta distância do maior fim visto, no mínimo um ano à frente, e no máximo tantos anos. */
const CYCLE_HORIZON_MIN_DAYS = 365;
const CYCLE_HORIZON_MAX_YEARS = 15;
/** A fonte recusa janela com o fim a mais de 365 dias do início. */
const MAX_WINDOW_SPAN_DAYS = 365;

export const FEDERAL_LOAD_NOT_STARTED = 'carga de contratos federais não iniciada: R2 não configurado';
export const FEDERAL_LOAD_FINISHED = 'carga de contratos federais concluída: nenhum órgão pendente';
export const FEDERAL_LOAD_NO_TIME = 'sem tempo na rotina para a carga de contratos federais';
export const FEDERAL_CYCLE_NOT_STARTED = 'ciclo de contratos federais não iniciado: R2 não configurado';
export const FEDERAL_CYCLE_NO_TIME = 'sem tempo na rotina para o ciclo de contratos federais';

/** Por que o bloco parou antes de terminar os órgãos pendentes. */
export type FederalStopReason = CollectionLimitReason | 'source';

// --- Janelas (puras) ---

/** O ano de início da vigência inteiro: sempre cabe nos 365 dias da fonte (o ano bissexto tem o fim a 365 dias do início). */
export function yearWindow(year: number): ComprasGovWindow {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * Os anos que a carga ainda lê de um órgão, do mais recente para o mais antigo: do ano atual até `fromYear`, ou, retomando,
 * do ano anterior ao mais antigo já lido até `fromYear`. Com `repair`, todos os anos da faixa.
 */
export function loadYears(currentYear: number, oldestLoadedYear: number | null, fromYear: number, repair: boolean): number[] {
  const newest = repair || oldestLoadedYear === null ? currentYear : oldestLoadedYear - 1;
  const years: number[] = [];
  for (let year = newest; year >= fromYear; year -= 1) {
    years.push(year);
  }
  return years;
}

/** Divide de `from` a `to` em janelas de até 365 dias de distância, uma depois da outra e sem sobreposição. */
export function splitIntoWindows(from: string, to: string): ComprasGovWindow[] {
  const windows: ComprasGovWindow[] = [];
  for (let start = from; start <= to; ) {
    const limit = addCalendarDays(start, MAX_WINDOW_SPAN_DAYS);
    const end = limit < to ? limit : to;
    windows.push({ from: start, to: end });
    start = addCalendarDays(end, 1);
  }
  return windows;
}

function addYearsToDate(date: string, years: number): string {
  const [year, month, day] = date.split('-');
  return `${String(Number(year) + years).padStart(4, '0')}-${month}-${day}`;
}

/**
 * Janelas dos vigentes do ciclo, pelo fim da vigência: de 30 dias atrás até o maior fim visto do órgão (no mínimo um ano
 * à frente e no máximo 15 anos), em janelas de até 365 dias.
 */
export function cycleCurrentWindows(today: string, latestEnd: string | null): ComprasGovWindow[] {
  const from = addCalendarDays(today, -CYCLE_LOOKBACK_DAYS);
  const minimum = addCalendarDays(today, CYCLE_HORIZON_MIN_DAYS);
  const cap = addYearsToDate(today, CYCLE_HORIZON_MAX_YEARS);
  const wanted = latestEnd !== null && latestEnd > minimum ? latestEnd : minimum;
  return splitIntoWindows(from, wanted < cap ? wanted : cap);
}

/** Janela dos contratos iniciados nos últimos 120 dias, pelo início da vigência. */
export function cycleRecentWindow(today: string): ComprasGovWindow {
  return { from: addCalendarDays(today, -CYCLE_RECENT_DAYS), to: today };
}

/** Janelas da medição de um órgão sem dado: o ano anterior e o atual, pelo início da vigência. */
export function remeasureWindows(today: string): ComprasGovWindow[] {
  const year = Number(today.slice(0, 4));
  return [yearWindow(year - 1), yearWindow(year)];
}

// --- Números da execução ---

type SkipCounts = Record<FederalSkipReason, number>;

class FederalMetrics {
  pages = 0;
  windows = 0;
  incompleteWindows = 0;
  failedWindows = 0;
  /** Leituras além da primeira, feitas porque a anterior deixou linha de fora. */
  extraPasses = 0;
  /** Janelas divididas ao meio porque não completavam. */
  splits = 0;
  repeatedRows = 0;
  rowsRead = 0;
  mapped = 0;
  invalid = 0;
  collidingKeys = 0;
  /** Linhas que não sobrescreveram uma inclusão mais recente do mesmo contrato já gravada (a fonte o registra duas vezes). */
  supersededRows = 0;
  withoutEndDate = 0;
  implausibleTerm = 0;
  cnpjLearned = 0;
  agenciesRead = 0;
  readonly skipped: SkipCounts = { withPncpNumber: 0, excluded: 0, recent: 0, agencyWithoutCnpj: 0, termEndsBeforeStart: 0, pncpTwin: 0 };
  fetchMs = 0;
  applyMs = 0;
  publishMs = 0;
  /** Maior inclusão vista nas linhas lidas: até quando a fonte tem dado. */
  lastInclusion: string | null = null;

  seeInclusion(value: string | null): void {
    if (value !== null && (this.lastInclusion === null || value > this.lastInclusion)) {
      this.lastInclusion = value;
    }
  }

  toDetails(): Record<string, unknown> {
    return {
      pages: this.pages,
      windows: this.windows,
      incompleteWindows: this.incompleteWindows,
      failedWindows: this.failedWindows,
      extraPasses: this.extraPasses,
      splits: this.splits,
      repeatedRows: this.repeatedRows,
      rowsRead: this.rowsRead,
      mapped: this.mapped,
      invalid: this.invalid,
      collidingKeys: this.collidingKeys,
      supersededRows: this.supersededRows,
      withoutEndDate: this.withoutEndDate,
      implausibleTerm: this.implausibleTerm,
      cnpjLearned: this.cnpjLearned,
      agenciesRead: this.agenciesRead,
      skipped: { ...this.skipped },
      fetchMs: Math.round(this.fetchMs),
      applyMs: Math.round(this.applyMs),
      publishMs: Math.round(this.publishMs),
    };
  }
}

// --- Leitura de uma janela ---

/** O que a leitura de uma janela de um órgão deixou, para o andamento dele. */
interface WindowOutcome {
  /** Todas as linhas que a fonte anunciou vieram e foram aplicadas. */
  completed: boolean;
  /** A fonte falhou (pedido sem resposta aproveitável): as outras janelas tendem a falhar também. */
  sourceFailed: boolean;
  /** Linhas que viram contrato, ou que entrariam logo (carência) ou vieram inválidas: o órgão tem dado a aproveitar. */
  ingestible: number;
  latestEnd: string | null;
  lastInclusion: string | null;
  /** CNPJ do PNCP aprendido dos números de controle das linhas desta janela. */
  learnedCnpj: string | null;
  stoppedBy: CollectionLimitReason | null;
}

/** O andamento de um órgão ao longo de uma execução, até a publicação. */
class AgencyProgress {
  ingestible = 0;
  latestEnd: string | null = null;
  lastInclusion: string | null = null;
  pncpCnpj: string | null = null;
  /** Ano de início da vigência mais antigo lido (só a carga). */
  oldestYear: number | null = null;
  /** A carga chegou ao ano `fromYear`. */
  finished = false;
  /** Janelas lidas por inteiro e ainda não publicadas. */
  windows = 0;

  absorb(outcome: WindowOutcome): void {
    this.ingestible += outcome.ingestible;
    if (outcome.latestEnd !== null && (this.latestEnd === null || outcome.latestEnd > this.latestEnd)) {
      this.latestEnd = outcome.latestEnd;
    }
    if (outcome.lastInclusion !== null && (this.lastInclusion === null || outcome.lastInclusion > this.lastInclusion)) {
      this.lastInclusion = outcome.lastInclusion;
    }
    this.windows += 1;
  }

  toMark(code: string): FederalReadMark {
    return { code, hadRows: this.ingestible > 0, latestEnd: this.latestEnd, lastInclusion: this.lastInclusion, pncpCnpj: this.pncpCnpj };
  }
}

/** A lista de órgãos federais e a de unidades gestoras, lidas da fonte no começo de cada execução. */
interface FederalDirectory {
  units: ReadonlyMap<string, FederalUnit>;
}

/**
 * Atualiza a lista de órgãos federais no banco e lê a lista de unidades gestoras (UF e município dos contratos). A lista
 * de órgãos incompleta ou com falha mantém a que já estava no banco (só falha se o banco ainda não tem nenhuma); a de
 * unidades incompleta falha a execução: contrato gravado sem UF e município não seria corrigido depois.
 */
async function prepareDirectory(context: CollectorContext, tally: RunTally): Promise<FederalDirectory> {
  const agencies = await readFederal(context.comprasGov, { endpoint: AGENCIES_ENDPOINT, params: { statusOrgao: 'true' }, window: null });
  const federal = agencies.rows.map(parseFederalAgency).filter((agency): agency is FederalAgency => agency !== null);
  if (agencies.complete && federal.length > 0) {
    const synced = await syncFederalAgencies(context.db, federal);
    tally.details['agencies'] = { total: synced.total, inserted: synced.inserted, updated: synced.updated, withoutCnpj: federal.filter((agency) => agency.cnpj === null).length };
  } else {
    const message = agencies.failure?.message ?? `A lista de órgãos veio incompleta: ${agencies.rows.length} de ${agencies.announced}`;
    tally.addError({ kind: 'agencies', message });
    context.logger.warn('Lista de órgãos federais não atualizada', { announced: agencies.announced, rows: agencies.rows.length });
    if ((await readFederalProgress(context.db, 0)).agencies === 0) {
      throw new Error(`Sem a lista de órgãos federais da fonte e sem nenhuma no banco: ${message}`);
    }
  }

  const unitList = await readFederal(context.comprasGov, { endpoint: UNITS_ENDPOINT, params: { statusUasg: 'true' }, window: null });
  if (!unitList.complete) {
    throw new Error(unitList.failure?.message ?? `A lista de unidades gestoras veio incompleta: ${unitList.rows.length} de ${unitList.announced}`);
  }
  const units = new Map<string, FederalUnit>();
  for (const raw of unitList.rows) {
    const unit = parseFederalUnit(raw);
    if (unit !== null) {
      units.set(unit.code, unit);
    }
  }
  tally.details['units'] = units.size;
  return { units };
}

/** O CNPJ mais frequente entre os números de controle do PNCP das linhas; nulo sem nenhum. */
function learnedCnpjOf(rows: readonly unknown[]): string | null {
  const counts = new Map<string, number>();
  for (const raw of rows) {
    const cnpj = pncpAgencyCnpjOf(raw);
    if (cnpj !== null) {
      counts.set(cnpj, (counts.get(cnpj) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

interface MappedWindowRows {
  contracts: Map<string, { row: TenderContractRow; raw: unknown }>;
  refused: unknown[];
  ingestible: number;
  latestEnd: string | null;
  lastInclusion: string | null;
}

/** Mapeia as linhas de uma janela; a colisão da chave fica com a inclusão mais recente. Conta o que entra, o que é pulado e o que é inválido. */
function mapWindowRows(
  tally: RunTally,
  metrics: FederalMetrics,
  agency: FederalAgencyState,
  window: ComprasGovWindow,
  rows: readonly unknown[],
  context: FederalMappingContext,
): MappedWindowRows {
  const result: MappedWindowRows = { contracts: new Map(), refused: [], ingestible: 0, latestEnd: null, lastInclusion: null };
  let invalid = 0;
  const seeInclusion = (value: string | null) => {
    if (value !== null && (result.lastInclusion === null || value > result.lastInclusion)) {
      result.lastInclusion = value;
    }
  };

  for (const raw of rows) {
    const mapped = mapFederalContract(raw, context);
    if (!mapped.ok && mapped.kind === 'invalid') {
      invalid += 1;
      result.ingestible += 1;
      seeInclusion(inclusionOf(raw));
      tally.addError({ kind: 'record', agency: agency.code, reason: mapped.reason });
      result.refused.push(raw);
      continue;
    }
    if (!mapped.ok) {
      metrics.skipped[mapped.reason] += 1;
      seeInclusion(mapped.includedAt);
      if (mapped.reason === 'recent') {
        result.ingestible += 1;
      }
      continue;
    }
    result.ingestible += 1;
    seeInclusion(mapped.includedAt);
    if (mapped.withoutExpiry === 'withoutEndDate') {
      metrics.withoutEndDate += 1;
    } else if (mapped.withoutExpiry === 'implausibleTerm') {
      metrics.implausibleTerm += 1;
    }
    if (mapped.row.originalTermEnd !== null && (result.latestEnd === null || mapped.row.originalTermEnd > result.latestEnd)) {
      result.latestEnd = mapped.row.originalTermEnd;
    }
    const previous = result.contracts.get(mapped.row.pncpControlNumber);
    if (previous === undefined) {
      result.contracts.set(mapped.row.pncpControlNumber, { row: mapped.row, raw });
    } else {
      metrics.collidingKeys += 1;
      if (isLaterRegistration(mapped.row, previous.row)) {
        result.contracts.set(mapped.row.pncpControlNumber, { row: mapped.row, raw });
      }
    }
  }

  metrics.invalid += invalid;
  metrics.mapped += result.contracts.size;
  // Muitas linhas fora do formato: provável mudança na fonte. Falha antes de publicar, e nada é dado como lido.
  if (rows.length >= MIN_ROWS_FOR_INVALID_RATIO && invalid / rows.length > FEDERAL_MAX_INVALID_RATIO) {
    throw new Error(
      `${invalid} de ${rows.length} linhas fora do formato no órgão ${agency.code}, ${window.from} a ${window.to} (mais de ${FEDERAL_MAX_INVALID_RATIO * 100}%): a fonte pode ter mudado de formato`,
    );
  }
  return result;
}

/**
 * Lê uma janela de um órgão, mapeia e aplica ao armazém (as mudanças da execução, ainda sem publicar). O arquivo bruto
 * recebe, com o CPF mascarado, o que entrou ou mudou e o que foi recusado. As linhas que chegaram antes de uma falha
 * também são aplicadas: a gravação é idempotente, e a janela só fica como não lida.
 */
async function readAgencyWindow(
  context: CollectorContext,
  tally: RunTally,
  archive: RunArchive,
  store: RunContractStore,
  metrics: FederalMetrics,
  directory: FederalDirectory,
  agency: FederalAgencyState,
  endpoint: ComprasGovEndpoint,
  window: ComprasGovWindow,
  stopAt: number,
): Promise<WindowOutcome> {
  const fetchStartedAt = performance.now();
  let stoppedBy: CollectionLimitReason | null = null;
  const read = await readFederal(context.comprasGov, {
    endpoint,
    params: { codigoOrgao: agency.code },
    window,
    beforePage: async () => {
      stoppedBy = await collectionStopReason(context, stopAt, store.canContinue);
      return stoppedBy === null;
    },
  });
  metrics.fetchMs += performance.now() - fetchStartedAt;
  metrics.windows += 1;
  metrics.pages += read.pages;
  metrics.extraPasses += Math.max(0, read.passes - 1);
  metrics.splits += read.splits;
  metrics.repeatedRows += read.repeated;
  metrics.rowsRead += read.rows.length;
  tally.recordsRead += read.rows.length;
  if (read.stoppedByLimit) {
    return { completed: false, sourceFailed: false, ingestible: 0, latestEnd: null, lastInclusion: null, learnedCnpj: null, stoppedBy };
  }

  // O CNPJ do PNCP vem das linhas desta janela; sem elas, do que já se aprendeu do órgão, e por último da matriz do cadastro.
  const learned = learnedCnpjOf(read.rows);
  if (learned !== null && learned !== agency.pncpCnpj) {
    metrics.cnpjLearned += 1;
    agency.pncpCnpj = learned;
  }
  const mappingContext: FederalMappingContext = {
    agencyCnpj: resolveAgencyCnpj(agency.pncpCnpj, agency.registeredCnpj),
    units: directory.units,
    recentFrom: federalRecentFrom(context.now()),
  };
  const mapped = mapWindowRows(tally, metrics, agency, window, read.rows, mappingContext);
  metrics.seeInclusion(mapped.lastInclusion);

  // A fonte deixa de ligar ao PNCP contratos que ele tem (5% na UFMG): quem tem gêmeo lá não entra duas vezes.
  const twinStartedAt = performance.now();
  const twins = await store.writer.findPncpTwins([...mapped.contracts.values()].map(({ row }) => row));
  metrics.applyMs += performance.now() - twinStartedAt;
  for (const key of twins) {
    mapped.contracts.delete(key);
  }
  metrics.skipped.pncpTwin += twins.size;
  metrics.mapped -= twins.size;
  mapped.ingestible -= twins.size;

  const contracts = [...mapped.contracts.values()];
  await archive.append(ARCHIVE_DATASETS.federalContracts, mapped.refused.map((raw) => maskPersonDocument(raw)));
  assertArchiveHealthy(archive);
  for (let start = 0; start < contracts.length; start += UPSERT_BATCH_SIZE) {
    stoppedBy = await collectionStopReason(context, stopAt, store.canContinue);
    if (stoppedBy !== null) {
      break;
    }
    const batch = contracts.slice(start, start + UPSERT_BATCH_SIZE);
    const applyStartedAt = performance.now();
    const states = await store.writer.readStates(batch.map(({ row }) => row.pncpControlNumber));
    // A fonte registra o mesmo contrato duas vezes (cerca de 0,3%), às vezes com anos de início diferentes, e cada janela
    // devolve uma das duas: a inclusão mais antiga não sobrescreve a mais recente que já está gravada. Sem isso, o
    // contrato alternaria a cada leitura, e o armazém seria publicado de novo toda semana por causa dele.
    const current = batch.filter(({ row }) => {
      const previous = states.get(row.pncpControlNumber);
      const superseded = previous?.publishedAt != null && previous.publishedAt > row.publishedAt;
      if (superseded) {
        metrics.supersededRows += 1;
      }
      return !superseded;
    });
    let result: ContractUpsertResult;
    try {
      result = await store.writer.upsert(current.map(({ row }) => row));
    } catch (error) {
      if (!(error instanceof CollectorResourceLimitError)) {
        throw error;
      }
      stoppedBy = 'disk';
      break;
    }
    metrics.applyMs += performance.now() - applyStartedAt;
    tally.newCount += result.insertedCount;
    tally.updatedCount += result.updatedCount;
    const rawsToArchive: unknown[] = [];
    for (const { row, raw } of current) {
      if (result.changedKeys.has(row.pncpControlNumber)) {
        rawsToArchive.push(maskPersonDocument(raw));
        const previous = states.get(row.pncpControlNumber);
        if (previous && previous.expiresOn !== row.expiresOn) {
          store.noteExpiryChange({ controlNumber: row.pncpControlNumber, expiresOn: row.expiresOn, contractObject: row.contractObject });
        }
      }
    }
    await archive.append(ARCHIVE_DATASETS.federalContracts, rawsToArchive);
    assertArchiveHealthy(archive);
  }

  let completed = read.complete && stoppedBy === null;
  if (read.failure !== null) {
    metrics.failedWindows += 1;
    tally.addError({ kind: 'request', agency: agency.code, window, ...read.failure.details, message: read.failure.message });
    context.logger.warn('Consulta de contratos federais interrompida', { agency: agency.code, window, error: read.failure });
  } else if (!read.complete) {
    // A fonte não avisa quando entrega páginas que não se encaixam: ela diz quantas linhas tem, e menos linhas não é janela lida.
    metrics.incompleteWindows += 1;
    tally.addError({
      kind: 'incomplete',
      agency: agency.code,
      window,
      announced: read.announced,
      distinct: read.rows.length,
      passes: read.passes,
      message: `Órgão ${agency.code}, ${window.from} a ${window.to}: a fonte informou ${read.announced} registros, mas só ${read.rows.length} vieram, mesmo depois de ${read.passes} leituras`,
    });
    completed = false;
  }
  return {
    completed,
    sourceFailed: read.failure !== null,
    ingestible: mapped.ingestible,
    latestEnd: mapped.latestEnd,
    lastInclusion: mapped.lastInclusion,
    learnedCnpj: learned,
    stoppedBy,
  };
}

/** Publica o armazém (com o bruto já enviado) e só então grava o andamento do que foi lido. */
async function publishThen(archive: RunArchive, store: RunContractStore, metrics: FederalMetrics, mark: () => Promise<void>): Promise<void> {
  const startedAt = performance.now();
  await store.publish(archive, mark);
  metrics.publishMs += performance.now() - startedAt;
}

function allowedByOption(agency: FederalAgencyState, code: string | undefined): boolean {
  return code === undefined || agency.code === code;
}

// --- Carga ---

export interface FederalLoadOptions {
  /** Só este órgão; com ele (ou com `from`), é reparo: lê todos os anos da faixa, mesmo os já lidos. */
  agencyCode?: string;
  /** Primeiro dia de início de vigência; só o ano conta. Sem ele, TENDERS_FEDERAL_FROM. */
  from?: string;
  /** Tempo do bloco; sem ele, TENDERS_FEDERAL_MINUTES. */
  maxMinutes?: number;
  /** Instante (ms) em que a rotina inteira precisa ter acabado: o bloco usa só o tempo que sobra, menos a folga. */
  deadlineAt?: number;
  /** Janelas entre as publicações; sem ele, FEDERAL_PUBLISH_EVERY_WINDOWS. */
  publishEveryWindows?: number;
}

/**
 * Carga dos contratos federais: por órgão, do ano atual para trás até o ano de `TENDERS_FEDERAL_FROM`, uma janela por ano
 * de início da vigência, e cada janela só vale se vier completa. Retomável (o ano mais antigo lido fica em
 * federal_orgao) e em blocos com limite de tempo. O armazém é publicado a cada FEDERAL_PUBLISH_EVERY_WINDOWS janelas e no
 * fim do bloco, e o andamento só é gravado depois de publicar. Janela que falha deixa o órgão parado no ano anterior, e o
 * bloco segue para o próximo órgão. Sem o R2, sem órgão pendente ou sem tempo na rotina, não roda e não abre execução.
 */
export async function runFederalLoad(context: CollectorContext, options: FederalLoadOptions = {}): Promise<RunOutcome> {
  if (!context.storage) {
    context.logger.warn('Carga de contratos federais não iniciada', { reason: FEDERAL_LOAD_NOT_STARTED });
    return { skipped: true, reason: FEDERAL_LOAD_NOT_STARTED };
  }
  const maxMinutes = backfillBlockMinutes(options.maxMinutes ?? context.config.federal.minutes, options.deadlineAt, context.now().getTime());
  if (maxMinutes === null) {
    context.logger.warn('Carga de contratos federais sem tempo na rotina', { deadlineAt: options.deadlineAt });
    return { skipped: true, reason: FEDERAL_LOAD_NO_TIME };
  }
  const repair = options.agencyCode !== undefined || options.from !== undefined;
  const fromYear = Number((options.from ?? context.config.federal.from).slice(0, 4));
  const known = (await readFederalProgress(context.db, fromYear)).agencies;
  if (known > 0 && !repair && (await readLoadAgencies(context.db, fromYear)).length === 0) {
    context.logger.info('Carga de contratos federais sem órgão pendente', { fromYear });
    return { skipped: true, reason: FEDERAL_LOAD_FINISHED };
  }
  const publishEvery = options.publishEveryWindows ?? FEDERAL_PUBLISH_EVERY_WINDOWS;

  return withCollectionRun(
    context,
    'FEDERAIS_CARGA',
    COLLECTOR_LOCK_KEYS.contracts,
    async (tally, archive, runId) => {
      const startedAt = context.now().getTime();
      const stopAt = startedAt + maxMinutes * 60_000;
      const today = brasiliaDate(context.now());
      const currentYear = Number(today.slice(0, 4));
      const metrics = new FederalMetrics();
      const directory = await prepareDirectory(context, tally);

      const candidates = repair ? await readAllFederalAgencies(context.db) : await readLoadAgencies(context.db, fromYear);
      const pending = candidates.filter((agency) => allowedByOption(agency, options.agencyCode));
      if (options.agencyCode !== undefined && pending.length === 0) {
        tally.addError({ kind: 'agency', agency: options.agencyCode, message: 'Órgão federal não encontrado na lista da fonte' });
      }

      const store = await RunContractStore.open(context, tally, runId, today);
      let agenciesCompleted = 0;
      let windowsSincePublish = 0;
      let consecutiveFailures = 0;
      let stoppedBy: FederalStopReason | null = null;
      let awaiting = new Map<string, AgencyProgress>();

      const publishAndMark = async () => {
        await publishThen(archive, store, metrics, async () => {
          for (const [code, progress] of awaiting) {
            if (progress.oldestYear === null) {
              continue;
            }
            await markFederalLoad(context.db, { ...progress.toMark(code), oldestYear: progress.oldestYear, finished: progress.finished }, context.now());
            if (progress.finished) {
              agenciesCompleted += 1;
              context.logger.info('Órgão da carga de contratos federais concluído', { agency: code, ingestible: progress.ingestible });
            }
          }
        });
        awaiting = new Map();
        windowsSincePublish = 0;
      };

      try {
        agencies: for (const agency of pending) {
          const years = loadYears(currentYear, agency.oldestLoadedYear, fromYear, repair);
          if (years.length === 0) {
            continue;
          }
          metrics.agenciesRead += 1;
          let progress = awaiting.get(agency.code) ?? new AgencyProgress();
          awaiting.set(agency.code, progress);

          for (const year of years) {
            stoppedBy = await collectionStopReason(context, stopAt, store.canContinue);
            if (stoppedBy !== null) {
              break agencies;
            }
            const outcome = await readAgencyWindow(context, tally, archive, store, metrics, directory, agency, CONTRACTS_BY_START_ENDPOINT, yearWindow(year), stopAt);
            if (outcome.stoppedBy !== null) {
              stoppedBy = outcome.stoppedBy;
              break agencies;
            }
            if (!outcome.completed) {
              consecutiveFailures += 1;
              if (consecutiveFailures >= MAX_CONSECUTIVE_FAILED_WINDOWS) {
                stoppedBy = 'source';
                break agencies;
              }
              // O órgão fica parado neste ano (o andamento é um ano só): a próxima execução o retoma daqui.
              break;
            }
            consecutiveFailures = 0;
            progress.absorb(outcome);
            progress.oldestYear = year;
            progress.finished = year <= fromYear;
            if (outcome.learnedCnpj !== null) {
              progress.pncpCnpj = outcome.learnedCnpj;
            }
            windowsSincePublish += 1;
            if (windowsSincePublish >= publishEvery) {
              await publishAndMark();
              // O órgão segue nos anos mais antigos: o andamento dali em diante começa de novo (o já publicado ficou marcado).
              progress = new AgencyProgress();
              awaiting.set(agency.code, progress);
            }
          }
        }
        // As sobras do bloco, e o que janelas interrompidas já gravaram nas mudanças.
        if (store.canContinue) {
          await publishAndMark();
        }
      } finally {
        const progressNow = await readFederalProgress(context.db, fromYear);
        tally.details['backfill'] = {
          fromYear,
          maxMinutes,
          publishEveryWindows: publishEvery,
          repair,
          pendingAtStart: pending.length,
          agenciesCompleted,
          totalAgencies: progressNow.agencies,
          agenciesLoaded: progressNow.loaded,
          withData: progressNow.withData,
          stoppedBy,
          finished: progressNow.agencies > 0 && progressNow.loaded >= progressNow.agencies,
        };
        tally.details['metrics'] = metrics.toDetails();
        tally.details['sourceLastInclusion'] = metrics.lastInclusion;
        await store.close();
      }
    },
    () => context.comprasGov.requestCount,
  );
}

// --- Ciclo ---

export interface FederalCycleOptions {
  /** Só este órgão, mesmo sem dado e mesmo com o ciclo em dia (reparo). */
  agencyCode?: string;
  /** Tempo do bloco; sem ele, TENDERS_FEDERAL_MINUTES. */
  maxMinutes?: number;
  deadlineAt?: number;
  publishEveryWindows?: number;
}

/**
 * Ciclo de 7 dias dos contratos federais: nos órgãos com contrato na fonte, os vigentes (pelo fim da vigência, de 30 dias
 * atrás até o maior fim visto) e os iniciados nos últimos 120 dias; os órgãos sem dado são medidos de novo a cada 90 dias
 * (o ano anterior e o atual). Cada órgão só é marcado como lido depois de todas as janelas dele virem completas e o
 * armazém publicar. Fonte sem dado novo não é falha. Atualiza também a lista de órgãos federais e a de unidades.
 */
export async function runFederalCycle(context: CollectorContext, options: FederalCycleOptions = {}): Promise<RunOutcome> {
  if (!context.storage) {
    context.logger.warn('Ciclo de contratos federais não iniciado', { reason: FEDERAL_CYCLE_NOT_STARTED });
    return { skipped: true, reason: FEDERAL_CYCLE_NOT_STARTED };
  }
  const maxMinutes = backfillBlockMinutes(options.maxMinutes ?? context.config.federal.minutes, options.deadlineAt, context.now().getTime());
  if (maxMinutes === null) {
    context.logger.warn('Ciclo de contratos federais sem tempo na rotina', { deadlineAt: options.deadlineAt });
    return { skipped: true, reason: FEDERAL_CYCLE_NO_TIME };
  }
  const publishEvery = options.publishEveryWindows ?? FEDERAL_PUBLISH_EVERY_WINDOWS;

  return withCollectionRun(
    context,
    'FEDERAIS_CICLO',
    COLLECTOR_LOCK_KEYS.contracts,
    async (tally, archive, runId) => {
      const startedAt = context.now().getTime();
      const stopAt = startedAt + maxMinutes * 60_000;
      const today = brasiliaDate(context.now());
      const metrics = new FederalMetrics();
      const directory = await prepareDirectory(context, tally);

      let cycleAgencies: FederalAgencyState[];
      let remeasureAgencies: FederalAgencyState[];
      if (options.agencyCode !== undefined) {
        const one = await readFederalAgency(context.db, options.agencyCode);
        if (one === null) {
          tally.addError({ kind: 'agency', agency: options.agencyCode, message: 'Órgão federal não encontrado na lista da fonte' });
        }
        cycleAgencies = one !== null && one.hasData !== false ? [one] : [];
        remeasureAgencies = one !== null && one.hasData === false ? [one] : [];
      } else {
        cycleAgencies = await readCycleAgencies(context.db, context.now());
        remeasureAgencies = await readRemeasureAgencies(context.db, context.now());
      }

      const store = await RunContractStore.open(context, tally, runId, today);
      let agenciesRead = 0;
      let windowsSincePublish = 0;
      let consecutiveFailures = 0;
      let stoppedBy: FederalStopReason | null = null;
      let awaiting: Array<{ code: string; kind: 'cycle' | 'remeasure'; progress: AgencyProgress; readAt: Date }> = [];

      const publishAndMark = async () => {
        await publishThen(archive, store, metrics, async () => {
          for (const { code, kind, progress, readAt } of awaiting) {
            const mark = progress.toMark(code);
            await (kind === 'cycle' ? markFederalCycle(context.db, mark, readAt) : markFederalRemeasure(context.db, mark, readAt));
            agenciesRead += 1;
          }
        });
        awaiting = [];
        windowsSincePublish = 0;
      };

      /** Lê todas as janelas do órgão; só se todas vierem completas ele entra na fila da publicação. */
      const readAgency = async (agency: FederalAgencyState, kind: 'cycle' | 'remeasure'): Promise<'done' | FederalStopReason> => {
        const plan: Array<{ endpoint: ComprasGovEndpoint; window: ComprasGovWindow }> =
          kind === 'cycle'
            ? [
                ...cycleCurrentWindows(today, agency.latestEnd).map((window) => ({ endpoint: CONTRACTS_BY_END_ENDPOINT, window })),
                { endpoint: CONTRACTS_BY_START_ENDPOINT, window: cycleRecentWindow(today) },
              ]
            : remeasureWindows(today).map((window) => ({ endpoint: CONTRACTS_BY_START_ENDPOINT, window }));
        const progress = new AgencyProgress();
        const readAt = context.now();
        metrics.agenciesRead += 1;
        for (const { endpoint, window } of plan) {
          const limit = await collectionStopReason(context, stopAt, store.canContinue);
          if (limit !== null) {
            return limit;
          }
          const outcome = await readAgencyWindow(context, tally, archive, store, metrics, directory, agency, endpoint, window, stopAt);
          if (outcome.stoppedBy !== null) {
            return outcome.stoppedBy;
          }
          if (!outcome.completed) {
            consecutiveFailures += 1;
            return consecutiveFailures >= MAX_CONSECUTIVE_FAILED_WINDOWS ? 'source' : 'done';
          }
          consecutiveFailures = 0;
          progress.absorb(outcome);
          if (outcome.learnedCnpj !== null) {
            progress.pncpCnpj = outcome.learnedCnpj;
          }
          windowsSincePublish += 1;
        }
        awaiting.push({ code: agency.code, kind, progress, readAt });
        return 'done';
      };

      try {
        const queue = [
          ...cycleAgencies.map((agency) => ({ agency, kind: 'cycle' as const })),
          ...remeasureAgencies.map((agency) => ({ agency, kind: 'remeasure' as const })),
        ];
        for (const { agency, kind } of queue) {
          const result = await readAgency(agency, kind);
          if (result !== 'done') {
            stoppedBy = result;
            break;
          }
          if (windowsSincePublish >= publishEvery) {
            await publishAndMark();
          }
        }
        if (store.canContinue) {
          await publishAndMark();
        }
      } finally {
        tally.details['cycle'] = {
          maxMinutes,
          publishEveryWindows: publishEvery,
          eligible: cycleAgencies.length,
          remeasureEligible: remeasureAgencies.length,
          agenciesRead,
          stoppedBy,
        };
        tally.details['metrics'] = metrics.toDetails();
        tally.details['sourceLastInclusion'] = metrics.lastInclusion;
        await store.close();
      }
    },
    () => context.comprasGov.requestCount,
  );
}
