import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { eq, inArray } from 'drizzle-orm';
import { readManifest } from '../contractStore/manifest';
import { publishWith, readParquetRows, sampleContract, withTempDirectory } from '../contractStore/storeTestSupport';
import { tenderCollectionRuns, tenderContractFavorites, tenderFederalAgencies, tenderNotifications } from '../db/schema';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { closeLocalTestDatabase, createTestAccount, createTestCollectorContext, databaseTestsSkipReason, withRollback } from './dbTestSupport';
import type { FederalSettings } from './config';
import type { TenderContractRow } from './contractMapping';
import type { TendersDb } from './database';
import {
  federalRecentFrom,
  isLaterRegistration,
  mapFederalContract,
  parseFederalUnit,
  type FederalMappingContext,
  type FederalSkipReason,
  type FederalUnit,
} from './federalMapping';
import { readFederalAgency } from './federalProgress';
import {
  FEDERAL_CYCLE_NOT_STARTED,
  FEDERAL_CYCLE_NO_TIME,
  FEDERAL_LOAD_FINISHED,
  FEDERAL_LOAD_NOT_STARTED,
  FEDERAL_LOAD_NO_TIME,
  runFederalCycle,
  runFederalLoad,
} from './federalRuns';
import type { CollectorContext, RunOutcome } from './runs';

// Execuções dos contratos federais sobre o banco local e um armazém de exemplo (R2 simulado), com a fonte simulada: cada
// teste numa transação desfeita no fim. A fonte devolve as linhas reais da fixture (UFMG, 26/10/2026). Precisam da
// migration 0087d no banco local (plano .plans/licitacoes-contratos-federais.md).

type Row = Record<string, unknown>;

interface Fixture {
  orgaos: Row[];
  unidades: Row[];
  contratos: Record<string, Row>;
}

const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'comprasgov-contratos.json'), 'utf8')) as Fixture;

// 26/10/2026, 09:00 em Brasília.
const NOW = new Date('2026-10-26T12:00:00Z');
const UFMG = '26238';
const UFMG_CNPJ = '17217985000104';
const FROM_YEAR = 2023;

const units = new Map<string, FederalUnit>(
  fixture.unidades.map((raw) => {
    const unit = parseFederalUnit(raw);
    assert.ok(unit);
    return [unit.code, unit];
  }),
);

/** As linhas da UFMG da fixture, como a fonte as devolve. */
const UFMG_ROWS: Row[] = Object.values(fixture.contratos).filter((row) => String(row['codigoOrgao']) === UFMG);

interface ServerOptions {
  rows?: Row[];
  agencies?: Row[];
  units?: Row[];
  /** Anota o caminho e os parâmetros de cada pedido. */
  requests?: string[];
  /** Resposta no lugar da normal para o pedido. */
  override?: (url: URL) => Response | null;
  /** Linhas que a fonte conta no total e nunca entrega. */
  neverDelivered?: (row: Row) => boolean;
  /** Anuncia tantos registros a mais que os da lista de órgãos (lista incompleta). */
  agenciesMissing?: number;
  unitsMissing?: number;
}

const datePart = (value: unknown) => String(value ?? '').slice(0, 10);

function pageOf(matching: Row[], url: URL, announced: number, drop: (row: Row) => boolean = () => false): Response {
  const size = Number(url.searchParams.get('tamanhoPagina') ?? '500');
  const page = Number(url.searchParams.get('pagina') ?? '1');
  const totalPages = Math.max(1, Math.ceil(matching.length / size));
  return Response.json({
    resultado: matching.slice((page - 1) * size, page * size).filter((row) => !drop(row)),
    totalRegistros: announced,
    totalPaginas: totalPages,
    paginasRestantes: Math.max(0, totalPages - page),
  });
}

/** A fonte simulada do Compras.gov.br: lista de órgãos, de unidades e os contratos por início e por fim da vigência. */
function federalServer(options: ServerOptions = {}) {
  const rows = options.rows ?? UFMG_ROWS;
  return (url: URL): Response => {
    options.requests?.push(`${url.pathname}?${url.searchParams.toString()}`);
    const overridden = options.override?.(url);
    if (overridden) {
      return overridden;
    }
    if (url.pathname === '/modulo-uasg/2_consultarOrgao') {
      const list = options.agencies ?? fixture.orgaos;
      return pageOf(list, url, list.length + (options.agenciesMissing ?? 0));
    }
    if (url.pathname === '/modulo-uasg/1_consultarUasg') {
      const list = options.units ?? fixture.unidades;
      return pageOf(list, url, list.length + (options.unitsMissing ?? 0));
    }
    const byEnd = url.pathname === '/modulo-contratos/1.2_consultarContratos_FimVigencia';
    assert.ok(byEnd || url.pathname === '/modulo-contratos/1_consultarContratos', `pedido inesperado: ${url.pathname}`);
    const field = byEnd ? 'dataVigenciaFinal' : 'dataVigenciaInicial';
    const min = url.searchParams.get(byEnd ? 'dataVigenciaFinalMin' : 'dataVigenciaInicialMin') ?? '';
    const max = url.searchParams.get(byEnd ? 'dataVigenciaFinalMax' : 'dataVigenciaInicialMax') ?? '';
    const matching = rows.filter(
      (row) => String(row['codigoOrgao']) === url.searchParams.get('codigoOrgao') && row[field] !== null && datePart(row[field]) >= min && datePart(row[field]) <= max,
    );
    return pageOf(matching, url, matching.length, options.neverDelivered);
  };
}

