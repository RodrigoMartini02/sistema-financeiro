import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { and, count, eq, inArray } from 'drizzle-orm';
import { readManifest } from '../contractStore/manifest';
import { readContract } from '../contractStore/queries';
import { ContractStoreReader } from '../contractStore/reader';
import { postgresSearchFields } from '../contractStore/textSearch';
import { publishWith, quietLogger, sampleContract, withTempDirectory } from '../contractStore/storeTestSupport';
import type { StoredContract } from '../contractStore/layout';
import { tenderCollectionRuns, tenderContractBackfillDays, tenderContractFavorites, tenderContractSavedSearches, tenderNotifications } from '../db/schema';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import {
  BACKFILL_FINISHED,
  BACKFILL_NOT_STARTED,
  runContractReminders,
  runContractsBackfill,
  runContractsDaily,
  type DailyQueryDetail,
} from './contractRuns';
import { markBackfillDayCompleted } from './contractProgress';
import type { TenderContractRow } from './contractMapping';
import {
  closeLocalTestDatabase,
  createTestAccount,
  createTestCollectorContext,
  databaseTestsSkipReason,
  localTestPool,
  withRollback,
} from './dbTestSupport';
import type { TendersDb } from './database';
import { COLLECTOR_LOCK_KEYS, tryAcquireCollectorLock } from './repository';
import type { CollectorContext, RunOutcome } from './runs';

// Execuções de contratos sobre o banco local e um armazém de exemplo (R2
// simulado), com o PNCP simulado: cada teste numa transação desfeita no fim. Os
// contratos moram só no armazém do teste; o Postgres tem os dias da carga, as
// execuções, os favoritos e os avisos.

const fixtures = path.join(__dirname, 'fixtures');
const realPage = JSON.parse(readFileSync(path.join(fixtures, 'contratos-page.json'), 'utf8')) as { data: Record<string, unknown>[] };
const prorrogacao = readFileSync(path.join(fixtures, 'termos-prorrogacao.json'), 'utf8');
const baseRecord = realPage.data.find((record) => record.numeroControlePNCP === '03353358000196-2-000216/2026') ?? {};
const AGENCY = '03353358000196';

// 13/10/2026, 09:00 em Brasília: hoje = 2026-10-13, ontem = 2026-10-12.
const NOW = new Date('2026-10-13T12:00:00Z');
/** Versão dos arquivos de partida: longe dos números de execução do banco. */
const SEED_VERSION = 900_000_001;

/** Contrato do PNCP com base no registro real (termo inicial de 1 ano), com número e sequencial próprios. */
function contractRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const sequence = randomInt(100_000, 900_000);
  return {
    ...baseRecord,
    numeroControlePNCP: `${AGENCY}-2-${String(sequence).padStart(6, '0')}/2026`,
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

/** O R2 simulado e as pastas do teste; `fails` recusa as chaves indicadas, no envio e no download. */
interface TestEnvironment {
  storage: ObjectStorage;
  objects: Map<string, Uint8Array>;
  directory: string;
}

async function withEnvironment<T>(run: (env: TestEnvironment) => Promise<T>, fails?: (key: string) => boolean): Promise<T> {
  const { storage, objects } = createMemoryStorage(fails);
  return withTempDirectory((directory) => run({ storage, objects, directory }));
}

type ContextOptions = Omit<Parameters<typeof createTestCollectorContext>[1], 'storage' | 'contractWorkDirectory'>;

/** Contexto do coletor com o armazém de exemplo e a cópia de trabalho do teste. */
function contextOf(tx: TendersDb, env: TestEnvironment, options: ContextOptions): CollectorContext {
  return createTestCollectorContext(tx, { ...options, storage: env.storage, contractWorkDirectory: path.join(env.directory, 'trabalho') });
}

/** Contratos já publicados no armazém antes da execução, com os campos de busca do Postgres, como os da coleta. */
async function seedStore(tx: TendersDb, env: TestEnvironment, contracts: TenderContractRow[]): Promise<void> {
  await publishWith(
    env.storage,
    path.join(env.directory, 'semente'),
    SEED_VERSION,
    async (writer) => {
      await writer.upsert(contracts);
    },
    { searchFields: postgresSearchFields(tx), today: '2026-10-13', now: () => NOW },
  );
}

/** Contrato de exemplo com o número de controle de um registro do PNCP. */
function storedFrom(record: Record<string, unknown>, overrides: Partial<TenderContractRow> = {}): TenderContractRow {
  return sampleContract(Number(record.sequencialContrato), {
    pncpControlNumber: String(record.numeroControlePNCP),
    agencyCnpj: AGENCY,
    contractYear: 2026,
    ...overrides,
  });
}

/** O contrato como está no armazém publicado (null se não está). */
async function storedContract(env: TestEnvironment, controlNumber: unknown): Promise<StoredContract | null> {
  const reader = await ContractStoreReader.create({ storage: env.storage, directory: path.join(env.directory, `leitura-${randomUUID()}`), logger: quietLogger });
  try {
    await reader.refresh();
    return await reader.query((connection) => readContract(connection, String(controlNumber)));
  } finally {
    await reader.close();
  }
}

async function storedRevision(env: TestEnvironment): Promise<string | null> {
  return (await readManifest(env.storage))?.revision ?? null;
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

interface ArchivedLine {
  collectedAt: string;
  controlNumber?: string;
  record: unknown;
}

/** As linhas de uma parte do arquivo, descompactadas. */
function archivedLines(body: Uint8Array | undefined): ArchivedLine[] {
  assert.ok(body, 'a parte foi enviada');
  return gunzipSync(body)
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line) as ArchivedLine);
}

