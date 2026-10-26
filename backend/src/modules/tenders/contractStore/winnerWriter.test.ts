import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { z } from 'zod/v4';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { FILES_FOLDER, MANIFEST_KEY, columnsOf, storeFileKey } from './layout';
import { manifestFiles, parseManifest, type StoreManifest } from './manifest';
import { ContractStoreReader } from './reader';
import {
  publishWinnersWith,
  publishWith,
  quietLogger,
  readParquetRows,
  sampleContract,
  samplePurchase,
  sampleResult,
  sampleSupplier,
  withTempDirectory,
} from './storeTestSupport';
import { WinnerStoreWriter } from './winnerWriter';

// Gravação do conjunto `vencedores` com o R2 simulado e o DuckDB de verdade (plano .plans/licitacoes-vencedores.md):
// cada "execução" abre o gravador, aplica os resultados e publica (publishWinnersWith).

function manifestOf(objects: Map<string, Uint8Array>): StoreManifest {
  const body = objects.get(MANIFEST_KEY);
  assert.ok(body, 'manifesto publicado');
  return parseManifest(body);
}

interface StoredWinner {
  key: string;
  purchase: string;
  year: number;
  items: number;
  total: string;
  itemsJson: string;
}

/** As linhas dos vencedores publicadas, na ordem do manifesto (ano, faixa) e do arquivo. */
async function winnersOf(objects: Map<string, Uint8Array>): Promise<StoredWinner[]> {
  const rows: StoredWinner[] = [];
  for (const file of manifestOf(objects).datasets.vencedores) {
    for (const row of await readParquetRows(objects, file.path, 'chave, numero_controle_compra, ano_compra, quantidade_itens, valor_homologado_total, itens')) {
      rows.push({
        key: String(row['chave']),
        purchase: String(row['numero_controle_compra']),
        year: Number(row['ano_compra']),
        items: Number(row['quantidade_itens']),
        total: String(row['valor_homologado_total']),
        itemsJson: String(row['itens']),
      });
    }
  }
  return rows;
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

/** R2 simulado que recusa só o envio do manifesto enquanto `state.fail` estiver ligado: os arquivos novos vão e ficam sem manifesto. */
function failingManifestStorage(base: ObjectStorage, state: { fail: boolean }): ObjectStorage {
  return {
    ...base,
    async putObject(key, body, contentType) {
      if (state.fail && key === MANIFEST_KEY) {
        throw new Error('R2 fora do ar');
      }
      await base.putObject(key, body, contentType);
    },
  };
}

const ALFA = sampleSupplier('11222333000181', 'ALFA LTDA');
const BETA = sampleSupplier('99887766000155', 'BETA LTDA');

/** Um fornecedor ganha o item 1 de cada compra de 1 a `count` (ano 2026), com o valor da sequência. */
const winsOfPurchases = (count: number, year = 2026) =>
  Array.from({ length: count }, (_, index) => sampleResult(1, { purchaseControlNumber: samplePurchase(index + 1, year), valueCents: (index + 1) * 100 }));

test('primeira publicação: uma pasta por ano, partes ordenadas pela chave, manifesto vazio nos contratos e por último', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const puts: string[] = [];
    const summary = await publishWinnersWith(
      recordingStorage(storage, puts),
      directory,
      10,
      async (writer) => {
        const result = await writer.apply([
          ...winsOfPurchases(5),
          sampleResult(2, { purchaseControlNumber: samplePurchase(1), valueCents: 50 }),
          sampleResult(1, { purchaseControlNumber: samplePurchase(7, 2025), supplier: BETA }),
        ]);
        assert.deepEqual(result.counts, { inserted: 6, updated: 0, removed: 0, unchanged: 0 });
        assert.equal(await writer.pendingChanges(), 6);
      },
      { maxRowsPerFile: 2 },
    );

    assert.equal(summary?.revision, '10.1');
    assert.equal(summary?.changedRows, 6);
    assert.equal(summary?.years, 2);
    assert.equal(summary?.rows, 6);
    assert.equal(puts.at(-1), MANIFEST_KEY, 'o manifesto vai por último');

    const manifest = manifestOf(objects);
    assert.deepEqual(manifest.datasets.vigentes, []);
    assert.deepEqual(manifest.datasets.contratos, []);
    assert.deepEqual(manifest.datasets.fornecedor, []);
    assert.deepEqual(manifest.totals, { contracts: 0, active: 0, withoutExpiry: 0 });
    assert.equal(manifest.today, '2026-10-19');
    // 2025: 1 linha numa parte; 2026: 5 linhas em 3 partes de até 2.
    assert.deepEqual(manifest.datasets.vencedores.map((file) => [file.partition, file.rows]), [['2025', 1], ['2026', 2], ['2026', 2], ['2026', 1]]);
    assert.deepEqual(
      manifest.datasets.vencedores.map((file) => file.from === ''),
      [true, true, false, false],
      'só a primeira parte de cada ano começa em ""',
    );
    for (const file of manifest.datasets.vencedores) {
      assert.match(file.path, new RegExp(`^${FILES_FOLDER}/vencedores/(2025|2026)/v10\\.1-000\\d\\.parquet$`));
      assert.ok(objects.has(file.path), `arquivo enviado: ${file.path}`);
      assert.ok(file.bytes > 0);
    }

    const rows = await winnersOf(objects);
    const keysOf2026 = rows.filter((row) => row.year === 2026).map((row) => row.key);
    assert.deepEqual(keysOf2026, [...keysOf2026].sort(), 'a ordem das linhas é a da chave, também entre as partes');
    // A faixa de cada parte começa na primeira chave dela.
    const partsOf2026 = manifest.datasets.vencedores.filter((file) => file.partition === '2026');
    assert.equal(partsOf2026[1]?.from, keysOf2026[2]);
    assert.equal(partsOf2026[2]?.from, keysOf2026[4]);
    // A linha da compra 1 tem os dois itens, na ordem numérica, e o total soma os dois.
    const purchaseOne = rows.find((row) => row.purchase === samplePurchase(1));
    assert.equal(purchaseOne?.items, 2);
    assert.equal(purchaseOne?.total, '1.50');
    assert.equal(purchaseOne?.itemsJson, '{"1/1":[1,"2026-09-14"],"2/1":[0.5,"2026-09-14"]}');
  });
});

