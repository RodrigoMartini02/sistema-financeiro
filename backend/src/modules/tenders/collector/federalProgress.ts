import { and, count, eq, isNull, lt, max, or, sql } from 'drizzle-orm';
import { tenderFederalAgencies } from '../db/schema';
import type { TendersDb } from './database';
import type { FederalAgency } from './federalMapping';

// O andamento da leitura dos contratos federais, que fica no Postgres (plano .plans/licitacoes-contratos-federais.md):
// por órgão, o CNPJ do cadastro e o que o PNCP usa, até que ano a carga já leu, se a fonte tem contrato dele e quando o
// ciclo o leu pela última vez (licitacoes.federal_orgao, migration 0087d). Os contratos em si estão no armazém do R2. Cada
// marca de andamento só é gravada depois de o armazém publicar o que a leitura trouxe: o que uma execução leu e não chegou
// a publicar volta a ser lido pela próxima.

export interface FederalAgencyState {
  code: string;
  name: string;
  /** CNPJ do cadastro da fonte, com os dígitos conferidos; nulo se o cadastro não tem um. */
  registeredCnpj: string | null;
  /** CNPJ que o PNCP usa para os contratos do órgão, aprendido dos números de controle. */
  pncpCnpj: string | null;
  /** null: ainda não medido. false: a fonte não tem contrato dele. */
  hasData: boolean | null;
  /** Ano de início da vigência mais antigo que a carga já leu por inteiro e publicou. */
  oldestLoadedYear: number | null;
  cycleReadAt: string | null;
  /** Maior fim de vigência plausível visto (AAAA-MM-DD): até onde o ciclo procura os vigentes. */
  latestEnd: string | null;
  measuredAt: string | null;
  /** Maior data e hora de inclusão vista (Brasília, sem fuso). */
  lastInclusion: string | null;
}

/** Dias entre os ciclos de um órgão com dado. */
export const FEDERAL_CYCLE_DAYS = 7;
/** Dias entre as medições de um órgão sem dado. */
export const FEDERAL_REMEASURE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const SMALLINT_MAX = 32_767;
const CHUNK_SIZE = 500;

const columns = tenderFederalAgencies;

const stateColumns = {
  code: columns.agencyCode,
  name: columns.name,
  registeredCnpj: columns.registeredCnpj,
  pncpCnpj: columns.pncpCnpj,
  hasData: columns.hasData,
  oldestLoadedYear: columns.oldestLoadedYear,
  cycleReadAt: columns.cycleReadAt,
  latestEnd: columns.latestEnd,
  measuredAt: columns.measuredAt,
  lastInclusion: columns.lastInclusion,
};

/** Os órgãos em ordem de código (numérica: o código é texto, e "9" vem antes de "10"). */
const byCode = [sql`length(${columns.agencyCode})`, columns.agencyCode];

/**
 * Atualiza a lista de órgãos federais da fonte: os novos entram sem andamento, e o nome e o CNPJ do cadastro dos que já
 * existem são corrigidos se mudaram. Órgão que saiu da lista fica (o andamento dele não se perde).
 */
export async function syncFederalAgencies(db: TendersDb, agencies: readonly FederalAgency[]): Promise<{ total: number; inserted: number; updated: number }> {
  const existing = new Map(
    (await db.select({ code: columns.agencyCode, name: columns.name, registeredCnpj: columns.registeredCnpj }).from(columns)).map((row) => [row.code, row]),
  );
  const toInsert = agencies.filter((agency) => !existing.has(agency.code));
  const toUpdate = agencies.filter((agency) => {
    const stored = existing.get(agency.code);
    return stored !== undefined && (stored.name !== agency.name || (stored.registeredCnpj ?? null) !== agency.cnpj);
  });

  for (let start = 0; start < toInsert.length; start += CHUNK_SIZE) {
    await db
      .insert(columns)
      .values(toInsert.slice(start, start + CHUNK_SIZE).map((agency) => ({ agencyCode: agency.code, name: agency.name, registeredCnpj: agency.cnpj })));
  }
  for (const agency of toUpdate) {
    await db
      .update(columns)
      .set({ name: agency.name, registeredCnpj: agency.cnpj, updatedAt: sql`now()` })
      .where(eq(columns.agencyCode, agency.code));
  }
  return { total: existing.size + toInsert.length, inserted: toInsert.length, updated: toUpdate.length };
}

/** Todos os órgãos, em ordem de código (o reparo da carga lê também os que já estão lidos). */
export async function readAllFederalAgencies(db: TendersDb): Promise<FederalAgencyState[]> {
  return db.select(stateColumns).from(columns).orderBy(...byCode);
}

/** Um órgão pelo código; nulo se a lista da fonte nunca o trouxe. */
export async function readFederalAgency(db: TendersDb, code: string): Promise<FederalAgencyState | null> {
  const [row] = await db.select(stateColumns).from(columns).where(eq(columns.agencyCode, code)).limit(1);
  return row ?? null;
}

/** Os órgãos que a carga ainda não leu até o ano `fromYear`: sem andamento, ou com o ano mais antigo lido depois dele. */
export async function readLoadAgencies(db: TendersDb, fromYear: number): Promise<FederalAgencyState[]> {
  return db
    .select(stateColumns)
    .from(columns)
    .where(or(isNull(columns.oldestLoadedYear), sql`${columns.oldestLoadedYear} > ${fromYear}`))
    .orderBy(...byCode);
}

