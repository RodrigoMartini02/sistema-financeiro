import { and, asc, count, desc, eq, gte, inArray, lt, lte, max, min, ne, notExists, notInArray, sql, getTableColumns } from 'drizzle-orm';
import {
  tenderCollectionRuns,
  tenderContractBackfillDays,
  tenderContractFavorites,
  tenderContracts,
  type CollectionRunDetails,
  type ContractTermSummary,
} from '../db/schema';
import type { TendersDb } from './database';
import type { TenderContractRow } from './contractMapping';
import { PNCP_CONTRACT_ENDPOINTS, type PncpContractEndpoint } from './pncpClient';

// Gravação dos contratos (plano .plans/licitacoes-contratos-a-vencer.md):
// upsert por página, leitura em lote do que já está gravado (para não
// reconsultar termos), dias da carga inicial, limpeza dos vencidos e tamanho
// do banco, que a carga confere antes de cada dia. Do plano
// .plans/licitacoes-contratos-coleta-sem-perda.md: o último dia que cada
// consulta da coleta diária leu sem falha e os contratos com termos pendentes,
// para a reconsulta.

const BYTES_PER_MB = 1024 * 1024;

// Colunas regravadas quando o contrato muda; o número de controle é a chave, e
// as datas de coleta têm regra própria.
const NOT_REFRESHED_FIELDS = new Set(['id', 'pncpControlNumber', 'firstCollectedAt', 'lastCollectedAt', 'searchVector']);
const REFRESH_FROM_EXCLUDED = Object.fromEntries(
  Object.entries(getTableColumns(tenderContracts))
    .filter(([field]) => !NOT_REFRESHED_FIELDS.has(field))
    .map(([field, column]) => [field, sql.raw(`excluded."${column.name}"`)]),
);

/** O que já está gravado de um contrato, para decidir se os termos precisam de nova consulta. */
export interface StoredContractState {
  amendments: ContractTermSummary[] | null;
  /** Data de atualização global da última conferência dos termos, no formato do PNCP (Brasília). */
  amendmentsReference: string | null;
  expiresOn: string;
}

/** Contratos já gravados entre os números da página, numa consulta só (sem N+1). */
export async function readStoredContracts(db: TendersDb, controlNumbers: string[]): Promise<Map<string, StoredContractState>> {
  if (controlNumbers.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      controlNumber: tenderContracts.pncpControlNumber,
      amendments: tenderContracts.amendments,
      // No formato do PNCP, para comparar com a data de atualização global recebida.
      amendmentsReference: sql<string | null>`to_char(${tenderContracts.amendmentsReference} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS')`,
      expiresOn: tenderContracts.expiresOn,
    })
    .from(tenderContracts)
    .where(inArray(tenderContracts.pncpControlNumber, controlNumbers));
  return new Map(rows.map(({ controlNumber, ...state }) => [controlNumber, state]));
}

export interface ContractPageResult {
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
}

/** O mesmo contrato duas vezes na página quebraria o ON CONFLICT DO UPDATE: fica o último. */
function keepLastByControlNumber(rows: TenderContractRow[]): TenderContractRow[] {
  return [...new Map(rows.map((row) => [row.pncpControlNumber, row])).values()];
}

/**
 * Grava uma página numa transação. Novo entra; existente com hash, vencimento
 * ou conferência dos termos diferente é regravado; igual só tem a última
 * coleta atualizada. `xmax = 0` no RETURNING separa as inseridas das atualizadas.
 */
export async function upsertContractPage(db: TendersDb, rows: TenderContractRow[]): Promise<ContractPageResult> {
  const uniqueRows = keepLastByControlNumber(rows);
  if (uniqueRows.length === 0) {
    return { insertedCount: 0, updatedCount: 0, unchangedCount: 0 };
  }

  return db.transaction(async (tx) => {
    const changed = await tx
      .insert(tenderContracts)
      .values(uniqueRows)
      .onConflictDoUpdate({
        target: tenderContracts.pncpControlNumber,
        set: { ...REFRESH_FROM_EXCLUDED, lastCollectedAt: sql`now()` },
        setWhere: sql`${tenderContracts.payloadHash} IS DISTINCT FROM excluded."hash_payload"
          OR ${tenderContracts.expiresOn} IS DISTINCT FROM excluded."vencimento"
          OR ${tenderContracts.amendmentsReference} IS DISTINCT FROM excluded."aditivos_referencia"`,
      })
      .returning({ controlNumber: tenderContracts.pncpControlNumber, inserted: sql<boolean>`(xmax = 0)` });

    const changedNumbers = new Set(changed.map((row) => row.controlNumber));
    const unchangedNumbers = uniqueRows.map((row) => row.pncpControlNumber).filter((number) => !changedNumbers.has(number));
    if (unchangedNumbers.length > 0) {
      await tx
        .update(tenderContracts)
        .set({ lastCollectedAt: sql`now()` })
        .where(inArray(tenderContracts.pncpControlNumber, unchangedNumbers));
    }

    const insertedCount = changed.filter((row) => row.inserted).length;
    return { insertedCount, updatedCount: changed.length - insertedCount, unchangedCount: unchangedNumbers.length };
  });
}