test('só os anos tocados são regravados, e os outros mantêm os mesmos arquivos', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWinnersWith(storage, directory, 1, async (writer) => {
      await writer.apply([...winsOfPurchases(3, 2026), sampleResult(1, { purchaseControlNumber: samplePurchase(9, 2025) })]);
    });
    const before = manifestOf(objects).datasets.vencedores;
    const files2025 = before.filter((file) => file.partition === '2025');

    const summary = await publishWinnersWith(storage, directory, 2, async (writer) => {
      const result = await writer.apply([sampleResult(1, { purchaseControlNumber: samplePurchase(2, 2026), valueCents: 777, updatedAt: '2026-09-20T09:00:00' })]);
      assert.deepEqual(result.counts, { inserted: 0, updated: 1, removed: 0, unchanged: 0 });
    });

    assert.equal(summary?.years, 1);
    assert.equal(summary?.revision, '2.1');
    const after = manifestOf(objects).datasets.vencedores;
    assert.deepEqual(after.filter((file) => file.partition === '2025'), files2025, 'o ano de 2025 segue com os mesmos arquivos');
    assert.ok(after.filter((file) => file.partition === '2026').every((file) => file.path.includes('/v2.1-')), 'o ano de 2026 foi regravado');
    const row = (await winnersOf(objects)).find((candidate) => candidate.purchase === samplePurchase(2));
    assert.equal(row?.total, '7.77');
    assert.equal((await winnersOf(objects)).length, 4, 'nenhuma linha perdida nem repetida');
  });
});

