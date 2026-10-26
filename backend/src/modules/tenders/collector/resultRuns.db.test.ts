import assert from 'node:assert/strict';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { eq, inArray } from 'drizzle-orm';
import { MANIFEST_KEY } from '../contractStore/layout';
import { readManifest } from '../contractStore/manifest';
import { readParquetRows, withTempDirectory } from '../contractStore/storeTestSupport';
import { tenderCollectionRuns, tenderResultBackfillDays } from '../db/schema';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import {
  closeLocalTestDatabase,
  createTestCollectorContext,
  databaseTestsSkipReason,
  localTestPool,
  withRollback,
} from './dbTestSupport';
import { RESULTS_MAX_PASSES } from './comprasGovClient';
import type { WinnersSettings } from './config';
import type { TendersDb } from './database';
import { markResultDayCompleted, readResultBackfillProgress } from './resultProgress';
import {
  RESULTS_BACKFILL_FINISHED,
  RESULTS_BACKFILL_NOT_STARTED,
  RESULTS_BACKFILL_NO_TIME,
  runResultsBackfill,
  runResultsDaily,
} from './resultRuns';
import { COLLECTOR_LOCK_KEYS, readCollectionStatus, tryAcquireCollectorLock } from './repository';
import type { CollectorContext, RunOutcome } from './runs';

// Execuções dos vencedores sobre o banco local e um armazém de exemplo (R2 simulado), com a fonte simulada: cada
// teste numa transação desfeita no fim. O Postgres tem as execuções e os dias da carga; as linhas dos vencedores
// moram só no armazém do teste (plano .plans/licitacoes-vencedores.md). Precisam da migration 0087c no banco local.

const FULL_CPF = '12345678901';
const AGENCY = '00394460005887';

// 26/10/2026, 09:00 em Brasília: hoje = 2026-10-26, ontem = 2026-10-25.
const NOW = new Date('2026-10-26T12:00:00Z');
const atNoon = (day: string) => () => new Date(`${day}T12:00:00Z`);

/** Resultado de um item como a fonte o entrega (a forma medida na sondagem de 25/10/2026). */
function rawResult(purchase: number, item: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const number = `${AGENCY}-1-${String(purchase).padStart(6, '0')}/2026`;
  return {
    idCompraItem: `${number}#${item}`,
    idContratacaoPNCP: number,
    numeroControlePNCPCompra: number,
    numeroItemPncp: item,
    sequencialResultado: 1,
    niFornecedor: '11222333000181',
    tipoPessoa: 'PJ',
    nomeRazaoSocialFornecedor: 'ALFA LTDA',
    porteFornecedorNome: 'ME',
    valorTotalHomologado: 100.5,
    dataResultadoPncp: '2026-10-24T00:00:00',
    dataAtualizacaoPncp: '2026-10-24T10:00:00',
    dataCancelamentoPncp: null,
    situacaoCompraItemResultadoId: 1,
    situacaoCompraItemResultadoNome: 'Informado',
    unidadeOrgaoCodigoUnidade: '153103',
    unidadeOrgaoUfSigla: 'SP',
    ordemClassificacaoSrp: 1,
    ...overrides,
  };
}

const onDay = (day: string, overrides: Record<string, unknown> = {}) => ({
  dataResultadoPncp: `${day}T00:00:00`,
  dataAtualizacaoPncp: `${day}T10:00:00`,
  ...overrides,
});

interface ServerOptions {
  /** Registros por página; sem ele, o tamanho pedido (500). */
  pageSize?: number;
  /** Anota cada pedido: [início, fim, página, tamanho da página]. */
  requests?: string[][];
  /** Resposta no lugar da normal para o pedido. */
  override?: (url: URL) => Response | null;
  /**
   * A paginação que falhou na carga de piloto: nas primeiras leituras de um dia (cada tamanho de página novo é uma
   * leitura), a partir da segunda página, o começo de cada página traz de novo o fim da anterior (de 1 a 5 registros,
   * conforme a página e a leitura) e os registros que ele ocupava não vêm. Pedir a mesma página de novo devolve o mesmo.
   * As leituras depois dessas vêm certas. Sem o número, a fonte é estável.
   */
  unstableReads?: number;
}

/** A fonte simulada: devolve os registros do intervalo (fim inclusivo) em páginas, no envelope da fonte. */
function resultsServer(records: Record<string, unknown>[], options: ServerOptions = {}) {
  /** Os tamanhos de página já pedidos de cada dia, na ordem: o índice do tamanho é o da leitura. */
  const readsOfDay = new Map<string, string[]>();
  return (url: URL): Response => {
    const initial = url.searchParams.get('dataResultadoPncpInicial') ?? '';
    const final = url.searchParams.get('dataResultadoPncpFinal') ?? '';
    const page = Number(url.searchParams.get('pagina') ?? '1');
    options.requests?.push([initial, final, String(page), url.searchParams.get('tamanhoPagina') ?? '']);
    const overridden = options.override?.(url);
    if (overridden) {
      return overridden;
    }
    const matching = records.filter((record) => {
      const day = String(record['dataResultadoPncp']).slice(0, 10);
      return day >= initial && day <= final;
    });
    const pageSize = options.pageSize ?? Number(url.searchParams.get('tamanhoPagina') ?? '500');
    const totalPages = Math.ceil(matching.length / pageSize);
    let pageRecords = matching.slice((page - 1) * pageSize, page * pageSize);
    const reads = readsOfDay.get(initial) ?? [];
    readsOfDay.set(initial, reads);
    if (!reads.includes(String(pageSize))) {
      reads.push(String(pageSize));
    }
    const read = reads.indexOf(String(pageSize));
    if (page >= 2 && read < (options.unstableReads ?? 0)) {
      const repeated = 1 + ((page + read) % 5);
      pageRecords = [...matching.slice((page - 1) * pageSize - repeated, (page - 1) * pageSize), ...pageRecords.slice(repeated)];
    }
    return Response.json({
      resultado: pageRecords,
      totalRegistros: matching.length,
      totalPaginas: totalPages,
      paginasRestantes: Math.max(0, totalPages - page),
    });
  };
}

