import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { InvalidCnpjError, isCnpjFormat } from '../cnpj';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { MANIFEST_KEY } from './layout';
import { parseManifest } from './manifest';
import { ContractStoreReader } from './reader';
import { publishWinnersWith, quietLogger, sampleResult, sampleSupplier, withTempDirectory } from './storeTestSupport';
import { queryTopAgencies, queryWinnerCount, queryWinnerList, queryWinnerSummary } from './winnerQueries';
import type { ResultRecord, SupplierIdentity } from './winnerRows';
import { supplierKeyOf } from './winnerRows';

// Consultas dos vencedores sobre um armazém de exemplo com vários arquivos (partes de poucas linhas), lido pelo
// mesmo leitor do Web Service com só o conjunto `vencedores`.

const ALFA = sampleSupplier('11222333000181', 'ALFA LTDA');
const NEIGHBOR = sampleSupplier('11222333000182', 'VIZINHA LTDA');
const BETA = sampleSupplier('99887766000155', 'BETA LTDA');
const PERSON: SupplierIdentity = { key: supplierKeyOf('PF', '***.123.456-**', 'MARIA DA SILVA'), personType: 'PF', document: '***.123.456-**', name: 'MARIA DA SILVA', size: null };

const AGENCY_ONE = '00394460005887';
const AGENCY_TWO = '12345678000195';
const AGENCY_THREE = '33000167000101';

function purchase(agency: string, sequence: number, year: number): string {
  return `${agency}-1-${String(sequence).padStart(6, '0')}/${year}`;
}

function win(
  supplier: SupplierIdentity,
  agency: string,
  sequence: number,
  year: number,
  valueCents: number,
  overrides: Partial<ResultRecord> = {},
): ResultRecord {
  return {
    ...sampleResult(1, { supplier, valueCents, resultDate: `${year}-09-${String(10 + (sequence % 15)).padStart(2, '0')}`, ...overrides }),
    purchaseControlNumber: purchase(agency, sequence, year),
  };
}

/** O ALFA ganha 6 licitações em 3 órgãos e 2 anos (a primeira com 2 itens); os outros ganham as suas. */
function dataset(): ResultRecord[] {
  return [
    win(ALFA, AGENCY_ONE, 1, 2026, 100_000),
    win(ALFA, AGENCY_ONE, 1, 2026, 25_000, { itemNumber: 2 }),
    win(ALFA, AGENCY_ONE, 2, 2026, 50_000),
    win(ALFA, AGENCY_TWO, 3, 2026, 700_000),
    win(ALFA, AGENCY_THREE, 4, 2026, 10_000),
    win(ALFA, AGENCY_TWO, 5, 2025, 300_000),
    win(ALFA, AGENCY_TWO, 6, 2025, 5_000),
    win(NEIGHBOR, AGENCY_ONE, 7, 2026, 900_000),
    win(NEIGHBOR, AGENCY_TWO, 8, 2025, 800_000),
    win(BETA, AGENCY_ONE, 9, 2026, 1_000),
    win(PERSON, AGENCY_ONE, 10, 2026, 2_000),
  ];
}

async function withReader<T>(records: ResultRecord[], run: (reader: ContractStoreReader, filesInStore: number) => Promise<T>): Promise<T> {
  return withTempDirectory(async (directory) => {
    const { storage, objects } = createMemoryStorage();
    await publishWinnersWith(storage, join(directory, 'gravacao'), 1, async (writer) => void (await writer.apply(records)), { maxRowsPerFile: 3 });
    const reader = await ContractStoreReader.create({ storage, directory: join(directory, 'leitura'), logger: quietLogger, datasets: ['vencedores'] });
    try {
      await reader.refresh();
      const manifest = parseManifest(objects.get(MANIFEST_KEY) ?? new Uint8Array());
      return await run(reader, manifest.datasets.vencedores.length);
    } finally {
      await reader.close();
    }
  });
}

test('resumo do fornecedor: licitações, itens e valor no total e por ano, do ano mais recente para o mais antigo', async () => {
  await withReader(dataset(), async (reader) => {
    const summary = await reader.query((connection) => queryWinnerSummary(connection, ALFA.key));
    assert.deepEqual(summary, {
      name: 'ALFA LTDA',
      purchases: 6,
      items: 7,
      totalValue: '11900.00',
      firstResultDate: '2025-09-15',
      lastResultDate: '2026-09-14',
      byYear: [
        { year: 2026, purchases: 4, items: 5, totalValue: '8850.00' },
        { year: 2025, purchases: 2, items: 2, totalValue: '3050.00' },
      ],
    });
    // Contagens e itens são números de verdade (nunca BigInt).
    assert.equal(typeof summary.purchases, 'number');
    assert.equal(typeof summary.byYear[0]?.items, 'number');
  });
});

test('a faixa da chave não pega o CNPJ vizinho, a pessoa física nem outro fornecedor', async () => {
  await withReader(dataset(), async (reader) => {
    const neighbor = await reader.query((connection) => queryWinnerSummary(connection, NEIGHBOR.key));
    assert.equal(neighbor.purchases, 2);
    assert.equal(neighbor.name, 'VIZINHA LTDA');
    assert.equal(await reader.query((connection) => queryWinnerCount(connection, NEIGHBOR.key)), 2);
    assert.equal(await reader.query((connection) => queryWinnerCount(connection, ALFA.key)), 6, 'as licitações, não os itens');
    assert.equal(neighbor.totalValue, '17000.00');
    const beta = await reader.query((connection) => queryWinnerSummary(connection, BETA.key));
    assert.equal(beta.purchases, 1);
    assert.equal(beta.totalValue, '10.00');
  });
});