test('lápide: a linha sai do arquivo e não volta nas regravações seguintes; o ano que esvazia sai do manifesto', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWinnersWith(storage, directory, 1, async (writer) => {
      await writer.apply([...winsOfPurchases(3, 2026), sampleResult(1, { purchaseControlNumber: samplePurchase(9, 2025) })]);
    });

    const cancelled = await publishWinnersWith(storage, directory, 2, async (writer) => {
      const result = await writer.apply([
        sampleResult(1, { purchaseControlNumber: samplePurchase(1, 2026), situation: 'cancelled', updatedAt: '2026-09-21T09:00:00' }),
        sampleResult(1, { purchaseControlNumber: samplePurchase(9, 2025), situation: 'cancelled', updatedAt: '2026-09-21T09:00:00' }),
      ]);
      assert.deepEqual(result.counts, { inserted: 0, updated: 0, removed: 2, unchanged: 0 });
      assert.equal(result.removedKeys.length, 2);
    });
    assert.equal(cancelled?.rows, 2);
    const manifest = manifestOf(objects);
    assert.deepEqual([...new Set(manifest.datasets.vencedores.map((file) => file.partition))], ['2026'], 'o ano de 2025 ficou sem linha e saiu');
    assert.deepEqual((await winnersOf(objects)).map((row) => row.purchase).sort(), [samplePurchase(2), samplePurchase(3)]);

    // Outra regravação do mesmo ano: a linha cancelada não volta.
    await publishWinnersWith(storage, directory, 3, async (writer) => {
      await writer.apply([sampleResult(1, { purchaseControlNumber: samplePurchase(3, 2026), valueCents: 1, updatedAt: '2026-09-22T09:00:00' })]);
    });
    assert.deepEqual((await winnersOf(objects)).map((row) => row.purchase).sort(), [samplePurchase(2), samplePurchase(3)]);
  });
});

test('o estado anterior vem das mudanças da execução antes dos arquivos, e publicar no meio da sequência não muda o resultado', async () => {
  const stages = [
    [sampleResult(1), sampleResult(2), sampleResult(3, { supplier: BETA })],
    [sampleResult(2, { situation: 'cancelled', updatedAt: '2026-09-18T10:00:00' }), sampleResult(3, { supplier: ALFA, updatedAt: '2026-09-18T10:00:00' })],
    [sampleResult(1, { valueCents: 2_500, updatedAt: '2026-09-19T10:00:00' }), sampleResult(4, { valueCents: 40 })],
  ];

  const direct = await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWinnersWith(storage, directory, 1, async (writer) => {
      for (const stage of stages) {
        await writer.apply(stage);
        // As mudanças da execução valem mais que os arquivos: o estado já reflete o que foi aplicado.
        assert.ok((await writer.readRows([stage[0]?.purchaseControlNumber ?? ''])).length >= 1);
      }
    });
    return winnersOf(objects);
  });

  const interleaved = await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWinnersWith(storage, directory, 1, async (writer) => {
      for (const [index, stage] of stages.entries()) {
        await writer.apply(stage);
        if (index === 0) {
          assert.ok(await writer.publish(), 'publica no meio da sequência');
        }
      }
    });
    return winnersOf(objects);
  });

  assert.deepEqual(interleaved, direct);
  assert.equal(direct.length, 1, 'tudo acabou na linha do ALFA: a do BETA ficou sem itens');
  assert.equal(direct[0]?.items, 3, 'itens 1, 3 e 4 (o 2 foi cancelado)');
  assert.equal(direct[0]?.total, '125.40', 'item 1 corrigido para 25,00, item 3 de 100,00 e item 4 de 0,40');
});

test('reler o mesmo conteúdo não publica nada e não muda o manifesto nem os arquivos', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWinnersWith(storage, directory, 1, async (writer) => void (await writer.apply(winsOfPurchases(4))));
    const manifest = manifestOf(objects);
    const keysBefore = [...objects.keys()].sort();

    const again = await publishWinnersWith(storage, directory, 2, async (writer) => {
      const result = await writer.apply(winsOfPurchases(4));
      assert.deepEqual(result.counts, { inserted: 0, updated: 0, removed: 0, unchanged: 4 });
      assert.equal(result.alteredRecords.size, 0);
      assert.equal(await writer.pendingChanges(), 0);
    });
    assert.equal(again, null);
    assert.deepEqual(manifestOf(objects), manifest);
    assert.deepEqual([...objects.keys()].sort(), keysBefore);
  });
});