/** Os órgãos com dado cujo ciclo não roda há 7 dias (ou nunca rodou), os mais atrasados primeiro. */
export async function readCycleAgencies(db: TendersDb, now: Date): Promise<FederalAgencyState[]> {
  const cutoff = new Date(now.getTime() - FEDERAL_CYCLE_DAYS * DAY_MS).toISOString();
  return db
    .select(stateColumns)
    .from(columns)
    .where(and(eq(columns.hasData, true), or(isNull(columns.cycleReadAt), lt(columns.cycleReadAt, cutoff))))
    .orderBy(sql`${columns.cycleReadAt} NULLS FIRST`, ...byCode);
}

/** Os órgãos sem dado que não são medidos há 90 dias (ou nunca foram medidos depois da carga), os mais antigos primeiro. */
export async function readRemeasureAgencies(db: TendersDb, now: Date): Promise<FederalAgencyState[]> {
  const cutoff = new Date(now.getTime() - FEDERAL_REMEASURE_DAYS * DAY_MS).toISOString();
  return db
    .select(stateColumns)
    .from(columns)
    .where(and(eq(columns.hasData, false), or(isNull(columns.measuredAt), lt(columns.measuredAt, cutoff))))
    .orderBy(sql`${columns.measuredAt} NULLS FIRST`, ...byCode);
}

/** O que uma leitura publicada diz de um órgão. */
export interface FederalReadMark {
  code: string;
  /** A fonte trouxe contrato do órgão nesta leitura. */
  hadRows: boolean;
  /** Maior fim de vigência plausível lido. */
  latestEnd: string | null;
  /** Maior data e hora de inclusão lida. */
  lastInclusion: string | null;
  /** CNPJ do PNCP aprendido nesta leitura, se diferente do que estava gravado. */
  pncpCnpj: string | null;
}

/**
 * Marca a carga de um órgão: o ano mais antigo já lido, publicado (`oldestYear`). Com contrato na fonte, o órgão passa a ter
 * dado; terminada a carga (`finished`) sem nenhum contrato, passa a "sem dado" e entra na medição de 90 dias.
 */
export async function markFederalLoad(
  db: TendersDb,
  mark: FederalReadMark & { oldestYear: number; finished: boolean },
  readAt: Date,
): Promise<void> {
  await db
    .update(columns)
    .set({
      oldestLoadedYear: sql`least(coalesce(${columns.oldestLoadedYear}, ${SMALLINT_MAX}), ${mark.oldestYear})`,
      ...(mark.hadRows
        ? { hasData: true }
        : mark.finished
          ? { hasData: sql`coalesce(${columns.hasData}, false)`, measuredAt: sql`coalesce(${columns.measuredAt}, ${readAt.toISOString()}::timestamptz)` }
          : {}),
      ...readMarkColumns(mark),
    })
    .where(eq(columns.agencyCode, mark.code));
}

/** Marca o ciclo de um órgão com dado (vigentes e recentes lidos e publicados). */
export async function markFederalCycle(db: TendersDb, mark: FederalReadMark, readAt: Date): Promise<void> {
  await db
    .update(columns)
    .set({ cycleReadAt: readAt.toISOString(), ...readMarkColumns(mark) })
    .where(eq(columns.agencyCode, mark.code));
}

/** Marca a medição de um órgão sem dado: com contrato nos anos medidos, ele passa a ter dado (o ciclo o lê dali em diante). */
export async function markFederalRemeasure(db: TendersDb, mark: FederalReadMark, readAt: Date): Promise<void> {
  await db
    .update(columns)
    .set({ measuredAt: readAt.toISOString(), ...(mark.hadRows ? { hasData: true } : {}), ...readMarkColumns(mark) })
    .where(eq(columns.agencyCode, mark.code));
}

function readMarkColumns(mark: FederalReadMark) {
  return {
    latestEnd: sql`greatest(${columns.latestEnd}, ${mark.latestEnd}::date)`,
    lastInclusion: sql`greatest(${columns.lastInclusion}, ${mark.lastInclusion}::timestamp)`,
    ...(mark.pncpCnpj !== null ? { pncpCnpj: mark.pncpCnpj } : {}),
    updatedAt: sql`now()`,
  };
}

export interface FederalProgress {
  agencies: number;
  /** Órgãos com contrato na fonte (entram no ciclo). */
  withData: number;
  /** Órgãos sem contrato na fonte. */
  withoutData: number;
  /** Órgãos ainda sem medida (a carga não chegou neles). */
  notMeasured: number;
  /** Órgãos que a carga já leu até o ano `fromYear`. */
  loaded: number;
  /** Última inclusão vista na fonte (Brasília, sem fuso): até quando ela tem dado. */
  lastInclusion: string | null;
}

/** O andamento para o comando `status` e para Configurações › Coleta. */
export async function readFederalProgress(db: TendersDb, fromYear: number): Promise<FederalProgress> {
  const [row] = await db
    .select({
      agencies: count(),
      withData: count(sql`CASE WHEN ${columns.hasData} IS TRUE THEN 1 END`),
      withoutData: count(sql`CASE WHEN ${columns.hasData} IS FALSE THEN 1 END`),
      notMeasured: count(sql`CASE WHEN ${columns.hasData} IS NULL THEN 1 END`),
      loaded: count(sql`CASE WHEN ${columns.oldestLoadedYear} <= ${fromYear} THEN 1 END`),
      lastInclusion: max(columns.lastInclusion),
    })
    .from(columns);
  return {
    agencies: row?.agencies ?? 0,
    withData: row?.withData ?? 0,
    withoutData: row?.withoutData ?? 0,
    notMeasured: row?.notMeasured ?? 0,
    loaded: row?.loaded ?? 0,
    lastInclusion: row?.lastInclusion ?? null,
  };
}