test('teste de poda: o resumo pela faixa da chave é igual à varredura completa pela coluna do documento', async () => {
  await withReader(dataset(), async (reader, filesInStore) => {
    // O conjunto tem vários arquivos (partes de 3 linhas): a poda por faixa de chave não é trivial.
    assert.ok(filesInStore > 2, `${filesInStore} arquivos`);
    for (const supplier of [ALFA, NEIGHBOR, BETA]) {
      const pruned = await reader.query((connection) => queryWinnerSummary(connection, supplier.key));
      const scanned = await reader.query(async (connection) => {
        const result = await connection.runAndReadAll(
          `SELECT count(*)::INTEGER AS licitacoes, sum(quantidade_itens)::INTEGER AS itens, sum(valor_homologado_total)::DECIMAL(38,2) AS valor
             FROM vencedores WHERE fornecedor_documento = '${supplier.key}'`,
        );
        return result.getRowObjectsJson()[0] ?? {};
      });
      assert.equal(pruned.purchases, Number(scanned['licitacoes']), supplier.key);
      assert.equal(pruned.items, Number(scanned['itens']), supplier.key);
      assert.equal(pruned.totalValue, String(scanned['valor']), supplier.key);
    }
  });
});

test('fornecedor sem vitórias: zeros, sem datas e lista vazia', async () => {
  await withReader(dataset(), async (reader) => {
    const none = '55444333000122';
    const summary = await reader.query((connection) => queryWinnerSummary(connection, none));
    assert.deepEqual(summary, { name: null, purchases: 0, items: 0, totalValue: '0.00', firstResultDate: null, lastResultDate: null, byYear: [] });
    assert.equal(await reader.query((connection) => queryWinnerCount(connection, none)), 0);
    assert.deepEqual(await reader.query((connection) => queryWinnerList(connection, none)), []);
    assert.deepEqual(await reader.query((connection) => queryTopAgencies(connection, none)), []);
  });
});

test('principais órgãos: pelo valor, depois pelo número de licitações, com o CNPJ como último desempate', async () => {
  await withReader(dataset(), async (reader) => {
    const agencies = await reader.query((connection) => queryTopAgencies(connection, ALFA.key));
    assert.deepEqual(
      agencies.map((agency) => [agency.agencyCnpj, agency.purchases, agency.items, agency.totalValue]),
      [
        [AGENCY_TWO, 3, 3, '10050.00'],
        [AGENCY_ONE, 2, 3, '1750.00'],
        [AGENCY_THREE, 1, 1, '100.00'],
      ],
    );
    assert.equal(agencies[0]?.agencyName, null, 'a fonte de resultados não traz o nome do órgão');
    assert.equal((await reader.query((connection) => queryTopAgencies(connection, ALFA.key, 2))).length, 2);
    // Limite fora da faixa vira o mais próximo válido, nunca um erro.
    assert.equal((await reader.query((connection) => queryTopAgencies(connection, ALFA.key, 0))).length, 1);
  });
});

test('lista: da licitação mais recente para a mais antiga, com desempate estável e paginação', async () => {
  await withReader(dataset(), async (reader) => {
    const all = await reader.query((connection) => queryWinnerList(connection, ALFA.key, { limit: 50 }));
    assert.equal(all.length, 6);
    const order = all.map((row) => [row.lastResultDate, row.purchaseControlNumber] as const);
    const expected = [...order].sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : b[0].localeCompare(a[0])));
    assert.deepEqual(order, expected, 'última data do resultado decrescente, e a compra no desempate');
    assert.equal(all[0]?.lastResultDate, '2026-09-14');
    assert.equal(all.at(-1)?.lastResultDate, '2025-09-15');
    assert.ok(all.every((row) => !('itens' in row)), 'a lista não leva o mapa de itens');
    assert.equal(all[0]?.supplierName, 'ALFA LTDA');
    assert.equal(typeof all[0]?.items, 'number');

    const pages: string[] = [];
    for (const offset of [0, 2, 4]) {
      const page = await reader.query((connection) => queryWinnerList(connection, ALFA.key, { limit: 2, offset }));
      assert.equal(page.length, 2);
      pages.push(...page.map((row) => row.key));
    }
    assert.deepEqual(pages, all.map((row) => row.key), 'as páginas, juntas, são a lista inteira, sem repetir nem pular');
    assert.equal((await reader.query((connection) => queryWinnerList(connection, ALFA.key, { limit: 2, offset: 6 }))).length, 0);
    // Limite acima do teto e deslocamento negativo são corrigidos.
    assert.equal((await reader.query((connection) => queryWinnerList(connection, ALFA.key, { limit: 100_000 }))).length, 6);
    assert.equal((await reader.query((connection) => queryWinnerList(connection, ALFA.key, { limit: 1, offset: -5 }))).length, 1);
  });
});

test('CNPJ com letra, com 13 dígitos ou com máscara é recusado antes de virar consulta', async () => {
  await withReader(dataset(), async (reader) => {
    for (const invalid of ['1122233300018A', '1122233300018', '112223330001811', '11.222.333/0001-81', '', "11222333000181'; DROP TABLE vencedores; --"]) {
      assert.equal(isCnpjFormat(invalid), false, invalid);
      await assert.rejects(reader.query((connection) => queryWinnerSummary(connection, invalid)), InvalidCnpjError, invalid);
      await assert.rejects(reader.query((connection) => queryWinnerList(connection, invalid)), InvalidCnpjError, invalid);
      await assert.rejects(reader.query((connection) => queryWinnerCount(connection, invalid)), InvalidCnpjError, invalid);
      await assert.rejects(reader.query((connection) => queryTopAgencies(connection, invalid)), InvalidCnpjError, invalid);
    }
    assert.equal(isCnpjFormat('11222333000181'), true);
    assert.equal(isCnpjFormat(11222333000181), false);
  });
});