test('falha no envio do manifesto não troca a versão em uso, e a publicação seguinte apaga os arquivos que sobraram', async () => {
  await withTempDirectory(async (directory) => {
    const failure = { fail: false };
    const memory = createMemoryStorage();
    const { objects } = memory;
    const storage = failingManifestStorage(memory.storage, failure);
    await publishWinnersWith(storage, directory, 1, async (writer) => void (await writer.apply(winsOfPurchases(2))));
    const manifest = manifestOf(objects);

    failure.fail = true;
    await assert.rejects(
      publishWinnersWith(storage, directory, 2, async (writer) => void (await writer.apply([sampleResult(1, { purchaseControlNumber: samplePurchase(1), valueCents: 999, updatedAt: '2026-09-20T10:00:00' })]))),
      /R2 fora do ar/,
    );
    assert.deepEqual(manifestOf(objects), manifest, 'a versão em uso não mudou');
    const orphans = [...objects.keys()].filter((key) => key.includes('/v2.1-'));
    assert.ok(orphans.length > 0, 'os arquivos novos já tinham ido');

    failure.fail = false;
    const summary = await publishWinnersWith(storage, directory, 3, async (writer) => void (await writer.apply([sampleResult(1, { purchaseControlNumber: samplePurchase(1), valueCents: 999, updatedAt: '2026-09-20T10:00:00' })])));
    assert.ok((summary?.filesDeleted ?? 0) >= orphans.length, 'os órfãos da publicação que falhou foram apagados');
    for (const key of orphans) {
      assert.equal(objects.has(key), false);
    }
    assert.equal((await winnersOf(objects)).find((row) => row.purchase === samplePurchase(1))?.total, '9.99');
  });
});

test('a limpeza do bucket guarda a versão anterior e a de antes sai', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWinnersWith(storage, directory, 1, async (writer) => void (await writer.apply(winsOfPurchases(2))));
    const first = manifestOf(objects).datasets.vencedores.map((file) => file.path);
    await publishWinnersWith(storage, directory, 2, async (writer) => void (await writer.apply([sampleResult(1, { purchaseControlNumber: samplePurchase(1), valueCents: 1 })])));
    for (const key of first) {
      assert.ok(objects.has(key), 'quem ainda lê a versão anterior encontra os arquivos');
    }
    await publishWinnersWith(storage, directory, 3, async (writer) => void (await writer.apply([sampleResult(1, { purchaseControlNumber: samplePurchase(1), valueCents: 2 })])));
    for (const key of first) {
      assert.equal(objects.has(key), false, 'a versão de antes da anterior foi apagada');
    }
  });
});

test('muitas compras de uma vez: o estado volta inteiro, sem chave perdida, e compra desconhecida não volta nada', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    const wins = winsOfPurchases(3_000);
    await publishWinnersWith(storage, directory, 1, async (writer) => {
      await writer.apply(wins);
      const rows = await writer.readRows(wins.map((record) => record.purchaseControlNumber));
      assert.equal(rows.length, 3_000);
      assert.equal(new Set(rows.map((row) => row.key)).size, 3_000);
      assert.deepEqual(await writer.readRows(Array.from({ length: 4_000 }, (_, index) => samplePurchase(100_000 + index, 2026))), []);
      assert.deepEqual(await writer.readRows(['formato-diferente', "x'; DROP TABLE mudancas_vencedores; --"]), [], 'o que não é número de controle nem vira consulta');
    });
    assert.equal((await winnersOf(objects)).length, 3_000);
  });
});

test('o estado volta também depois de publicado: as linhas dos arquivos, sem as lápides', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await publishWinnersWith(storage, directory, 1, async (writer) => void (await writer.apply(winsOfPurchases(3))));
    await publishWinnersWith(storage, directory, 2, async (writer) => {
      await writer.apply([sampleResult(1, { purchaseControlNumber: samplePurchase(2), situation: 'cancelled', updatedAt: '2026-09-20T10:00:00' })]);
      const rows = await writer.readRows([samplePurchase(1), samplePurchase(2), samplePurchase(3)]);
      assert.deepEqual(rows.map((row) => row.purchaseControlNumber).sort(), [samplePurchase(1), samplePurchase(3)], 'a lápide conta como linha ausente');
    });
  });
});

// ---- Interação com o armazém de contratos ----

