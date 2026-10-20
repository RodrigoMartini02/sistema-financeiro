import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { localPath } from './localCopy';
import { manifestFiles, parseManifest } from './manifest';
import { MANIFEST_KEY } from './layout';
import { ContractStoreReader, ContractStoreTimeoutError, ContractStoreUnavailableError, type ContractStoreReaderOptions } from './reader';
import { publishWith, quietLogger, sampleContract, withTempDirectory } from './storeTestSupport';

// Leitura do armazém de contratos no Web Service, com o R2 simulado: o
// gravador publica numa pasta, e o leitor copia para outra.

async function withReader(
  storage: ObjectStorage,
  directory: string,
  run: (reader: ContractStoreReader) => Promise<void>,
  options: Partial<ContractStoreReaderOptions> = {},
): Promise<void> {
  const reader = await ContractStoreReader.create({ storage, directory, logger: quietLogger, ...options });
  try {
    await run(reader);
  } finally {
    await reader.close();
  }
}

async function count(reader: ContractStoreReader, view: 'vigentes' | 'contratos' | 'fornecedor'): Promise<number> {
  return reader.query(async (connection) => Number((await connection.runAndReadAll(`SELECT count(*) FROM ${view}`)).getRows()[0]?.[0]));
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

test('sem cópia pronta, a busca recusa com ContractStoreUnavailableError', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await withReader(storage, directory, async (reader) => {
      assert.equal(reader.status().ready, false);
      await assert.rejects(count(reader, 'contratos'), ContractStoreUnavailableError);
    });
  });
});

test('armazém sem nenhuma publicação: pronto, com as visões vazias', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await withReader(storage, directory, async (reader) => {
      assert.equal(await reader.refresh(), true);
      assert.deepEqual(reader.status(), { ready: true, revision: null, publishedAt: null, today: null, totals: null });
      assert.equal(await count(reader, 'contratos'), 0);
      assert.equal(await count(reader, 'vigentes'), 0);
      assert.equal(await count(reader, 'fornecedor'), 0);
      assert.equal(await reader.refresh(), false, 'continua sem publicação: nada a trocar');
    });
  });
});

test('copia a versão publicada e troca para a seguinte; a mesma versão não é baixada de novo', async () => {
  await withTempDirectory(async (root) => {
    const { storage } = createMemoryStorage();
    const writerDirectory = join(root, 'gravador');
    const readerDirectory = join(root, 'leitor');
    await publishWith(storage, writerDirectory, 1, async (writer) => void (await writer.upsert([sampleContract(1), sampleContract(2), sampleContract(3, { expiresOn: '2025-01-01' })])));

    await withReader(storage, readerDirectory, async (reader) => {
      assert.equal(await reader.refresh(), true);
      assert.equal(reader.status().revision, '1.1');
      assert.deepEqual(reader.status().totals, { contracts: 3, active: 2, withoutExpiry: 0 });
      assert.equal(await count(reader, 'contratos'), 3);
      assert.equal(await count(reader, 'vigentes'), 2);
      assert.equal(await count(reader, 'fornecedor'), 3);
      assert.equal(await reader.refresh(), false);

      await publishWith(storage, writerDirectory, 2, async (writer) => void (await writer.upsert([sampleContract(4), sampleContract(5)])));
      assert.equal(await reader.refresh(), true);
      assert.equal(reader.status().revision, '2.1');
      assert.equal(await count(reader, 'contratos'), 5);
      const storedObject = await reader.query(async (connection: DuckDBConnection) =>
        (await connection.runAndReadAll(`SELECT objeto FROM contratos WHERE sequencial_contrato = 5`)).getRows()[0]?.[0],
      );
      assert.equal(storedObject, 'Serviço de limpeza 5');
    });
  });
});

