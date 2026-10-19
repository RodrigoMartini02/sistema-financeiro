import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import type { TenderContractRow } from '../collector/contractMapping';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { openDuckDb, sqlLiteral, toDuckDbPath } from './duckdb';
import { FILES_FOLDER, MANIFEST_KEY } from './layout';
import { manifestFiles, parseManifest, type StoreManifest } from './manifest';
import { publishWith, quietLogger, sampleContract, simpleSearchFields, withTempDirectory } from './storeTestSupport';
import { ContractStoreWriter } from './writer';

// Gravação do armazém de contratos com o R2 simulado e campos de busca
// simplificados: cada "execução" abre o gravador, grava e publica (publishWith).

function manifestOf(objects: Map<string, Uint8Array>): StoreManifest {
  const body = objects.get(MANIFEST_KEY);
  assert.ok(body, 'manifesto publicado');
  return parseManifest(body);
}

/** Linhas de um arquivo do bucket simulado, na ordem do arquivo. */
async function rowsOf(objects: Map<string, Uint8Array>, key: string, columns: string): Promise<Record<string, unknown>[]> {
  return withTempDirectory(async (directory) => {
    const path = join(directory, 'arquivo.parquet');
    const body = objects.get(key);
    assert.ok(body, `arquivo no bucket: ${key}`);
    await writeFile(path, body);
    const { instance, connection } = await openDuckDb({ memoryLimitMb: 128, threads: 1, tempDirectory: join(directory, 'tmp') });
    try {
      const result = await connection.runAndReadAll(`SELECT ${columns} FROM read_parquet(${sqlLiteral(toDuckDbPath(path))})`);
      return result.getRowObjectsJson() as Record<string, unknown>[];
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });
}

/** Números de controle de todos os arquivos de um conjunto, na ordem do manifesto. */
async function controlNumbers(objects: Map<string, Uint8Array>, dataset: 'vigentes' | 'contratos' | 'fornecedor'): Promise<string[]> {
  const numbers: string[] = [];
  for (const file of manifestOf(objects).datasets[dataset]) {
    for (const row of await rowsOf(objects, file.path, 'numero_controle_pncp')) {
      numbers.push(String(row['numero_controle_pncp']));
    }
  }
  return numbers;
}

/** R2 simulado que anota a ordem dos envios. */
function recordingStorage(base: ObjectStorage, puts: string[]): ObjectStorage {
  return {
    ...base,
    async putObject(key, body, contentType) {
      puts.push(key);
      await base.putObject(key, body, contentType);
    },
  };
}

const at = (sequence: number, overrides: Partial<TenderContractRow> = {}) => sampleContract(sequence, overrides);

test('primeira publicação: os três conjuntos, por ano e faixa, com os totais, e o manifesto por último', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const puts: string[] = [];
    const summary = await publishWith(recordingStorage(storage, puts), directory, 10, async (writer) => {
      const result = await writer.upsert([
        at(1, { state: 'SP' }),
        at(2, { state: 'MG' }),
        at(3, { state: 'SP', expiresOn: '2028-03-01' }),
        at(4, { contractYear: 2025, state: 'RJ', expiresOn: '2025-12-31' }),
        at(5, { expiresOn: null, originalTermEnd: null }),
      ]);
      assert.deepEqual(result, { insertedCount: 5, updatedCount: 0, unchangedCount: 0 });
    });

    assert.deepEqual(summary?.totals, { contracts: 5, active: 3, withoutExpiry: 1 });
    assert.equal(summary?.revision, '10.1');
    assert.equal(puts.at(-1), MANIFEST_KEY, 'o manifesto vai por último');
    const manifest = manifestOf(objects);
    assert.deepEqual(manifest.datasets.contratos.map((file) => [file.partition, file.from, file.rows]), [['2025', '', 1], ['2026', '', 4]]);
    assert.deepEqual(manifest.datasets.fornecedor.map((file) => [file.partition, file.rows]), [['2025', 1], ['2026', 4]]);
    assert.deepEqual(manifest.datasets.vigentes.map((file) => file.partition), ['2027-01-04', '2028-03-01'], 'semana no 1º ano, mês no 2º, pelo dia de início');
    for (const file of manifestFiles(manifest)) {
      assert.ok(objects.has(file.path), `arquivo enviado: ${file.path}`);
      assert.ok(file.bytes > 0);
    }

    // Ordem dentro do arquivo: UF e número de controle.
    const file2026 = manifest.datasets.contratos.find((file) => file.partition === '2026');
    const rows = await rowsOf(objects, file2026?.path ?? '', 'uf, sequencial_contrato');
    assert.deepEqual(rows.map((row) => [row['uf'], row['sequencial_contrato']]), [['MG', 2], ['SP', 1], ['SP', 3], ['SP', 5]]);
    // Vigentes: por vencimento e UF (os dois primeiros vencem no mesmo dia: MG antes de SP).
    assert.deepEqual(await controlNumbers(objects, 'vigentes'), [at(2).pncpControlNumber, at(1).pncpControlNumber, at(3).pncpControlNumber]);
  });
});