test('publicar vencedores preserva vigentes, contratos, fornecedor, o dia e os totais; publicar contratos preserva os vencedores', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWith(storage, directory, 1, async (writer) => {
      await writer.upsert([sampleContract(1), sampleContract(2, { state: 'MG' })]);
    });
    const contractsManifest = manifestOf(objects);
    assert.ok(contractsManifest.datasets.vigentes.length > 0);

    await publishWinnersWith(storage, directory, 2, async (writer) => void (await writer.apply(winsOfPurchases(3))));
    const afterWinners = manifestOf(objects);
    assert.equal(afterWinners.revision, '2.1');
    assert.deepEqual(afterWinners.datasets.vigentes, contractsManifest.datasets.vigentes);
    assert.deepEqual(afterWinners.datasets.contratos, contractsManifest.datasets.contratos);
    assert.deepEqual(afterWinners.datasets.fornecedor, contractsManifest.datasets.fornecedor);
    assert.deepEqual(afterWinners.totals, contractsManifest.totals);
    assert.equal(afterWinners.today, contractsManifest.today);
    assert.equal(afterWinners.datasets.vencedores.length, 1);
    for (const file of manifestFiles(contractsManifest)) {
      assert.ok(objects.has(file.path), `arquivo de contratos intacto: ${file.path}`);
    }

    // Publicar contratos depois: a lista e os arquivos dos vencedores continuam (falha se o escritor de contratos não os carregar adiante).
    await publishWith(storage, directory, 3, async (writer) => void (await writer.upsert([sampleContract(3)])));
    const afterContracts = manifestOf(objects);
    assert.equal(afterContracts.revision, '3.1');
    assert.deepEqual(afterContracts.datasets.vencedores, afterWinners.datasets.vencedores);
    for (const file of afterContracts.datasets.vencedores) {
      assert.ok(objects.has(file.path), `arquivo de vencedores intacto: ${file.path}`);
    }
    assert.equal((await winnersOf(objects)).length, 3);
    assert.equal(afterContracts.totals.contracts, 3);

    // E mais uma publicação de contratos, que apaga a versão de antes: os vencedores seguem.
    await publishWith(storage, directory, 4, async (writer) => void (await writer.upsert([sampleContract(4)])));
    for (const file of manifestOf(objects).datasets.vencedores) {
      assert.ok(objects.has(file.path), 'a limpeza do bucket não apaga arquivo de vencedores');
    }
  });
});

test('os vencedores sobre um bucket sem manifesto criam um manifesto válido, e a primeira publicação de contratos o aproveita', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    assert.equal(objects.has(MANIFEST_KEY), false);
    await publishWinnersWith(storage, directory, 1, async (writer) => void (await writer.apply(winsOfPurchases(2))));
    const manifest = manifestOf(objects);
    assert.deepEqual(manifest.totals, { contracts: 0, active: 0, withoutExpiry: 0 });
    assert.equal(manifest.format, 1);

    await publishWith(storage, directory, 2, async (writer) => void (await writer.upsert([sampleContract(1)])));
    const next = manifestOf(objects);
    assert.deepEqual(next.datasets.vencedores, manifest.datasets.vencedores);
    assert.equal(next.totals.contracts, 1);
  });
});

test('manifesto de antes dos vencedores (sem a chave) é aceito, e o novo é aceito pelo schema antigo', () => {
  const oldFile = { path: 'contratos/arquivos/contratos/2026/v1.1-0001.parquet', rows: 1, bytes: 10, partition: '2026', from: '' };
  const legacy = {
    format: 1,
    revision: '1.1',
    publishedAt: '2026-10-19T12:00:00.000Z',
    today: '2026-10-19',
    totals: { contracts: 1, active: 1, withoutExpiry: 0 },
    datasets: { vigentes: [], contratos: [oldFile], fornecedor: [] },
  };
  const parsed = parseManifest(Buffer.from(JSON.stringify(legacy)));
  assert.deepEqual(parsed.datasets.vencedores, []);

  // O schema do Web Service antigo (z.object não estrito, três conjuntos): a chave nova é ignorada, e o formato segue 1.
  const file = z.object({ path: z.string().min(1), rows: z.number().int().nonnegative(), bytes: z.number().int().nonnegative(), partition: z.string().min(1), from: z.string() });
  const legacySchema = z.object({
    format: z.literal(1),
    revision: z.string().min(1),
    publishedAt: z.iso.datetime(),
    today: z.iso.date(),
    totals: z.object({ contracts: z.number().int().nonnegative(), active: z.number().int().nonnegative(), withoutExpiry: z.number().int().nonnegative() }),
    datasets: z.object({ vigentes: z.array(file), contratos: z.array(file), fornecedor: z.array(file) }),
  });
  const withWinners = { ...legacy, datasets: { ...legacy.datasets, vencedores: [{ ...oldFile, path: storeFileKey('vencedores', '2026', '2.1', 1) }] } };
  assert.equal(legacySchema.safeParse(withWinners).success, true);
});