function assertRan(outcome: RunOutcome) {
  if (outcome.skipped) {
    assert.fail(`a execução deveria rodar: ${outcome.reason}`);
  }
  return outcome;
}

interface TestEnvironment {
  storage: ObjectStorage;
  objects: Map<string, Uint8Array>;
  directory: string;
}

async function withEnvironment<T>(run: (env: TestEnvironment) => Promise<T>, wrap?: (storage: ObjectStorage) => ObjectStorage): Promise<T> {
  const memory = createMemoryStorage();
  return withTempDirectory((directory) => run({ storage: wrap ? wrap(memory.storage) : memory.storage, objects: memory.objects, directory }));
}

interface ContextOptions {
  fetch: (url: URL) => Response | Promise<Response>;
  now?: () => Date;
  federal?: Partial<FederalSettings>;
  withoutStorage?: boolean;
}

function contextOf(tx: TendersDb, env: TestEnvironment, options: ContextOptions): CollectorContext {
  const base = createTestCollectorContext(tx, {
    contractsFetch: () => {
      throw new Error('pedido inesperado aos contratos do PNCP');
    },
    resultsFetch: options.fetch,
    now: options.now ?? (() => NOW),
    ...(options.withoutStorage ? {} : { storage: env.storage }),
    contractWorkDirectory: path.join(env.directory, 'trabalho'),
  });
  return { ...base, config: { ...base.config, federal: { ...base.config.federal, from: `${FROM_YEAR}-01-01`, ...options.federal } } };
}

/** O teste parte sem execuções nem órgãos federais: o banco local pode ter os de uma conferência. */
async function withoutLocalFederalState(tx: TendersDb): Promise<void> {
  await tx.delete(tenderCollectionRuns).where(inArray(tenderCollectionRuns.type, ['FEDERAIS_CARGA', 'FEDERAIS_CICLO']));
  await tx.delete(tenderFederalAgencies);
}

interface PublishedContract {
  key: string;
  expiresOn: string | null;
  cnpj: string;
}

/** Os contratos como estão no armazém publicado (conjunto `contratos`). */
async function publishedContracts(env: TestEnvironment): Promise<PublishedContract[]> {
  const manifest = await readManifest(env.storage);
  const rows: PublishedContract[] = [];
  for (const file of manifest?.datasets.contratos ?? []) {
    for (const row of await readParquetRows(env.objects, file.path, 'numero_controle_pncp, vencimento, orgao_cnpj')) {
      rows.push({
        key: String(row['numero_controle_pncp']),
        expiresOn: row['vencimento'] === null ? null : String(row['vencimento']).slice(0, 10),
        cnpj: String(row['orgao_cnpj']),
      });
    }
  }
  return rows.sort((a, b) => (a.key < b.key ? -1 : 1));
}

interface Expectation {
  /** O que a carga deve gravar: as linhas mapeadas dos anos lidos, a inclusão mais recente de cada chave. */
  contracts: Map<string, TenderContractRow>;
  skipped: Record<FederalSkipReason, number>;
  invalid: number;
  /** Chaves que a fonte registrou mais de uma vez entre as linhas que entram. */
  collidingKeys: number;
}

/** O que o mapeamento diz das linhas da UFMG que a carga lê (do ano `fromYear` em diante), para conferir contra a execução. */
function expectation(rows: Row[], fromYear: number, now: Date = NOW): Expectation {
  const context: FederalMappingContext = { agencyCnpj: UFMG_CNPJ, units, recentFrom: federalRecentFrom(now) };
  const result: Expectation = { contracts: new Map(), skipped: { withPncpNumber: 0, excluded: 0, recent: 0, agencyWithoutCnpj: 0, termEndsBeforeStart: 0, pncpTwin: 0 }, invalid: 0, collidingKeys: 0 };
  for (const raw of rows) {
    if (Number(datePart(raw['dataVigenciaInicial']).slice(0, 4)) < fromYear) {
      continue;
    }
    const mapped = mapFederalContract(raw, context);
    if (!mapped.ok && mapped.kind === 'invalid') {
      result.invalid += 1;
    } else if (!mapped.ok) {
      result.skipped[mapped.reason] += 1;
    } else {
      const previous = result.contracts.get(mapped.row.pncpControlNumber);
      if (previous !== undefined) {
        result.collidingKeys += 1;
      }
      if (previous === undefined || isLaterRegistration(mapped.row, previous)) {
        result.contracts.set(mapped.row.pncpControlNumber, mapped.row);
      }
    }
  }
  return result;
}