test('arquivos da versão anterior ficam até a troca seguinte (uma busca pode estar lendo deles)', async () => {
  await withTempDirectory(async (root) => {
    const { storage, objects } = createMemoryStorage();
    const writerDirectory = join(root, 'gravador');
    const readerDirectory = join(root, 'leitor');
    const manifest = () => parseManifest(objects.get(MANIFEST_KEY) ?? new Uint8Array());

    await publishWith(storage, writerDirectory, 1, async (writer) => void (await writer.upsert([sampleContract(1)])));
    await withReader(storage, readerDirectory, async (reader) => {
      await reader.refresh();
      const firstFiles = manifestFiles(manifest()).map((file) => localPath(readerDirectory, file.path));
      assert.ok((await Promise.all(firstFiles.map(exists))).every(Boolean));

      await publishWith(storage, writerDirectory, 2, async (writer) => void (await writer.upsert([sampleContract(1, { payloadHash: 'v2' })])));
      await reader.refresh();
      assert.ok((await Promise.all(firstFiles.map(exists))).every(Boolean), 'a versão anterior continua na pasta');

      await publishWith(storage, writerDirectory, 3, async (writer) => void (await writer.upsert([sampleContract(1, { payloadHash: 'v3' })])));
      await reader.refresh();
      const current = new Set(manifestFiles(manifest()).map((file) => localPath(readerDirectory, file.path)));
      const firstOnly = firstFiles.filter((path) => !current.has(path));
      assert.ok(firstOnly.length > 0);
      assert.ok((await Promise.all(firstOnly.map(exists))).every((found) => !found), 'duas trocas depois, saiu');
    });
  });
});

test('busca que passa do limite de tempo é interrompida com ContractStoreTimeoutError', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await withReader(
      storage,
      directory,
      async (reader) => {
        await reader.refresh();
        await assert.rejects(
          reader.query((connection) => connection.runAndReadAll('SELECT sum(x) FROM range(100000000000) t(x)')),
          ContractStoreTimeoutError,
        );
        assert.equal(await count(reader, 'contratos'), 0, 'a conexão volta para a fila e funciona');
      },
      { queryTimeoutMs: 100, maxConcurrentQueries: 1 },
    );
  });
});

test('fila: com uma conexão, a segunda busca espera a primeira; espera longa demais vira ContractStoreTimeoutError', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await withReader(
      storage,
      directory,
      async (reader) => {
        await reader.refresh();
        const order: string[] = [];
        let releaseFirst = () => {};
        const first = reader.query(async () => {
          order.push('primeira começou');
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
          order.push('primeira terminou');
        });
        const second = reader.query(async () => {
          order.push('segunda começou');
        });
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.deepEqual(order, ['primeira começou'], 'a segunda está na fila');
        releaseFirst();
        await Promise.all([first, second]);
        assert.deepEqual(order, ['primeira começou', 'primeira terminou', 'segunda começou']);

        let releaseHolder = () => {};
        const holder = reader.query(
          () =>
            new Promise<void>((resolve) => {
              releaseHolder = resolve;
            }),
        );
        await assert.rejects(reader.query(async () => 'nunca'), ContractStoreTimeoutError);
        releaseHolder();
        await holder;
      },
      { queryTimeoutMs: 200, maxConcurrentQueries: 1 },
    );
  });
});

test('R2 fora do ar: sem cópia continua indisponível; com cópia, a versão em uso continua', async () => {
  await withTempDirectory(async (root) => {
    let down = false;
    const { storage } = createMemoryStorage(() => down);
    await publishWith(storage, join(root, 'gravador'), 1, async (writer) => void (await writer.upsert([sampleContract(1)])));

    down = true;
    await withReader(storage, join(root, 'leitor'), async (reader) => {
      assert.equal(await reader.refresh(), false);
      assert.equal(reader.status().ready, false);
      down = false;
      assert.equal(await reader.refresh(), true);
      down = true;
      assert.equal(await reader.refresh(), false);
      assert.equal(reader.status().revision, '1.1');
      assert.equal(await count(reader, 'contratos'), 1);
    });
  });
});
