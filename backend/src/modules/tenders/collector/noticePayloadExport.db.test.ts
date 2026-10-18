import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test, type TestContext } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { sql } from 'drizzle-orm';
import { tenderCollectionRuns } from '../db/schema';
import type { ArchiveStorage } from './archive';
import type { TendersDb } from './database';
import { closeLocalTestDatabase, createTestCollectorContext, databaseTestsSkipReason, insertTestNotice, withRollback } from './dbTestSupport';
import { EXPORT_WITHOUT_ARCHIVE, NOTICES_PAYLOAD_EXPORT_COMMAND, runNoticesPayloadExport } from './noticePayloadExport';
import type { RunOutcome } from './runs';

// Exportação do JSON dos editais para o R2 (plano .plans/licitacoes-base-nacional.md,
// parte 2), no banco local, com o R2 simulado. O banco local tem os editais da
// coleta: cada teste começa depois deles, com uma exportação anterior até o
// maior id, e a transação é desfeita no fim.

// 13/10/2026, 09:00 em Brasília: a pasta das partes é 2026/10/13.
const NOW = new Date('2026-10-13T12:00:00Z');
const noContracts = () => new Response(null, { status: 204 });

function memoryArchive(fails: (key: string) => boolean = () => false) {
  const objects = new Map<string, Uint8Array>();
  const storage: ArchiveStorage = {
    async putObject(key, body) {
      if (fails(key)) {
        throw new Error('R2 fora do ar');
      }
      objects.set(key, body);
    },
    close: () => {},
  };
  return { storage, objects };
}

interface ArchivedLine {
  collectedAt: string;
  controlNumber: string;
  firstCollectedAt: string;
  lastCollectedAt: string;
  record: unknown;
}

/** As linhas de todas as partes, na ordem das chaves. */
function archivedLines(objects: Map<string, Uint8Array>): ArchivedLine[] {
  return [...objects.keys()].sort().flatMap((key) =>
    gunzipSync(objects.get(key) ?? new Uint8Array())
      .toString('utf8')
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as ArchivedLine),
  );
}

function assertRan(outcome: RunOutcome) {
  if (outcome.skipped) {
    assert.fail(`a exportação deveria rodar: ${outcome.reason}`);
  }
  return outcome;
}

