import assert from 'node:assert/strict';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import type { TenderContractRow } from '../collector/contractMapping';
import { CollectorResourceBudget, CollectorResourceLimitError } from '../collector/resourceBudget';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { openDuckDb, sqlLiteral, toDuckDbPath } from './duckdb';
import { FILES_FOLDER, MANIFEST_KEY } from './layout';
import { manifestFiles, parseManifest, serializeManifest, type StoreManifest } from './manifest';
import { publishWith, quietLogger, sampleContract, simpleSearchFields, withTempDirectory } from './storeTestSupport';
import { ContractStoreWriter, twinNumber } from './writer';

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
      assert.deepEqual(result, {
        insertedCount: 5,
        updatedCount: 0,
        unchangedCount: 0,
        changedKeys: new Set([at(1), at(2), at(3), at(4, { contractYear: 2025 }), at(5)].map((contract) => contract.pncpControlNumber)),
      });
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

test('contrato federal do Compras.gov.br: entra nos três conjuntos com a chave comprasgov-..., e a segunda passada não regrava nada', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const federal = at(1, {
      pncpControlNumber: 'comprasgov-153254-50-00586/2023',
      contractSequence: 0,
      contractYear: 2023,
      governmentSphere: 'F',
      state: 'MG',
      expiresOn: '2028-01-02',
      originalTermEnd: '2028-01-02',
    });
    await publishWith(storage, directory, 1, async (writer) => {
      const result = await writer.upsert([federal, at(2)]);
      assert.deepEqual([result.insertedCount, result.changedKeys.has(federal.pncpControlNumber)], [2, true]);
    });

    assert.deepEqual(await controlNumbers(objects, 'contratos'), [federal.pncpControlNumber, at(2).pncpControlNumber]);
    assert.deepEqual(await controlNumbers(objects, 'vigentes'), [at(2).pncpControlNumber, federal.pncpControlNumber]);
    assert.deepEqual(
      (await controlNumbers(objects, 'fornecedor')).sort(),
      [federal.pncpControlNumber, at(2).pncpControlNumber].sort(),
      'o federal também aparece na lista por fornecedor',
    );

    const again = await publishWith(storage, directory, 2, async (writer) => {
      const result = await writer.upsert([federal]);
      assert.deepEqual([result.insertedCount, result.updatedCount, result.unchangedCount, result.changedKeys.size], [0, 0, 1, 0]);
    });
    assert.equal(again, null, 'nada mudou: nada é publicado');
  });
});

test('número para comparar federal e PNCP: sem o /AAAA do fim, só dígitos, sem zeros à esquerda', () => {
  assert.equal(twinNumber('00586/2023'), '586');
  assert.equal(twinNumber('586'), '586');
  assert.equal(twinNumber('05'), '5');
  assert.equal(twinNumber('2026NE000096'), '2026000096');
  assert.equal(twinNumber('  000/2024 '), '');
  assert.equal(twinNumber(null), '');
  assert.equal(twinNumber('S/N'), '');
});

