import { and, count, gte, lte, max, min, sql } from 'drizzle-orm';
import { tenderResultBackfillDays } from '../db/schema';
import { readLastCompletedDay } from './contractProgress';
import type { TendersDb } from './database';

// O andamento da coleta de vencedores, que fica no Postgres (plano .plans/licitacoes-vencedores.md): o último dia que
// a coleta diária leu por inteiro (nos detalhes de coleta_execucao) e os dias da carga histórica já concluídos
// (licitacoes.resultado_carga_dia). As linhas dos vencedores em si estão no armazém do R2 (contractStore). Espelha o
// contractProgress.ts, sem mexer nas funções dos contratos.

/** O nome da única consulta da coleta diária de vencedores em `detalhes.queries`. */
export const RESULTS_QUERY = 'resultados';

/**
 * Último dia lido por inteiro e publicado pela coleta diária: o fim da consulta (o último dia que a fonte tinha) na
 * execução mais recente em que ela aparece com `completed: true`.
 */
export function readLastCompletedResultDay(db: TendersDb): Promise<string | null> {
  return readLastCompletedDay(db, 'VENCEDORES_DIARIA', RESULTS_QUERY);
}

/** Dias da carga já concluídos entre `from` e `to` (AAAA-MM-DD, inclusive). */
export async function readCompletedResultDays(db: TendersDb, from: string, to: string): Promise<Set<string>> {
  const rows = await db
    .select({ day: tenderResultBackfillDays.day })
    .from(tenderResultBackfillDays)
    .where(and(gte(tenderResultBackfillDays.day, from), lte(tenderResultBackfillDays.day, to)));
  return new Set(rows.map((row) => row.day));
}

/** Dia mais recente que a carga já concluiu: depois da primeira execução, é o fim fixo da faixa. */
export async function readNewestResultDay(db: TendersDb): Promise<string | null> {
  const [row] = await db.select({ day: max(tenderResultBackfillDays.day) }).from(tenderResultBackfillDays);
  return row?.day ?? null;
}

/** Marca o dia da carga como concluído (só depois de o armazém publicar o dia). */
export async function markResultDayCompleted(db: TendersDb, day: string, recordsRead: number): Promise<void> {
  await db
    .insert(tenderResultBackfillDays)
    .values({ day, recordsRead })
    .onConflictDoUpdate({
      target: tenderResultBackfillDays.day,
      set: { recordsRead, completedAt: sql`now()` },
    });
}

export interface ResultBackfillProgress {
  completedDays: number;
  oldestDay: string | null;
  newestDay: string | null;
}

/** Andamento da carga, para o comando `status` e Configurações › Coleta. */
export async function readResultBackfillProgress(db: TendersDb): Promise<ResultBackfillProgress> {
  const [progress] = await db
    .select({
      completedDays: count(),
      oldestDay: min(tenderResultBackfillDays.day),
      newestDay: max(tenderResultBackfillDays.day),
    })
    .from(tenderResultBackfillDays);
  return {
    completedDays: progress?.completedDays ?? 0,
    oldestDay: progress?.oldestDay ?? null,
    newestDay: progress?.newestDay ?? null,
  };
}