/** Os dias de `from` a `to`, os dois inclusive. */
function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 24 * 60 * 60 * 1000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/** Os dias pedidos à fonte, na ordem em que apareceram e sem repetir: cada dia é lido sozinho. */
function daysRequested(requests: string[][]): string[] {
  assert.ok(requests.every((request) => request[0] === request[1]), 'cada pedido é de um dia só');
  return [...new Set(requests.map((request) => request[0] ?? ''))];
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
  resultsFetch: (url: URL) => Response | Promise<Response>;
  now?: () => Date;
  winners?: Partial<WinnersSettings>;
  withoutStorage?: boolean;
}

function contextOf(tx: TendersDb, env: TestEnvironment, options: ContextOptions): CollectorContext {
  const base = createTestCollectorContext(tx, {
    contractsFetch: () => {
      throw new Error('pedido inesperado aos contratos');
    },
    resultsFetch: options.resultsFetch,
    ...(options.now ? { now: options.now } : { now: () => NOW }),
    ...(options.withoutStorage ? {} : { storage: env.storage }),
    contractWorkDirectory: path.join(env.directory, 'trabalho'),
  });
  return { ...base, config: { ...base.config, winners: { ...base.config.winners, ...options.winners } } };
}

/** O teste parte sem execuções nem dias de vencedores: o banco local pode ter os de um piloto. */
async function withoutLocalWinnerState(tx: TendersDb): Promise<void> {
  await tx.delete(tenderCollectionRuns).where(inArray(tenderCollectionRuns.type, ['VENCEDORES_DIARIA', 'VENCEDORES_CARGA']));
  await tx.delete(tenderResultBackfillDays);
}

interface PublishedWinner {
  key: string;
  purchase: string;
  items: number;
  total: string;
  name: string | null;
  document: string | null;
  size: string | null;
  unit: string | null;
}

/** As linhas dos vencedores como estão no armazém publicado. */
async function publishedWinners(env: TestEnvironment): Promise<PublishedWinner[]> {
  const manifest = await readManifest(env.storage);
  const rows: PublishedWinner[] = [];
  for (const file of manifest?.datasets.vencedores ?? []) {
    for (const row of await readParquetRows(env.objects, file.path, 'chave, numero_controle_compra, quantidade_itens, valor_homologado_total, fornecedor_nome, fornecedor_documento, fornecedor_porte, unidade_codigo')) {
      rows.push({
        key: String(row['chave']),
        purchase: String(row['numero_controle_compra']),
        items: Number(row['quantidade_itens']),
        total: String(row['valor_homologado_total']),
        name: row['fornecedor_nome'] === null ? null : String(row['fornecedor_nome']),
        document: row['fornecedor_documento'] === null ? null : String(row['fornecedor_documento']),
        size: row['fornecedor_porte'] === null ? null : String(row['fornecedor_porte']),
        unit: row['unidade_codigo'] === null ? null : String(row['unidade_codigo']),
      });
    }
  }
  return rows.sort((a, b) => (a.key < b.key ? -1 : 1));
}

interface ArchivedLine {
  collectedAt: string;
  record: Record<string, unknown>;
}

/** Todas as linhas do arquivo bruto dos resultados, descompactadas. */
function archivedResults(env: TestEnvironment): ArchivedLine[] {
  return [...env.objects.entries()]
    .filter(([key]) => key.startsWith('comprasgov/resultados/'))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([, body]) =>
      gunzipSync(body)
        .toString('utf8')
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line) as ArchivedLine),
    );
}

const archiveKeys = (env: TestEnvironment) => [...env.objects.keys()].filter((key) => key.startsWith('comprasgov/resultados/'));

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

const winnerFile = (key: string) => key.startsWith('contratos/arquivos/vencedores/');
const queriesOf = (outcome: { details: Record<string, unknown> }) => (outcome.details['queries'] ?? []) as Array<Record<string, unknown>>;