test('gêmeos do PNCP: o federal com o mesmo órgão, ano, fornecedor e número (normalizado) de um contrato do PNCP; o resto não', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    const pncp = [
      at(1, { contractNumber: '586', contractYear: 2023, supplierDocument: '11222333000181' }),
      at(2, { contractNumber: '2026NE000096', contractYear: 2026, supplierDocument: '11222333000181' }),
      at(3, { contractNumber: '7', contractYear: 2024, supplierDocument: null }),
    ];
    await publishWith(storage, directory, 1, async (writer) => void (await writer.upsert(pncp)));

    const federal = (key: string, overrides: Partial<TenderContractRow>): TenderContractRow =>
      at(50, { pncpControlNumber: `comprasgov-153254-50-${key}`, governmentSphere: 'F', contractSequence: 0, ...overrides });
    const candidates = [
      federal('00586/2023', { contractNumber: '00586/2023', contractYear: 2023, supplierDocument: '11222333000181' }),
      federal('2026NE000096', { contractNumber: '2026NE000096', contractYear: 2026, supplierDocument: '11222333000181' }),
      federal('00007/2024', { contractNumber: '00007/2024', contractYear: 2024, supplierDocument: null }),
      // Outro fornecedor, outro ano e outro órgão: não são gêmeos.
      federal('00586/2023B', { contractNumber: '00586/2023', contractYear: 2023, supplierDocument: '99888777000166' }),
      federal('00586/2024', { contractNumber: '00586/2024', contractYear: 2024, supplierDocument: '11222333000181' }),
      federal('00586/2023C', { contractNumber: '00586/2023', contractYear: 2023, supplierDocument: '11222333000181', agencyCnpj: '17217985000104' }),
      federal('S/N', { contractNumber: 'S/N', contractYear: 2023, supplierDocument: '11222333000181' }),
    ];
    await publishWith(storage, directory, 2, async (writer) => {
      const twins = await writer.findPncpTwins(candidates);
      assert.deepEqual([...twins].sort(), [candidates[0], candidates[1], candidates[2]].map((row) => row?.pncpControlNumber ?? '').sort());
      assert.deepEqual([...(await writer.findPncpTwins([]))], []);
      // Um federal já gravado não é gêmeo de si mesmo: só contratos do PNCP contam.
      await writer.upsert([candidates[3] as TenderContractRow]);
      assert.equal((await writer.findPncpTwins([candidates[3] as TenderContractRow])).size, 0);
    });
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
        publishedAt: '2026-01-12T10:00:00',
      });

      assert.deepEqual(await writer.upsert([at(1)]), { insertedCount: 0, updatedCount: 0, unchangedCount: 1, changedKeys: new Set() });
      assert.deepEqual(await writer.upsert([at(1, { payloadHash: 'outro' }), at(9)]), {
        insertedCount: 1,
        updatedCount: 1,
        unchangedCount: 0,
        changedKeys: new Set([at(1).pncpControlNumber, at(9).pncpControlNumber]),
      });
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

test('vigentes incrementais: alteração pequena reutiliza as partes não afetadas e o banco fica vazio entre publicações', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const limits = { maxRowsPerFile: { vigentes: 3, contratos: 3, fornecedor: 3 } };
    await publishWith(storage, directory, 1, async (writer) => {
      await writer.upsert(Array.from({ length: 9 }, (_, index) => at(index + 1)));
    }, limits);
    const before = manifestOf(objects).datasets.vigentes;
    assert.equal(before.length, 3);
    const writer = await ContractStoreWriter.open({
      storage, directory, version: 2, searchFields: simpleSearchFields,
      today: '2026-10-19', now: () => new Date('2026-10-19T12:00:00Z'), logger: quietLogger,
      ...limits,
    });
    try {
      const emptyDatabaseBytes = (await stat(join(directory, 'trabalho.duckdb'))).size;
      await writer.upsert([at(5, { payloadHash: 'conteudo-novo' })]);
      await writer.publish();
      const after = manifestOf(objects).datasets.vigentes;
      assert.equal(after[0]?.path, before[0]?.path);
      assert.notEqual(after[1]?.path, before[1]?.path);
      assert.equal(after[2]?.path, before[2]?.path);
      assert.equal(await writer.pendingChanges(), 0);
      assert.equal((await stat(join(directory, 'trabalho.duckdb'))).size, emptyDatabaseBytes, 'o banco é renovado sem carregar os dados do lote');
      assert.equal(writer.canContinue, true);
      assert.deepEqual(await controlNumbers(objects, 'vigentes'), Array.from({ length: 9 }, (_, index) => at(index + 1).pncpControlNumber));
      await writer.upsert([at(1, { payloadHash: 'outro-lote' })]);
      await writer.publish();
      assert.equal((await stat(join(directory, 'trabalho.duckdb'))).size, emptyDatabaseBytes, 'outra publicação não acumula espaço');
    } finally {
      await writer.close();
    }
  });
});