const expectedContracts = (rows: Row[], fromYear: number, now: Date = NOW) => expectation(rows, fromYear, now).contracts;

interface ArchivedLine {
  collectedAt: string;
  record: Row;
}

/** Todas as linhas do arquivo bruto dos contratos federais, descompactadas. */
function archivedContracts(env: TestEnvironment): ArchivedLine[] {
  return [...env.objects.entries()]
    .filter(([key]) => key.startsWith('comprasgov/contratos/'))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([, body]) =>
      gunzipSync(body)
        .toString('utf8')
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line) as ArchivedLine),
    );
}

/** R2 simulado que recusa o envio das chaves indicadas enquanto `down()` for verdade; o resto passa. */
function refusingUploads(down: () => boolean, matches: (key: string) => boolean) {
  return (base: ObjectStorage): ObjectStorage => ({
    ...base,
    async putObject(key, body, contentType) {
      if (down() && matches(key)) {
        throw new Error('R2 fora do ar');
      }
      await base.putObject(key, body, contentType);
    },
  });
}

const requestsFor = (requests: string[], pattern: RegExp) => requests.filter((request) => pattern.test(request));
const metricsOf = (outcome: { details: Record<string, unknown> }) => outcome.details['metrics'] as Record<string, unknown>;
const backfillOf = (outcome: { details: Record<string, unknown> }) => outcome.details['backfill'] as Record<string, unknown>;
const errorKinds = (outcome: { details: Record<string, unknown> }) =>
  ((outcome.details['errors'] ?? []) as Array<Record<string, unknown>>).map((error) => String(error['kind']));

