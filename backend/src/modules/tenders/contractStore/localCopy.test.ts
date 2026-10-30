import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { CollectorResourceBudget, CollectorResourceLimitError } from '../collector/resourceBudget';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { downloadManifestFiles, localPath } from './localCopy';
import type { StoreManifest } from './manifest';
import { withTempDirectory } from './storeTestSupport';

test('cópia recusa o manifesto completo antes do primeiro download quando não cabe no orçamento', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    let downloads = 0;
    storage.downloadToFile = async () => { downloads += 1; };
    const manifest: StoreManifest = {
      format: 1, revision: '1.1', today: '2026-10-30', publishedAt: '2026-10-30T12:00:00Z',
      totals: { contracts: 2, active: 0, withoutExpiry: 2 },
      datasets: {
        contratos: [1, 2].map((number) => ({ path: `contratos/arquivos/contratos/2026/v1-${number}.parquet`, rows: 1, bytes: 80, partition: '2026', from: '' })),
        vigentes: [], fornecedor: [], vencedores: [],
      },
    };
    const budget = new CollectorResourceBudget({ directory, limitBytes: 100, publicationReserveBytes: 0 });
    await assert.rejects(downloadManifestFiles(storage, manifest, directory, ['contratos'], budget), CollectorResourceLimitError);
    assert.equal(downloads, 0);
    assert.deepEqual(await readdir(directory), []);
  });
});

test('caminhos de objetos não podem escapar da pasta de trabalho', () => {
  const directory = join(process.cwd(), 'copia-de-teste');
  for (const key of ['../fora.parquet', 'contratos/../../fora.parquet', 'C:/fora.parquet', '/fora.parquet', 'contratos\\fora.parquet']) {
    assert.throws(() => localPath(directory, key), /fora do diretório/);
  }
  assert.equal(localPath(directory, 'contratos/arquivos/parte.parquet'), join(directory, 'contratos', 'arquivos', 'parte.parquet'));
});
