import assert from 'node:assert/strict';
import test from 'node:test';
import { createCollectorLogger } from '../collector/logger';
import { ContractStoreUnavailableError } from './reader';
import { startContractStore, startContractStoreFromEnv } from './service';

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

test('startContractStore sem configuração é o mesmo estado: indisponível', async () => {
  const { logger } = recordingLogger();
  const store = startContractStore(null, logger);
  await assert.rejects(store.query(async () => 'nunca'), ContractStoreUnavailableError);
  await store.close();
});
