import assert from 'node:assert/strict';
import test from 'node:test';
import { CollectorConfigError, loadCollectorConfig, loadComprasGovSettings, loadStorageSettings } from './config';

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
  });
});

test('contratos: os valores informados são lidos; o limite de espaço do banco saiu (os contratos moram no R2)', () => {
  const config = loadCollectorConfig({
    TENDERS_COLLECTOR_DATABASE_URL: databaseUrl,
    TENDERS_CONTRACTS_MAX_DB_MB: '700',
    PNCP_TERMS_INTERVAL_MS: '1000',
    TENDERS_CONTRACTS_BACKFILL_FROM: '2024-01-01',
    TENDERS_CONTRACTS_BACKFILL_MINUTES: '60',
  });
  assert.equal('maxDatabaseMb' in config.contracts, false);
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
  ];
  for (const [key, value] of invalid) {
    assert.throws(() => loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, [key]: value }), CollectorConfigError, `${key}=${value}`);
  }
});

// Valores de mentira, só para os testes.
const storageEnv = {
  TENDERS_ARCHIVE_ENDPOINT: 'https://conta-teste.r2.cloudflarestorage.com/',
  TENDERS_ARCHIVE_BUCKET: 'licitacoes-dados',
  TENDERS_ARCHIVE_ACCESS_KEY_ID: 'chave-de-teste',
  TENDERS_ARCHIVE_SECRET_ACCESS_KEY: 'segredo-de-teste',
  TENDERS_STORAGE_PREFIX: 'local',
};
const productionDatabaseUrl = 'postgres://app:senha@dpg-teste.oregon-postgres.render.com/banco';

test('R2: sem nenhuma variável (ou com todas vazias), desligado', () => {
  assert.equal(loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl }).storage, null);
  const blank = Object.fromEntries(Object.keys(storageEnv).map((key) => [key, ' ']));
  assert.equal(loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, ...blank }).storage, null);
});

test('R2: as 5 variáveis ligam, com o endpoint sem a barra do fim e a pasta do ambiente', () => {
  assert.deepEqual(loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, ...storageEnv }).storage, {
    endpoint: 'https://conta-teste.r2.cloudflarestorage.com',
    bucket: 'licitacoes-dados',
    accessKeyId: 'chave-de-teste',
    secretAccessKey: 'segredo-de-teste',
    prefix: 'local',
  });
});

test('R2: parte das variáveis é recusada, citando só os nomes das que faltam', () => {
  const partial = { ...storageEnv, TENDERS_ARCHIVE_BUCKET: '', TENDERS_ARCHIVE_ACCESS_KEY_ID: undefined };
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

test('R2: as 4 da conta sem a pasta do ambiente são recusadas', () => {
  assert.throws(
    () => loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, ...storageEnv, TENDERS_STORAGE_PREFIX: undefined }),
    /faltam TENDERS_STORAGE_PREFIX/,
  );
});

test('R2: endpoint sem https, bucket fora da regra do R2 e pasta fora do formato são recusados', () => {
  const invalid: Array<[string, string]> = [
    ['TENDERS_ARCHIVE_ENDPOINT', 'http://conta-teste.r2.cloudflarestorage.com'],
    ['TENDERS_ARCHIVE_ENDPOINT', 'conta-teste.r2.cloudflarestorage.com'],
    ['TENDERS_ARCHIVE_BUCKET', 'Licitacoes_Dados'],
    ['TENDERS_ARCHIVE_BUCKET', 'ab'],
    ['TENDERS_STORAGE_PREFIX', 'Producao'],
    ['TENDERS_STORAGE_PREFIX', 'local/teste'],
    ['TENDERS_STORAGE_PREFIX', '-local'],
  ];
  for (const [key, value] of invalid) {
    assert.throws(
      () => loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, ...storageEnv, [key]: value }),
      CollectorConfigError,
      `${key}=${value}`,
    );
  }
});