test('estado anterior: das mudanças da execução e dos arquivos; igual não conta como mudança e nada é publicado', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWith(storage, directory, 1, async (writer) => {
      await writer.upsert([at(1), at(2, { amendments: [], amendmentsReference: '2026-10-05T10:00:00' })]);
    });

    const summary = await publishWith(storage, directory, 2, async (writer) => {
      const states = await writer.readStates([at(1).pncpControlNumber, at(2).pncpControlNumber, at(9).pncpControlNumber]);
      assert.deepEqual([...states.keys()].sort(), [at(1).pncpControlNumber, at(2).pncpControlNumber]);
      assert.deepEqual(states.get(at(2).pncpControlNumber), {
        amendments: [],
        amendmentsReference: '2026-10-05T10:00:00',
        expiresOn: '2027-01-10',
        payloadHash: 'hash-2',
        firstCollectedAt: '2026-10-19T12:00:00.000Z',
      });

      assert.deepEqual(await writer.upsert([at(1)]), { insertedCount: 0, updatedCount: 0, unchangedCount: 1 });
      assert.deepEqual(await writer.upsert([at(1, { payloadHash: 'outro' }), at(9)]), { insertedCount: 1, updatedCount: 1, unchangedCount: 0 });
      assert.equal((await writer.readStates([at(1).pncpControlNumber])).get(at(1).pncpControlNumber)?.payloadHash, 'outro', 'a mudança da execução vale');
      assert.equal(await writer.pendingChanges(), 2);
    });
    assert.equal(summary?.changedContracts, 2);
    assert.equal(summary?.totals.contracts, 3);

    const revision = manifestOf(objects).revision;
    assert.equal(await publishWith(storage, directory, 3, async (writer) => void (await writer.upsert([at(9)]))), null, 'nada mudou: não publica');
    assert.equal(manifestOf(objects).revision, revision);
  });
});

test('publicação parcial: só a parte do contrato mudado é regravada; as outras continuam com o mesmo arquivo', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const limits = { maxRowsPerFile: { contratos: 3 } };
    await publishWith(storage, directory, 1, async (writer) => void (await writer.upsert(Array.from({ length: 9 }, (_, index) => at(index + 1)))), limits);
    const before = manifestOf(objects).datasets.contratos;
    assert.deepEqual(before.map((file) => file.rows), [3, 3, 3]);

    await publishWith(storage, directory, 2, async (writer) => void (await writer.upsert([at(5, { payloadHash: 'mudou' })])), limits);
    const after = manifestOf(objects).datasets.contratos;
    assert.deepEqual(after.map((file) => file.rows), [3, 3, 3]);
    assert.equal(after[0]?.path, before[0]?.path, 'a primeira parte é a mesma');
    assert.equal(after[2]?.path, before[2]?.path, 'a terceira parte é a mesma');
    assert.notEqual(after[1]?.path, before[1]?.path, 'a do meio foi regravada');
    assert.match(after[1]?.path ?? '', /\/v2\.1-\d{4}\.parquet$/);
    const middle = await rowsOf(objects, after[1]?.path ?? '', 'sequencial_contrato, hash_payload');
    assert.deepEqual(middle.map((row) => [row['sequencial_contrato'], row['hash_payload']]), [[4, 'hash-4'], [5, 'mudou'], [6, 'hash-6']]);
  });
});