describe('execuções dos vencedores (banco local e armazém de exemplo)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('diária: lê a janela, agrega por licitação e fornecedor, publica e grava os detalhes', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const requests: string[][] = [];
        const records = [
          rawResult(1, 1, onDay('2026-10-22')),
          rawResult(1, 2, onDay('2026-10-23', { valorTotalHomologado: 50 })),
          rawResult(2, 1, onDay('2026-10-24', { niFornecedor: '99887766000155', nomeRazaoSocialFornecedor: 'BETA LTDA' })),
          rawResult(3, 1, onDay('2026-10-25', { situacaoCompraItemResultadoId: 3 })),
        ];
        const context = contextOf(tx, env, { resultsFetch: resultsServer(records, { requests }) });

        const outcome = assertRan(await runResultsDaily(context));
        assert.equal(outcome.status, 'SUCESSO');
        assert.equal(outcome.errorCount, 0);
        assert.equal(outcome.recordsRead, 4);
        assert.equal(outcome.newCount, 2, 'duas linhas: a compra 1 do ALFA (2 itens) e a compra 2 do BETA; a reserva não entra');
        assert.equal(outcome.updatedCount, 0);
        assert.equal(outcome.details['today'], '2026-10-26');
        assert.deepEqual(outcome.details['period'], { dataInicial: '20261018', dataFinal: '20261026' });
        assert.deepEqual(daysRequested(requests), dayRange('2026-10-18', '2026-10-26'), 'a janela do dia normal: hoje − 8 até hoje, um dia por vez');
        assert.equal(requests.length, 9, 'dia que a fonte entrega inteiro é uma leitura só');

        // O que a próxima execução precisa: o fim da consulta é o último dia com dado, e não o fim da janela.
        assert.deepEqual(queriesOf(outcome), [
          { endpoint: 'resultados', from: '2026-10-18', to: '2026-10-25', windowTo: '2026-10-26', completed: true, recordsRead: 4 },
        ]);
        assert.equal(outcome.details['sourceLastDay'], '2026-10-25');
        const metrics = outcome.details['metrics'] as Record<string, unknown>;
        assert.equal(metrics['extraPasses'], 0);
        assert.equal(metrics['repeatedRecords'], 0);
        assert.equal(metrics['incompleteWindows'], 0);
        assert.deepEqual(metrics['records'], { mapped: 4, invalid: 0, winners: 3, cancelled: 0, reserve: 1, otherSituation: 0 });
        // Um dia por vez: a linha da compra 1 nasce com o item do dia 22 e recebe o item do dia 23.
        assert.deepEqual(metrics['rows'], { inserted: 2, updated: 1, removed: 0, unchanged: 0 });
        const publications = outcome.details['publications'] as Array<Record<string, unknown>>;
        assert.equal(publications.length, 1);
        assert.equal(publications[0]?.['revision'], `${outcome.runId}.1`);
        assert.equal(publications[0]?.['rows'], 2);
        assert.deepEqual(outcome.details['store'], { revision: `${outcome.runId}.1`, rows: 2 });

        const winners = await publishedWinners(env);
        assert.deepEqual(
          winners.map((row) => [row.purchase, row.items, row.total, row.name]),
          [
            [`${AGENCY}-1-000001/2026`, 2, '150.50', 'ALFA LTDA'],
            [`${AGENCY}-1-000002/2026`, 1, '100.50', 'BETA LTDA'],
          ],
        );
        assert.equal((await readManifest(env.storage))?.revision, `${outcome.runId}.1`);
        // O arquivo bruto leva os 4 registros: todos de dias ainda não cobertos.
        assert.equal(archivedResults(env).length, 4);
        assert.equal((outcome.details['archive'] as Record<string, unknown>)['files'], 1);
      });
    });
  });

  test('releitura idêntica: nada novo, nada publicado e nada no arquivo bruto', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = [rawResult(1, 1, onDay('2026-10-24')), rawResult(2, 1, onDay('2026-10-25'))];
        const context = contextOf(tx, env, { resultsFetch: resultsServer(records) });

        const first = assertRan(await runResultsDaily(context));
        const archivedBefore = archiveKeys(env).length;
        const second = assertRan(await runResultsDaily(context));

        assert.equal(second.status, 'SUCESSO');
        assert.equal(second.recordsRead, 2);
        assert.equal(second.newCount, 0);
        assert.equal(second.updatedCount, 0);
        assert.equal(second.details['publications'], undefined, 'nada mudou: não publica');
        assert.equal((await readManifest(env.storage))?.revision, `${first.runId}.1`, 'a versão em uso continua a mesma');
        assert.equal(archiveKeys(env).length, archivedBefore, 'o arquivo bruto não recebe o que já tinha');
        assert.equal(queriesOf(second)[0]?.['completed'], true);
      });
    });
  });

  test('fonte atrás do calendário: o último dia lido não anda, a janela se repete sem publicar, e quando ela volta o dia avança', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const upToTheFirst = [rawResult(1, 1, onDay('2026-10-24')), rawResult(2, 1, onDay('2026-10-25'))];
        const first = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(upToTheFirst), now: atNoon('2026-10-26') })));
        assert.equal(queriesOf(first)[0]?.['to'], '2026-10-25');

        // Cinco dias depois a fonte continua com os mesmos dados: a janela parte do dia 25 e nada avança nem publica.
        const stale = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(upToTheFirst), now: atNoon('2026-10-31') })));
        assert.equal(stale.status, 'SUCESSO');
        assert.deepEqual(
          queriesOf(stale)[0],
          { endpoint: 'resultados', from: '2026-10-18', to: '2026-10-25', windowTo: '2026-10-31', completed: true, recordsRead: 2 },
          'o dia lido não passou de 25, porque a fonte não tinha mais nada',
        );
        assert.equal(stale.details['publications'], undefined);
        assert.equal(stale.details['sourceLastDay'], '2026-10-25');

        // A fonte volta com dados até o dia 29: a janela é a mesma e o dia lido avança até 29.
        const caughtUp = [...upToTheFirst, rawResult(3, 1, onDay('2026-10-28')), rawResult(4, 1, onDay('2026-10-29'))];
        const back = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(caughtUp), now: atNoon('2026-10-31') })));
        assert.equal(queriesOf(back)[0]?.['to'], '2026-10-29');
        assert.equal(back.newCount, 2);
        assert.equal((await publishedWinners(env)).length, 4);
      });
    });
  });

  test('parada longa: a janela anda em etapas de até 7 dias a partir do último dia lido, sem perder nenhum', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = Array.from({ length: 20 }, (_, index) => rawResult(index + 1, 1, onDay(`2026-10-${String(index + 1).padStart(2, '0')}`)));
        const requests: string[][] = [];
        const context = (day: string) => contextOf(tx, env, { resultsFetch: resultsServer(records, { requests }), now: atNoon(day) });

        // A primeira execução já é a de um dia longe do último lido (histórico de 02/10).
        await tx.insert(tenderCollectionRuns).values({
          type: 'VENCEDORES_DIARIA',
          status: 'SUCESSO',
          details: { queries: [{ endpoint: 'resultados', from: '2026-09-24', to: '2026-10-02', completed: true, recordsRead: 1 }] },
        });
        const first = assertRan(await runResultsDaily(context('2026-10-26')));
        assert.deepEqual(daysRequested(requests), dayRange('2026-09-25', '2026-10-09'), 'parte do dia 02, com 7 de sobreposição e 7 de avanço');
        assert.equal(queriesOf(first)[0]?.['to'], '2026-10-09');
        const afterFirst = requests.length;
        const second = assertRan(await runResultsDaily(context('2026-10-26')));
        assert.deepEqual(daysRequested(requests.slice(afterFirst)), dayRange('2026-10-02', '2026-10-16'));
        assert.equal(queriesOf(second)[0]?.['to'], '2026-10-16');
        assert.equal((await publishedWinners(env)).length, 16, 'todos os dias de 01 a 16 entraram, nenhum ficou para trás');
      });
    });
  });

  test('execução que falha antes de publicar não cobre nada, e a seguinte relê as mesmas datas', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      let down = true;
      await withEnvironment(
        async (env) => {
          const records = [rawResult(1, 1, onDay('2026-10-24')), rawResult(2, 1, onDay('2026-10-25'))];
          const requests: string[][] = [];
          const context = contextOf(tx, env, { resultsFetch: resultsServer(records, { requests }) });

          const failed = assertRan(await runResultsDaily(context));
          assert.equal(failed.status, 'FALHA');
          assert.match(JSON.stringify(failed.details['errors']), /R2 fora do ar/);
          assert.equal(queriesOf(failed)[0]?.['completed'], false, 'o que foi lido não foi publicado');
          assert.equal((await readManifest(env.storage)), null);

          down = false;
          const afterFailure = requests.length;
          const retry = assertRan(await runResultsDaily(context));
          assert.equal(retry.status, 'SUCESSO');
          assert.equal(retry.newCount, 2);
          assert.deepEqual(daysRequested(requests.slice(afterFailure)), dayRange('2026-10-18', '2026-10-26'), 'as mesmas datas, porque nenhuma ficou como lida');
          assert.equal(queriesOf(retry)[0]?.['completed'], true);
        },
        refusingUploads(() => down, winnerFile),
      );
    });
  });

  test('páginas da fonte que não se encaixam: o dia é lido de novo com outro tamanho de página, e só o que faltava é aplicado', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        // 1.200 resultados num dia só (uma licitação cada): três páginas de 500, e a fonte repete e perde registros entre elas.
        const records = Array.from({ length: 1_200 }, (_, index) => rawResult(index + 1, 1, onDay('2026-10-24')));
        const requests: string[][] = [];
        const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records, { requests, unstableReads: 1 }) })));

        assert.equal(outcome.status, 'SUCESSO', 'a segunda leitura completou o dia');
        assert.equal(outcome.errorCount, 0);
        assert.equal(outcome.newCount, 1_200, 'cada resultado entrou uma vez');
        assert.equal((await publishedWinners(env)).length, 1_200);
        assert.equal(queriesOf(outcome)[0]?.['recordsRead'], 1_200, 'as linhas do dia, sem contar as repetidas');
        assert.equal(queriesOf(outcome)[0]?.['completed'], true);
        assert.equal(outcome.recordsRead, 2_400, 'duas leituras do dia, de 1.200 linhas cada');
        const metrics = outcome.details['metrics'] as Record<string, unknown>;
        assert.equal(metrics['extraPasses'], 1);
        assert.equal(metrics['incompleteWindows'], 0);
        assert.ok((metrics['repeatedRecords'] as number) >= 14, 'as repetidas das duas leituras e o que a segunda releu');

        // A segunda leitura pediu páginas menores, só do dia que faltava.
        const pageSizes = requests.filter((request) => request[0] === '2026-10-24').map((request) => request[3]);
        assert.deepEqual(pageSizes, ['500', '500', '500', '499', '499', '499']);
        assert.equal(requests.filter((request) => request[0] !== '2026-10-24').length, 8, 'os outros oito dias, uma leitura cada');
        // O bruto leva cada linha uma vez, sem as repetidas.
        const archived = archivedResults(env).map((line) => String(line.record['idContratacaoPNCP']));
        assert.equal(archived.length, 1_200);
        assert.equal(new Set(archived).size, 1_200);
      });
    });
  });

  test('a segunda leitura também vem falha: a terceira traz o que faltou nas duas', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = Array.from({ length: 1_200 }, (_, index) => rawResult(index + 1, 1, onDay('2026-10-24')));
        const requests: string[][] = [];
        const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records, { requests, unstableReads: 2 }) })));

        assert.equal(outcome.status, 'SUCESSO');
        assert.equal(outcome.newCount, 1_200, 'inclusive as linhas que faltaram nas duas primeiras leituras');
        assert.equal((await publishedWinners(env)).length, 1_200);
        const metrics = outcome.details['metrics'] as Record<string, unknown>;
        assert.equal(metrics['extraPasses'], 2);
        assert.equal(metrics['incompleteWindows'], 0);
        assert.deepEqual(
          [...new Set(requests.filter((request) => request[0] === '2026-10-24').map((request) => request[3]))],
          ['500', '499', '437'],
          'três leituras do dia, cada uma com um tamanho de página',
        );
      });
    });
  });

  test('relida a janela inteira com a fonte instável, o armazém fica igual ao de uma fonte estável, e reler não muda nada', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      // Compras de 3 itens em dois dias, com porte e unidade diferentes em cada dia (como na fonte real): a linha tem de sair
      // igual qualquer que seja a divisão em lotes, e as releituras não podem mexer nela.
      const records = Array.from({ length: 700 }, (_, index) => {
        const supplier = index % 3 === 0 ? { niFornecedor: '99887766000155', nomeRazaoSocialFornecedor: 'BETA LTDA' } : {};
        return [
          rawResult(index + 1, 1, onDay('2026-10-24', { ...supplier, porteFornecedorNome: 'Demais', unidadeOrgaoCodigoUnidade: '111111' })),
          rawResult(index + 1, 2, onDay('2026-10-23', { ...supplier, porteFornecedorNome: 'ME', unidadeOrgaoCodigoUnidade: '222222' })),
          rawResult(index + 1, 3, onDay('2026-10-23', { ...supplier, porteFornecedorNome: 'ME', unidadeOrgaoCodigoUnidade: '222222' })),
        ];
      }).flat();
      const stable = await withEnvironment(async (env) => {
        assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records) })));
        return publishedWinners(env);
      });
      await withoutLocalWinnerState(tx);
      const unstable = await withEnvironment(async (env) => {
        assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records, { unstableReads: 1 }) })));
        const published = await publishedWinners(env);

        // Outra leitura da janela, de novo com a divisão em lotes diferente: nenhuma linha muda.
        const again = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records, { unstableReads: 1 }) })));
        assert.equal(again.newCount, 0);
        assert.equal(again.updatedCount, 0, 'o porte e a unidade da linha não oscilam entre as leituras');
        assert.equal(again.details['publications'], undefined, 'nada mudou: não publica');
        return published;
      });
      assert.equal(stable.length, 700);
      assert.ok(stable.every((row) => row.items === 3 && row.size === 'Demais' && row.unit === '111111'), 'o porte e a unidade são os do item 1');
      assert.deepEqual(unstable, stable);
    });
  });


  test('dia que continua sem todas as linhas depois de todas as leituras não vale como lido, e o resto da janela segue', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = [rawResult(1, 1, onDay('2026-10-24')), rawResult(2, 1, onDay('2026-10-25')), rawResult(3, 1, onDay('2026-10-25'))];
        const requests: string[][] = [];
        // Para o dia 25 a fonte informa 2 linhas e entrega sempre a mesma, em qualquer tamanho de página.
        const hidesOne = (url: URL) =>
          url.searchParams.get('dataResultadoPncpInicial') === '2026-10-25'
            ? Response.json({ resultado: [records[1]], totalRegistros: 2, totalPaginas: 1, paginasRestantes: 0 })
            : null;
        const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records, { requests, override: hidesOne }) })));

        assert.equal(outcome.status, 'PARCIAL');
        const errors = outcome.details['errors'] as Array<Record<string, unknown>>;
        assert.equal(errors.length, 1);
        assert.equal(errors[0]?.['kind'], 'incomplete');
        assert.deepEqual(
          [errors[0]?.['announced'], errors[0]?.['distinct'], errors[0]?.['passes']],
          [2, 1, RESULTS_MAX_PASSES],
          'a fonte disse 2, vieram 1, e foram as 4 leituras',
        );
        assert.match(String(errors[0]?.['message']), /2 registros, mas só 1 vieram, mesmo depois de 4 leituras/);
        assert.equal(queriesOf(outcome)[0]?.['completed'], false, 'a janela não vale como lida: a próxima execução relê');
        assert.deepEqual(
          requests.filter((request) => request[0] === '2026-10-25').map((request) => request[3]),
          ['500', '499', '437', '389'],
          'um tamanho de página diferente em cada leitura',
        );
        const metrics = outcome.details['metrics'] as Record<string, unknown>;
        assert.equal(metrics['incompleteWindows'], 1);
        assert.equal(metrics['extraPasses'], RESULTS_MAX_PASSES - 1);
        // O que veio entra (a agregação é idempotente): o dia 24 e a linha do dia 25 que a fonte entregou.
        assert.equal((await publishedWinners(env)).length, 2);
        assert.equal(outcome.newCount, 2);
      });
    });
  });

  test('linhas repetidas na leitura contam uma vez: não são aplicadas, não entram no bruto e o dia fecha pelo total da fonte', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = [rawResult(1, 1, onDay('2026-10-24')), rawResult(2, 1, onDay('2026-10-24')), rawResult(3, 1, onDay('2026-10-24'))];
        // A fonte informa 3, entrega a linha 1 duas vezes e a 3 nenhuma; a segunda leitura (499) traz as três.
        const requests: string[][] = [];
        const firstReadShortOfOne = (url: URL) =>
          url.searchParams.get('dataResultadoPncpInicial') === '2026-10-24' && url.searchParams.get('tamanhoPagina') === '500'
            ? Response.json({ resultado: [records[0], records[1], records[0]], totalRegistros: 3, totalPaginas: 1, paginasRestantes: 0 })
            : null;
        const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records, { requests, override: firstReadShortOfOne }) })));

        assert.equal(outcome.status, 'SUCESSO');
        assert.equal(outcome.newCount, 3);
        assert.equal(queriesOf(outcome)[0]?.['recordsRead'], 3);
        const metrics = outcome.details['metrics'] as Record<string, unknown>;
        assert.equal(metrics['extraPasses'], 1);
        assert.equal(metrics['repeatedRecords'], 3, 'a linha 1 repetida na primeira leitura, e as linhas 1 e 2 que a segunda releu');
        assert.equal(archivedResults(env).length, 3);
      });
    });
  });

  test('mais de 5% de registros inválidos derruba a execução: nada é publicado nem dado como lido', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const valid = Array.from({ length: 180 }, (_, index) => rawResult(index + 1, 1, onDay('2026-10-24')));
        // Cada um com o seu item: a mesma licitação, item e sequência seria a mesma linha da fonte, lida uma vez só.
        const invalid = Array.from({ length: 20 }, (_, index) => rawResult(1_000 + index, index + 1, onDay('2026-10-24', { idContratacaoPNCP: 'formato-diferente', numeroControlePNCPCompra: 'formato-diferente' })));
        const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer([...valid, ...invalid]) })));

        assert.equal(outcome.status, 'FALHA', 'a execução inteira cai, mesmo com registros lidos');
        assert.match(JSON.stringify(outcome.details['errors']), /registros fora do formato/);
        assert.equal(queriesOf(outcome)[0]?.['completed'], false);
        assert.equal(await readManifest(env.storage), null, 'nada foi publicado');
      });
    });
  });

  test('um registro recusado conta erro "record" e não derruba a página; o resto entra', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = [
          ...Array.from({ length: 30 }, (_, index) => rawResult(index + 1, 1, onDay('2026-10-24'))),
          rawResult(99, 1, onDay('2026-10-24', { idContratacaoPNCP: 'formato-diferente', numeroControlePNCPCompra: 'formato-diferente' })),
        ];
        const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records) })));

        assert.equal(outcome.status, 'PARCIAL');
        assert.equal(outcome.errorCount, 1);
        const errors = outcome.details['errors'] as Array<Record<string, unknown>>;
        assert.equal(errors[0]?.['kind'], 'record');
        assert.equal(errors[0]?.['controlNumber'], 'formato-diferente');
        assert.equal(outcome.newCount, 30);
        assert.equal(queriesOf(outcome)[0]?.['completed'], true, 'dentro do limite de recusados, a janela vale');
        // O registro recusado vai para o bruto, para quem quiser ver o que a fonte mandou.
        assert.ok(archivedResults(env).some((line) => line.record['idContratacaoPNCP'] === 'formato-diferente'));
      });
    });
  });

  test('janela sem nenhum registro falha: a fonte pode estar fora do ar ou ter mudado', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer([]) })));
        assert.equal(outcome.status, 'FALHA');
        assert.equal(outcome.recordsRead, 0);
        assert.match(JSON.stringify(outcome.details['errors']), /nenhum registro/);
        assert.equal(queriesOf(outcome)[0]?.['completed'], false);
      });
    });
  });

  test('falha do envio do bruto cancela a publicação: nada é dado como lido', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(
        async (env) => {
          const records = [rawResult(1, 1, onDay('2026-10-24'))];
          const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records) })));

          assert.equal(outcome.status, 'FALHA');
          assert.match(JSON.stringify(outcome.details['errors']), /arquivo bruto não foi enviado/);
          assert.equal(await readManifest(env.storage), null, 'o armazém não foi publicado');
          assert.equal(queriesOf(outcome)[0]?.['completed'], false);
          assert.equal((outcome.details['archive'] as Record<string, unknown>)['failures'], 1);
        },
        refusingUploads(() => true, (key) => key.startsWith('comprasgov/resultados/')),
      );
    });
  });

  test('bruto: só o inédito, o que mudou o estado e o recusado; o CPF vai mascarado e nunca inteiro', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const person = rawResult(3, 1, onDay('2026-10-24', { niFornecedor: FULL_CPF, tipoPessoa: 'PF', nomeRazaoSocialFornecedor: 'MARIA DA SILVA' }));
        const first = [rawResult(1, 1, onDay('2026-10-24')), rawResult(2, 1, onDay('2026-10-25')), person];
        assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(first), now: atNoon('2026-10-26') })));
        assert.equal(archivedResults(env).length, 3);
        assert.ok(archivedResults(env).every((line) => !JSON.stringify(line).includes(FULL_CPF)), 'o CPF inteiro não está no bruto');
        assert.ok(archivedResults(env).some((line) => line.record['niFornecedor'] === '***.456.789-**'));

        // Segunda leitura: um valor corrigido (muda o estado) e um registro recusado entram no bruto; o resto, não.
        const second = [
          rawResult(1, 1, onDay('2026-10-24', { valorTotalHomologado: 999, dataAtualizacaoPncp: '2026-10-26T08:00:00' })),
          rawResult(2, 1, onDay('2026-10-25')),
          person,
          rawResult(77, 1, onDay('2026-10-24', { idContratacaoPNCP: 'formato-diferente', numeroControlePNCPCompra: 'formato-diferente' })),
        ];
        const before = archivedResults(env).length;
        assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(second), now: atNoon('2026-10-26') })));
        const added = archivedResults(env).slice(before).map((line) => line.record['idContratacaoPNCP']);
        assert.deepEqual(added.sort(), [`${AGENCY}-1-000001/2026`, 'formato-diferente']);

        const published = await publishedWinners(env);
        assert.equal(published.find((row) => row.purchase === `${AGENCY}-1-000003/2026`)?.document, '***.456.789-**');
        assert.equal(published.find((row) => row.purchase === `${AGENCY}-1-000001/2026`)?.total, '999.00');
        assert.ok(!JSON.stringify(published).includes(FULL_CPF));
        assert.ok(![...env.objects.keys()].some((key) => key.includes(FULL_CPF)));
      });
    });
  });

  test('cancelamento tardio: o resultado cancelado sai da linha e a linha sem itens some do armazém', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = [rawResult(1, 1, onDay('2026-10-24')), rawResult(1, 2, onDay('2026-10-24')), rawResult(2, 1, onDay('2026-10-25'))];
        await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(records), now: atNoon('2026-10-26') }));
        assert.equal((await publishedWinners(env)).length, 2);

        const cancelled = [
          rawResult(1, 1, onDay('2026-10-24', { situacaoCompraItemResultadoId: 2, dataCancelamentoPncp: '2026-10-26T07:00:00', dataAtualizacaoPncp: '2026-10-26T07:00:00' })),
          rawResult(1, 2, onDay('2026-10-24')),
          rawResult(2, 1, onDay('2026-10-25', { situacaoCompraItemResultadoId: 2, dataAtualizacaoPncp: '2026-10-26T07:30:00' })),
        ];
        const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer(cancelled), now: atNoon('2026-10-27') })));
        assert.equal(outcome.updatedCount, 2, 'uma linha mudou e outra foi removida');
        const winners = await publishedWinners(env);
        assert.deepEqual(winners.map((row) => [row.purchase, row.items, row.total]), [[`${AGENCY}-1-000001/2026`, 1, '100.50']]);
        const metrics = outcome.details['metrics'] as Record<string, unknown>;
        assert.deepEqual((metrics['rows'] as Record<string, number>)['removed'], 1);
      });
    });
  });

  test('trava compartilhada com os contratos: com contratos em execução, a coleta de vencedores sai "coleta já em execução"', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const lock = await tryAcquireCollectorLock(localTestPool(), COLLECTOR_LOCK_KEYS.contracts);
        assert.ok(lock, 'a trava dos contratos estava livre');
        try {
          const outcome = await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer([rawResult(1, 1)]) }));
          assert.deepEqual(outcome, { skipped: true, reason: 'coleta já em execução' });
          const backfill = await runResultsBackfill(contextOf(tx, env, { resultsFetch: resultsServer([rawResult(1, 1)]) }), { from: '2026-10-24', to: '2026-10-24' });
          assert.deepEqual(backfill, { skipped: true, reason: 'coleta já em execução' });
        } finally {
          await lock.release();
        }
      });
    });
  });

  test('sem o R2: a diária falha com o motivo e a carga sai "não iniciada", sem abrir execução', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const context = contextOf(tx, env, { resultsFetch: resultsServer([rawResult(1, 1)]), withoutStorage: true });
        const daily = assertRan(await runResultsDaily(context));
        assert.equal(daily.status, 'FALHA');
        assert.match(JSON.stringify(daily.details['errors']), /TENDERS_STORAGE_PREFIX/);

        const before = await tx.select().from(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'VENCEDORES_CARGA'));
        assert.deepEqual(await runResultsBackfill(context), { skipped: true, reason: RESULTS_BACKFILL_NOT_STARTED });
        assert.equal((await tx.select().from(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'VENCEDORES_CARGA'))).length, before.length);
      });
    });
  });

  test('execução anterior derrubada (EXECUTANDO, sem detalhes) é ignorada: a janela parte de ontem', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        await tx.insert(tenderCollectionRuns).values({ type: 'VENCEDORES_DIARIA', status: 'EXECUTANDO', details: {} });
        const requests: string[][] = [];
        const outcome = assertRan(await runResultsDaily(contextOf(tx, env, { resultsFetch: resultsServer([rawResult(1, 1, onDay('2026-10-25'))], { requests }) })));
        assert.equal(outcome.status, 'SUCESSO');
        assert.deepEqual(daysRequested(requests), dayRange('2026-10-18', '2026-10-26'));
      });
    });
  });

  test('o status da coleta traz os dias da carga de vencedores', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      assert.deepEqual((await readCollectionStatus(tx)).winners.backfill, { completedDays: 0, oldestDay: null, newestDay: null });
      await markResultDayCompleted(tx, '2026-10-20', 10);
      await markResultDayCompleted(tx, '2026-10-22', 20);
      await markResultDayCompleted(tx, '2026-10-22', 25);
      assert.deepEqual((await readCollectionStatus(tx)).winners.backfill, { completedDays: 2, oldestDay: '2026-10-20', newestDay: '2026-10-22' });
      assert.deepEqual(await readResultBackfillProgress(tx), { completedDays: 2, oldestDay: '2026-10-20', newestDay: '2026-10-22' });
      const [row] = await tx.select().from(tenderResultBackfillDays).where(eq(tenderResultBackfillDays.day, '2026-10-22'));
      assert.equal(row?.recordsRead, 25, 'marcar de novo atualiza o dia');
    });
  });

  // ---- Carga histórica ----

  /** Um registro por dia, de 20/10 a 22/10, e nenhum depois (a fonte "atrás" dos dias 23 a 25). */
  const threeDays = () => [rawResult(1, 1, onDay('2026-10-20')), rawResult(2, 1, onDay('2026-10-21')), rawResult(3, 1, onDay('2026-10-22'))];

  test('carga: do mais recente ao mais antigo; os dias vazios depois do último com dado ficam fora e a faixa conclui', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const requests: string[][] = [];
        const context = contextOf(tx, env, { resultsFetch: resultsServer(threeDays(), { requests }), winners: { backfillFrom: '2026-10-20' } });

        const outcome = assertRan(await runResultsBackfill(context));
        assert.equal(outcome.status, 'SUCESSO');
        assert.deepEqual(
          requests.map((request) => request[0]),
          ['2026-10-25', '2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21', '2026-10-20'],
          'um dia por vez, do mais recente ao mais antigo',
        );
        const backfill = outcome.details['backfill'] as Record<string, unknown>;
        assert.equal(backfill['daysCompleted'], 3);
        assert.equal(backfill['skippedEmptyDays'], 3, 'os três dias que a fonte ainda não tem');
        assert.equal(backfill['pendingAfter'], 0);
        assert.equal(backfill['finished'], true);
        assert.equal(backfill['totalDays'], 3);
        assert.deepEqual(await readResultBackfillProgress(tx), { completedDays: 3, oldestDay: '2026-10-20', newestDay: '2026-10-22' });
        assert.equal((await publishedWinners(env)).length, 3);
        assert.equal(outcome.newCount, 3);

        // O fim da faixa ficou fixo no dia mais recente carregado: nada pendente, e nenhuma execução aberta.
        const runsBefore = (await tx.select().from(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'VENCEDORES_CARGA'))).length;
        assert.deepEqual(await runResultsBackfill(context), { skipped: true, reason: RESULTS_BACKFILL_FINISHED });
        assert.equal((await tx.select().from(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'VENCEDORES_CARGA'))).length, runsBefore);
      });
    });
  });

  test('carga: retoma de onde parou, pulando os dias já marcados', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        await markResultDayCompleted(tx, '2026-10-22', 1);
        await markResultDayCompleted(tx, '2026-10-21', 1);
        const requests: string[][] = [];
        const context = contextOf(tx, env, { resultsFetch: resultsServer(threeDays(), { requests }), winners: { backfillFrom: '2026-10-18' } });

        const outcome = assertRan(await runResultsBackfill(context));
        assert.deepEqual(requests.map((request) => request[0]), ['2026-10-20', '2026-10-19', '2026-10-18'], 'só os dias anteriores ao mais recente já carregado');
        const backfill = outcome.details['backfill'] as Record<string, unknown>;
        assert.equal(backfill['to'], '2026-10-22', 'o fim da faixa é o dia mais recente já carregado');
        assert.equal(backfill['daysCompleted'], 3, 'os dias 18 e 19, vazios mas abaixo de um dia com dado, também ficam concluídos');
        assert.equal((await readResultBackfillProgress(tx)).oldestDay, '2026-10-18');
      });
    });
  });

  test('carga: publica a cada N dias concluídos e só então marca os dias', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = Array.from({ length: 5 }, (_, index) => rawResult(index + 1, 1, onDay(`2026-10-${String(20 + index).padStart(2, '0')}`)));
        const context = contextOf(tx, env, { resultsFetch: resultsServer(records), winners: { backfillFrom: '2026-10-20' } });

        const outcome = assertRan(await runResultsBackfill(context, { to: '2026-10-24', publishEveryDays: 2 }));
        const publications = outcome.details['publications'] as Array<Record<string, unknown>>;
        assert.equal(publications.length, 3, '2 dias, 2 dias e o 1 que sobrou no fim do bloco');
        assert.deepEqual(publications.map((publication) => publication['rows']), [2, 4, 5]);
        assert.equal((await readResultBackfillProgress(tx)).completedDays, 5);
      });
    });
  });

  test('carga: falha de publicação deixa os dias pendentes; os já publicados ficam marcados', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      let manifestPuts = 0;
      await withEnvironment(
        async (env) => {
          const records = Array.from({ length: 4 }, (_, index) => rawResult(index + 1, 1, onDay(`2026-10-${String(20 + index).padStart(2, '0')}`)));
          const context = contextOf(tx, env, { resultsFetch: resultsServer(records), winners: { backfillFrom: '2026-10-20' } });

          const outcome = assertRan(await runResultsBackfill(context, { to: '2026-10-23', publishEveryDays: 2 }));
          assert.equal(outcome.status, 'FALHA');
          assert.match(JSON.stringify(outcome.details['errors']), /R2 fora do ar/);
          const backfill = outcome.details['backfill'] as Record<string, unknown>;
          assert.equal(backfill['daysCompleted'], 2, 'só os dois dias da primeira publicação');
          assert.equal(backfill['pendingAfter'], 2);
          assert.equal(backfill['finished'], false);
          assert.deepEqual(await readResultBackfillProgress(tx), { completedDays: 2, oldestDay: '2026-10-22', newestDay: '2026-10-23' });
        },
        (base) => ({
          ...base,
          async putObject(key, body, contentType) {
            if (key === MANIFEST_KEY) {
              manifestPuts += 1;
              if (manifestPuts > 1) {
                throw new Error('R2 fora do ar');
              }
            }
            await base.putObject(key, body, contentType);
          },
        }),
      );
    });
  });

  test('carga: para por tempo, e o prazo da rotina limita o bloco ou tira a execução', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = Array.from({ length: 6 }, (_, index) => rawResult(index + 1, 1, onDay(`2026-10-${String(15 + index).padStart(2, '0')}`)));
        // Cada leitura do relógio passa 20 s: o bloco de 1 minuto se esgota nos primeiros dias, bem antes dos seis.
        let ticks = 0;
        const stepping = () => new Date(NOW.getTime() + ticks++ * 20_000);
        const context = contextOf(tx, env, { resultsFetch: resultsServer(records), winners: { backfillFrom: '2026-10-15' }, now: stepping });

        const timed = assertRan(await runResultsBackfill(context, { to: '2026-10-20', maxMinutes: 1 }));
        const backfill = timed.details['backfill'] as Record<string, unknown>;
        assert.equal(backfill['stoppedBy'], 'time');
        assert.equal(backfill['finished'], false);
        assert.ok((backfill['pendingAfter'] as number) > 0);
        assert.ok((backfill['daysCompleted'] as number) < 6, 'o bloco parou antes de terminar os seis dias');

        // Prazo da rotina: com 60 minutos sobrando, o bloco é de 45 (60 menos a folga de 15), e o configurado era 120.
        const fixed = contextOf(tx, env, { resultsFetch: resultsServer(records), winners: { backfillFrom: '2026-10-15', backfillMinutes: 120 } });
        const limited = assertRan(await runResultsBackfill(fixed, { to: '2026-10-20', deadlineAt: NOW.getTime() + 60 * 60_000 }));
        assert.equal((limited.details['backfill'] as Record<string, unknown>)['maxMinutes'], 45);

        // Sem tempo na rotina: a etapa é pulada, sem abrir execução.
        const runsBefore = (await tx.select().from(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'VENCEDORES_CARGA'))).length;
        assert.deepEqual(await runResultsBackfill(fixed, { to: '2026-10-20', from: '2026-10-15', deadlineAt: NOW.getTime() + 10 * 60_000 }), {
          skipped: true,
          reason: RESULTS_BACKFILL_NO_TIME,
        });
        assert.equal((await tx.select().from(tenderCollectionRuns).where(eq(tenderCollectionRuns.type, 'VENCEDORES_CARGA'))).length, runsBefore);
      });
    });
  });

  test('carga: três dias seguidos com falha da fonte encerram o bloco com o motivo "fonte"; o dia que falha fica pendente', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const down = (url: URL) => (url.searchParams.get('dataResultadoPncpInicial') ?? '') >= '2026-10-23' ? new Response('erro', { status: 500 }) : null;
        const records = [rawResult(1, 1, onDay('2026-10-22')), rawResult(2, 1, onDay('2026-10-21'))];
        const context = contextOf(tx, env, { resultsFetch: resultsServer(records, { override: down }), winners: { backfillFrom: '2026-10-20' } });

        const outcome = assertRan(await runResultsBackfill(context));
        const backfill = outcome.details['backfill'] as Record<string, unknown>;
        assert.equal(backfill['stoppedBy'], 'pncp');
        assert.equal(backfill['failedDays'], 3, 'os dias 25, 24 e 23');
        assert.equal(backfill['daysCompleted'], 0);
        assert.equal((await readResultBackfillProgress(tx)).completedDays, 0);
        assert.equal(outcome.status, 'FALHA', 'só erros da fonte e nenhum registro lido');
      });
    });
  });

  test('carga: dia que não completa depois das releituras fica pendente e conta como falha; os outros concluem, e a próxima execução o refaz', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        const records = threeDays();
        // No dia 21 a fonte informa 2 linhas e entrega só uma, em qualquer tamanho de página.
        const hidesOne = (url: URL) =>
          url.searchParams.get('dataResultadoPncpInicial') === '2026-10-21'
            ? Response.json({ resultado: [records[1]], totalRegistros: 2, totalPaginas: 1, paginasRestantes: 0 })
            : null;
        const outcome = assertRan(
          await runResultsBackfill(contextOf(tx, env, { resultsFetch: resultsServer(records, { override: hidesOne }), winners: { backfillFrom: '2026-10-20' } })),
        );

        assert.equal(outcome.status, 'PARCIAL');
        assert.match(JSON.stringify(outcome.details['errors']), /"kind":"incomplete"/);
        const backfill = outcome.details['backfill'] as Record<string, unknown>;
        assert.equal(backfill['failedDays'], 1);
        assert.equal(backfill['daysCompleted'], 2, 'os dias 22 e 20');
        assert.equal(backfill['pendingAfter'], 1);
        assert.equal(backfill['finished'], false);
        assert.equal(backfill['stoppedBy'], null);
        assert.deepEqual(await readResultBackfillProgress(tx), { completedDays: 2, oldestDay: '2026-10-20', newestDay: '2026-10-22' });

        // A fonte volta inteira: só o dia que faltava é lido.
        const requests: string[][] = [];
        const healthy = contextOf(tx, env, { resultsFetch: resultsServer(records, { requests }), winners: { backfillFrom: '2026-10-20' } });
        const again = assertRan(await runResultsBackfill(healthy));
        assert.deepEqual(daysRequested(requests), ['2026-10-21']);
        assert.equal((again.details['backfill'] as Record<string, unknown>)['daysCompleted'], 1);
        assert.deepEqual(await readResultBackfillProgress(tx), { completedDays: 3, oldestDay: '2026-10-20', newestDay: '2026-10-22' });
        assert.equal((await publishedWinners(env)).length, 3);
      });
    });
  });

  test('carga: --from e --to releem os dias já marcados (reparo), sem pular nenhum', async () => {
    await withRollback(async (tx) => {
      await withoutLocalWinnerState(tx);
      await withEnvironment(async (env) => {
        await markResultDayCompleted(tx, '2026-10-21', 1);
        const requests: string[][] = [];
        const context = contextOf(tx, env, { resultsFetch: resultsServer(threeDays(), { requests }), winners: { backfillFrom: '2026-10-01' } });

        const outcome = assertRan(await runResultsBackfill(context, { from: '2026-10-20', to: '2026-10-22' }));
        assert.deepEqual(requests.map((request) => request[0]), ['2026-10-22', '2026-10-21', '2026-10-20'], 'inclusive o dia 21, que já estava marcado');
        assert.equal(outcome.recordsRead, 3);
        assert.equal((outcome.details['backfill'] as Record<string, unknown>)['daysCompleted'], 3);
        // O dia 21 já estava coberto: o registro dele só vai ao bruto se mudar o estado; os outros dois, que eram inéditos, vão.
        const archived = archivedResults(env).map((line) => line.record['idContratacaoPNCP']);
        assert.equal(archived.length, 3, 'o 21 também: o armazém de teste estava vazio, então o registro dele muda o estado');
        assert.deepEqual((await publishedWinners(env)).length, 3);
      });
    });
  });
});
