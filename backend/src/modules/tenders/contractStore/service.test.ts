import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { createCollectorLogger } from '../collector/logger';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { contractExists } from './queries';
import { ContractStoreReader, ContractStoreUnavailableError } from './reader';
import { WEB_STORE_DATASETS, startContractStore, startContractStoreFromEnv } from './service';
import { publishWinnersWith, publishWith, quietLogger, sampleContract, sampleResult, sampleSupplier, withTempDirectory } from './storeTestSupport';
import { queryWinnerList, queryWinnerSummary } from './winnerQueries';

// O armazém no Web Service sem o R2: nunca derruba o servidor, só deixa os
// contratos indisponíveis ("atualizando") e registra o motivo no log.

function recordingLogger() {
  const lines: string[] = [];
  return { lines, logger: createCollectorLogger('debug', (line) => lines.push(line)) };
}

test('sem as variáveis do R2: os contratos ficam indisponíveis, com aviso no log', async () => {
  const { lines, logger } = recordingLogger();
  const store = startContractStoreFromEnv({ DATABASE_URL: 'postgres://app:senha@dpg-x.render.com/banco' }, logger);
  await assert.rejects(store.query(async () => 'nunca'), ContractStoreUnavailableError);
  assert.deepEqual(store.status(), { ready: false, revision: null, publishedAt: null, today: null, totals: null });
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? '', /R2 desligado/);
  await store.close();
});

test('R2 só em parte, ou a pasta da produção com o banco local: o erro é registrado e o servidor segue, sem os contratos', async () => {
  const complete = {
    TENDERS_ARCHIVE_ENDPOINT: 'https://conta-teste.r2.cloudflarestorage.com',
    TENDERS_ARCHIVE_BUCKET: 'licitacoes-dados',
    TENDERS_ARCHIVE_ACCESS_KEY_ID: 'chave-de-teste',
    TENDERS_ARCHIVE_SECRET_ACCESS_KEY: 'segredo-de-teste',
  };
  for (const env of [
    { ...complete, DATABASE_URL: 'postgres://app:senha@dpg-x.render.com/banco' },
    { ...complete, TENDERS_STORAGE_PREFIX: 'producao', DATABASE_URL: 'postgres://postgres:x@localhost:5433/sistema_financas_dev' },
  ]) {
    const { lines, logger } = recordingLogger();
    const store = startContractStoreFromEnv(env, logger);
    await assert.rejects(store.query(async () => 'nunca'), ContractStoreUnavailableError);
    const errors = lines.map((line) => JSON.parse(line) as { level: string; msg: string; error?: string }).filter((line) => line.level === 'error');
    assert.equal(errors.length, 1);
    assert.match(errors[0]?.msg ?? '', /Configuração do R2 recusada/);
    assert.ok(!lines.join('\n').includes('segredo-de-teste'), 'o log não mostra as chaves');
    await store.close();
  }
});

test('o Web Service abre os conjuntos de contratos e os vencedores', () => {
  assert.deepEqual([...WEB_STORE_DATASETS], ['vigentes', 'contratos', 'fornecedor', 'vencedores']);
});

test('leitor com os conjuntos do Web Service: sem arquivos de vencedores as consultas dão zeros; depois da publicação, os números', async () => {
  const supplier = sampleSupplier();
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await publishWith(storage, join(directory, 'gravacao-contratos'), 1, async (writer) => void (await writer.upsert([sampleContract(1)])));
    const reader = await ContractStoreReader.create({ storage, directory: join(directory, 'leitura'), logger: quietLogger, datasets: WEB_STORE_DATASETS });
    try {
      await reader.refresh();
      assert.equal(reader.status().ready, true);
      assert.equal(reader.status().winners, undefined, 'sem arquivos de vencedores no manifesto');
      assert.deepEqual(await reader.query((connection) => queryWinnerSummary(connection, supplier.key)), {
        name: null,
        purchases: 0,
        items: 0,
        totalValue: '0.00',
        firstResultDate: null,
        lastResultDate: null,
        byYear: [],
      });
      assert.deepEqual(await reader.query((connection) => queryWinnerList(connection, supplier.key)), []);
      assert.equal(await reader.query((connection) => contractExists(connection, sampleContract(1).pncpControlNumber)), true);

      await publishWinnersWith(storage, join(directory, 'gravacao-vencedores'), 2, async (writer) => void (await writer.apply([sampleResult(1, { supplier })])));
      assert.equal(await reader.refresh(), true, 'a nova publicação é baixada');
      assert.equal(reader.status().winners?.rows, 1);
      assert.equal((await reader.query((connection) => queryWinnerSummary(connection, supplier.key))).purchases, 1);
      assert.equal(await reader.query((connection) => contractExists(connection, sampleContract(1).pncpControlNumber)), true, 'os contratos continuam');
    } finally {
      await reader.close();
    }
  });
});

test('startContractStore sem configuração é o mesmo estado: indisponível', async () => {
  const { logger } = recordingLogger();
  const store = startContractStore(null, logger);
  await assert.rejects(store.query(async () => 'nunca'), ContractStoreUnavailableError);
  await store.close();
});
