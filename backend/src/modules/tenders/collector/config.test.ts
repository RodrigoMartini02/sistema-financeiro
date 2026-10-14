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