test('parte que passa do limite é dividida em faixas de tamanho parecido, em ordem', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWith(
      storage,
      directory,
      1,
      async (writer) => void (await writer.upsert(Array.from({ length: 10 }, (_, index) => at(index + 1)))),
      { maxRowsPerFile: { contratos: 4, fornecedor: 4 } },
    );
    const files = manifestOf(objects).datasets.contratos;
    assert.equal(files.length, 3);
    assert.equal(files.reduce((total, file) => total + file.rows, 0), 10);
    assert.ok(files.every((file) => file.rows <= 4), JSON.stringify(files.map((file) => file.rows)));
    assert.equal(files[0]?.from, '');
    assert.deepEqual(await controlNumbers(objects, 'contratos'), Array.from({ length: 10 }, (_, index) => at(index + 1).pncpControlNumber));
    assert.equal(manifestOf(objects).datasets.fornecedor.length, 3);
  });
});

test('faixa de vencimento cheia (como a semana de 31/12) é dividida em partes, na ordem de vencimento e UF', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const yearEnd = Array.from({ length: 7 }, (_, index) => at(index + 1, { expiresOn: '2026-12-31', state: index % 2 === 0 ? 'SP' : 'BA' }));
    await publishWith(storage, directory, 1, async (writer) => void (await writer.upsert([...yearEnd, at(8, { expiresOn: '2027-03-15' })])), {
      maxRowsPerFile: { vigentes: 3 },
    });
    const files = manifestOf(objects).datasets.vigentes;
    assert.deepEqual(files.map((file) => [file.partition, file.rows]), [['2026-12-28', 3], ['2026-12-28', 3], ['2026-12-28', 1], ['2027-03-15', 1]]);
    const numbers = await controlNumbers(objects, 'vigentes');
    const expected = [...[2, 4, 6].map((sequence) => at(sequence)), ...[1, 3, 5, 7].map((sequence) => at(sequence)), at(8)].map((row) => row.pncpControlNumber);
    assert.deepEqual(numbers, expected, 'BA antes de SP no mesmo dia, e cada contrato uma vez');
  });
});

test('contrato que muda de UF sai da parte antiga e entra na nova, sem repetir', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const limits = { maxRowsPerFile: { contratos: 2 } };
    await publishWith(
      storage,
      directory,
      1,
      async (writer) => void (await writer.upsert([at(1, { state: 'MG' }), at(2, { state: 'MG' }), at(3), at(4)])),
      limits,
    );
    assert.deepEqual(manifestOf(objects).datasets.contratos.map((file) => file.rows), [2, 2]);

    // O 4 sai de SP (2ª parte) e vai para AC, que fica antes de MG (1ª parte).
    await publishWith(storage, directory, 2, async (writer) => void (await writer.upsert([at(4, { state: 'AC', payloadHash: 'mudou' })])), limits);
    const numbers = await controlNumbers(objects, 'contratos');
    assert.equal(numbers.length, 4, 'nenhum contrato repetido nem perdido');
    assert.equal(new Set(numbers).size, 4);
    const rowsByFile: Array<Array<[unknown, unknown]>> = [];
    for (const file of manifestOf(objects).datasets.contratos) {
      rowsByFile.push((await rowsOf(objects, file.path, 'uf, sequencial_contrato')).map((row) => [row['uf'], row['sequencial_contrato']]));
    }
    assert.deepEqual(rowsByFile.flat(), [['AC', 4], ['MG', 1], ['MG', 2], ['SP', 3]], 'em ordem, o 4 uma vez só, já em AC');
    assert.deepEqual(rowsByFile.at(-1), [['SP', 3]], 'a parte de SP ficou sem ele');
    assert.ok(rowsByFile.every((rows) => rows.length <= 2), 'a parte que cresceu foi dividida');
    assert.equal(manifestOf(objects).totals.contracts, 4);
  });
});

