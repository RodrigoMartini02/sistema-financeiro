import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { tenderCollectionRuns, tenderContractBackfillDays, tenderContractFavorites, tenderContracts, tenderNotifications } from '../db/schema';
import {
  BACKFILL_FINISHED,
  BACKFILL_NOT_STARTED,
  runContractReminders,
  runContractsBackfill,
  runContractsCleanup,
  runContractsDaily,
  type DailyQueryDetail,
} from './contractRuns';
import { markBackfillDayCompleted, pendingTermsCondition } from './contractRepository';
import {
  closeLocalTestDatabase,
  createTestAccount,
  createTestCollectorContext,
  databaseTestsSkipReason,
  insertTestContract,
  localTestPool,
  withRollback,
} from './dbTestSupport';
import type { TendersDb } from './database';
import { COLLECTOR_LOCK_KEYS, tryAcquireCollectorLock } from './repository';
import type { CollectorContext, RunOutcome } from './runs';

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

/**
 * A coleta diária reconsulta os termos pendentes de toda a base, e o banco
 * local pode ter contratos reais assim: no teste, eles ficam conferidos (a
 * transação é desfeita no fim).
 */
async function settleLocalPendingTerms(tx: TendersDb): Promise<void> {
  await tx.update(tenderContracts).set({ amendmentsReference: sql`${tenderContracts.pncpGlobalUpdatedAt}` }).where(pendingTermsCondition);
}

/** A janela parte das coletas diárias anteriores: no teste, sem as do banco local (o piloto deixou algumas). */
async function withoutLocalDailyRuns(tx: TendersDb): Promise<void> {
  await tx.delete(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'CONTRATOS_DIARIA'));
}

/** Coleta diária anterior, terminada, com as consultas nos detalhes. */
async function insertDailyRun(tx: TendersDb, queries: Array<Omit<DailyQueryDetail, 'recordsRead'>>): Promise<void> {
  await tx.insert(tenderCollectionRuns).values({
    type: 'CONTRATOS_DIARIA',
    status: 'SUCESSO',
    details: { queries: queries.map((query) => ({ ...query, recordsRead: 0 })) },
  });
}

/** Consulta de contratos simulada que anota cada pedido: [consulta, dataInicial, dataFinal]. */
function recordingFetch(requests: string[][], respond: (endpoint: string) => Response = () => pageOf([])) {
  return (url: URL) => {
    const endpoint = url.pathname.endsWith('/atualizacao') ? 'contratos-atualizacao' : 'contratos';
    requests.push([endpoint, url.searchParams.get('dataInicial') ?? '', url.searchParams.get('dataFinal') ?? '']);
    return respond(endpoint);
  };
}

/** As consultas gravadas nos detalhes: [consulta, início, fim, terminou]. */
function queriesOf(outcome: { details: Record<string, unknown> }): unknown[][] {
  const queries = (outcome.details['queries'] ?? []) as Array<Record<string, unknown>>;
  return queries.map((query) => [query['endpoint'], query['from'], query['to'], query['completed']]);
}

const atNoon = (day: string) => () => new Date(`${day}T12:00:00Z`);