/**
 * Termos pendentes: contrato com sinal de alteração (a atualização global mais
 * de 24 h depois da publicação, como hasChangeSignal) cujos termos não foram
 * conferidos para a atualização global atual. Sobra quando o PNCP falhou nos
 * termos, na coleta diária ou na carga.
 */
export const pendingTermsCondition = sql`${tenderContracts.pncpGlobalUpdatedAt} > ${tenderContracts.publishedAt} + interval '24 hours'
  AND ${tenderContracts.amendmentsReference} IS DISTINCT FROM ${tenderContracts.pncpGlobalUpdatedAt}`;

/** O que a reconsulta precisa de um contrato com termos pendentes. */
export interface PendingTermsContract {
  pncpControlNumber: string;
  agencyCnpj: string;
  contractYear: number;
  contractSequence: number;
  originalTermEnd: string;
  expiresOn: string;
}

/** Total de contratos com termos pendentes, para os detalhes da reconsulta. */
export async function countContractsWithPendingTerms(db: TendersDb): Promise<number> {
  const [row] = await db.select({ total: count() }).from(tenderContracts).where(pendingTermsCondition);
  return row?.total ?? 0;
}

/**
 * Contratos com termos pendentes, da atualização global mais antiga para a
 * mais nova, menos os que falharam na própria execução: esses voltam no dia
 * seguinte.
 */
export async function readContractsWithPendingTerms(
  db: TendersDb,
  limit: number,
  excludedControlNumbers: string[],
): Promise<PendingTermsContract[]> {
  const notExcluded = excludedControlNumbers.length > 0 ? notInArray(tenderContracts.pncpControlNumber, excludedControlNumbers) : undefined;
  return db
    .select({
      pncpControlNumber: tenderContracts.pncpControlNumber,
      agencyCnpj: tenderContracts.agencyCnpj,
      contractYear: tenderContracts.contractYear,
      contractSequence: tenderContracts.contractSequence,
      originalTermEnd: tenderContracts.originalTermEnd,
      expiresOn: tenderContracts.expiresOn,
    })
    .from(tenderContracts)
    .where(and(pendingTermsCondition, notExcluded))
    .orderBy(asc(tenderContracts.pncpGlobalUpdatedAt), asc(tenderContracts.id))
    .limit(limit);
}

/** Resultado da reconsulta de um contrato: o vencimento e os termos conferidos. */
export interface CheckedContractTerms {
  pncpControlNumber: string;
  expiresOn: string;
  amendments: ContractTermSummary[];
}

/**
 * Grava a reconsulta numa transação: o vencimento, os termos e a conferência,
 * que passa a ser a atualização global atual. São no máximo os contratos de
 * uma reconsulta (o limite dela), um UPDATE por contrato.
 */