test('R2: a pasta da produção é recusada com o banco local e aceita com o banco da produção', () => {
  const productionStorage = { ...storageEnv, TENDERS_STORAGE_PREFIX: 'producao' };
  for (const localUrl of [databaseUrl, 'postgres://app@127.0.0.1:5432/banco']) {
    assert.throws(() => loadStorageSettings(productionStorage, localUrl), /TENDERS_STORAGE_PREFIX=producao com o banco local/, localUrl);
  }
  assert.equal(loadStorageSettings(productionStorage, productionDatabaseUrl)?.prefix, 'producao');
  assert.equal(loadStorageSettings(storageEnv, productionDatabaseUrl)?.prefix, 'local', 'outra pasta com o banco da produção é aceita');
});

test('vencedores: desligados por padrão, carga desde 2021-08 (o primeiro mês com dado) em blocos de 120 min', () => {
  const config = loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl });
  assert.deepEqual(config.winners, { enabled: false, backfillFrom: '2021-08-01', backfillMinutes: 120 });
});

test('vencedores: só "1" liga as etapas; os valores informados são lidos', () => {
  const config = loadCollectorConfig({
    TENDERS_COLLECTOR_DATABASE_URL: databaseUrl,
    TENDERS_WINNERS_ENABLED: '1',
    TENDERS_WINNERS_BACKFILL_FROM: '2024-01-01',
    TENDERS_WINNERS_BACKFILL_MINUTES: '30',
  });
  assert.deepEqual(config.winners, { enabled: true, backfillFrom: '2024-01-01', backfillMinutes: 30 });
  assert.equal(loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, TENDERS_WINNERS_ENABLED: '0' }).winners.enabled, false);
  assert.equal(loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, TENDERS_WINNERS_ENABLED: ' ' }).winners.enabled, false, 'vazia vale como não informada');
});

test('vencedores: valores fora da faixa são recusados, e a variável de ligar só aceita 0 ou 1', () => {
  const invalid: Array<[string, string]> = [
    ['TENDERS_WINNERS_ENABLED', 'true'],
    ['TENDERS_WINNERS_ENABLED', 'sim'],
    ['TENDERS_WINNERS_ENABLED', '2'],
    ['TENDERS_WINNERS_BACKFILL_MINUTES', '0'],
    ['TENDERS_WINNERS_BACKFILL_MINUTES', '601'],
    ['TENDERS_WINNERS_BACKFILL_FROM', '2021-02-30'],
  ];
  for (const [key, value] of invalid) {
    assert.throws(() => loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, [key]: value }), CollectorConfigError, `${key}=${value}`);
  }
});

test('vencedores: a configuração dos contratos não muda', () => {
  const config = loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, TENDERS_WINNERS_ENABLED: '1', TENDERS_WINNERS_BACKFILL_MINUTES: '30' });
  assert.deepEqual(config.contracts, { pageSize: 500, termsIntervalMs: 500, backfillFrom: '2021-01-01', backfillMinutes: 480 });
});

test('Compras.gov.br: 1,5 s entre pedidos por padrão, no coletor e sem nenhuma variável (a sondagem não tem banco)', () => {
  assert.deepEqual(loadComprasGovSettings({}), { requestIntervalMs: 1500 });
  assert.deepEqual(loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl }).comprasGov, { requestIntervalMs: 1500 });
});

test('Compras.gov.br: o intervalo informado é lido (de 0 a 60 s); vazio vale o padrão; fora da faixa é recusado', () => {
  assert.equal(loadComprasGovSettings({ COMPRASGOV_REQUEST_INTERVAL_MS: '4000' }).requestIntervalMs, 4000);
  assert.equal(loadComprasGovSettings({ COMPRASGOV_REQUEST_INTERVAL_MS: '0' }).requestIntervalMs, 0);
  assert.equal(loadComprasGovSettings({ COMPRASGOV_REQUEST_INTERVAL_MS: ' ' }).requestIntervalMs, 1500);
  for (const value of ['-1', '60001', 'rápido', '1.5']) {
    assert.throws(() => loadComprasGovSettings({ COMPRASGOV_REQUEST_INTERVAL_MS: value }), CollectorConfigError, value);
  }
  assert.throws(
    () => loadCollectorConfig({ TENDERS_COLLECTOR_DATABASE_URL: databaseUrl, COMPRASGOV_REQUEST_INTERVAL_MS: '999999' }),
    /COMPRASGOV_REQUEST_INTERVAL_MS/,
  );
});