describe('execuções dos contratos federais (banco local e armazém de exemplo)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('carga da UFMG: grava no armazém só o que o PNCP não tem, marca o órgão e arquiva o bruto com o CPF mascarado', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const requests: string[] = [];
        const context = contextOf(tx, env, { fetch: federalServer({ requests }) });

        const outcome = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));

        // O que entrou é o que o mapeamento diz, da inclusão mais recente de cada chave.
        const expected = expectation(UFMG_ROWS, FROM_YEAR);
        const stored = await publishedContracts(env);
        assert.deepEqual(
          stored.map((contract) => contract.key),
          [...expected.contracts.keys()].sort(),
        );
        assert.ok(stored.every((contract) => contract.cnpj === UFMG_CNPJ));
        assert.equal(outcome.newCount, expected.contracts.size);
        assert.equal(outcome.updatedCount, 0);
        // As linhas inválidas da fixture (número vazio, data que não existe, número grande demais) viram erro de registro,
        // e a execução fica parcial (leu, mas com erro).
        assert.equal(expected.invalid, 3);
        assert.equal(outcome.status, 'PARCIAL');
        assert.deepEqual([...new Set(errorKinds(outcome))], ['record']);
        assert.equal(outcome.errorCount, expected.invalid);

        // A colisão da chave: vale a inclusão mais recente (a segunda, com fim em 2030).
        const collided = stored.find((contract) => contract.key === 'comprasgov-153262-50-00019/2024');
        assert.equal(collided?.expiresOn, '2030-01-02');
        assert.equal(expected.collidingKeys, 1);
        assert.equal(metricsOf(outcome)['collidingKeys'], expected.collidingKeys);

        // O que o PNCP já tem, o que foi excluído e o recente demais ficam de fora, contados por motivo.
        assert.deepEqual(metricsOf(outcome)['skipped'], expected.skipped);
        assert.deepEqual(expected.skipped, { withPncpNumber: 2, excluded: 1, recent: 1, agencyWithoutCnpj: 0, termEndsBeforeStart: 1, pncpTwin: 0 }, 'o fim antes do início é contado à parte');

        // O andamento: lido até 2023, com dado, CNPJ do PNCP aprendido, maior fim e última inclusão da fonte.
        const state = await readFederalAgency(tx, UFMG);
        assert.deepEqual(
          [state?.oldestLoadedYear, state?.hasData, state?.pncpCnpj, state?.lastInclusion],
          [2023, true, UFMG_CNPJ, '2026-10-20 10:00:00'],
        );
        assert.equal(outcome.details['sourceLastInclusion'], '2026-10-20T10:00:00');
        assert.equal(backfillOf(outcome)['finished'], false, 'só a UFMG foi lida; os outros órgãos seguem pendentes');

        // A lista de órgãos e a de unidades foram lidas, e só os anos da faixa pedidos.
        assert.equal(requestsFor(requests, /2_consultarOrgao/).length, 1);
        assert.equal(requestsFor(requests, /1_consultarUasg/).length, 1);
        const years = requestsFor(requests, /1_consultarContratos/).map((request) => new URLSearchParams(request.split('?')[1]).get('dataVigenciaInicialMin'));
        assert.deepEqual(years, ['2026-01-01', '2025-01-01', '2024-01-01', '2023-01-01'], 'do ano atual para trás');

        // O bruto: o que entrou e o que foi recusado, com o CPF mascarado.
        const lines = archivedContracts(env);
        assert.equal(lines.length, expected.contracts.size + expected.invalid);
        // O documento do fornecedor nunca é um CPF inteiro (o nome do MEI traz o CPF no cadastro público, e segue como está).
        assert.ok(lines.every((line) => String(line.record['niFornecedor'] ?? '').replace(/\D/g, '').length !== 11), 'o CPF inteiro não vai para o bruto');
        assert.ok(lines.some((line) => line.record['niFornecedor'] === '***.456.789-**'));
      });
    });
  });

  test('gêmeo do PNCP no armazém: o contrato federal igual a um do PNCP não entra, e a contagem diz', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        // O PNCP já tem o contrato 00019/2024 da UFMG (mesmo fornecedor e ano, número sem o ano e sem zeros à esquerda).
        const pncp = sampleContract(1, { agencyCnpj: UFMG_CNPJ, contractNumber: '19', contractYear: 2024, supplierDocument: '38680138000151' });
        await publishWith(env.storage, path.join(env.directory, 'semente'), 1, async (writer) => void (await writer.upsert([pncp])));
        const context = contextOf(tx, env, { fetch: federalServer() });

        const outcome = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        const expected = expectation(UFMG_ROWS, FROM_YEAR);
        const twinKey = 'comprasgov-153262-50-00019/2024';
        assert.ok(expected.contracts.has(twinKey));
        const stored = (await publishedContracts(env)).map((contract) => contract.key);
        assert.equal(stored.includes(twinKey), false, 'o federal igual ao do PNCP não entrou');
        assert.equal(stored.includes(pncp.pncpControlNumber), true, 'o do PNCP continua');
        assert.equal(outcome.newCount, expected.contracts.size - 1);
        assert.deepEqual(metricsOf(outcome)['skipped'], { ...expected.skipped, pncpTwin: 1 });
        assert.equal(metricsOf(outcome)['mapped'], expected.contracts.size - 1);
        // O bruto não leva o que não entrou.
        assert.equal(archivedContracts(env).length, expected.contracts.size - 1 + expected.invalid);
      });
    });
  });

  test('o mesmo contrato registrado duas vezes, com anos de início diferentes: vale a inclusão mais recente e reler não alterna', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const key = 'comprasgov-153262-50-00019/2024';
        const rows = UFMG_ROWS.map((row) => ({ ...row }));
        // A inclusão mais recente (fim em 2030) passa a começar em 2023; a antiga segue começando em 2024: cada janela
        // devolve uma das duas.
        const later = rows.find((row) => row['numeroContrato'] === '00019/2024' && String(row['dataHoraInclusao']).startsWith('2025-06-30'));
        assert.ok(later);
        later['dataVigenciaInicial'] = '2023-06-01T00:00:00';
        const context = contextOf(tx, env, { fetch: federalServer({ rows }) });

        assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        assert.equal((await publishedContracts(env)).find((contract) => contract.key === key)?.expiresOn, '2030-01-02', 'vale a inclusão mais recente');
        const revision = (await readManifest(env.storage))?.revision;

        // A leitura seguinte vê a antiga (2024) antes da recente (2023): a antiga não sobrescreve.
        const again = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        assert.deepEqual([again.newCount, again.updatedCount], [0, 0]);
        assert.equal(again.details['publications'], undefined, 'nada mudou: o armazém não é publicado');
        assert.equal((await readManifest(env.storage))?.revision, revision);
        assert.equal(metricsOf(again)['supersededRows'], 1);
        assert.equal((await publishedContracts(env)).find((contract) => contract.key === key)?.expiresOn, '2030-01-02');
      });
    });
  });

  test('segunda passada da mesma faixa: nada novo, nada alterado e nada publicado', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const context = contextOf(tx, env, { fetch: federalServer() });
        assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        const revision = (await readManifest(env.storage))?.revision;

        const again = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        assert.deepEqual([again.newCount, again.updatedCount], [0, 0]);
        assert.equal(again.details['publications'], undefined, 'sem mudança, o armazém não é publicado');
        assert.equal((await readManifest(env.storage))?.revision, revision);
        // O bruto da segunda passada só leva o que foi recusado (as linhas inválidas), não o que já estava gravado.
        const expected = expectation(UFMG_ROWS, FROM_YEAR);
        assert.equal(archivedContracts(env).length, expected.contracts.size + expected.invalid + expected.invalid);
      });
    });
  });

  test('carga sem órgão pedido: lê os cinco órgãos federais da lista, só o da UFMG com contrato, e fecha os outros sem dado', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const requests: string[] = [];
        const context = contextOf(tx, env, { fetch: federalServer({ requests }) });

        const outcome = assertRan(await runFederalLoad(context));
        assert.deepEqual(outcome.details['agencies'], { total: 5, inserted: 5, updated: 0, withoutCnpj: 1 }, 'o órgão de esfera estadual da lista fica de fora');
        assert.equal(outcome.details['units'], 6);
        const states = await Promise.all(['26238', '52121', '36000', '32205', '32991'].map((code) => readFederalAgency(tx, code)));
        assert.deepEqual(states.map((state) => state?.oldestLoadedYear), [2023, 2023, 2023, 2023, 2023]);
        assert.deepEqual(states.map((state) => state?.hasData), [true, false, false, false, false], 'sem contrato nos quatro anos: sem dado, e medido');
        assert.ok(states[1]?.measuredAt);
        assert.equal(backfillOf(outcome)['finished'], true);
        assert.equal(backfillOf(outcome)['agenciesCompleted'], 5);

        // Já lidos até 2023: sem órgão pendente, a carga nem abre execução.
        const runsBefore = (await tx.select().from(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'FEDERAIS_CARGA'))).length;
        const finished = await runFederalLoad(context);
        assert.deepEqual(finished, { skipped: true, reason: FEDERAL_LOAD_FINISHED });
        assert.equal((await tx.select().from(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'FEDERAIS_CARGA'))).length, runsBefore);
      });
    });
  });

  test('janela com falha da fonte: o órgão fica parado no ano anterior e a próxima carga retoma dali, sem reler o que já leu', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const failing = { on: true };
        const requests: string[] = [];
        const server = federalServer({
          requests,
          override: (url) => (failing.on && url.searchParams.get('dataVigenciaInicialMin') === '2024-01-01' ? new Response('erro', { status: 500 }) : null),
        });
        const context = contextOf(tx, env, { fetch: server });

        const first = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        assert.equal(first.status, 'PARCIAL');
        assert.ok(errorKinds(first).includes('request'));
        assert.equal(metricsOf(first)['failedWindows'], 1);
        assert.equal((await readFederalAgency(tx, UFMG))?.oldestLoadedYear, 2025, '2026 e 2025 lidos, 2024 falhou: o órgão para aí');

        // A fonte volta: a carga sem órgão pedido retoma do ano anterior ao mais antigo lido, sem reler 2026 e 2025.
        failing.on = false;
        requests.length = 0;
        assertRan(await runFederalLoad(context));
        const ufmgYears = requestsFor(requests, /1_consultarContratos\?.*codigoOrgao=26238/).map((request) => new URLSearchParams(request.split('?')[1]).get('dataVigenciaInicialMin'));
        assert.deepEqual(ufmgYears, ['2024-01-01', '2023-01-01'], 'retoma do ano anterior ao mais antigo lido');
        assert.equal((await readFederalAgency(tx, UFMG))?.oldestLoadedYear, 2023);
        assert.deepEqual((await publishedContracts(env)).map((contract) => contract.key), [...expectedContracts(UFMG_ROWS, FROM_YEAR).keys()].sort());
      });
    });
  });

  test('três janelas seguidas com falha encerram o bloco: a fonte está fora do ar', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const requests: string[] = [];
        const context = contextOf(tx, env, {
          fetch: federalServer({ requests, override: (url) => (url.pathname.includes('modulo-contratos') ? new Response('erro', { status: 503 }) : null) }),
        });

        const outcome = assertRan(await runFederalLoad(context));
        assert.equal(backfillOf(outcome)['stoppedBy'], 'source');
        assert.equal(requestsFor(requests, /modulo-contratos/).length, 3, 'um pedido por órgão, e parou no terceiro');
        assert.equal(outcome.status, 'FALHA', 'a lista de órgãos foi lida, mas nenhum contrato');
        assert.equal(await readFederalAgency(tx, UFMG).then((state) => state?.oldestLoadedYear), null);
      });
    });
  });

  test('janela que a fonte nunca completa: erro de leitura incompleta e o órgão não avança', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const missing = UFMG_ROWS.find((row) => row['numeroContrato'] === '00019/2024');
        assert.ok(missing);
        const context = contextOf(tx, env, { fetch: federalServer({ neverDelivered: (row) => row === missing || row['numeroContrato'] === missing['numeroContrato'] }) });

        const outcome = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        assert.ok(errorKinds(outcome).includes('incomplete'));
        assert.equal(metricsOf(outcome)['incompleteWindows'], 1);
        assert.equal((await readFederalAgency(tx, UFMG))?.oldestLoadedYear, 2025, '2024 não completou: o andamento fica em 2025');
      });
    });
  });

  test('o que a execução leu só vale depois de publicar: com o R2 recusando os arquivos do armazém, o órgão não é marcado', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      let down = true;
      await withEnvironment(
        async (env) => {
          const context = contextOf(tx, env, { fetch: federalServer() });
          const failed = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
          assert.equal(failed.status, 'FALHA');
          assert.equal((await readFederalAgency(tx, UFMG))?.oldestLoadedYear, null, 'nada foi marcado');
          assert.equal((await readFederalAgency(tx, UFMG))?.hasData, null);

          down = false;
          const ok = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
          assert.equal(ok.status, 'PARCIAL');
          assert.equal((await readFederalAgency(tx, UFMG))?.oldestLoadedYear, 2023);
        },
        refusingUploads(() => down, (key) => key.startsWith('contratos/arquivos/')),
      );
    });
  });

  test('o bruto não enviado cancela a publicação: nada é dado como lido sem o arquivo bruto', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(
        async (env) => {
          const context = contextOf(tx, env, { fetch: federalServer() });
          const outcome = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
          assert.equal(outcome.status, 'FALHA');
          assert.ok(errorKinds(outcome).includes('archive'));
          assert.equal((await readFederalAgency(tx, UFMG))?.oldestLoadedYear, null);
          assert.equal(await readManifest(env.storage), null, 'nada publicado');
        },
        refusingUploads(() => true, (key) => key.startsWith('comprasgov/contratos/')),
      );
    });
  });

  test('sem R2, sem tempo na rotina ou sem órgão pendente, a carga e o ciclo não rodam nem abrem execução', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const offline = contextOf(tx, env, { fetch: federalServer(), withoutStorage: true });
        assert.deepEqual(await runFederalLoad(offline), { skipped: true, reason: FEDERAL_LOAD_NOT_STARTED });
        assert.deepEqual(await runFederalCycle(offline), { skipped: true, reason: FEDERAL_CYCLE_NOT_STARTED });

        const context = contextOf(tx, env, { fetch: federalServer() });
        // Faltam 10 minutos para o prazo da rotina e a folga é de 15: não sobra nem um minuto.
        const tooLate = NOW.getTime() + 10 * 60_000;
        assert.deepEqual(await runFederalLoad(context, { deadlineAt: tooLate }), { skipped: true, reason: FEDERAL_LOAD_NO_TIME });
        assert.deepEqual(await runFederalCycle(context, { deadlineAt: tooLate }), { skipped: true, reason: FEDERAL_CYCLE_NO_TIME });
        const runs = await tx.select().from(tenderCollectionRuns).where(inArray(tenderCollectionRuns.type, ['FEDERAIS_CARGA', 'FEDERAIS_CICLO']));
        assert.equal(runs.length, 0);
      });
    });
  });

  test('bloco com tempo esgotado: para antes da primeira janela, sem falha, e o órgão segue pendente', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        let calls = 0;
        // Cada leitura do relógio avança 2 minutos: com bloco de 1 minuto, o primeiro teste de tempo já estoura.
        const context = contextOf(tx, env, { fetch: federalServer(), now: () => new Date(NOW.getTime() + calls++ * 120_000) });
        const outcome = assertRan(await runFederalLoad(context, { agencyCode: UFMG, maxMinutes: 1 }));
        assert.equal(backfillOf(outcome)['stoppedBy'], 'time');
        assert.equal(outcome.status, 'SUCESSO');
        assert.equal((await readFederalAgency(tx, UFMG))?.oldestLoadedYear, null);
      });
    });
  });

  test('lista de órgãos incompleta: com órgãos no banco a carga segue com a lista que tem e conta o erro; sem nenhum, falha', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const incompleteAgencies = federalServer({ agenciesMissing: 3 });
        const context = contextOf(tx, env, { fetch: incompleteAgencies });
        const empty = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        assert.equal(empty.status, 'FALHA', 'sem lista no banco nem completa na fonte');
        assert.equal((await tx.select().from(tenderFederalAgencies)).length, 0);

        await tx.insert(tenderFederalAgencies).values({ agencyCode: UFMG, name: 'UFMG', registeredCnpj: '17217985005840' });
        const withStored = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        assert.equal(withStored.status, 'PARCIAL', 'seguiu com o órgão que já estava no banco, e contou o erro da lista');
        assert.ok(errorKinds(withStored).includes('agencies'));
        assert.equal((await readFederalAgency(tx, UFMG))?.oldestLoadedYear, 2023);
      });
    });
  });

  test('lista de unidades incompleta: a execução falha antes de ler contrato, para não gravar contrato sem UF e município', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const requests: string[] = [];
        const context = contextOf(tx, env, { fetch: federalServer({ requests, unitsMissing: 2 }) });
        const outcome = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        assert.equal(outcome.status, 'FALHA');
        assert.equal(requestsFor(requests, /modulo-contratos/).length, 0);
        assert.equal(await readManifest(env.storage), null);
      });
    });
  });

  test('ciclo: lê os vigentes pelo fim e os recentes pelo início, só dos órgãos com dado, e a segunda passada não grava nada', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const requests: string[] = [];
        const context = contextOf(tx, env, { fetch: federalServer({ requests }) });
        assertRan(await runFederalLoad(context));
        requests.length = 0;

        const first = assertRan(await runFederalCycle(context));
        assert.equal((first.details['cycle'] as Record<string, unknown>)['eligible'], 1, 'só a UFMG tem dado');
        const byEnd = requestsFor(requests, /1\.2_consultarContratos_FimVigencia/).map((request) => new URLSearchParams(request.split('?')[1]));
        const maxEnd = [...expectedContracts(UFMG_ROWS, FROM_YEAR).values()].map((row) => row.originalTermEnd ?? '').sort().at(-1);
        assert.equal(byEnd[0]?.get('dataVigenciaFinalMin'), '2026-09-26', '30 dias antes de hoje');
        assert.equal(byEnd.at(-1)?.get('dataVigenciaFinalMax'), maxEnd, 'até o maior fim visto');
        assert.ok(byEnd.every((params) => Number(params.get('tamanhoPagina')) >= 389));
        const recent = requestsFor(requests, /\/1_consultarContratos\?/).map((request) => new URLSearchParams(request.split('?')[1]));
        assert.equal(recent.length, 1);
        assert.deepEqual([recent[0]?.get('dataVigenciaInicialMin'), recent[0]?.get('dataVigenciaInicialMax')], ['2026-06-28', '2026-10-26']);

        // As linhas lidas já estavam gravadas: nada novo, nada alterado, nada publicado.
        assert.deepEqual([first.newCount, first.updatedCount], [0, 0]);
        assert.equal(first.details['publications'], undefined);
        assert.equal(first.status, 'SUCESSO', 'os vigentes e os recentes não têm linha inválida');
        assert.deepEqual(
          metricsOf(first)['skipped'],
          { withPncpNumber: 1, excluded: 0, recent: 2, agencyWithoutCnpj: 0, termEndsBeforeStart: 0, pncpTwin: 0 },
          'o contrato do PNCP vigente aparece no fim da vigência e fica de fora; o recente demais é lido pelo fim e pelo início',
        );
        const state = await readFederalAgency(tx, UFMG);
        assert.ok(state?.cycleReadAt, 'o ciclo marcou a leitura');

        // Sem 7 dias, o órgão não volta; com o órgão pedido, o ciclo roda mesmo assim (reparo).
        requests.length = 0;
        const idle = assertRan(await runFederalCycle(context));
        assert.equal((idle.details['cycle'] as Record<string, unknown>)['eligible'], 0);
        assert.equal(requestsFor(requests, /modulo-contratos/).length, 0);
        const forced = assertRan(await runFederalCycle(context, { agencyCode: UFMG }));
        assert.equal((forced.details['cycle'] as Record<string, unknown>)['agenciesRead'], 1);
        assert.deepEqual([forced.newCount, forced.updatedCount], [0, 0]);
      });
    });
  });

  test('ciclo: contrato que mudou na fonte é atualizado, e quem favoritou é avisado do vencimento novo depois de publicar', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const key = 'comprasgov-153262-50-00019/2024';
        const rows = UFMG_ROWS.map((row) => ({ ...row }));
        const server = federalServer({ rows });
        const context = contextOf(tx, env, { fetch: server });
        assertRan(await runFederalLoad(context, { agencyCode: UFMG }));

        const fan = await createTestAccount(tx, 'federal-favorito');
        const bystander = await createTestAccount(tx, 'federal-sem-favorito');
        await tx.insert(tenderContractFavorites).values({ accountId: fan.accountId, userId: fan.ownerId, contractKey: key });
        // A fonte prorroga o contrato (a segunda inclusão, a que vale) de 2030-01-02 para 2029-06-30.
        const registered = rows.find((row) => row['numeroContrato'] === '00019/2024' && String(row['dataHoraInclusao']).startsWith('2025-06-30'));
        assert.ok(registered);
        registered['dataVigenciaFinal'] = '2029-06-30T00:00:00';

        const outcome = assertRan(await runFederalCycle(context, { agencyCode: UFMG }));
        assert.deepEqual([outcome.newCount, outcome.updatedCount], [0, 1]);
        assert.equal((await publishedContracts(env)).find((contract) => contract.key === key)?.expiresOn, '2029-06-30');
        assert.equal(outcome.notificationCount, 1);
        const notices = await tx
          .select({ type: tenderNotifications.type, accountId: tenderNotifications.accountId })
          .from(tenderNotifications)
          .where(eq(tenderNotifications.contractKey, key));
        assert.deepEqual(notices, [{ type: 'CONTRATO_ALTERADO', accountId: fan.accountId }]);
        assert.equal(notices.some((notice) => notice.accountId === bystander.accountId), false);
      });
    });
  });

  test('ciclo com a fonte parada: sem dado novo termina com sucesso e mostra até quando a fonte tem dado', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        // Só o contrato de 2024 sem número do PNCP e sem inclusão recente: nada na janela de 120 dias, nada novo.
        const rows = [fixture.contratos['contratoSemPncp'] as Row];
        const context = contextOf(tx, env, { fetch: federalServer({ rows }) });
        assertRan(await runFederalLoad(context, { agencyCode: UFMG }));

        const outcome = assertRan(await runFederalCycle(context, { agencyCode: UFMG }));
        assert.equal(outcome.status, 'SUCESSO');
        assert.equal(outcome.errorCount, 0);
        assert.equal(outcome.details['sourceLastInclusion'], null, 'o ciclo só leu janelas sem linha: nada a mostrar nesta execução');
        assert.equal((await readFederalAgency(tx, UFMG))?.lastInclusion, '2024-01-24 12:27:07', 'o painel guarda até quando a fonte tem dado');
      });
    });
  });

  test('medição de órgão sem dado: lê o ano anterior e o atual; com contrato, o órgão passa a ter dado', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const rows: Row[] = [];
        const requests: string[] = [];
        // A carga em fevereiro de 2026; a medição seguinte, 91 dias depois, ainda em 2026.
        const february = new Date('2026-02-01T12:00:00Z');
        const context = contextOf(tx, env, { fetch: federalServer({ rows, requests }), now: () => february });
        assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        assert.equal((await readFederalAgency(tx, UFMG))?.hasData, false, 'a fonte não tinha contrato dele');

        // Nenhuma medição agora (medido há pouco); 91 dias depois, o órgão é lido de novo.
        requests.length = 0;
        assertRan(await runFederalCycle(context));
        assert.equal(requestsFor(requests, /modulo-contratos/).length, 0);

        rows.push({ ...(fixture.contratos['contratoSemPncp'] as Row), dataVigenciaInicial: '2026-02-01T00:00:00', dataVigenciaFinal: '2027-02-01T00:00:00', numeroContrato: '00033/2026', dataHoraInclusao: '2026-01-20T10:00:00' });
        const later = contextOf(tx, env, { fetch: federalServer({ rows, requests }), now: () => new Date(february.getTime() + 91 * 24 * 60 * 60 * 1000) });
        requests.length = 0;
        const outcome = assertRan(await runFederalCycle(later));
        assert.deepEqual(
          requestsFor(requests, /1_consultarContratos\?.*codigoOrgao=26238/).map((request) => new URLSearchParams(request.split('?')[1]).get('dataVigenciaInicialMin')),
          ['2025-01-01', '2026-01-01'],
          'o ano anterior e o atual',
        );
        assert.equal(outcome.newCount, 1, 'o contrato de 2026 entrou');
        const state = await readFederalAgency(tx, UFMG);
        assert.equal(state?.hasData, true);
        assert.ok(state?.measuredAt);
      });
    });
  });

  test('contrato federal gravado também é achado com a chave nova nos favoritos, e a execução registra o tipo certo', async () => {
    await withRollback(async (tx) => {
      await withoutLocalFederalState(tx);
      await withEnvironment(async (env) => {
        const context = contextOf(tx, env, { fetch: federalServer() });
        const load = assertRan(await runFederalLoad(context, { agencyCode: UFMG }));
        const cycle = assertRan(await runFederalCycle(context, { agencyCode: UFMG }));
        const runs = await tx
          .select({ id: tenderCollectionRuns.id, type: tenderCollectionRuns.type })
          .from(tenderCollectionRuns)
          .where(inArray(tenderCollectionRuns.id, [load.runId, cycle.runId]));
        assert.deepEqual(runs.map((run) => run.type).sort(), ['FEDERAIS_CARGA', 'FEDERAIS_CICLO']);
        // A chave cabe nos 60 caracteres das colunas de favoritos e de avisos.
        const longest = Math.max(...(await publishedContracts(env)).map((contract) => contract.key.length));
        assert.ok(longest <= 60, `a maior chave tem ${longest} caracteres`);
      });
    });
  });
});