test('vigentes incrementais: prorrogação, vencimento, ausência de data e mudança de UF atingem origem e destino', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const limits = { maxRowsPerFile: { vigentes: 2 } };
    await publishWith(storage, directory, 1, async (writer) => {
      await writer.upsert([at(1), at(2), at(3), at(4), at(5, { expiresOn: null }), at(6, { expiresOn: '2026-01-01' })]);
    }, limits);
    await publishWith(storage, directory, 2, async (writer) => {
      await writer.upsert([
        at(1, { expiresOn: '2028-04-12', payloadHash: 'prorrogado' }),
        at(2, { expiresOn: '2026-01-01', payloadHash: 'vencido' }),
        at(3, { expiresOn: null, payloadHash: 'sem-fim' }),
        at(4, { state: 'AC', payloadHash: 'mudou-uf' }),
        at(5, { expiresOn: '2027-01-10', payloadHash: 'ganhou-fim' }),
        at(6, { expiresOn: '2027-01-10', payloadHash: 'renovado' }),
      ]);
    }, limits);
    const numbers = await controlNumbers(objects, 'vigentes');
    assert.deepEqual(new Set(numbers), new Set([1, 4, 5, 6].map((number) => at(number).pncpControlNumber)));
    assert.equal(numbers.length, 4);
    assert.deepEqual(manifestOf(objects).totals, { contracts: 6, active: 4, withoutExpiry: 1 });
    const rows = [];
    for (const file of manifestOf(objects).datasets.vigentes) {
      assert.ok(file.rows <= 2);
      rows.push(...await rowsOf(objects, file.path, 'sequencial_contrato, uf, vencimento'));
    }
    assert.equal(rows.find((row) => row['sequencial_contrato'] === 4)?.['uf'], 'AC');
    assert.equal(rows.find((row) => row['sequencial_contrato'] === 1)?.['vencimento'], '2028-04-12');
  });
});

test('virada de Brasília sem mudanças remove vencidos e move as faixas de 365, 730 e 3650 dias sem regravar os outros conjuntos', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    let instant = new Date('2026-10-20T02:59:00Z'); // Ainda 19/10 em Brasília.
    const dayAfter = (days: number) => new Date(Date.parse('2026-10-19') + days * 86_400_000).toISOString().slice(0, 10);
    const writer = await ContractStoreWriter.open({
      storage, directory, version: 1, searchFields: simpleSearchFields,
      today: '2026-10-19', now: () => instant, logger: quietLogger,
    });
    try {
      await writer.upsert([
        at(1, { expiresOn: dayAfter(0) }), at(2),
        at(3, { expiresOn: dayAfter(365) }), at(4, { expiresOn: dayAfter(730) }),
        at(5, { expiresOn: dayAfter(3650) }), at(6, { expiresOn: null }),
        at(7, { expiresOn: dayAfter(-1) }),
      ]);
      await writer.publish();
      const before = manifestOf(objects);
      const stablePart = before.datasets.vigentes.find((file) => file.partition === '2027-01-04');
      assert.ok(stablePart);
      assert.equal(await writer.publish(), null, 'mesmo dia sem alterações não publica');
      instant = new Date('2026-10-20T03:01:00Z');
      const summary = await writer.publish();
      assert.equal(summary?.changedContracts, 0);
      assert.equal(manifestOf(objects).today, '2026-10-20');
      assert.deepEqual(summary?.totals, { contracts: 7, active: 4, withoutExpiry: 1 });
      const after = manifestOf(objects);
      assert.deepEqual(after.datasets.contratos, before.datasets.contratos);
      assert.deepEqual(after.datasets.fornecedor, before.datasets.fornecedor);
      assert.ok(after.datasets.vigentes.some((file) => file.path === stablePart.path), 'parte estável continua sendo o mesmo arquivo');
      const partitionBySequence = new Map<number, string>();
      for (const file of after.datasets.vigentes) {
        for (const row of await rowsOf(objects, file.path, 'sequencial_contrato')) {
          partitionBySequence.set(Number(row['sequencial_contrato']), file.partition);
        }
      }
      assert.equal(partitionBySequence.has(1), false, 'o vencido saiu');
      assert.equal(partitionBySequence.get(3), '2027-10-18', 'mensal passa a semanal');
      assert.equal(partitionBySequence.get(4), '2028-10-01', 'anual passa a mensal');
      assert.equal(partitionBySequence.get(5), '2036-01-01', 'depois passa a anual');
      assert.equal(await writer.publish(), null);
    } finally {
      await writer.close();
    }
  });
});