function pick(value: unknown, keys: string[]): Record<string, unknown> {
  const record = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

/** A coluna payload sai na 0088; depois dela, os testes que gravam JSON não se aplicam. */
async function hasPayloadColumn(tx: TendersDb): Promise<boolean> {
  const result = await tx.execute(sql`
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'licitacoes' AND table_name = 'edital' AND column_name = 'payload'`);
  return result.rows.length > 0;
}

/** Exportação anterior até o maior id do banco local: o teste só exporta os editais dele. */
async function startAfterExistingNotices(tx: TendersDb): Promise<void> {
  const result = await tx.execute<{ max_id: string | null }>(sql`SELECT max(id)::text AS max_id FROM licitacoes.edital`);
  await tx.insert(tenderCollectionRuns).values({
    type: 'MANUAL',
    status: 'SUCESSO',
    details: { command: NOTICES_PAYLOAD_EXPORT_COMMAND, lastId: Number(result.rows[0]?.max_id ?? 0), exported: 0 },
  });
}

/** Editais de teste com o JSON gravado como o coletor antigo gravava (a coluna saiu do schema do Drizzle). */
async function insertNoticesWithPayload(tx: TendersDb, count: number): Promise<Array<{ id: number; payload: Record<string, string> }>> {
  const notices: Array<{ id: number; payload: Record<string, string> }> = [];
  for (let index = 1; index <= count; index += 1) {
    const pncpControlNumber = `TESTE-EXPORT-${randomUUID().slice(0, 8)}-${index}`;
    const payload = { numeroControlePNCP: pncpControlNumber, objetoCompra: `Objeto ${index}` };
    const id = await insertTestNotice(tx, { pncpControlNumber, procurementObject: payload.objetoCompra });
    await tx.execute(sql`UPDATE licitacoes.edital SET payload = ${JSON.stringify(payload)}::jsonb WHERE id = ${id}`);
    notices.push({ id, payload });
  }
  return notices;
}

/** Pula o teste depois da 0088 (sem a coluna, não há o que exportar). */
async function skippedAfter0088(t: TestContext, tx: TendersDb): Promise<boolean> {
  if (await hasPayloadColumn(tx)) {
    return false;
  }
  t.skip('a coluna payload já saiu (migration 0088)');
  return true;
}

describe('exportação do JSON dos editais (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('sem o arquivo bruto (variáveis do R2), não roda nem registra execução', async () => {
    await withRollback(async (tx) => {
      const context = createTestCollectorContext(tx, { contractsFetch: noContracts, now: () => NOW });
      assert.deepEqual(await runNoticesPayloadExport(context), { skipped: true, reason: EXPORT_WITHOUT_ARCHIVE });
    });
  });

  test('em lotes, do id mais antigo ao mais novo, com o JSON e as datas de coleta; no fim, confere e marca verified', async (t) => {
    await withRollback(async (tx) => {
      if (await skippedAfter0088(t, tx)) {
        return;
      }
      await startAfterExistingNotices(tx);
      const notices = await insertNoticesWithPayload(tx, 5);
      const { storage, objects } = memoryArchive();
      const context = createTestCollectorContext(tx, { contractsFetch: noContracts, now: () => NOW, archive: storage });

      const outcome = assertRan(await runNoticesPayloadExport(context, { batchSize: 2 }));
      assert.equal(outcome.status, 'SUCESSO');
      assert.deepEqual(
        [...objects.keys()].sort(),
        [1, 2, 3].map((part) => `pncp/editais-legado/2026/10/13/${outcome.runId}-000${part}.jsonl.gz`),
        'um lote por parte',
      );
      const lines = archivedLines(objects);
      assert.deepEqual(
        lines.map((line) => line.record),
        notices.map((notice) => notice.payload),
      );
      assert.deepEqual(
        lines.map((line) => line.controlNumber),
        notices.map((notice) => notice.payload.numeroControlePNCP),
      );
      assert.ok(lines.every((line) => line.firstCollectedAt.length > 0 && line.lastCollectedAt.length > 0));
      assert.deepEqual(pick(outcome.details, ['command', 'lastId', 'exported', 'exportedTotal', 'remaining', 'verified']), {
        command: NOTICES_PAYLOAD_EXPORT_COMMAND,
        lastId: notices.at(-1)?.id,
        exported: 5,
        exportedTotal: 5,
        remaining: 0,
        verified: true,
      });
    });
  });

  test('falha no envio para sem avançar; a seguinte continua de onde parou e confere', async (t) => {
    await withRollback(async (tx) => {
      if (await skippedAfter0088(t, tx)) {
        return;
      }
      await startAfterExistingNotices(tx);
      const notices = await insertNoticesWithPayload(tx, 5);
      const failing = memoryArchive((key) => key.endsWith('-0002.jsonl.gz'));

      const first = assertRan(
        await runNoticesPayloadExport(createTestCollectorContext(tx, { contractsFetch: noContracts, now: () => NOW, archive: failing.storage }), {
          batchSize: 2,
        }),
      );
      assert.equal(first.status, 'PARCIAL');
      assert.equal(first.details.errors?.[0]?.['kind'], 'archive');
      assert.deepEqual(pick(first.details, ['lastId', 'exported', 'remaining', 'verified']), {
        lastId: notices[1]?.id,
        exported: 2,
        remaining: 3,
        verified: false,
      });

      const working = memoryArchive();
      const second = assertRan(
        await runNoticesPayloadExport(createTestCollectorContext(tx, { contractsFetch: noContracts, now: () => NOW, archive: working.storage }), {
          batchSize: 2,
        }),
      );
      assert.equal(second.status, 'SUCESSO');
      assert.deepEqual(pick(second.details, ['fromId', 'lastId', 'exported', 'exportedTotal', 'remaining', 'verified']), {
        fromId: notices[1]?.id,
        lastId: notices.at(-1)?.id,
        exported: 3,
        exportedTotal: 5,
        remaining: 0,
        verified: true,
      });
      assert.deepEqual(
        archivedLines(working.objects).map((line) => line.record),
        notices.slice(2).map((notice) => notice.payload),
      );
    });
  });
});
