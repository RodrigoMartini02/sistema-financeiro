import { and, count, gte, inArray, lt, lte, max, min, sql, getTableColumns } from 'drizzle-orm';
import { tenderContractBackfillDays, tenderContracts, type ContractTermSummary } from '../db/schema';
import type { TendersDb } from './database';
import type { TenderContractRow } from './contractMapping';

// Gravação dos contratos (plano .plans/licitacoes-contratos-a-vencer.md):
// upsert por página, leitura em lote do que já está gravado (para não
// reconsultar termos), dias da carga inicial, limpeza dos vencidos e tamanho
// do banco, que a carga confere antes de cada dia.

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

/** Apaga os contratos com vencimento antes de `today` (AAAA-MM-DD, Brasília). */
export async function deleteExpiredContracts(db: TendersDb, today: string): Promise<number> {
  const result = await db.delete(tenderContracts).where(lt(tenderContracts.expiresOn, today));
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