// ---- Leitor ----

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('o leitor padrão não baixa nem abre os vencedores; com o conjunto pedido, lê, e o status mostra as linhas do manifesto', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWith(storage, join(directory, 'gravacao'), 1, async (writer) => void (await writer.upsert([sampleContract(1)])));
    await publishWinnersWith(storage, join(directory, 'gravacao'), 2, async (writer) => void (await writer.apply(winsOfPurchases(4))));
    const winnerFile = manifestOf(objects).datasets.vencedores[0]?.path ?? '';
    const contractFile = manifestOf(objects).datasets.contratos[0]?.path ?? '';

    const defaultReader = await ContractStoreReader.create({ storage, directory: join(directory, 'leitura-padrao'), logger: quietLogger });
    try {
      assert.equal(await defaultReader.refresh(), true);
      assert.equal(await exists(join(directory, 'leitura-padrao', ...winnerFile.split('/'))), false, 'o arquivo de vencedores não foi baixado');
      assert.equal(await exists(join(directory, 'leitura-padrao', ...contractFile.split('/'))), true);
      const counts = await defaultReader.query(async (connection) => {
        const winners = await connection.runAndReadAll('SELECT count(*)::INTEGER FROM vencedores');
        const contracts = await connection.runAndReadAll('SELECT count(*)::INTEGER FROM contratos');
        return [Number(winners.getRows()[0]?.[0]), Number(contracts.getRows()[0]?.[0])];
      });
      assert.deepEqual(counts, [0, 1], 'a visão de vencedores existe e está vazia');
      assert.deepEqual(defaultReader.status().winners, { rows: 4 }, 'o status vem do manifesto');
    } finally {
      await defaultReader.close();
    }

    const winnersReader = await ContractStoreReader.create({ storage, directory: join(directory, 'leitura-vencedores'), logger: quietLogger, datasets: ['vencedores'] });
    try {
      assert.equal(await winnersReader.refresh(), true);
      assert.equal(await exists(join(directory, 'leitura-vencedores', ...winnerFile.split('/'))), true);
      assert.equal(await exists(join(directory, 'leitura-vencedores', ...contractFile.split('/'))), false, 'os contratos não foram baixados');
      const rows = await winnersReader.query(async (connection) => {
        const result = await connection.runAndReadAll('SELECT count(*)::INTEGER FROM vencedores');
        return Number(result.getRows()[0]?.[0]);
      });
      assert.equal(rows, 4);
    } finally {
      await winnersReader.close();
    }
  });
});

test('o status do leitor só traz os vencedores quando o manifesto os tem', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await publishWith(storage, join(directory, 'gravacao'), 1, async (writer) => void (await writer.upsert([sampleContract(1)])));
    const reader = await ContractStoreReader.create({ storage, directory: join(directory, 'leitura'), logger: quietLogger });
    try {
      await reader.refresh();
      assert.equal('winners' in reader.status(), false);
    } finally {
      await reader.close();
    }
  });
});

test('as colunas do conjunto: a chave primeiro e nada herdado dos contratos', () => {
  const columns = columnsOf('vencedores').map((spec) => spec.column);
  assert.equal(columns[0], 'chave');
  assert.ok(columns.includes('itens') && columns.includes('hash_conteudo') && columns.includes('valor_homologado_total'));
  assert.equal(columns.includes('numero_controle_pncp'), false);
  assert.notDeepEqual(columns, columnsOf('contratos').map((spec) => spec.column));
});

test('uma execução nova sobre os arquivos publicados baixa só os vencedores e ignora os de contratos', async () => {
  await withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWith(storage, join(directory, 'contratos-a'), 1, async (writer) => void (await writer.upsert([sampleContract(1)])));
    await publishWinnersWith(storage, join(directory, 'vencedores-a'), 2, async (writer) => void (await writer.apply(winsOfPurchases(2))));
    const manifest = manifestOf(objects);

    // Pasta de trabalho nova: o gravador dos vencedores baixa só os arquivos dos vencedores.
    const writer = await WinnerStoreWriter.open({
      storage,
      directory: join(directory, 'vencedores-b'),
      version: 3,
      today: '2026-10-19',
      now: () => new Date('2026-10-19T12:00:00Z'),
      logger: quietLogger,
    });
    try {
      assert.equal(writer.publishedRows, 2);
      assert.equal(await exists(join(directory, 'vencedores-b', ...(manifest.datasets.vencedores[0]?.path ?? '').split('/'))), true);
      assert.equal(await exists(join(directory, 'vencedores-b', ...(manifest.datasets.contratos[0]?.path ?? '').split('/'))), false);
    } finally {
      await writer.close();
    }
  });
});