describe('execuções de contratos (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('diária: grava o termo inicial longo e conta os que ficam de fora, por motivo', async () => {
    await withRollback(async (tx) => {
      await settleLocalPendingTerms(tx);
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
      await settleLocalPendingTerms(tx);
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
      await settleLocalPendingTerms(tx);
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
      await settleLocalPendingTerms(tx);
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

  test('janela: grava cada consulta nos detalhes; sem coleta completa anterior, de ontem a hoje', async () => {
    await withRollback(async (tx) => {
      await withoutLocalDailyRuns(tx);
      await settleLocalPendingTerms(tx);
      const requests: string[][] = [];

      const first = assertRan(await runContractsDaily(createTestCollectorContext(tx, { contractsFetch: recordingFetch(requests), now: () => NOW })));
      assert.deepEqual(requests, [
        ['contratos', '20261012', '20261013'],
        ['contratos-atualizacao', '20261012', '20261013'],
      ]);
      assert.equal(first.details['today'], '2026-10-13');
      assert.deepEqual(first.details['queries'], [
        { endpoint: 'contratos', from: '2026-10-12', to: '2026-10-13', completed: true, recordsRead: 0 },
        { endpoint: 'contratos-atualizacao', from: '2026-10-12', to: '2026-10-13', completed: true, recordsRead: 0 },
      ]);

      requests.length = 0;
      await runContractsDaily(createTestCollectorContext(tx, { contractsFetch: recordingFetch(requests), now: atNoon('2026-10-14') }));
      assert.deepEqual(
        requests,
        [
          ['contratos', '20261013', '20261014'],
          ['contratos-atualizacao', '20261013', '20261014'],
        ],
        'dia normal: de ontem a hoje',
      );
    });
  });

  test('janela: falha do PNCP só nos atualizados; a próxima relê os atualizados desde a última completa', async () => {
    await withRollback(async (tx) => {
      await withoutLocalDailyRuns(tx);
      await settleLocalPendingTerms(tx);
      const requests: string[][] = [];
      let updatesDown = false;
      const contextAt = (day: string) =>
        createTestCollectorContext(tx, {
          contractsFetch: recordingFetch(requests, (endpoint) =>
            updatesDown && endpoint === 'contratos-atualizacao' ? new Response('erro', { status: 500 }) : pageOf([]),
          ),
          now: atNoon(day),
        });

      await runContractsDaily(contextAt('2026-10-14'));
      updatesDown = true;
      const failed = assertRan(await runContractsDaily(contextAt('2026-10-15')));
      assert.deepEqual(queriesOf(failed), [
        ['contratos', '2026-10-14', '2026-10-15', true],
        ['contratos-atualizacao', '2026-10-14', '2026-10-15', false],
      ]);

      updatesDown = false;
      requests.length = 0;
      await runContractsDaily(contextAt('2026-10-16'));
      assert.deepEqual(requests, [
        ['contratos', '20261015', '20261016'],
        ['contratos-atualizacao', '20261014', '20261016'],
      ]);
    });
  });

  test('janela: falha fora do PNCP na segunda consulta; a primeira, que terminou, conta para a próxima', async () => {
    await withRollback(async (tx) => {
      await withoutLocalDailyRuns(tx);
      await settleLocalPendingTerms(tx);
      await insertDailyRun(tx, [
        { endpoint: 'contratos', from: '2026-10-09', to: '2026-10-10', completed: true },
        { endpoint: 'contratos-atualizacao', from: '2026-10-09', to: '2026-10-10', completed: true },
      ]);
      const base = createTestCollectorContext(tx, {
        contractsFetch: (url) => (url.pathname.endsWith('/atualizacao') ? pageOf([contractRecord()]) : pageOf([])),
        now: () => NOW,
      });
      // O registro da página dos atualizados falha: erro fora do PNCP, que interrompe a execução.
      const context: CollectorContext = {
        ...base,
        logger: {
          ...base.logger,
          debug: (_message, fields) => {
            if (fields?.['endpoint'] === 'contratos-atualizacao') {
              throw new Error('falha simulada fora do PNCP');
            }
          },
        },
      };

      const failed = assertRan(await runContractsDaily(context));
      assert.equal(failed.status, 'FALHA');
      assert.deepEqual(queriesOf(failed), [['contratos', '2026-10-10', '2026-10-13', true]]);

      const requests: string[][] = [];
      await runContractsDaily(createTestCollectorContext(tx, { contractsFetch: recordingFetch(requests), now: atNoon('2026-10-14') }));
      assert.deepEqual(requests, [
        ['contratos', '20261013', '20261014'],
        ['contratos-atualizacao', '20261010', '20261014'],
      ]);
    });
  });

  test('janela: execução sem as consultas nos detalhes, ou ainda executando, não conta', async () => {
    await withRollback(async (tx) => {
      await withoutLocalDailyRuns(tx);
      await settleLocalPendingTerms(tx);
      await tx.insert(tenderCollectionRuns).values([
        { type: 'CONTRATOS_DIARIA', status: 'SUCESSO', details: { period: { dataInicial: '20261001', dataFinal: '20261002' } } },
        {
          type: 'CONTRATOS_DIARIA',
          status: 'EXECUTANDO',
          details: { queries: [{ endpoint: 'contratos', from: '2026-10-01', to: '2026-10-02', completed: true, recordsRead: 0 }] },
        },
      ]);
      const requests: string[][] = [];

      await runContractsDaily(createTestCollectorContext(tx, { contractsFetch: recordingFetch(requests), now: () => NOW }));
      assert.deepEqual(requests, [
        ['contratos', '20261012', '20261013'],
        ['contratos-atualizacao', '20261012', '20261013'],
      ]);
    });
  });

  test('janela: parada longa é recuperada em etapas de até 8 dias; a seguinte fica em dia', async () => {
    await withRollback(async (tx) => {
      await withoutLocalDailyRuns(tx);
      await settleLocalPendingTerms(tx);
      await insertDailyRun(tx, [
        { endpoint: 'contratos', from: '2026-10-02', to: '2026-10-03', completed: true },
        { endpoint: 'contratos-atualizacao', from: '2026-10-02', to: '2026-10-03', completed: true },
      ]);
      const requests: string[][] = [];

      const catchingUp = assertRan(await runContractsDaily(createTestCollectorContext(tx, { contractsFetch: recordingFetch(requests), now: () => NOW })));
      assert.deepEqual(requests, [
        ['contratos', '20261003', '20261010'],
        ['contratos-atualizacao', '20261003', '20261010'],
      ]);
      assert.equal(catchingUp.details['today'], '2026-10-13', 'o fim antes de hoje é o que a tela mostra como recuperação');
      assert.deepEqual(catchingUp.details['period'], { dataInicial: '20261003', dataFinal: '20261010' });

      requests.length = 0;
      await runContractsDaily(createTestCollectorContext(tx, { contractsFetch: recordingFetch(requests), now: atNoon('2026-10-14') }));
      assert.deepEqual(requests, [
        ['contratos', '20261010', '20261014'],
        ['contratos-atualizacao', '20261010', '20261014'],
      ]);
    });
  });

  test('reconsulta: os termos que falharam antes são consultados de novo e o vencimento é corrigido', async () => {
    await withRollback(async (tx) => {
      await settleLocalPendingTerms(tx);
      // Com sinal de alteração e sem conferência: a falha deixou o fim original.
      const failed = await insertTestContract(tx, {
        contractSequence: 910_001,
        originalTermEnd: '2026-06-30',
        expiresOn: '2026-06-30',
        publishedAt: '2025-07-02T10:00:00',
        pncpGlobalUpdatedAt: '2026-10-05T10:00:00',
      });
      // O PNCP não conhece os termos (404): conferido, sem termo.
      const notFound = await insertTestContract(tx, {
        contractSequence: 910_002,
        publishedAt: '2025-07-02T10:00:00',
        pncpGlobalUpdatedAt: '2026-10-05T10:00:00',
      });
      // Sem sinal de alteração, e com a conferência em dia: ficam de fora.
      const withoutSignal = await insertTestContract(tx, {
        contractSequence: 910_003,
        publishedAt: '2026-09-30T07:13:38',
        pncpGlobalUpdatedAt: '2026-09-30T07:23:32',
      });
      const alreadyChecked = await insertTestContract(tx, {
        contractSequence: 910_004,
        publishedAt: '2025-07-02T10:00:00',
        pncpGlobalUpdatedAt: '2026-10-05T10:00:00',
        amendmentsReference: '2026-10-05T10:00:00',
        amendments: [],
      });
      const termsRequested: string[] = [];
      const context = createTestCollectorContext(tx, {
        contractsFetch: () => pageOf([]),
        termsFetch: (url) => {
          termsRequested.push(url.pathname);
          return url.pathname.includes('/910002/') ? new Response('', { status: 404 }) : new Response(prorrogacao, { status: 200 });
        },
        now: () => NOW,
      });

      const outcome = assertRan(await runContractsDaily(context));
      assert.deepEqual(outcome.details['termsRetry'], {
        pendingAtStart: 2,
        checked: 2,
        resolved: 2,
        expiryChanged: 1,
        failed: 0,
        stoppedByFailures: false,
      });
      assert.equal(outcome.updatedCount, 2);
      assert.equal(termsRequested.length, 2, 'sem sinal e já conferido não são consultados');

      const [fixed, notFoundRow, withoutSignalRow, alreadyCheckedRow] = await Promise.all(
        [failed, notFound, withoutSignal, alreadyChecked].map(async (id) => {
          const [row] = await tx.select().from(tenderContracts).where(eq(tenderContracts.id, id));
          return row;
        }),
      );
      assert.equal(fixed?.expiresOn, '2026-12-31', 'o aditivo prorroga até 31/12/2026');
      assert.equal(fixed?.amendments?.length, 1);
      assert.equal(fixed?.amendmentsReference, fixed?.pncpGlobalUpdatedAt);
      assert.deepEqual(notFoundRow?.amendments, []);
      assert.equal(notFoundRow?.amendmentsReference, notFoundRow?.pncpGlobalUpdatedAt);
      assert.equal(withoutSignalRow?.amendmentsReference, null);
      assert.deepEqual(alreadyCheckedRow?.amendments, []);

      const next = assertRan(await runContractsDaily(context));
      assert.equal(pick(next.details['termsRetry'], ['pendingAtStart']).pendingAtStart, 0, 'nada mais pendente');
    });
  });

  test('reconsulta: falha mantém pendente e conta erro; 3 falhas seguidas param; o limite vale, do mais antigo ao mais novo', async () => {
    await withRollback(async (tx) => {
      await settleLocalPendingTerms(tx);
      const pendingNumbers: string[] = [];
      for (let day = 1; day <= 5; day += 1) {
        const pncpControlNumber = `TESTE-RECONSULTA-${randomUUID().slice(0, 8)}-${day}`;
        await insertTestContract(tx, {
          pncpControlNumber,
          contractSequence: 920_000 + day,
          publishedAt: '2026-01-02T10:00:00',
          pncpGlobalUpdatedAt: `2026-10-0${day}T10:00:00`,
        });
        pendingNumbers.push(pncpControlNumber);
      }
      let termsUp = false;
      let termsRequests = 0;
      const context = createTestCollectorContext(tx, {
        contractsFetch: () => pageOf([]),
        termsFetch: () => {
          termsRequests += 1;
          return termsUp ? new Response(prorrogacao, { status: 200 }) : new Response('erro', { status: 500 });
        },
        now: () => NOW,
      });

      const down = assertRan(await runContractsDaily(context));
      assert.deepEqual(down.details['termsRetry'], {
        pendingAtStart: 5,
        checked: 3,
        resolved: 0,
        expiryChanged: 0,
        failed: 3,
        stoppedByFailures: true,
      });
      assert.equal(down.errorCount, 3);
      assert.equal(termsRequests, 3);

      termsUp = true;
      const limited = assertRan(await runContractsDaily(context, { termsRetryLimit: 2 }));
      assert.deepEqual(pick(limited.details['termsRetry'], ['pendingAtStart', 'checked', 'resolved', 'failed']), {
        pendingAtStart: 5,
        checked: 2,
        resolved: 2,
        failed: 0,
      });
      const stillPending = await tx
        .select({ controlNumber: tenderContracts.pncpControlNumber })
        .from(tenderContracts)
        .where(and(inArray(tenderContracts.pncpControlNumber, pendingNumbers), pendingTermsCondition));
      assert.deepEqual(
        stillPending.map((row) => row.controlNumber).sort(),
        pendingNumbers.slice(2).sort(),
        'os dois de atualização mais antiga saíram primeiro',
      );
    });
  });

  test('reconsulta: o contrato que falhou na coleta não repete na mesma execução e é conferido na seguinte', async () => {
    await withRollback(async (tx) => {
      await settleLocalPendingTerms(tx);
      const record = contractRecord({ dataPublicacaoPncp: '2026-09-01T10:00:00', dataAtualizacaoGlobal: '2026-10-05T10:00:00' });
      let termsUp = false;
      let termsRequests = 0;
      const termsFetch = () => {
        termsRequests += 1;
        return termsUp ? new Response(prorrogacao, { status: 200 }) : new Response('erro', { status: 500 });
      };

      const first = assertRan(
        await runContractsDaily(createTestCollectorContext(tx, { contractsFetch: publicationOnly([record]), termsFetch, now: () => NOW })),
      );
      assert.equal(termsRequests, 1, 'a reconsulta pula quem falhou nesta execução');
      assert.deepEqual(pick(first.details['termsRetry'], ['pendingAtStart', 'checked']), { pendingAtStart: 1, checked: 0 });

      termsUp = true;
      const second = assertRan(
        await runContractsDaily(createTestCollectorContext(tx, { contractsFetch: () => pageOf([]), termsFetch, now: atNoon('2026-10-14') })),
      );
      assert.deepEqual(pick(second.details['termsRetry'], ['pendingAtStart', 'checked', 'resolved', 'expiryChanged']), {
        pendingAtStart: 1,
        checked: 1,
        resolved: 1,
        expiryChanged: 1,
      });
      const stored = await storedContract(tx, record.numeroControlePNCP);
      assert.equal(stored?.expiresOn, '2026-12-31');
      assert.equal(stored?.amendmentsReference, stored?.pncpGlobalUpdatedAt);
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

  test('trava própria: com contratos em execução, coleta, carga e avisos saem sem rodar; os editais usam outra trava', async () => {
    await withRollback(async (tx) => {
      const pool = localTestPool();
      const context = createTestCollectorContext(tx, { contractsFetch: () => pageOf([]), now: () => NOW });
      const lock = await tryAcquireCollectorLock(pool, COLLECTOR_LOCK_KEYS.contracts);
      assert.ok(lock, 'a primeira execução de contratos obtém a trava');
      const busy = { skipped: true, reason: 'coleta já em execução' };
      try {
        assert.deepEqual(await runContractsDaily(context), busy);
        assert.deepEqual(await runContractsBackfill(context, { from: '2019-07-01', to: '2019-07-01', maxDbMb: 1_000_000 }), busy);
        assert.deepEqual(await runContractReminders(context), busy);
      } finally {
        await lock.release();
      }
      // A trava dos editais não é pega aqui: os arquivos de teste rodam em
      // paralelo, e repository.db.test.ts testa a dela.
      assert.notEqual(COLLECTOR_LOCK_KEYS.contracts, COLLECTOR_LOCK_KEYS.collection);
      assert.notEqual(COLLECTOR_LOCK_KEYS.contracts, COLLECTOR_LOCK_KEYS.maintenance);
    });
  });

  test('avisos: a execução CONTRATOS_AVISOS registra o total de avisos do dia', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'avisos-execucao');
      const contractId = await insertTestContract(tx, { expiresOn: '2026-10-20' });
      await tx.insert(tenderContractFavorites).values({ accountId: account.accountId, userId: account.ownerId, contractId });
      const context = createTestCollectorContext(tx, { contractsFetch: () => pageOf([]), now: () => NOW });

      const outcome = assertRan(await runContractReminders(context));
      assert.equal(outcome.status, 'SUCESSO');
      assert.equal(outcome.details['today'], '2026-10-13');
      assert.ok(outcome.notificationCount >= 1);
      const [notice] = await tx
        .select({ type: tenderNotifications.type })
        .from(tenderNotifications)
        .where(and(eq(tenderNotifications.contractId, contractId), eq(tenderNotifications.accountId, account.accountId)));
      assert.equal(notice?.type, 'CONTRATO_VENCE_30D');
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

  test('limpeza: o contrato vencido favoritado fica (a pessoa continua vendo o favorito)', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'limpeza-favorito');
      const favorited = await insertTestContract(tx, { termStart: '2024-01-01', originalTermEnd: '2026-10-12', expiresOn: '2026-10-12' });
      const notFavorited = await insertTestContract(tx, { termStart: '2024-01-01', originalTermEnd: '2026-10-12', expiresOn: '2026-10-12' });
      await tx.insert(tenderContractFavorites).values({ accountId: account.accountId, userId: account.ownerId, contractId: favorited });
      const context = createTestCollectorContext(tx, { contractsFetch: () => pageOf([]), now: () => NOW });

      assertRan(await runContractsCleanup(context));
      const remaining = await tx
        .select({ id: tenderContracts.id })
        .from(tenderContracts)
        .where(inArray(tenderContracts.id, [favorited, notFavorited]));
      assert.deepEqual(remaining.map((row) => row.id), [favorited]);
    });
  });

  test('vencimento alterado: CONTRATO_ALTERADO só para quem favoritou, e só quando o vencimento muda', async () => {
    await withRollback(async (tx) => {
      await settleLocalPendingTerms(tx);
      // Gravado com o fim original (30/06/2026); o aditivo do PNCP prorroga até 31/12/2026.
      const record = contractRecord({
        dataVigenciaInicio: '2025-07-01',
        dataVigenciaFim: '2026-06-30',
        dataPublicacaoPncp: '2025-07-02T10:00:00',
        dataAtualizacaoGlobal: '2026-10-05T10:00:00',
      });
      const contractId = await insertTestContract(tx, {
        pncpControlNumber: String(record.numeroControlePNCP),
        termStart: '2025-07-01',
        originalTermEnd: '2026-06-30',
        expiresOn: '2026-06-30',
      });
      const fan = await createTestAccount(tx, 'alterado-favorito');
      const bystander = await createTestAccount(tx, 'alterado-sem-favorito');
      await tx.insert(tenderContractFavorites).values({ accountId: fan.accountId, userId: fan.ownerId, contractId });
      const context = createTestCollectorContext(tx, {
        contractsFetch: publicationOnly([record]),
        termsFetch: () => new Response(prorrogacao, { status: 200 }),
        now: () => NOW,
      });

      const outcome = assertRan(await runContractsDaily(context));
      assert.equal(outcome.notificationCount, 1);
      const notices = await tx
        .select({ accountId: tenderNotifications.accountId, type: tenderNotifications.type, title: tenderNotifications.title, link: tenderNotifications.link, reference: tenderNotifications.reference })
        .from(tenderNotifications)
        .where(eq(tenderNotifications.contractId, contractId));
      assert.deepEqual(notices, [
        {
          accountId: fan.accountId,
          type: 'CONTRATO_ALTERADO',
          title: 'Vencimento de contrato favorito mudou para 31/12/2026',
          link: `/contratos/${contractId}`,
          reference: '2026-12-31',
        },
      ]);
      assert.equal(notices.some((notice) => notice.accountId === bystander.accountId), false);

      const again = assertRan(await runContractsDaily(context));
      assert.equal(again.notificationCount, 0, 'mesmo vencimento: sem aviso novo');
      const [row] = await tx
        .select({ total: count() })
        .from(tenderNotifications)
        .where(and(eq(tenderNotifications.contractId, contractId), eq(tenderNotifications.type, 'CONTRATO_ALTERADO')));
      assert.equal(row?.total, 1);
    });
  });

  test('vencimento alterado pela reconsulta: CONTRATO_ALTERADO para quem favoritou; sem mudança, nenhum aviso', async () => {
    await withRollback(async (tx) => {
      await settleLocalPendingTerms(tx);
      // Os dois com termos pendentes (atualização global nova, sem conferência); o aditivo do PNCP prorroga até 31/12/2026.
      const pending = { originalTermEnd: '2026-06-30', publishedAt: '2025-07-02T10:00:00', pncpGlobalUpdatedAt: '2026-10-05T10:00:00' };
      // A falha deixou o fim original: o vencimento muda.
      const changed = await insertTestContract(tx, { ...pending, contractSequence: 930_001, expiresOn: '2026-06-30' });
      // Já tinha o vencimento do aditivo, conferido numa atualização anterior: não muda.
      const unchanged = await insertTestContract(tx, {
        ...pending,
        contractSequence: 930_002,
        expiresOn: '2026-12-31',
        amendmentsReference: '2026-09-01T10:00:00',
      });
      const fan = await createTestAccount(tx, 'reconsulta-favorito');
      await tx.insert(tenderContractFavorites).values([
        { accountId: fan.accountId, userId: fan.ownerId, contractId: changed },
        { accountId: fan.accountId, userId: fan.ownerId, contractId: unchanged },
      ]);
      const context = createTestCollectorContext(tx, {
        contractsFetch: () => pageOf([]),
        termsFetch: () => new Response(prorrogacao, { status: 200 }),
        now: () => NOW,
      });

      const outcome = assertRan(await runContractsDaily(context));
      assert.deepEqual(pick(outcome.details['termsRetry'], ['checked', 'resolved', 'expiryChanged']), { checked: 2, resolved: 2, expiryChanged: 1 });
      assert.equal(outcome.notificationCount, 1);
      const notices = await tx
        .select({
          accountId: tenderNotifications.accountId,
          contractId: tenderNotifications.contractId,
          type: tenderNotifications.type,
          title: tenderNotifications.title,
          reference: tenderNotifications.reference,
        })
        .from(tenderNotifications)
        .where(inArray(tenderNotifications.contractId, [changed, unchanged]));
      assert.deepEqual(notices, [
        {
          accountId: fan.accountId,
          contractId: changed,
          type: 'CONTRATO_ALTERADO',
          title: 'Vencimento de contrato favorito mudou para 31/12/2026',
          reference: '2026-12-31',
        },
      ]);
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