test('mudança somente do dia publica o manifesto sem regravar partes estáveis', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWith(storage, directory, 1, async (writer) => { await writer.upsert([at(1)]); });
    const before = manifestOf(objects);
    const summary = await publishWith(storage, directory, 2, async () => {}, { today: '2026-10-20' });
    assert.equal(summary?.filesWritten, 0);
    assert.deepEqual(manifestOf(objects).datasets, before.datasets);
    assert.equal(manifestOf(objects).today, '2026-10-20');
  });
});

test('Parquet inválido na abertura fecha o banco de trabalho e permite recuperar a cópia', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const invalidKey = `${FILES_FOLDER}/contratos/2026/invalido.parquet`;
    objects.set(invalidKey, Buffer.from('arquivo incompleto'));
    objects.set(MANIFEST_KEY, serializeManifest({
      format: 1, revision: 'invalida', publishedAt: '2026-10-19T12:00:00Z', today: '2026-10-19',
      totals: { contracts: 1, active: 0, withoutExpiry: 1 },
      datasets: { contratos: [{ path: invalidKey, rows: 1, bytes: 18, partition: '2026', from: '' }], vigentes: [], fornecedor: [], vencedores: [] },
    }));
    await assert.rejects(ContractStoreWriter.open({
      storage, directory, version: 2, searchFields: simpleSearchFields, today: '2026-10-19',
      now: () => new Date('2026-10-19T12:00:00Z'), logger: quietLogger,
    }));
    await assert.rejects(stat(join(directory, 'trabalho.duckdb')), { code: 'ENOENT' });
    objects.delete(MANIFEST_KEY);
    const summary = await publishWith(storage, directory, 3, async (writer) => { await writer.upsert([at(1)]); });
    assert.equal(summary?.totals.contracts, 1);
  });
});

test('retomada remove órfãos antes de verificar o orçamento dos downloads', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await publishWith(storage, join(directory, 'origem'), 1, async (writer) => { await writer.upsert([at(1)]); });
    const work = join(directory, 'retomada');
    const orphanDirectory = join(work, FILES_FOLDER, 'contratos', '2026');
    await mkdir(orphanDirectory, { recursive: true });
    const orphan = join(orphanDirectory, 'publicacao-interrompida.parquet');
    await writeFile(orphan, Buffer.alloc(2_000_000));
    const budget = new CollectorResourceBudget({ directory: work, limitBytes: 1_000_000, publicationReserveBytes: 64_000 });
    const writer = await ContractStoreWriter.open({
      storage, directory: work, version: 2, searchFields: simpleSearchFields, resourceBudget: budget,
      today: '2026-10-19', now: () => new Date('2026-10-19T12:00:00Z'), logger: quietLogger,
    });
    try {
      assert.equal((await writer.readStates([at(1).pncpControlNumber])).size, 1);
      await assert.rejects(stat(orphan), { code: 'ENOENT' });
    } finally {
      await writer.close();
    }
  });
});

test('falha de limpeza posterior ao manifesto não oculta a publicação confirmada', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const failingCleanup: ObjectStorage = { ...storage, async listKeys() { throw new Error('limpeza indisponível'); } };
    const summary = await publishWith(failingCleanup, directory, 1, async (writer) => { await writer.upsert([at(1)]); });
    assert.equal(summary?.revision, manifestOf(objects).revision);
    assert.equal(summary?.totals.contracts, 1);
    assert.equal(summary?.filesDeleted, 0);
  });
});

test('falha ao reabrir o banco depois do manifesto devolve a publicação e impede outro bloco', async () => {
  await withTempDirectory(async (directory) => {
    class ReopenBudget extends CollectorResourceBudget {
      failReopen = false;
      override async availableTempBytes(): Promise<number> {
        if (this.failReopen) {
          throw new Error('reabertura indisponível');
        }
        return super.availableTempBytes();
      }
    }
    const resourceBudget = new ReopenBudget({ directory });
    const { storage, objects } = createMemoryStorage();
    const afterCommit: ObjectStorage = {
      ...storage,
      async putObject(key, body, contentType) {
        await storage.putObject(key, body, contentType);
        if (key === MANIFEST_KEY) {
          resourceBudget.failReopen = true;
        }
      },
    };
    const writer = await ContractStoreWriter.open({
      storage: afterCommit, directory, version: 1, searchFields: simpleSearchFields,
      today: '2026-10-19', now: () => new Date('2026-10-19T12:00:00Z'), logger: quietLogger, resourceBudget,
    });
    try {
      await writer.upsert([at(1)]);
      const summary = await writer.publish();
      assert.equal(summary?.revision, manifestOf(objects).revision);
      assert.equal(summary?.totals.contracts, 1);
      assert.equal(writer.canContinue, false);
      await assert.rejects(writer.upsert([at(2)]), /cópia de trabalho precisa ser reaberta/);
    } finally {
      await writer.close();
    }
  });
});

