import { and, count, desc, eq, gte, lte, max, min, ne, sql } from 'drizzle-orm';
import { tenderCollectionRuns, tenderContractBackfillDays, type CollectionRunDetails } from '../db/schema';
import type { TendersDb } from './database';
import { PNCP_CONTRACT_ENDPOINTS, type PncpContractEndpoint } from './pncpClient';

// O andamento da coleta de contratos, que fica no Postgres (plano
// .plans/licitacoes-contratos-no-r2.md): o último dia que cada consulta da
// coleta diária leu sem falha do PNCP (nos detalhes de coleta_execucao) e os dias
// da carga inicial já concluídos (licitacoes.contrato_carga_dia). Os contratos
// em si estão no armazém do R2 (contractStore).

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** O fim (AAAA-MM-DD) da consulta completa nos detalhes de uma coleta diária; fora do formato, nada. */
function completedDayOf(details: CollectionRunDetails | undefined, endpoint: string): string | null {
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

/** Tipos de execução diária que guardam em `detalhes.queries` até onde cada consulta leu. */
export type DailyRunType = 'CONTRATOS_DIARIA' | 'VENCEDORES_DIARIA';

/**
 * Último dia lido sem falha numa consulta da coleta diária: o fim da execução
 * mais recente do tipo em que a consulta aparece em `detalhes.queries` com
 * `completed: true`. Execuções sem esse registro (anteriores à regra, ou
 * interrompidas antes de gravar) não contam. Uma execução que não conseguiu
 * publicar o armazém grava as consultas como não concluídas (contractRuns.ts e
 * resultRuns.ts).
 */
export async function readLastCompletedDay(db: TendersDb, type: DailyRunType, endpoint: string): Promise<string | null> {
  const completedQuery = JSON.stringify({ queries: [{ endpoint, completed: true }] });
  const [run] = await db
    .select({ details: tenderCollectionRuns.details })
    .from(tenderCollectionRuns)
    .where(
      and(
        eq(tenderCollectionRuns.type, type),
        ne(tenderCollectionRuns.status, 'EXECUTANDO'),
        // Contenção do JSONB (@>): o Drizzle não tem esse operador, e o valor vai como parâmetro.
        sql`${tenderCollectionRuns.details} @> ${completedQuery}::jsonb`,
      ),
    )
    .orderBy(desc(tenderCollectionRuns.startedAt), desc(tenderCollectionRuns.id))
    .limit(1);
  return completedDayOf(run?.details, endpoint);
}

/** Último dia lido sem falha do PNCP em cada consulta da coleta diária de contratos. */
export async function readLastCompletedDailyDays(db: TendersDb): Promise<Partial<Record<PncpContractEndpoint, string>>> {
  const days: Partial<Record<PncpContractEndpoint, string>> = {};
  for (const endpoint of PNCP_CONTRACT_ENDPOINTS) {
    const day = await readLastCompletedDay(db, 'CONTRATOS_DIARIA', endpoint);
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

/** Marca o dia da carga como concluído (só depois de o armazém publicar o dia). */
export async function markBackfillDayCompleted(db: TendersDb, day: string, counts: BackfillDayCounts): Promise<void> {
  await db
    .insert(tenderContractBackfillDays)
    .values({ day, ...counts })
    .onConflictDoUpdate({
      target: tenderContractBackfillDays.day,
      set: { ...counts, completedAt: sql`now()` },
    });
}

export interface BackfillProgress {
  completedDays: number;
  oldestDay: string | null;
  newestDay: string | null;
}

/** Andamento da carga, para o comando `status` e Configurações › Coleta. */
export async function readBackfillProgress(db: TendersDb): Promise<BackfillProgress> {
  const [backfill] = await db
    .select({
      completedDays: count(),
      oldestDay: min(tenderContractBackfillDays.day),
      newestDay: max(tenderContractBackfillDays.day),
    })
    .from(tenderContractBackfillDays);
  return {
    completedDays: backfill?.completedDays ?? 0,
    oldestDay: backfill?.oldestDay ?? null,
    newestDay: backfill?.newestDay ?? null,
  };
}
