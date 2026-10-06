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
