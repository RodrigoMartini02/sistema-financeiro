import assert from 'node:assert/strict';
import test from 'node:test';
import { CollectorConfigError, loadCollectorConfig } from './config';

const databaseUrl = 'postgres://coletor@localhost:5433/teste';

test('padrões do PNCP: 4 s entre requisições, modalidades 6, 8, 4 e 7, todas as UFs', () => {
  const config = loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl });
  assert.equal(config.pncp.requestIntervalMs, 4000);
  assert.deepEqual(config.pncp.modalities, [6, 8, 4, 7]);
  assert.deepEqual(config.pncp.states, []);
  assert.equal(config.pncp.baseUrl, 'https://pncp.gov.br/api/consulta');
});

test('variável informada prevalece sobre o padrão; vazia vale como não informada', () => {
  const config = loadCollectorConfig({
    TENDERS_COLLECTOR_DATABASE_URL: databaseUrl,
    PNCP_REQUEST_INTERVAL_MS: '6000',
    PNCP_STATES: ' ',
  });
  assert.equal(config.pncp.requestIntervalMs, 6000);
  assert.deepEqual(config.pncp.states, []);
});

test('sem URL do banco, a configuração é recusada', () => {
  assert.throws(() => loadCollectorConfig({}), CollectorConfigError);
});

test('contratos: 500 por página, 0,5 s entre termos, carga desde 2021 em blocos de 480 min e sem limite de espaço', () => {
  const config = loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl });
  assert.deepEqual(config.contracts, {
    pageSize: 500,
    termsIntervalMs: 500,
    backfillFrom: '2021-01-01',
    backfillMinutes: 480,
    maxDatabaseMb: null,
  });
});

test('contratos: o limite de espaço informado liga a carga, e os outros valores são lidos', () => {
  const config = loadCollectorConfig({
    TENDERS_COLLECTOR_DATABASE_URL: databaseUrl,
    TENDERS_CONTRACTS_MAX_DB_MB: '700',
    PNCP_TERMS_INTERVAL_MS: '1000',
    TENDERS_CONTRACTS_BACKFILL_FROM: '2024-01-01',
    TENDERS_CONTRACTS_BACKFILL_MINUTES: '60',
  });
  assert.equal(config.contracts.maxDatabaseMb, 700);
  assert.equal(config.contracts.termsIntervalMs, 1000);
  assert.equal(config.contracts.backfillFrom, '2024-01-01');
  assert.equal(config.contracts.backfillMinutes, 60);
});

test('contratos: valores fora da faixa são recusados', () => {
  const invalid: Array<[string, string]> = [
    ['PNCP_CONTRACTS_PAGE_SIZE', '600'],
    ['PNCP_CONTRACTS_PAGE_SIZE', '5'],
    ['PNCP_TERMS_INTERVAL_MS', '60001'],
    ['TENDERS_CONTRACTS_BACKFILL_MINUTES', '0'],
    ['TENDERS_CONTRACTS_BACKFILL_MINUTES', '601'],
    ['TENDERS_CONTRACTS_BACKFILL_FROM', '2021-02-30'],
    ['TENDERS_CONTRACTS_MAX_DB_MB', '0'],
  ];
  for (const [key, value] of invalid) {
    assert.throws(() => loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, [key]: value }), CollectorConfigError, `${key}=${value}`);
  }
});

// Valores de mentira, só para os testes.
const archiveEnv = {
  TENDERS_ARCHIVE_ENDPOINT: 'https://conta-teste.r2.cloudflarestorage.com/',
  TENDERS_ARCHIVE_BUCKET: 'licitacoes-dados',
  TENDERS_ARCHIVE_ACCESS_KEY_ID: 'chave-de-teste',
  TENDERS_ARCHIVE_SECRET_ACCESS_KEY: 'segredo-de-teste',
};

test('arquivo bruto: sem nenhuma variável do R2 (ou com todas vazias), desligado', () => {
  assert.equal(loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl }).archive, null);
  const blank = Object.fromEntries(Object.keys(archiveEnv).map((key) => [key, ' ']));
  assert.equal(loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, ...blank }).archive, null);
});

test('arquivo bruto: as 4 variáveis ligam, com o endpoint sem a barra do fim', () => {
  assert.deepEqual(loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, ...archiveEnv }).archive, {
    endpoint: 'https://conta-teste.r2.cloudflarestorage.com',
    bucket: 'licitacoes-dados',
    accessKeyId: 'chave-de-teste',
    secretAccessKey: 'segredo-de-teste',
  });
});

test('arquivo bruto: parte das variáveis é recusada, citando só os nomes das que faltam', () => {
  const partial = { ...archiveEnv, TENDERS_ARCHIVE_BUCKET: '', TENDERS_ARCHIVE_ACCESS_KEY_ID: undefined };
  assert.throws(
    () => loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, ...partial }),
    (error: unknown) => {
      assert.ok(error instanceof CollectorConfigError);
      assert.match(error.message, /TENDERS_ARCHIVE_BUCKET, TENDERS_ARCHIVE_ACCESS_KEY_ID/);
      assert.doesNotMatch(error.message, /segredo-de-teste|conta-teste/, 'a mensagem não mostra valores');
      return true;
    },
  );
});

test('arquivo bruto: endpoint sem https e bucket fora da regra do R2 são recusados', () => {
  const invalid: Array<[string, string]> = [
    ['TENDERS_ARCHIVE_ENDPOINT', 'http://conta-teste.r2.cloudflarestorage.com'],
    ['TENDERS_ARCHIVE_ENDPOINT', 'conta-teste.r2.cloudflarestorage.com'],
    ['TENDERS_ARCHIVE_BUCKET', 'Licitacoes_Dados'],
    ['TENDERS_ARCHIVE_BUCKET', 'ab'],
  ];
  for (const [key, value] of invalid) {
    assert.throws(
      () => loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, ...archiveEnv, [key]: value }),
      CollectorConfigError,
      `${key}=${value}`,
    );
  }
});