/** Os arquivos do armazém de contratos (parquet) e o manifesto, fora o arquivo bruto. */
const storeObjectKeys = (objects: Map<string, Uint8Array>) => [...objects.keys()].filter((key) => key.startsWith('contratos/')).sort();
const archiveObjectKeys = (objects: Map<string, Uint8Array>) => [...objects.keys()].filter((key) => key.startsWith('pncp/')).sort();

/** O R2 recusa o envio dos arquivos do armazém enquanto `down()` for verdade; o manifesto e o resto passam. */
const uploadsDownWhile = (down: () => boolean) => (key: string) => down() && key.startsWith('contratos/arquivos/');

describe('execuções de contratos (banco local e armazém de exemplo)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('diária: grava todos os tipos, os curtos e os vencidos, com o tipo; os sem vencimento são contados à parte', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const kept = contractRecord();
        const empenho = contractRecord({ tipoContrato: { id: 7, nome: 'Empenho' } });
        const short = contractRecord({ dataVigenciaFim: '2027-01-15' });
        const expired = contractRecord({ dataVigenciaInicio: '2025-01-01', dataVigenciaFim: '2026-10-01' });
        // Dado que falta na origem: entra sem vencimento, conta à parte e não deixa a execução "Parcial".
        const withoutEnd = contractRecord({ dataVigenciaFim: null });
        const implausible = contractRecord({ dataVigenciaFim: '2227-09-29' });
        const context = contextOf(tx, env, { contractsFetch: publicationOnly([kept, empenho, short, expired, withoutEnd, implausible]), now: () => NOW });

        const outcome = assertRan(await runContractsDaily(context));
        assert.equal(outcome.status, 'SUCESSO');
        assert.equal(outcome.errorCount, 0);
        assert.equal(outcome.recordsRead, 6);
        assert.equal(outcome.newCount, 6);
        assert.equal(outcome.details['withoutEndDate'], 1);
        assert.equal(outcome.details['implausibleTerm'], 1);
        assert.deepEqual(outcome.details['period'], { dataInicial: '20261012', dataFinal: '20261013' });

        assert.equal((await storedContract(env, kept.numeroControlePNCP))?.contractTypeId, 1);
        assert.equal((await storedContract(env, empenho.numeroControlePNCP))?.contractTypeId, 7);
        assert.equal((await storedContract(env, short.numeroControlePNCP))?.expiresOn, '2027-01-15');
        assert.equal((await storedContract(env, expired.numeroControlePNCP))?.expiresOn, '2026-10-01', 'o vencido entra');
        for (const record of [withoutEnd, implausible]) {
          const stored = await storedContract(env, record.numeroControlePNCP);
          assert.equal(stored?.originalTermEnd, null);
          assert.equal(stored?.expiresOn, null);
        }
      });
    });
  });

  test('publicação: a execução publica uma versão nova do armazém com os totais; sem mudança, não publica', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const records = [contractRecord(), contractRecord({ dataVigenciaFim: '2026-10-01' }), contractRecord({ dataVigenciaFim: null })];
        const context = contextOf(tx, env, { contractsFetch: publicationOnly(records), now: () => NOW });

        const first = assertRan(await runContractsDaily(context));
        const publications = first.details['publications'] as Array<Record<string, unknown>>;
        assert.equal(publications.length, 1);
        assert.equal(publications[0]?.['revision'], `${first.runId}.1`);
        assert.equal(publications[0]?.['changedContracts'], 3);
        assert.deepEqual(publications[0]?.['totals'], { contracts: 3, active: 1, withoutExpiry: 1 });
        assert.equal(await storedRevision(env), `${first.runId}.1`);
        assert.ok(storeObjectKeys(env.objects).some((key) => key.endsWith('manifesto.json')));

        const second = assertRan(await runContractsDaily(context));
        assert.equal(second.details['publications'], undefined, 'os mesmos contratos: nada mudou, nada a publicar');
        assert.equal(second.updatedCount, 0);
        assert.equal(await storedRevision(env), `${first.runId}.1`, 'a versão em uso continua a mesma');
      });
    });
  });

  test('sem data de fim: entra sem vencimento e ganha o do aditivo de prazo quando os termos são consultados', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        // Com sinal de alteração: os termos são consultados, e o aditivo prorroga até 31/12/2026.
        const record = contractRecord({ dataVigenciaFim: null, dataPublicacaoPncp: '2026-09-01T10:00:00', dataAtualizacaoGlobal: '2026-10-05T10:00:00' });
        const context = contextOf(tx, env, {
          contractsFetch: publicationOnly([record]),
          termsFetch: () => new Response(prorrogacao, { status: 200 }),
          now: () => NOW,
        });

        assertRan(await runContractsDaily(context));
        const stored = await storedContract(env, record.numeroControlePNCP);
        assert.equal(stored?.originalTermEnd, null);
        assert.equal(stored?.expiresOn, '2026-12-31');
      });
    });
  });

  test('termos: não são reconsultados com a mesma data global, e são quando ela muda', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        // Vencido pela data original (30/06/2026), mas prorrogado pelo aditivo: entra na base.
        const record = contractRecord({
          dataVigenciaInicio: '2025-07-01',
          dataVigenciaFim: '2026-06-30',
          dataPublicacaoPncp: '2025-07-02T10:00:00',
          dataAtualizacaoGlobal: '2026-10-05T10:00:00',
        });
        let termsRequests = 0;
        let records = [record];
        const context = contextOf(tx, env, {
          contractsFetch: (url) => publicationOnly(records)(url),
          termsFetch: () => {
            termsRequests += 1;
            return new Response(prorrogacao, { status: 200 });
          },
          now: () => NOW,
        });

        await runContractsDaily(context);
        assert.equal(termsRequests, 1);
        const first = await storedContract(env, record.numeroControlePNCP);
        assert.equal(first?.expiresOn, '2026-12-31', 'o aditivo prorroga até 31/12/2026');
        assert.equal(first?.amendments?.length, 1);

        await runContractsDaily(context);
        assert.equal(termsRequests, 1, 'mesma data de atualização global: sem nova consulta');
        assert.equal((await storedContract(env, record.numeroControlePNCP))?.expiresOn, '2026-12-31');

        records = [{ ...record, dataAtualizacaoGlobal: '2026-10-10T08:00:00' }];
        await runContractsDaily(context);
        assert.equal(termsRequests, 2, 'a data global mudou: os termos são conferidos de novo');
      });
    });
  });

  test('vencido: o novo entra, e o já gravado é atualizado e fica na base', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const alreadyStored = contractRecord({ dataVigenciaInicio: '2025-01-01', dataVigenciaFim: '2026-10-01' });
        await seedStore(tx, env, [storedFrom(alreadyStored, { termStart: '2025-01-01', originalTermEnd: '2027-01-01', expiresOn: '2027-01-01' })]);
        const notStored = contractRecord({ dataVigenciaInicio: '2025-01-01', dataVigenciaFim: '2026-10-01' });
        const context = contextOf(tx, env, { contractsFetch: publicationOnly([alreadyStored, notStored]), now: () => NOW });

        const outcome = assertRan(await runContractsDaily(context));
        assert.equal(outcome.updatedCount, 1);
        assert.equal(outcome.newCount, 1);
        assert.equal((await storedContract(env, alreadyStored.numeroControlePNCP))?.expiresOn, '2026-10-01');
        assert.equal((await storedContract(env, notStored.numeroControlePNCP))?.expiresOn, '2026-10-01');
      });
    });
  });

  test('falha do PNCP nos termos conta erro e grava o fim original, sem marcar a conferência', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const record = contractRecord({ dataPublicacaoPncp: '2026-09-01T10:00:00', dataAtualizacaoGlobal: '2026-10-05T10:00:00' });
        const context = contextOf(tx, env, {
          contractsFetch: publicationOnly([record]),
          termsFetch: () => new Response('erro', { status: 500 }),
          now: () => NOW,
        });

        const outcome = assertRan(await runContractsDaily(context));
        assert.equal(outcome.status, 'PARCIAL');
        assert.equal(outcome.errorCount, 1);
        const stored = await storedContract(env, record.numeroControlePNCP);
        assert.equal(stored?.expiresOn, '2027-09-29');
        assert.equal(stored?.amendments, null);
        assert.equal(stored?.amendmentsReference, null);
      });
    });
  });

  test('janela: grava cada consulta nos detalhes; sem coleta completa anterior, de ontem a hoje', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        await withoutLocalDailyRuns(tx);
        const requests: string[][] = [];

        const first = assertRan(await runContractsDaily(contextOf(tx, env, { contractsFetch: recordingFetch(requests), now: () => NOW })));
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
        await runContractsDaily(contextOf(tx, env, { contractsFetch: recordingFetch(requests), now: atNoon('2026-10-14') }));
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
  });

  test('janela: falha do PNCP só nos atualizados; a próxima relê os atualizados desde a última completa', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        await withoutLocalDailyRuns(tx);
        const requests: string[][] = [];
        let updatesDown = false;
        const contextAt = (day: string) =>
          contextOf(tx, env, {
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
  });

  test('janela: falha fora do PNCP antes de publicar; nenhuma consulta conta, e a próxima relê desde a última completa', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        await withoutLocalDailyRuns(tx);
        await insertDailyRun(tx, [
          { endpoint: 'contratos', from: '2026-10-09', to: '2026-10-10', completed: true },
          { endpoint: 'contratos-atualizacao', from: '2026-10-09', to: '2026-10-10', completed: true },
        ]);
        const record = contractRecord();
        const base = contextOf(tx, env, {
          contractsFetch: (url) => (url.pathname.endsWith('/atualizacao') ? pageOf([record]) : pageOf([])),
          now: () => NOW,
        });
        // O registro da página dos atualizados falha: erro fora do PNCP, que interrompe a execução antes da publicação.
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
        assert.deepEqual(queriesOf(failed), [['contratos', '2026-10-10', '2026-10-13', false]], 'a que terminou também não conta: não foi publicada');
        assert.equal(await storedRevision(env), null, 'nada foi publicado');
        assert.equal(await storedContract(env, record.numeroControlePNCP), null);

        const requests: string[][] = [];
        await runContractsDaily(contextOf(tx, env, { contractsFetch: recordingFetch(requests), now: atNoon('2026-10-14') }));
        assert.deepEqual(requests, [
          ['contratos', '20261010', '20261014'],
          ['contratos-atualizacao', '20261010', '20261014'],
        ]);
      });
    });
  });

  test('janela: execução sem as consultas nos detalhes, ou ainda executando, não conta', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        await withoutLocalDailyRuns(tx);
        await tx.insert(tenderCollectionRuns).values([
          { type: 'CONTRATOS_DIARIA', status: 'SUCESSO', details: { period: { dataInicial: '20261001', dataFinal: '20261002' } } },
          {
            type: 'CONTRATOS_DIARIA',
            status: 'EXECUTANDO',
            details: { queries: [{ endpoint: 'contratos', from: '2026-10-01', to: '2026-10-02', completed: true, recordsRead: 0 }] },
          },
        ]);
        const requests: string[][] = [];

        await runContractsDaily(contextOf(tx, env, { contractsFetch: recordingFetch(requests), now: () => NOW }));
        assert.deepEqual(requests, [
          ['contratos', '20261012', '20261013'],
          ['contratos-atualizacao', '20261012', '20261013'],
        ]);
      });
    });
  });

  test('janela: parada longa é recuperada em etapas de até 8 dias; a seguinte fica em dia', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        await withoutLocalDailyRuns(tx);
        await insertDailyRun(tx, [
          { endpoint: 'contratos', from: '2026-10-02', to: '2026-10-03', completed: true },
          { endpoint: 'contratos-atualizacao', from: '2026-10-02', to: '2026-10-03', completed: true },
        ]);
        const requests: string[][] = [];

        const catchingUp = assertRan(await runContractsDaily(contextOf(tx, env, { contractsFetch: recordingFetch(requests), now: () => NOW })));
        assert.deepEqual(requests, [
          ['contratos', '20261003', '20261010'],
          ['contratos-atualizacao', '20261003', '20261010'],
        ]);
        assert.equal(catchingUp.details['today'], '2026-10-13', 'o fim antes de hoje é o que a tela mostra como recuperação');
        assert.deepEqual(catchingUp.details['period'], { dataInicial: '20261003', dataFinal: '20261010' });

        requests.length = 0;
        await runContractsDaily(contextOf(tx, env, { contractsFetch: recordingFetch(requests), now: atNoon('2026-10-14') }));
        assert.deepEqual(requests, [
          ['contratos', '20261010', '20261014'],
          ['contratos-atualizacao', '20261010', '20261014'],
        ]);
      });
    });
  });

  test('reconsulta: os termos que falharam antes são consultados de novo e o vencimento é corrigido', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        // Com sinal de alteração e sem conferência: a falha deixou o fim original.
        const failed = sampleContract(910_001, {
          originalTermEnd: '2026-06-30',
          expiresOn: '2026-06-30',
          publishedAt: '2025-07-02T10:00:00',
          pncpGlobalUpdatedAt: '2026-10-05T10:00:00',
        });
        // O PNCP não conhece os termos (404): conferido, sem termo.
        const notFound = sampleContract(910_002, { publishedAt: '2025-07-02T10:00:00', pncpGlobalUpdatedAt: '2026-10-05T10:00:00' });
        // Sem sinal de alteração, e com a conferência em dia: ficam de fora.
        const withoutSignal = sampleContract(910_003, { publishedAt: '2026-09-30T07:13:38', pncpGlobalUpdatedAt: '2026-09-30T07:23:32' });
        const alreadyChecked = sampleContract(910_004, {
          publishedAt: '2025-07-02T10:00:00',
          pncpGlobalUpdatedAt: '2026-10-05T10:00:00',
          amendmentsReference: '2026-10-05T10:00:00',
          amendments: [],
        });
        await seedStore(tx, env, [failed, notFound, withoutSignal, alreadyChecked]);
        const termsRequested: string[] = [];
        const context = contextOf(tx, env, {
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
          [failed, notFound, withoutSignal, alreadyChecked].map((contract) => storedContract(env, contract.pncpControlNumber)),
        );
        assert.equal(fixed?.expiresOn, '2026-12-31', 'o aditivo prorroga até 31/12/2026');
        assert.equal(fixed?.amendments?.length, 1);
        assert.equal(fixed?.amendmentsReference, fixed?.pncpGlobalUpdatedAt);
        assert.deepEqual(notFoundRow?.amendments, []);
        assert.equal(notFoundRow?.amendmentsReference, notFoundRow?.pncpGlobalUpdatedAt);
        assert.equal(withoutSignalRow?.amendmentsReference, null);
        assert.deepEqual(alreadyCheckedRow?.amendments, []);
        assert.equal(fixed?.contractObject, failed.contractObject, 'o resto do contrato fica como está');

        const next = assertRan(await runContractsDaily(context));
        assert.equal(pick(next.details['termsRetry'], ['pendingAtStart']).pendingAtStart, 0, 'nada mais pendente');
      });
    });
  });

  test('reconsulta: falha mantém pendente e conta erro; 3 falhas seguidas param; o limite vale, do mais antigo ao mais novo', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const pending = Array.from({ length: 5 }, (_, index) =>
          sampleContract(920_001 + index, { publishedAt: '2026-01-02T10:00:00', pncpGlobalUpdatedAt: `2026-10-0${index + 1}T10:00:00` }),
        );
        await seedStore(tx, env, pending);
        let termsUp = false;
        let termsRequests = 0;
        const context = contextOf(tx, env, {
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
        const checkedNow = await Promise.all(pending.map(async (contract) => (await storedContract(env, contract.pncpControlNumber))?.amendmentsReference !== null));
        assert.deepEqual(checkedNow, [true, true, false, false, false], 'os dois de atualização mais antiga saíram primeiro');
      });
    });
  });

  test('reconsulta: o contrato que falhou na coleta não repete na mesma execução e é conferido na seguinte', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const record = contractRecord({ dataPublicacaoPncp: '2026-09-01T10:00:00', dataAtualizacaoGlobal: '2026-10-05T10:00:00' });
        let termsUp = false;
        let termsRequests = 0;
        const termsFetch = () => {
          termsRequests += 1;
          return termsUp ? new Response(prorrogacao, { status: 200 }) : new Response('erro', { status: 500 });
        };

        const first = assertRan(await runContractsDaily(contextOf(tx, env, { contractsFetch: publicationOnly([record]), termsFetch, now: () => NOW })));
        assert.equal(termsRequests, 1, 'a reconsulta pula quem falhou nesta execução');
        assert.deepEqual(pick(first.details['termsRetry'], ['pendingAtStart', 'checked']), { pendingAtStart: 1, checked: 0 });

        termsUp = true;
        const second = assertRan(await runContractsDaily(contextOf(tx, env, { contractsFetch: () => pageOf([]), termsFetch, now: atNoon('2026-10-14') })));
        assert.deepEqual(pick(second.details['termsRetry'], ['pendingAtStart', 'checked', 'resolved', 'expiryChanged']), {
          pendingAtStart: 1,
          checked: 1,
          resolved: 1,
          expiryChanged: 1,
        });
        const stored = await storedContract(env, record.numeroControlePNCP);
        assert.equal(stored?.expiresOn, '2026-12-31');
        assert.equal(stored?.amendmentsReference, stored?.pncpGlobalUpdatedAt);
      });
    });
  });

  test('carga: do mais recente ao mais antigo, marca só o dia concluído e retoma o pendente', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const requestedDays: string[] = [];
        let failDay: string | null = '20190302';
        const context = contextOf(tx, env, {
          contractsFetch: (url) => {
            const day = url.searchParams.get('dataInicial') ?? '';
            requestedDays.push(day);
            return day === failDay ? new Response('erro', { status: 500 }) : pageOf([contractRecord({ dataVigenciaFim: '2030-01-01' })]);
          },
          now: () => NOW,
        });

        const first = assertRan(await runContractsBackfill(context, { from: '2019-03-01', to: '2019-03-03' }));
        assert.deepEqual(requestedDays, ['20190303', '20190302', '20190301']);
        assert.equal(first.status, 'PARCIAL');
        assert.deepEqual(
          { daysCompleted: 2, failedDays: 1, pendingAfter: 1, stoppedBy: null, finished: false },
          pick(first.details['backfill'], ['daysCompleted', 'failedDays', 'pendingAfter', 'stoppedBy', 'finished']),
        );
        assert.deepEqual(await backfillDays(tx, ['2019-03-01', '2019-03-02', '2019-03-03']), ['2019-03-01', '2019-03-03']);
        assert.ok(await storedRevision(env), 'os contratos dos dias concluídos foram publicados');

        failDay = null;
        requestedDays.length = 0;
        const second = assertRan(await runContractsBackfill(context, { from: '2019-03-01', to: '2019-03-03' }));
        assert.deepEqual(requestedDays, ['20190302'], 'só o dia pendente');
        assert.equal(pick(second.details['backfill'], ['finished']).finished, true);
      });
    });
  });

  test('carga: publica a cada N dias concluídos e só então marca os dias; a falha na publicação deixa os dias pendentes', async () => {
    await withRollback(async (tx) => {
      let uploadsDown = false;
      let requestsCount = 0;
      await withEnvironment(
        async (env) => {
          const context = contextOf(tx, env, {
            contractsFetch: () => {
              requestsCount += 1;
              // A partir do terceiro dia, o R2 recusa os arquivos: a segunda publicação falha.
              uploadsDown = requestsCount >= 3;
              return pageOf([contractRecord({ dataVigenciaFim: '2030-01-01' })]);
            },
            now: () => NOW,
          });
          const range = { from: '2019-08-01', to: '2019-08-05', publishEveryDays: 2 };

          const failed = assertRan(await runContractsBackfill(context, range));
          assert.equal(failed.status, 'FALHA');
          assert.deepEqual(
            await backfillDays(tx, ['2019-08-01', '2019-08-02', '2019-08-03', '2019-08-04', '2019-08-05']),
            ['2019-08-04', '2019-08-05'],
            'só os dois primeiros dias, que foram publicados',
          );
          assert.deepEqual(pick(failed.details['backfill'], ['daysCompleted', 'pendingAfter', 'finished', 'publishEveryDays']), {
            daysCompleted: 2,
            pendingAfter: 3,
            finished: false,
            publishEveryDays: 2,
          });
          assert.equal((failed.details['publications'] as unknown[]).length, 1);

          uploadsDown = false;
          requestsCount = Number.NEGATIVE_INFINITY;
          const resumed = assertRan(await runContractsBackfill(context, range));
          assert.equal(resumed.status, 'SUCESSO');
          assert.deepEqual(pick(resumed.details['backfill'], ['pendingAtStart', 'daysCompleted', 'finished']), { pendingAtStart: 3, daysCompleted: 3, finished: true });
          assert.equal((resumed.details['publications'] as unknown[]).length, 2, 'dois dias, e o último dia sozinho nas sobras');
          assert.equal(
            (await backfillDays(tx, ['2019-08-01', '2019-08-02', '2019-08-03', '2019-08-04', '2019-08-05'])).length,
            5,
          );
        },
        uploadsDownWhile(() => uploadsDown),
      );
    });
  });

  test('carga: para no limite de tempo, com o motivo nos detalhes', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        // Cada consulta "leva" 40 minutos no relógio simulado.
        let clock = NOW.getTime();
        const context = contextOf(tx, env, {
          contractsFetch: () => {
            clock += 40 * 60_000;
            return pageOf([]);
          },
          now: () => new Date(clock),
          contracts: { backfillMinutes: 60 },
        });

        const byTime = assertRan(await runContractsBackfill(context, { from: '2019-04-01', to: '2019-04-03' }));
        assert.deepEqual(pick(byTime.details['backfill'], ['daysCompleted', 'stoppedBy', 'pendingAfter']), {
          daysCompleted: 2,
          stoppedBy: 'time',
          pendingAfter: 1,
        });
      });
    });
  });

  test('carga: sem o R2 não roda nem registra execução; sem dia pendente, é pulada', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const withoutStorage = createTestCollectorContext(tx, { contractsFetch: () => pageOf([]), now: () => NOW });
        const runsBefore = await backfillRunCount(tx);
        assert.deepEqual(await runContractsBackfill(withoutStorage, { from: '2019-06-01', to: '2019-06-02' }), {
          skipped: true,
          reason: BACKFILL_NOT_STARTED,
        });
        assert.equal(await backfillRunCount(tx), runsBefore);

        const context = contextOf(tx, env, { contractsFetch: () => pageOf([]), now: () => NOW });
        await markBackfillDayCompleted(tx, '2019-06-01', { recordsRead: 0, storedCount: 0, termsChecked: 0 });
        await markBackfillDayCompleted(tx, '2019-06-02', { recordsRead: 0, storedCount: 0, termsChecked: 0 });
        assert.deepEqual(await runContractsBackfill(context, { from: '2019-06-01', to: '2019-06-02' }), {
          skipped: true,
          reason: BACKFILL_FINISHED,
        });
        assert.equal(await backfillRunCount(tx), runsBefore);
      });
    });
  });

  test('carga: a primeira execução vai até ontem; depois, o fim fica no dia mais recente já carregado', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        await tx.delete(tenderContractBackfillDays);
        const requestedDays: string[] = [];
        const context = contextOf(tx, env, {
          contractsFetch: (url) => {
            requestedDays.push(url.searchParams.get('dataInicial') ?? '');
            return pageOf([]);
          },
          now: () => NOW,
        });

        await runContractsBackfill(context, { from: '2026-10-11' });
        assert.deepEqual(requestedDays, ['20261012', '20261011'], 'de ontem para trás');

        requestedDays.length = 0;
        await runContractsBackfill(context, { from: '2026-10-09' });
        assert.deepEqual(requestedDays, ['20261010', '20261009'], 'sem repetir ontem: a coleta diária cobre os dias seguintes');
      });
    });
  });

  test('trava própria: com contratos em execução, coleta, carga e avisos saem sem rodar; os editais usam outra trava', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const pool = localTestPool();
        const context = contextOf(tx, env, { contractsFetch: () => pageOf([]), now: () => NOW });
        const lock = await tryAcquireCollectorLock(pool, COLLECTOR_LOCK_KEYS.contracts);
        assert.ok(lock, 'a primeira execução de contratos obtém a trava');
        const busy = { skipped: true, reason: 'coleta já em execução' };
        try {
          assert.deepEqual(await runContractsDaily(context), busy);
          assert.deepEqual(await runContractsBackfill(context, { from: '2019-07-01', to: '2019-07-01' }), busy);
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
  });

  test('sem o R2 configurado: a coleta diária falha com o motivo registrado, e nada é gravado', async () => {
    await withRollback(async (tx) => {
      const context = createTestCollectorContext(tx, { contractsFetch: publicationOnly([contractRecord()]), now: () => NOW });
      const outcome = assertRan(await runContractsDaily(context));
      assert.equal(outcome.status, 'FALHA');
      const errors = outcome.details['errors'] as Array<Record<string, unknown>>;
      assert.equal(errors[0]?.['kind'], 'fatal');
      assert.match(String(errors[0]?.['message']), /R2/);
    });
  });

  test('avisos: a execução CONTRATOS_AVISOS registra o total de avisos do dia e atualiza o total das buscas salvas', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const account = await createTestAccount(tx, 'avisos-execucao');
        const contract = sampleContract(1, { contractObject: 'Limpeza predial', expiresOn: '2026-10-20' });
        await seedStore(tx, env, [contract]);
        await tx.insert(tenderContractFavorites).values({ accountId: account.accountId, userId: account.ownerId, contractKey: contract.pncpControlNumber });
        const [search] = await tx
          .insert(tenderContractSavedSearches)
          .values({ accountId: account.accountId, userId: account.ownerId, name: 'Limpeza', terms: ['limpeza'] })
          .returning();
        const context = contextOf(tx, env, { contractsFetch: () => pageOf([]), now: () => NOW });

        const outcome = assertRan(await runContractReminders(context));
        assert.equal(outcome.status, 'SUCESSO');
        assert.equal(outcome.details['today'], '2026-10-13');
        assert.equal(outcome.notificationCount, 1);
        assert.deepEqual(outcome.details['savedSearchTotals'], { searches: 1, updated: 1, failed: 0 });
        const [notice] = await tx
          .select({ type: tenderNotifications.type })
          .from(tenderNotifications)
          .where(and(eq(tenderNotifications.contractKey, contract.pncpControlNumber), eq(tenderNotifications.accountId, account.accountId)));
        assert.equal(notice?.type, 'CONTRATO_VENCE_30D');
        const [updated] = await tx.select().from(tenderContractSavedSearches).where(eq(tenderContractSavedSearches.id, search!.id));
        assert.equal(updated?.activeTotal, 1);
        assert.ok(updated?.activeTotalAt);
      });
    });
  });

  test('avisos: sem cópia do armazém, a execução falha e os avisos esperam a seguinte', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(
        async (env) => {
          const outcome = assertRan(await runContractReminders(contextOf(tx, env, { contractsFetch: () => pageOf([]), now: () => NOW })));
          assert.equal(outcome.status, 'FALHA');
          const errors = outcome.details['errors'] as Array<Record<string, unknown>>;
          assert.match(String(errors[0]?.['message']), /armazém de contratos não respondeu/);
          assert.equal(outcome.notificationCount, 0);
        },
        () => true,
      );
    });
  });

  test('vencimento alterado: CONTRATO_ALTERADO só para quem favoritou, só quando o vencimento muda e só depois de publicar', async () => {
    await withRollback(async (tx) => {
      let uploadsDown = true;
      await withEnvironment(
        async (env) => {
          // Gravado com o fim original (30/06/2026); o aditivo do PNCP prorroga até 31/12/2026.
          const record = contractRecord({
            dataVigenciaInicio: '2025-07-01',
            dataVigenciaFim: '2026-06-30',
            dataPublicacaoPncp: '2025-07-02T10:00:00',
            dataAtualizacaoGlobal: '2026-10-05T10:00:00',
          });
          uploadsDown = false;
          await seedStore(tx, env, [storedFrom(record, { termStart: '2025-07-01', originalTermEnd: '2026-06-30', expiresOn: '2026-06-30' })]);
          const key = String(record.numeroControlePNCP);
          const fan = await createTestAccount(tx, 'alterado-favorito');
          const bystander = await createTestAccount(tx, 'alterado-sem-favorito');
          await tx.insert(tenderContractFavorites).values({ accountId: fan.accountId, userId: fan.ownerId, contractKey: key });
          const context = contextOf(tx, env, {
            contractsFetch: publicationOnly([record]),
            termsFetch: () => new Response(prorrogacao, { status: 200 }),
            now: () => NOW,
          });

          // O R2 recusa os arquivos novos: não publica, e ninguém é avisado de uma mudança que o app não mostra.
          uploadsDown = true;
          const failed = assertRan(await runContractsDaily(context));
          assert.equal(failed.status, 'FALHA');
          assert.equal(failed.notificationCount, 0);
          assert.equal(await noticeCount(tx, key), 0);

          uploadsDown = false;
          const outcome = assertRan(await runContractsDaily(context));
          assert.equal(outcome.notificationCount, 1);
          const notices = await tx
            .select({
              accountId: tenderNotifications.accountId,
              type: tenderNotifications.type,
              title: tenderNotifications.title,
              link: tenderNotifications.link,
              reference: tenderNotifications.reference,
            })
            .from(tenderNotifications)
            .where(eq(tenderNotifications.contractKey, key));
          assert.deepEqual(notices, [
            {
              accountId: fan.accountId,
              type: 'CONTRATO_ALTERADO',
              title: 'Vencimento de contrato favorito mudou para 31/12/2026',
              link: `/contratos/${encodeURIComponent(key)}`,
              reference: '2026-12-31',
            },
          ]);
          assert.equal(notices.some((notice) => notice.accountId === bystander.accountId), false);
          assert.equal((await storedContract(env, key))?.expiresOn, '2026-12-31', 'o vencimento novo foi publicado');

          const again = assertRan(await runContractsDaily(context));
          assert.equal(again.notificationCount, 0, 'mesmo vencimento: sem aviso novo');
          assert.equal(await noticeCount(tx, key), 1);
        },
        uploadsDownWhile(() => uploadsDown),
      );
    });
  });

  test('a publicação que falha deixa as consultas como não concluídas, e a próxima relê a mesma janela e publica', async () => {
    await withRollback(async (tx) => {
      let uploadsDown = true;
      await withEnvironment(
        async (env) => {
          await withoutLocalDailyRuns(tx);
          await insertDailyRun(tx, [
            { endpoint: 'contratos', from: '2026-10-10', to: '2026-10-11', completed: true },
            { endpoint: 'contratos-atualizacao', from: '2026-10-10', to: '2026-10-11', completed: true },
          ]);
          const record = contractRecord();
          const requests: string[][] = [];
          const respond = (endpoint: string) => (endpoint === 'contratos' ? pageOf([record]) : pageOf([]));
          const contextAt = (day: string) => contextOf(tx, env, { contractsFetch: recordingFetch(requests, respond), now: atNoon(day) });

          const failed = assertRan(await runContractsDaily(contextAt('2026-10-13')));
          assert.equal(failed.status, 'FALHA');
          assert.deepEqual(queriesOf(failed), [
            ['contratos', '2026-10-11', '2026-10-13', false],
            ['contratos-atualizacao', '2026-10-11', '2026-10-13', false],
          ]);
          assert.equal(await storedRevision(env), null, 'a versão em uso não mudou');

          uploadsDown = false;
          requests.length = 0;
          const next = assertRan(await runContractsDaily(contextAt('2026-10-14')));
          assert.deepEqual(requests, [
            ['contratos', '20261011', '20261014'],
            ['contratos-atualizacao', '20261011', '20261014'],
          ]);
          assert.equal(next.status, 'SUCESSO');
          assert.ok(await storedContract(env, record.numeroControlePNCP), 'o contrato lido na execução que falhou entrou agora');
        },
        uploadsDownWhile(() => uploadsDown),
      );
    });
  });

  test('arquivo bruto: a coleta diária grava todo contrato lido, também os que ficam de fora, e a resposta dos termos', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const kept = contractRecord();
        const empenho = contractRecord({ tipoContrato: { id: 7, nome: 'Empenho' } });
        // Com sinal de alteração: os termos são consultados.
        const amended = contractRecord({ dataPublicacaoPncp: '2026-09-01T10:00:00', dataAtualizacaoGlobal: '2026-10-05T10:00:00' });
        const context = contextOf(tx, env, {
          contractsFetch: publicationOnly([kept, empenho, amended]),
          termsFetch: () => new Response(prorrogacao, { status: 200 }),
          now: () => NOW,
        });

        const outcome = assertRan(await runContractsDaily(context));
        assert.equal(outcome.status, 'SUCESSO');
        const contractsKey = `pncp/contratos/2026/10/13/${outcome.runId}-0001.jsonl.gz`;
        const termsKey = `pncp/contratos-termos/2026/10/13/${outcome.runId}-0001.jsonl.gz`;
        assert.deepEqual(archiveObjectKeys(env.objects), [contractsKey, termsKey].sort());
        assert.deepEqual(
          archivedLines(env.objects.get(contractsKey)).map((line) => line.record),
          [kept, empenho, amended],
          'o arquivo bruto guarda tudo o que foi lido',
        );
        assert.deepEqual(archivedLines(env.objects.get(termsKey)), [
          { collectedAt: NOW.toISOString(), controlNumber: amended.numeroControlePNCP, record: JSON.parse(prorrogacao) },
        ]);
        const archiveBytes = archiveObjectKeys(env.objects).reduce((total, key) => total + (env.objects.get(key)?.length ?? 0), 0);
        assert.deepEqual(outcome.details['archive'], { enabled: true, files: 2, records: 4, bytes: archiveBytes, failures: 0 });
      });
    });
  });

  test('arquivo bruto: falha no R2 conta erro e a coleta segue, com o contrato gravado no armazém', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(
        async (env) => {
          const record = contractRecord();
          const context = contextOf(tx, env, { contractsFetch: publicationOnly([record]), now: () => NOW });

          const outcome = assertRan(await runContractsDaily(context));
          assert.equal(outcome.status, 'PARCIAL');
          assert.deepEqual(outcome.details.errors, [
            { kind: 'archive', key: `pncp/contratos/2026/10/13/${outcome.runId}-0001.jsonl.gz`, message: 'R2 fora do ar' },
          ]);
          assert.deepEqual(outcome.details['archive'], { enabled: true, files: 0, records: 0, bytes: 0, failures: 1 });
          assert.ok(await storedContract(env, record.numeroControlePNCP), 'o contrato entra na base mesmo sem o arquivo bruto');
        },
        (key) => key.startsWith('pncp/'),
      );
    });
  });

  test('arquivo bruto: a execução que falha fora do PNCP ainda envia o que já leu', async () => {
    await withRollback(async (tx) => {
      await withEnvironment(async (env) => {
        const record = contractRecord();
        const base = contextOf(tx, env, {
          contractsFetch: (url) => (url.pathname.endsWith('/atualizacao') ? pageOf([record]) : pageOf([])),
          now: () => NOW,
        });
        // Erro fora do PNCP depois de gravar a página dos atualizados: interrompe a execução.
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
        assert.deepEqual(
          archivedLines(env.objects.get(`pncp/contratos/2026/10/13/${failed.runId}-0001.jsonl.gz`)).map((line) => line.record),
          [record],
        );
        assert.equal(pick(failed.details['archive'], ['files']).files, 1);
      });
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

async function noticeCount(tx: TendersDb, key: string): Promise<number> {
  const [row] = await tx.select({ total: count() }).from(tenderNotifications).where(eq(tenderNotifications.contractKey, key));
  return row?.total ?? 0;
}
