import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { count, eq, inArray } from 'drizzle-orm';
import { tenderCollectionRuns, tenderContractBackfillDays, tenderContracts } from '../db/schema';
import { BACKFILL_FINISHED, BACKFILL_NOT_STARTED, runContractsBackfill, runContractsCleanup, runContractsDaily } from './contractRuns';
import { markBackfillDayCompleted } from './contractRepository';
import { closeLocalTestDatabase, createTestCollectorContext, databaseTestsSkipReason, insertTestContract, localTestPool, withRollback } from './dbTestSupport';
import type { TendersDb } from './database';
import { COLLECTOR_LOCK_KEYS, tryAcquireCollectorLock } from './repository';
import type { RunOutcome } from './runs';

// Execuções de contratos sobre o banco local, com o PNCP simulado: cada teste
// numa transação desfeita no fim. Os contratos de teste têm número de controle
// próprio, porque o banco local pode ter os contratos do piloto.

const fixtures = path.join(__dirname, 'fixtures');
const realPage = JSON.parse(readFileSync(path.join(fixtures, 'contratos-page.json'), 'utf8')) as { data: Record<string, unknown>[] };
const prorrogacao = readFileSync(path.join(fixtures, 'termos-prorrogacao.json'), 'utf8');
const baseRecord = realPage.data.find((record) => record.numeroControlePNCP === '03353358000196-2-000216/2026') ?? {};

// 13/10/2026, 09:00 em Brasília: hoje = 2026-10-13, ontem = 2026-10-12.
const NOW = new Date('2026-10-13T12:00:00Z');

/** Contrato do PNCP com base no registro real (termo inicial de 1 ano), com número e sequencial próprios. */
function contractRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const sequence = randomInt(100_000, 2_000_000_000);
  return {
    ...baseRecord,
    numeroControlePNCP: `TESTE-${randomUUID().slice(0, 8)}-${sequence}`,
    sequencialContrato: sequence,
    dataVigenciaInicio: '2026-09-29',
    dataVigenciaFim: '2027-09-29',
    dataPublicacaoPncp: '2026-09-30T07:13:38',
    dataAtualizacaoGlobal: '2026-09-30T07:23:32',
    ...overrides,
  };
}

function pageOf(records: unknown[]): Response {
  if (records.length === 0) {
    return new Response(null, { status: 204 });
  }
  return Response.json({ data: records, totalRegistros: records.length, totalPaginas: 1, numeroPagina: 1, paginasRestantes: 0, empty: false });
}

/** A consulta de contratos simulada: publicação devolve `records`, atualização vem vazia. */
const publicationOnly = (records: unknown[]) => (url: URL) => (url.pathname.endsWith('/contratos') ? pageOf(records) : pageOf([]));

function assertRan(outcome: RunOutcome) {
  if (outcome.skipped) {
    assert.fail(`a execução deveria rodar: ${outcome.reason}`);
  }
  return outcome;
}

async function storedContract(tx: TendersDb, controlNumber: unknown) {
  const [row] = await tx.select().from(tenderContracts).where(eq(tenderContracts.pncpControlNumber, String(controlNumber)));
  return row;
}