export async function saveCheckedContractTerms(db: TendersDb, checked: CheckedContractTerms[]): Promise<void> {
  if (checked.length === 0) {
    return;
  }
  await db.transaction(async (tx) => {
    for (const contract of checked) {
      await tx
        .update(tenderContracts)
        .set({
          expiresOn: contract.expiresOn,
          amendments: contract.amendments,
          amendmentsReference: sql`${tenderContracts.pncpGlobalUpdatedAt}`,
        })
        .where(eq(tenderContracts.pncpControlNumber, contract.pncpControlNumber));
    }
  });
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** O fim (AAAA-MM-DD) da consulta completa nos detalhes de uma coleta diária; fora do formato, nada. */
function completedDayOf(details: CollectionRunDetails | undefined, endpoint: PncpContractEndpoint): string | null {
  const queries = details?.['queries'];
  if (!Array.isArray(queries)) {
    return null;
  }
  for (const query of queries) {
    if (typeof query !== 'object' || query === null) {
      continue;
    }
    const entry = query as Record<string, unknown>;
    const to = entry['to'];
    if (entry['endpoint'] === endpoint && entry['completed'] === true && typeof to === 'string' && ISO_DAY.test(to)) {
      return to;
    }
  }
  return null;
}

/**
 * Último dia lido sem falha do PNCP em cada consulta da coleta diária: o fim
 * da execução mais recente em que a consulta aparece em `detalhes.queries` com
 * `completed: true`. Execuções sem esse registro (anteriores à regra, ou
 * interrompidas antes de gravar) não contam.
 */
export async function readLastCompletedDailyDays(db: TendersDb): Promise<Partial<Record<PncpContractEndpoint, string>>> {
  const days: Partial<Record<PncpContractEndpoint, string>> = {};
  for (const endpoint of PNCP_CONTRACT_ENDPOINTS) {
    const completedQuery = JSON.stringify({ queries: [{ endpoint, completed: true }] });
    const [run] = await db
      .select({ details: tenderCollectionRuns.details })
      .from(tenderCollectionRuns)
      .where(
        and(
          eq(tenderCollectionRuns.type, 'CONTRATOS_DIARIA'),
          ne(tenderCollectionRuns.status, 'EXECUTANDO'),
          // Contenção do JSONB (@>): o Drizzle não tem esse operador, e o valor vai como parâmetro.
          sql`${tenderCollectionRuns.details} @> ${completedQuery}::jsonb`,
        ),
      )
      .orderBy(desc(tenderCollectionRuns.startedAt), desc(tenderCollectionRuns.id))
      .limit(1);
    const day = completedDayOf(run?.details, endpoint);
    if (day) {
      days[endpoint] = day;
    }
  }
  return days;
}

/** Dias da carga já concluídos entre `from` e `to` (AAAA-MM-DD, inclusive). */
export async function readCompletedBackfillDays(db: TendersDb, from: string, to: string): Promise<Set<string>> {
  const rows = await db
    .select({ day: tenderContractBackfillDays.day })
    .from(tenderContractBackfillDays)
    .where(and(gte(tenderContractBackfillDays.day, from), lte(tenderContractBackfillDays.day, to)));
  return new Set(rows.map((row) => row.day));
}

/** Dia mais recente que a carga já concluiu: depois da primeira execução, é o fim fixo da faixa. */
export async function readNewestBackfillDay(db: TendersDb): Promise<string | null> {
  const [row] = await db.select({ day: max(tenderContractBackfillDays.day) }).from(tenderContractBackfillDays);
  return row?.day ?? null;
}

export interface BackfillDayCounts {
  recordsRead: number;
  storedCount: number;
  termsChecked: number;
}

/** Marca o dia da carga como concluído (só ao terminar o dia inteiro). */
export async function markBackfillDayCompleted(db: TendersDb, day: string, counts: BackfillDayCounts): Promise<void> {
  await db
    .insert(tenderContractBackfillDays)
    .values({ day, ...counts })
    .onConflictDoUpdate({
      target: tenderContractBackfillDays.day,
      set: { ...counts, completedAt: sql`now()` },
    });
}

/**
 * Apaga os contratos com vencimento antes de `today` (AAAA-MM-DD, Brasília),
 * menos os favoritados (a pessoa continua vendo o favorito vencido). Os avisos
 * do contrato apagado saem junto (ON DELETE CASCADE).
 */
export async function deleteExpiredContracts(db: TendersDb, today: string): Promise<number> {
  const favorited = db
    .select({ found: sql`1` })
    .from(tenderContractFavorites)
    .where(eq(tenderContractFavorites.contractId, tenderContracts.id));
  const result = await db.delete(tenderContracts).where(and(lt(tenderContracts.expiresOn, today), notExists(favorited)));
  return result.rowCount ?? 0;
}

/** Tamanho do banco inteiro em MB, como o plano do Render conta o espaço. */
export async function databaseSizeMb(db: TendersDb): Promise<number> {
  const result = await db.execute<{ bytes: string }>(sql`SELECT pg_database_size(current_database())::text AS bytes`);
  return Number(result.rows[0]?.bytes ?? 0) / BYTES_PER_MB;
}

export interface ContractsStatus {
  contracts: number;
  /** Com vencimento de hoje em diante (Brasília). */
  activeContracts: number;
  backfill: { completedDays: number; oldestDay: string | null; newestDay: string | null };
}

/** Totais de contratos e o andamento da carga, para o comando `status` e Configurações › Coleta. */
export async function readContractsStatus(db: TendersDb): Promise<ContractsStatus> {
  const [totals] = await db
    .select({
      contracts: count(),
      activeContracts: sql<number>`count(*) FILTER (WHERE ${tenderContracts.expiresOn} >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)`.mapWith(Number),
    })
    .from(tenderContracts);
  const [backfill] = await db
    .select({
      completedDays: count(),
      oldestDay: min(tenderContractBackfillDays.day),
      newestDay: max(tenderContractBackfillDays.day),
    })
    .from(tenderContractBackfillDays);
  return {
    contracts: totals?.contracts ?? 0,
    activeContracts: totals?.activeContracts ?? 0,
    backfill: {
      completedDays: backfill?.completedDays ?? 0,
      oldestDay: backfill?.oldestDay ?? null,
      newestDay: backfill?.newestDay ?? null,
    },
  };
}
