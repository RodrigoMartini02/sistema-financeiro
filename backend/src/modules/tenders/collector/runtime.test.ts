import assert from 'node:assert/strict';
import test from 'node:test';
import { COLLECTOR_DISK_LIMIT_BYTES } from './resourceBudget';
import { createCollectorRuntime } from './runtime';

// Valores de mentira, só para os testes: o banco e o R2 são apenas criados, e nenhuma requisição sai deles.
const baseEnv = {
  TENDERS_COLLECTOR_DATABASE_URL: 'postgres://coletor@localhost:5433/teste',
  TENDERS_ARCHIVE_ENDPOINT: 'https://conta-teste.r2.cloudflarestorage.com',
  TENDERS_ARCHIVE_BUCKET: 'licitacoes-dados',
  TENDERS_ARCHIVE_ACCESS_KEY_ID: 'chave-de-teste',
  TENDERS_ARCHIVE_SECRET_ACCESS_KEY: 'segredo-de-teste',
  TENDERS_STORAGE_PREFIX: 'local',
};

async function diskLimitOf(extraEnv: NodeJS.ProcessEnv): Promise<number | undefined> {
  const runtime = createCollectorRuntime({ ...baseEnv, ...extraEnv });
  try {
    return runtime.context.resourceBudget?.limitBytes;
  } finally {
    await runtime.close();
  }
}

test('orçamento de disco: sem a variável, vale o limite padrão de 1,6 GB (os 2 GB do disco temporário do Render)', async () => {
  assert.equal(COLLECTOR_DISK_LIMIT_BYTES, 1_600_000_000);
  assert.equal(await diskLimitOf({}), COLLECTOR_DISK_LIMIT_BYTES);
  assert.equal(await diskLimitOf({ TENDERS_DISK_LIMIT_MB: ' ' }), COLLECTOR_DISK_LIMIT_BYTES, 'vazia vale como não informada');
});

test('orçamento de disco: TENDERS_DISK_LIMIT_MB libera mais espaço, em MB decimais', async () => {
  assert.equal(await diskLimitOf({ TENDERS_DISK_LIMIT_MB: '20000' }), 20_000_000_000);
  assert.equal(await diskLimitOf({ TENDERS_DISK_LIMIT_MB: '1600' }), COLLECTOR_DISK_LIMIT_BYTES);
});