test('página larga é recusada antes de criar JSON sem espaço para aplicar e publicar', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    const resourceBudget = new CollectorResourceBudget({ directory, limitBytes: 3_000_000, publicationReserveBytes: 1_000_000 });
    const writer = await ContractStoreWriter.open({
      storage, directory, version: 1, searchFields: simpleSearchFields,
      today: '2026-10-19', now: () => new Date('2026-10-19T12:00:00Z'), logger: quietLogger, resourceBudget,
    });
    try {
      await assert.rejects(writer.upsert([at(1, { additionalInformation: 'a'.repeat(2_000_000) })]), CollectorResourceLimitError);
      await assert.rejects(stat(join(directory, 'pagina.ndjson')), { code: 'ENOENT' });
      assert.equal(await writer.pendingChanges(), 0);
      assert.equal(writer.currentManifest, null);
    } finally {
      await writer.close();
    }
  });
});

/** Abre o gravador sobre o armazém já publicado, para ler e gravar sem publicar. */
function openWriter(storage: ObjectStorage, directory: string, version: number) {
  return ContractStoreWriter.open({
    storage,
    searchFields: simpleSearchFields,
    directory,
    version,
    today: '2026-10-19',
    now: () => new Date('2026-10-19T12:00:00Z'),
    logger: quietLogger,
  });
}

test('termos pendentes: sinal de alteração (mais de 24 h) sem conferência da atualização atual, do mais antigo ao mais novo, menos os excluídos', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    const published = '2026-01-02T10:00:00';
    await publishWith(storage, directory, 1, async (writer) => {
      await writer.upsert([
        at(1, { publishedAt: published, pncpGlobalUpdatedAt: '2026-01-03T10:00:00' }), // exatamente 24 h: sem sinal
        at(2, { publishedAt: published, pncpGlobalUpdatedAt: '2026-01-03T10:00:01' }), // 24 h e 1 s: pendente
        at(3, { publishedAt: published, pncpGlobalUpdatedAt: '2026-05-01T10:00:00.123' }), // a fração de segundo não conta
        at(4, { publishedAt: published, pncpGlobalUpdatedAt: '2026-04-01T10:00:00', amendmentsReference: '2026-04-01T10:00:00', amendments: [] }), // conferido
        at(5, { publishedAt: published, pncpGlobalUpdatedAt: null }), // sem atualização global
        at(6, { publishedAt: published, pncpGlobalUpdatedAt: '2026-02-01T10:00:00', amendmentsReference: '2026-01-15T10:00:00', amendments: [] }), // conferido numa atualização antiga
      ]);
    });

    const writer = await openWriter(storage, directory, 2);
    try {
      assert.equal(await writer.countPendingTerms(), 3);
      assert.deepEqual((await writer.readPendingTerms(10, [])).map((contract) => contract.contractSequence), [2, 6, 3], 'da atualização global mais antiga para a mais nova');
      assert.deepEqual((await writer.readPendingTerms(2, [])).map((contract) => contract.contractSequence), [2, 6], 'o limite vale');
      assert.deepEqual(
        (await writer.readPendingTerms(10, [at(2).pncpControlNumber])).map((contract) => contract.contractSequence),
        [6, 3],
        'os que falharam na execução ficam de fora',
      );
      const [first] = await writer.readPendingTerms(1, []);
      assert.deepEqual(first, {
        pncpControlNumber: at(2).pncpControlNumber,
        agencyCnpj: '00394460005887',
        contractYear: 2026,
        contractSequence: 2,
        contractObject: 'Serviço de limpeza 2',
        originalTermEnd: '2027-01-10',
        expiresOn: '2027-01-10',
      });

      // O que a execução já mudou vale mais que o arquivo: conferido nas mudanças, deixa de ser pendente.
      await writer.upsert([at(2, { publishedAt: published, pncpGlobalUpdatedAt: '2026-01-03T10:00:01', amendmentsReference: '2026-01-03T10:00:01', amendments: [], payloadHash: 'novo' })]);
      assert.equal(await writer.countPendingTerms(), 2);
      assert.deepEqual((await writer.readPendingTerms(10, [])).map((contract) => contract.contractSequence), [6, 3]);
    } finally {
      await writer.close();
    }
  });
});