test('limpeza: apaga do bucket o que nenhum dos dois últimos manifestos usa, inclusive sobras de publicação que falhou', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const orphan = `${FILES_FOLDER}/contratos/2026/v99.1-0001.parquet`;
    await publishWith(storage, directory, 1, async (writer) => void (await writer.upsert([at(1)])));
    const first = manifestFiles(manifestOf(objects)).map((file) => file.path);
    objects.set(orphan, new Uint8Array([1]));

    await publishWith(storage, directory, 2, async (writer) => void (await writer.upsert([at(1, { payloadHash: 'v2' })])));
    assert.ok(first.every((path) => objects.has(path)), 'a versão anterior continua: quem lê pode estar nela');
    assert.ok(!objects.has(orphan), 'a sobra sem manifesto saiu');

    await publishWith(storage, directory, 3, async (writer) => void (await writer.upsert([at(1, { payloadHash: 'v3' })])));
    assert.ok(first.every((path) => !objects.has(path)), 'dois manifestos depois, a primeira versão saiu');
    const used = new Set(manifestFiles(manifestOf(objects)).map((file) => file.path));
    const stored = [...objects.keys()].filter((key) => key.startsWith(`${FILES_FOLDER}/`));
    assert.ok(stored.every((key) => used.has(key) || key.includes('/v2.1-')), JSON.stringify(stored));
  });
});

test('falha no envio: a publicação falha antes do manifesto, e a versão em uso não muda', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage((key) => key.includes('/v2.1-'));
    await publishWith(storage, directory, 1, async (writer) => void (await writer.upsert([at(1)])));
    const revision = manifestOf(objects).revision;

    await assert.rejects(
      publishWith(storage, directory, 2, async (writer) => void (await writer.upsert([at(2)]))),
      /R2 fora do ar/,
    );
    assert.equal(manifestOf(objects).revision, revision);
    assert.equal(manifestOf(objects).totals.contracts, 1);

    const summary = await publishWith(storage, directory, 3, async (writer) => void (await writer.upsert([at(2)])));
    assert.equal(summary?.totals.contracts, 2, 'a execução seguinte publica');
  });
});

test('carga: várias publicações na mesma execução, cada uma partindo da anterior', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const writer = await ContractStoreWriter.open({
      storage,
      searchFields: simpleSearchFields,
      directory,
      version: 7,
      today: '2026-10-19',
      now: () => new Date('2026-10-19T12:00:00Z'),
      logger: quietLogger,
    });
    try {
      await writer.upsert([at(1), at(2)]);
      assert.equal((await writer.publish())?.revision, '7.1');
      assert.equal(await writer.pendingChanges(), 0);
      assert.equal((await writer.readStates([at(1).pncpControlNumber])).size, 1, 'lê da versão recém-publicada');

      await writer.upsert([at(3), at(1)]);
      const second = await writer.publish();
      assert.equal(second?.revision, '7.2');
      assert.equal(second?.changedContracts, 1, 'o igual não conta');
      assert.equal(second?.totals.contracts, 3);
      assert.equal(writer.currentManifest?.revision, '7.2');
    } finally {
      await writer.close();
    }
    assert.equal(manifestOf(objects).revision, '7.2');
  });
});
