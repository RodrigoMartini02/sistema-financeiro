import { and, eq, ne, sql } from 'drizzle-orm';
import { tenderCollectionRuns } from '../db/schema';
import { ARCHIVE_DATASETS } from './archive';
import type { TendersDb } from './database';
import { COLLECTOR_LOCK_KEYS } from './repository';
import { withCollectionRun, type CollectorContext, type RunOutcome } from './runs';

// Exportação do JSON bruto dos editais que ainda está no banco para o arquivo
// no R2 (plano .plans/licitacoes-base-nacional.md, parte 2), antes da
// migration 0088, que remove a coluna `payload`. Os editais vão em ordem de
// id, em lotes; cada lote é uma parte enviada na hora e só conta depois do
// envio confirmado. Retomável: a execução seguinte continua do último id que
// uma anterior terminou. No fim, confere que nenhum edital com JSON ficou
// depois desse id: só então grava `verified: true`, que a trava da 0088
// exige. Sem o R2, ou depois da 0088, não roda.

export const NOTICES_PAYLOAD_EXPORT_COMMAND = 'notices-payload-export';
/** Editais por lote (cerca de 3 MB de JSON): uma parte por lote. */
export const NOTICE_EXPORT_BATCH_SIZE = 2_000;
export const EXPORT_WITHOUT_ARCHIVE = 'exportação não iniciada: o arquivo bruto está desligado (defina as variáveis TENDERS_ARCHIVE_*)';
export const EXPORT_AFTER_0088 = 'exportação não iniciada: a coluna payload já saiu (migration 0088)';

interface NoticePayloadRow {
  id: number;
  controlNumber: string;
  firstCollectedAt: string;
  lastCollectedAt: string;
  payload: unknown;
}

// A coluna payload saiu do schema do Drizzle na parte 2: as leituras dela são
// SQL parametrizado, só neste arquivo.

async function payloadColumnExists(db: TendersDb): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'licitacoes' AND table_name = 'edital' AND column_name = 'payload'`);
  return result.rows.length > 0;
}

async function readPayloadBatch(db: TendersDb, afterId: number, limit: number): Promise<NoticePayloadRow[]> {
  const result = await db.execute<{
    id: string;
    numero_controle_pncp: string;
    primeira_coleta_em: string;
    ultima_coleta_em: string;
    payload: unknown;
  }>(sql`
    SELECT id, numero_controle_pncp, primeira_coleta_em, ultima_coleta_em, payload
      FROM licitacoes.edital
     WHERE payload IS NOT NULL AND id > ${afterId}
     ORDER BY id
     LIMIT ${limit}`);
  return result.rows.map((row) => ({
    id: Number(row.id),
    controlNumber: row.numero_controle_pncp,
    firstCollectedAt: row.primeira_coleta_em,
    lastCollectedAt: row.ultima_coleta_em,
    payload: row.payload,
  }));
}

async function countPayloadsAfter(db: TendersDb, afterId: number): Promise<number> {
  const result = await db.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM licitacoes.edital WHERE payload IS NOT NULL AND id > ${afterId}`);
  return result.rows[0]?.total ?? 0;
}

/** Até onde as exportações terminadas chegaram (o maior `lastId`) e quanto exportaram ao todo. */
async function readExportProgress(db: TendersDb): Promise<{ lastId: number; exported: number }> {
  const runs = await db
    .select({ details: tenderCollectionRuns.details })
    .from(tenderCollectionRuns)
    .where(
      and(
        eq(tenderCollectionRuns.type, 'MANUAL'),
        ne(tenderCollectionRuns.status, 'EXECUTANDO'),
        // Contenção do JSONB (@>), como em readLastCompletedDailyDays: o Drizzle não tem esse operador.
        sql`${tenderCollectionRuns.details} @> ${JSON.stringify({ command: NOTICES_PAYLOAD_EXPORT_COMMAND })}::jsonb`,
      ),
    );
  let lastId = 0;
  let exported = 0;
  for (const { details } of runs) {
    const runLastId = details['lastId'];
    const runExported = details['exported'];
    if (typeof runLastId === 'number' && runLastId > lastId) {
      lastId = runLastId;
    }
    if (typeof runExported === 'number') {
      exported += runExported;
    }
  }
  return { lastId, exported };
}

/**
 * `notices-payload-export`: uma execução MANUAL, com o resumo nos detalhes
 * (`fromId`, `lastId`, `exported`, `exportedTotal`, `remaining` e `verified`).
 * Lote com falha no envio para a execução sem avançar o `lastId`.
 */
export async function runNoticesPayloadExport(context: CollectorContext, options: { batchSize?: number } = {}): Promise<RunOutcome> {
  if (!context.archive) {
    context.logger.warn('Exportação do JSON dos editais não iniciada', { reason: EXPORT_WITHOUT_ARCHIVE });
    return { skipped: true, reason: EXPORT_WITHOUT_ARCHIVE };
  }
  if (!(await payloadColumnExists(context.db))) {
    context.logger.warn('Exportação do JSON dos editais não iniciada', { reason: EXPORT_AFTER_0088 });
    return { skipped: true, reason: EXPORT_AFTER_0088 };
  }
  const batchSize = options.batchSize ?? NOTICE_EXPORT_BATCH_SIZE;

  return withCollectionRun(context, 'MANUAL', COLLECTOR_LOCK_KEYS.noticesExport, async (tally, archive) => {
    const previous = await readExportProgress(context.db);
    tally.details['command'] = NOTICES_PAYLOAD_EXPORT_COMMAND;
    tally.details['fromId'] = previous.lastId;
    let lastId = previous.lastId;
    let exported = 0;
    let sendFailed = false;

    for (;;) {
      const rows = await readPayloadBatch(context.db, lastId, batchSize);
      if (rows.length === 0) {
        break;
      }
      const failuresBefore = archive.summary()?.failures ?? 0;
      for (const row of rows) {
        await archive.append(ARCHIVE_DATASETS.legacyNotices, [row.payload], {
          controlNumber: row.controlNumber,
          firstCollectedAt: row.firstCollectedAt,
          lastCollectedAt: row.lastCollectedAt,
        });
      }
      // O lote vira uma parte enviada agora: ele só conta depois do envio confirmado.
      await archive.flush();
      if ((archive.summary()?.failures ?? 0) > failuresBefore) {
        sendFailed = true;
        break;
      }
      lastId = rows.at(-1)?.id ?? lastId;
      exported += rows.length;
      tally.recordsRead += rows.length;
      context.logger.info('Lote do JSON dos editais exportado', { lastId, exported });
    }

    const remaining = await countPayloadsAfter(context.db, lastId);
    tally.details['lastId'] = lastId;
    tally.details['exported'] = exported;
    tally.details['exportedTotal'] = previous.exported + exported;
    tally.details['remaining'] = remaining;
    // Envio sem falha e nada depois do último id: é o que a trava da 0088 confere.
    tally.details['verified'] = !sendFailed && remaining === 0;
  });
}