test('reconsulta dos termos: grava vencimento, termos e conferência nas mudanças; o resto do contrato fica como está e a publicação leva ao armazém', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const pending = at(1, {
      contractObject: 'Limpeza predial',
      publishedAt: '2025-07-02T10:00:00',
      pncpGlobalUpdatedAt: '2026-10-05T10:00:00',
      originalTermEnd: '2026-06-30',
      expiresOn: '2026-06-30',
    });
    await publishWith(storage, directory, 1, async (writer) => void (await writer.upsert([pending, at(2)])));

    const term = { type: 'Termo Aditivo', number: '1', sequence: 1, signedAt: '2026-06-01', endDate: '2026-12-31', addedValue: null, changesTerm: true };
    const writer = await openWriter(storage, directory, 2);
    try {
      await writer.saveCheckedTerms([]);
      assert.equal(await writer.pendingChanges(), 0, 'sem nada conferido, nada muda');
      await writer.saveCheckedTerms([{ pncpControlNumber: pending.pncpControlNumber, expiresOn: '2026-12-31', amendments: [term] }]);
      assert.equal(await writer.pendingChanges(), 1);
      assert.equal(await writer.countPendingTerms(), 0, 'conferido para a atualização global atual');
      const state = (await writer.readStates([pending.pncpControlNumber])).get(pending.pncpControlNumber);
      assert.deepEqual(state?.amendments, [term]);
      assert.equal(state?.expiresOn, '2026-12-31');
      assert.equal(state?.amendmentsReference, '2026-10-05T10:00:00');
      assert.equal(state?.payloadHash, 'hash-1', 'o resto do contrato não muda');
      assert.equal(state?.firstCollectedAt, '2026-10-19T12:00:00.000Z');

      // Conferir um contrato que a própria execução acabou de mudar parte das mudanças, não do arquivo.
      await writer.upsert([at(2, { contractObject: 'Objeto novo', payloadHash: 'novo', publishedAt: '2025-07-02T10:00:00', pncpGlobalUpdatedAt: '2026-10-06T10:00:00' })]);
      await writer.saveCheckedTerms([{ pncpControlNumber: at(2).pncpControlNumber, expiresOn: null, amendments: [] }]);
      const second = (await writer.readStates([at(2).pncpControlNumber])).get(at(2).pncpControlNumber);
      assert.deepEqual({ expiresOn: second?.expiresOn, amendments: second?.amendments, reference: second?.amendmentsReference, hash: second?.payloadHash }, {
        expiresOn: null,
        amendments: [],
        reference: '2026-10-06T10:00:00',
        hash: 'novo',
      });

      const summary = await writer.publish();
      assert.equal(summary?.changedContracts, 2);
    } finally {
      await writer.close();
    }

    const [row] = (await rowsOf(objects, manifestOf(objects).datasets.vigentes.find((file) => file.rows > 0)?.path ?? '', 'numero_controle_pncp, vencimento, aditivos, aditivos_referencia, radicais, objeto')).filter(
      (candidate) => candidate['numero_controle_pncp'] === pending.pncpControlNumber,
    );
    assert.equal(row?.['vencimento'], '2026-12-31');
    assert.equal(row?.['aditivos_referencia'], '2026-10-05T10:00:00');
    assert.deepEqual(JSON.parse(String(row?.['aditivos'])), [term]);
    assert.equal(row?.['radicais'], ' limpeza predial ', 'os campos de busca ficam como estavam');
  });
});