describe('execuções de contratos (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('diária: grava o termo inicial longo e conta os que ficam de fora, por motivo', async () => {
    await withRollback(async (tx) => {
      const kept = contractRecord();
      const empenho = contractRecord({ tipoContrato: { id: 7, nome: 'Empenho' } });
      const short = contractRecord({ dataVigenciaFim: '2027-01-15' });
      const expired = contractRecord({ dataVigenciaInicio: '2025-01-01', dataVigenciaFim: '2026-10-01' });
      // Dado que falta na origem: conta à parte e não deixa a execução "Parcial".
      const withoutEnd = contractRecord({ dataVigenciaFim: null });
      const implausible = contractRecord({ dataVigenciaFim: '2227-09-29' });
      const context = createTestCollectorContext(tx, {
        contractsFetch: publicationOnly([kept, empenho, short, expired, withoutEnd, implausible]),
        now: () => NOW,
      });

      const outcome = assertRan(await runContractsDaily(context));
      assert.equal(outcome.status, 'SUCESSO');
      assert.equal(outcome.errorCount, 0);
      assert.equal(outcome.recordsRead, 6);
      assert.equal(outcome.newCount, 1);
      assert.equal(outcome.details['skippedNotInitialTerm'], 1);
      assert.equal(outcome.details['skippedShortTerm'], 1);
      assert.equal(outcome.details['skippedExpired'], 1);
      assert.equal(outcome.details['skippedWithoutEndDate'], 1);
      assert.equal(outcome.details['skippedImplausibleTerm'], 1);
      assert.deepEqual(outcome.details['period'], { dataInicial: '20261012', dataFinal: '20261013' });
      assert.ok(await storedContract(tx, kept.numeroControlePNCP));
      assert.equal(await storedContract(tx, expired.numeroControlePNCP), undefined);
    });
  });

  test('termos: não são reconsultados com a mesma data global, e são quando ela muda', async () => {
    await withRollback(async (tx) => {
      // Vencido pela data original (30/06/2026), mas prorrogado pelo aditivo: entra na base.
      const record = contractRecord({
        dataVigenciaInicio: '2025-07-01',
        dataVigenciaFim: '2026-06-30',
        dataPublicacaoPncp: '2025-07-02T10:00:00',
        dataAtualizacaoGlobal: '2026-10-05T10:00:00',
      });
      let termsRequests = 0;
      let records = [record];
      const context = createTestCollectorContext(tx, {
        contractsFetch: (url) => publicationOnly(records)(url),
        termsFetch: () => {
          termsRequests += 1;
          return new Response(prorrogacao, { status: 200 });
        },
        now: () => NOW,
      });

      await runContractsDaily(context);
      assert.equal(termsRequests, 1);
      const first = await storedContract(tx, record.numeroControlePNCP);
      assert.equal(first?.expiresOn, '2026-12-31', 'o aditivo prorroga até 31/12/2026');
      assert.equal(first?.amendments?.length, 1);

      await runContractsDaily(context);
      assert.equal(termsRequests, 1, 'mesma data de atualização global: sem nova consulta');
      assert.equal((await storedContract(tx, record.numeroControlePNCP))?.expiresOn, '2026-12-31');

      records = [{ ...record, dataAtualizacaoGlobal: '2026-10-10T08:00:00' }];
      await runContractsDaily(context);
      assert.equal(termsRequests, 2, 'a data global mudou: os termos são conferidos de novo');
    });
  });

  test('vencido não gravado fica de fora; vencido já gravado é atualizado (a limpeza o tira)', async () => {
    await withRollback(async (tx) => {
      const alreadyStored = contractRecord({ dataVigenciaInicio: '2025-01-01', dataVigenciaFim: '2026-10-01' });
      await insertTestContract(tx, {
        pncpControlNumber: String(alreadyStored.numeroControlePNCP),
        termStart: '2025-01-01',
        originalTermEnd: '2027-01-01',
        expiresOn: '2027-01-01',
      });
      const notStored = contractRecord({ dataVigenciaInicio: '2025-01-01', dataVigenciaFim: '2026-10-01' });
      const context = createTestCollectorContext(tx, { contractsFetch: publicationOnly([alreadyStored, notStored]), now: () => NOW });

      const outcome = assertRan(await runContractsDaily(context));
      assert.equal(outcome.updatedCount, 1);
      assert.equal(outcome.details['skippedExpired'], 1);
      assert.equal((await storedContract(tx, alreadyStored.numeroControlePNCP))?.expiresOn, '2026-10-01');
      assert.equal(await storedContract(tx, notStored.numeroControlePNCP), undefined);
    });
  });

  test('falha do PNCP nos termos conta erro e grava o fim original, sem marcar a conferência', async () => {
    await withRollback(async (tx) => {
      const record = contractRecord({ dataPublicacaoPncp: '2026-09-01T10:00:00', dataAtualizacaoGlobal: '2026-10-05T10:00:00' });
      const context = createTestCollectorContext(tx, {
        contractsFetch: publicationOnly([record]),
        termsFetch: () => new Response('erro', { status: 500 }),
        now: () => NOW,
      });

      const outcome = assertRan(await runContractsDaily(context));
      assert.equal(outcome.status, 'PARCIAL');
      assert.equal(outcome.errorCount, 1);
      const stored = await storedContract(tx, record.numeroControlePNCP);
      assert.equal(stored?.expiresOn, '2027-09-29');
      assert.equal(stored?.amendments, null);
      assert.equal(stored?.amendmentsReference, null);
    });
  });

  test('carga: do mais recente ao mais antigo, marca só o dia concluído e retoma o pendente', async () => {
    await withRollback(async (tx) => {
      const requestedDays: string[] = [];
      let failDay: string | null = '20190302';
      const context = createTestCollectorContext(tx, {
        contractsFetch: (url) => {
          const day = url.searchParams.get('dataInicial') ?? '';
          requestedDays.push(day);
          return day === failDay ? new Response('erro', { status: 500 }) : pageOf([contractRecord({ dataVigenciaFim: '2030-01-01' })]);
        },
        now: () => NOW,
        contracts: { maxDatabaseMb: 1_000_000 },
      });

      const first = assertRan(await runContractsBackfill(context, { from: '2019-03-01', to: '2019-03-03' }));
      assert.deepEqual(requestedDays, ['20190303', '20190302', '20190301']);
      assert.equal(first.status, 'PARCIAL');
      assert.deepEqual(
        { daysCompleted: 2, failedDays: 1, pendingAfter: 1, stoppedBy: null, finished: false },
        pick(first.details['backfill'], ['daysCompleted', 'failedDays', 'pendingAfter', 'stoppedBy', 'finished']),
      );
      assert.deepEqual(await backfillDays(tx, ['2019-03-01', '2019-03-02', '2019-03-03']), ['2019-03-01', '2019-03-03']);

      failDay = null;
      requestedDays.length = 0;
      const second = assertRan(await runContractsBackfill(context, { from: '2019-03-01', to: '2019-03-03' }));
      assert.deepEqual(requestedDays, ['20190302'], 'só o dia pendente');
      assert.equal(pick(second.details['backfill'], ['finished']).finished, true);
    });
  });

  test('carga: para no limite de tempo e no de espaço, com o motivo nos detalhes', async () => {
    await withRollback(async (tx) => {
      // Cada consulta "leva" 40 minutos no relógio simulado.
      let clock = NOW.getTime();
      const context = createTestCollectorContext(tx, {
        contractsFetch: () => {
          clock += 40 * 60_000;
          return pageOf([]);
        },
        now: () => new Date(clock),
        contracts: { maxDatabaseMb: 1_000_000, backfillMinutes: 60 },
      });

      const byTime = assertRan(await runContractsBackfill(context, { from: '2019-04-01', to: '2019-04-03' }));
      assert.deepEqual(pick(byTime.details['backfill'], ['daysCompleted', 'stoppedBy', 'pendingAfter']), {
        daysCompleted: 2,
        stoppedBy: 'time',
        pendingAfter: 1,
      });

      const bySpace = assertRan(await runContractsBackfill(context, { from: '2019-05-01', to: '2019-05-03', maxDbMb: 1 }));
      assert.deepEqual(pick(bySpace.details['backfill'], ['daysCompleted', 'stoppedBy']), { daysCompleted: 0, stoppedBy: 'space' });
    });
  });

  test('carga: sem limite de espaço não roda nem registra execução; sem dia pendente, é pulada', async () => {
    await withRollback(async (tx) => {
      const context = createTestCollectorContext(tx, { contractsFetch: () => pageOf([]), now: () => NOW });
      const runsBefore = await backfillRunCount(tx);
      assert.deepEqual(await runContractsBackfill(context, { from: '2019-06-01', to: '2019-06-02' }), {
        skipped: true,
        reason: BACKFILL_NOT_STARTED,
      });
      assert.equal(await backfillRunCount(tx), runsBefore);

      await markBackfillDayCompleted(tx, '2019-06-01', { recordsRead: 0, storedCount: 0, termsChecked: 0 });
      await markBackfillDayCompleted(tx, '2019-06-02', { recordsRead: 0, storedCount: 0, termsChecked: 0 });
      assert.deepEqual(await runContractsBackfill(context, { from: '2019-06-01', to: '2019-06-02', maxDbMb: 1_000_000 }), {
        skipped: true,
        reason: BACKFILL_FINISHED,
      });
      assert.equal(await backfillRunCount(tx), runsBefore);
    });
  });

  test('carga: a primeira execução vai até ontem; depois, o fim fica no dia mais recente já carregado', async () => {
    await withRollback(async (tx) => {
      await tx.delete(tenderContractBackfillDays);
      const requestedDays: string[] = [];
      const context = createTestCollectorContext(tx, {
        contractsFetch: (url) => {
          requestedDays.push(url.searchParams.get('dataInicial') ?? '');
          return pageOf([]);
        },
        now: () => NOW,
        contracts: { maxDatabaseMb: 1_000_000 },
      });

      await runContractsBackfill(context, { from: '2026-10-11' });
      assert.deepEqual(requestedDays, ['20261012', '20261011'], 'de ontem para trás');

      requestedDays.length = 0;
      await runContractsBackfill(context, { from: '2026-10-09' });
      assert.deepEqual(requestedDays, ['20261010', '20261009'], 'sem repetir ontem: a coleta diária cobre os dias seguintes');
    });
  });

  test('trava própria: com contratos em execução, a segunda sai sem coletar; a varredura de editais usa outra trava', async () => {
    await withRollback(async (tx) => {
      const pool = localTestPool();
      const context = createTestCollectorContext(tx, { contractsFetch: () => pageOf([]), now: () => NOW });
      const lock = await tryAcquireCollectorLock(pool, COLLECTOR_LOCK_KEYS.contracts);
      assert.ok(lock, 'a primeira execução de contratos obtém a trava');
      try {
        assert.deepEqual(await runContractsDaily(context), { skipped: true, reason: 'coleta já em execução' });
        assert.deepEqual(await runContractsBackfill(context, { from: '2019-07-01', to: '2019-07-01', maxDbMb: 1_000_000 }), {
          skipped: true,
          reason: 'coleta já em execução',
        });
        const collectionLock = await tryAcquireCollectorLock(pool, COLLECTOR_LOCK_KEYS.collection);
        assert.ok(collectionLock, 'os contratos não bloqueiam a varredura de editais');
        await collectionLock.release();
      } finally {
        await lock.release();
      }
    });
  });

  test('limpeza: registra a execução e apaga os vencidos antes de hoje', async () => {
    await withRollback(async (tx) => {
      const expired = await insertTestContract(tx, { expiresOn: '2026-10-12' });
      const valid = await insertTestContract(tx, { expiresOn: '2026-10-13' });
      const context = createTestCollectorContext(tx, { contractsFetch: () => pageOf([]), now: () => NOW });

      const outcome = assertRan(await runContractsCleanup(context));
      assert.equal(outcome.status, 'SUCESSO');
      assert.equal(outcome.details['expiredBefore'], '2026-10-13');
      assert.ok(Number(outcome.details['removedContracts']) >= 1);
      const remaining = await tx.select({ id: tenderContracts.id }).from(tenderContracts).where(inArray(tenderContracts.id, [expired, valid]));
      assert.deepEqual(remaining.map((row) => row.id), [valid]);
    });
  });
});

function pick(value: unknown, keys: string[]): Record<string, unknown> {
  const record = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

async function backfillDays(tx: TendersDb, days: string[]): Promise<string[]> {
  const rows = await tx
    .select({ day: tenderContractBackfillDays.day })
    .from(tenderContractBackfillDays)
    .where(inArray(tenderContractBackfillDays.day, days));
  return rows.map((row) => row.day).sort();
}

async function backfillRunCount(tx: TendersDb): Promise<number> {
  const [row] = await tx.select({ total: count() }).from(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'CONTRATOS_CARGA'));
  return row?.total ?? 0;
}
