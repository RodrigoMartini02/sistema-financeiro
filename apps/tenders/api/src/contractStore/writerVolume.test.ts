import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { CollectorResourceBudget } from '../collector/resourceBudget';
import type { ObjectStorage } from '../objectStorage';
import { openDuckDb, sqlLiteral, toDuckDbPath } from './duckdb';
import { MANIFEST_KEY, ROW_ORDER, columnList, columnsOf, storeFileKey, type ContractDataset } from './layout';
import { manifestFiles, serializeManifest, type ManifestFile, type StoreManifest } from './manifest';
import { quietLogger, sampleContract, simpleSearchFields, withTempDirectory } from './storeTestSupport';
import { ContractStoreWriter } from './writer';

// Ensaio isolado e opt-in: não abre PostgreSQL nem rede. O bucket simulado
// fica fora da pasta medida para representar o armazenamento remoto.
const CONTRACTS = 1_975_955;
const ACTIVE = 878_827;
const WITHOUT_EXPIRY = 1_861;
const controlNumber = (sequence: number) => `00394460005887-2-${String(sequence).padStart(10, '0')}/2026`;

function diskStorage(directory: string, puts: Array<{ key: string; bytes: number }>): ObjectStorage {
  const pathOf = (key: string) => join(directory, ...key.split('/'));
  return {
    async putObject(key, body) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
      puts.push({ key, bytes: body.byteLength });
    },
    async getObject(key) {
      try {
        return await readFile(pathOf(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },
    async downloadToFile(key, path) {
      await mkdir(dirname(path), { recursive: true });
      await copyFile(pathOf(key), path);
    },
    async listKeys(prefix) {
      const entries = await readdir(directory, { recursive: true, withFileTypes: true });
      return entries.filter((entry) => entry.isFile())
        .map((entry) => relative(directory, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
        .filter((key) => key.startsWith(prefix));
    },
    async deleteObject(key) { await rm(pathOf(key), { force: true }); },
    close() {},
  };
}

async function seedVolume(bucket: string, directory: string): Promise<StoreManifest> {
  const { instance, connection } = await openDuckDb({
    path: join(directory, 'seed.duckdb'), memoryLimitMb: 160, threads: 1,
    tempDirectory: join(directory, 'tmp'), maxTempDirectoryBytes: 256_000_000,
  });
  const expressions: Record<string, string> = {
    numero_controle_pncp: `'00394460005887-2-' || lpad(i::VARCHAR, 10, '0') || '/2026'`,
    ano_contrato: '2026', sequencial_contrato: 'i', numero_contrato: `i::VARCHAR || '/2026'`,
    orgao_cnpj: `'00394460005887'`, orgao_razao_social: `'Prefeitura do ensaio de volume'`,
    esfera: `'M'`, unidade_codigo: `'153254'`, unidade_nome: `'Unidade do ensaio'`,
    uf: `'SP'`, municipio_nome: `'Sao Paulo'`, municipio_ibge: `'3550308'`, categoria_id: '8', categoria_nome: `'Servicos'`,
    // Hashes distintos evitam um ensaio artificial de milhões de linhas
    // iguais que comprimiriam para poucos megabytes.
    objeto: `'Servico de limpeza ' || md5(i::VARCHAR) || md5((i + 10000000)::VARCHAR) || md5((i + 60000000)::VARCHAR) || md5((i + 70000000)::VARCHAR)`,
    informacao_complementar: `md5((i + 20000000)::VARCHAR) || md5((i + 30000000)::VARCHAR) || md5((i + 80000000)::VARCHAR)`,
    fornecedor_tipo_pessoa: `'PJ'`, fornecedor_documento: `'11222333000181'`, fornecedor_nome: `'Fornecedor de Teste'`,
    valor_inicial: '(1000 + i % 100000)::DECIMAL(18,2)', valor_global: '(1000 + i % 100000)::DECIMAL(18,2)',
    data_assinatura: `DATE '2026-01-10'`, vigencia_inicio: `DATE '2026-01-10'`,
    vigencia_fim_original: `CASE WHEN i > ${CONTRACTS - WITHOUT_EXPIRY} THEN NULL WHEN i = 1 THEN DATE '2026-10-30' WHEN i <= ${ACTIVE} THEN DATE '2027-01-10' ELSE DATE '2025-01-10' END`,
    vencimento: `CASE WHEN i > ${CONTRACTS - WITHOUT_EXPIRY} THEN NULL WHEN i = 1 THEN DATE '2026-10-30' WHEN i <= ${ACTIVE} THEN DATE '2027-01-10' ELSE DATE '2025-01-10' END`,
    tipo_contrato_id: '1', tipo_contrato_nome: `'Contrato'`, data_publicacao_pncp: `'2026-01-12T10:00:00'`,
    hash_payload: `md5((i + 40000000)::VARCHAR)`, primeira_coleta_em: `'2026-10-30T09:00:00.000Z'`, ultima_coleta_em: `'2026-10-30T09:00:00.000Z'`,
    radicais: `' limpeza ' || md5((i + 50000000)::VARCHAR) || ' '`,
    grupos_numero: `[i::VARCHAR, '2026']`, grupos_processo: `[]::VARCHAR[]`,
    grupos_controle: `['00394460005887', i::VARCHAR, '2026']`, grupos_compra: `[]::VARCHAR[]`,
  };
  const selected = columnsOf('contratos').map((column) => `CAST(${expressions[column.column] ?? 'NULL'} AS ${column.type}) AS ${column.column}`).join(', ');
  const manifest: StoreManifest = {
    format: 1, revision: '1.1', publishedAt: '2026-10-30T09:00:00.000Z', today: '2026-10-30',
    totals: { contracts: CONTRACTS, active: ACTIVE, withoutExpiry: WITHOUT_EXPIRY },
    datasets: { contratos: [], vigentes: [], fornecedor: [], vencedores: [] },
  };
  try {
    await connection.run(`CREATE VIEW seed_contracts AS SELECT ${selected} FROM range(1, ${CONTRACTS + 1}) AS records(i)`);
    let sequence = 0;
    const writeParts = async (dataset: ContractDataset, partition: string, first: number, last: number, size: number) => {
      for (let start = first; start < last; start += size) {
        const end = Math.min(last, start + size);
        sequence += 1;
        const key = storeFileKey(dataset, partition, '1.1', sequence);
        const path = join(bucket, ...key.split('/'));
        await mkdir(dirname(path), { recursive: true });
        await connection.run(`COPY (
          SELECT ${columnList(dataset)} FROM seed_contracts
           WHERE sequencial_contrato >= ${start} AND sequencial_contrato < ${end}
           ORDER BY ${ROW_ORDER[dataset]}
        ) TO ${sqlLiteral(toDuckDbPath(path))} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 10000)`);
        const from = start === first ? '' : dataset === 'vigentes'
          ? `2027-01-10|SP|${controlNumber(start)}`
          : dataset === 'contratos' ? `SP|${controlNumber(start)}` : `11222333000181|${controlNumber(start)}`;
        const file: ManifestFile = { path: key, rows: end - start, bytes: (await stat(path)).size, partition, from };
        manifest.datasets[dataset].push(file);
      }
    };
    await writeParts('contratos', '2026', 1, CONTRACTS + 1, 15_000);
    await writeParts('fornecedor', '2026', 1, CONTRACTS + 1, 22_500);
    await writeParts('vigentes', '2026-10-26', 1, 2, 11_000);
    await writeParts('vigentes', '2027-01-04', 2, ACTIVE + 1, 11_000);
    const manifestPath = join(bucket, ...MANIFEST_KEY.split('/'));
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, serializeManifest(manifest));
    return manifest;
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

test('ensaio de volume: aproximadamente 2 milhoes de contratos, publicacoes incrementais e virada do dia dentro do orcamento', {
  skip: process.env['TENDERS_VOLUME_TESTS'] !== '1', timeout: 300_000,
}, async (context) => {
  await withTempDirectory(async (directory) => {
    const startedAt = performance.now();
    const bucket = join(directory, 'bucket');
    const fixture = await seedVolume(bucket, directory);
    const seedMs = Math.round(performance.now() - startedAt);
    const puts: Array<{ key: string; bytes: number }> = [];
    const storage = diskStorage(bucket, puts);
    const work = join(directory, 'work');
    const resourceBudget = new CollectorResourceBudget({ directory: work, logger: quietLogger, sampleIntervalMs: 100 });
    let instant = new Date('2026-10-30T12:00:00Z');
    const writer = await ContractStoreWriter.open({
      storage, directory: work, version: 2, searchFields: simpleSearchFields,
      today: '2026-10-30', now: () => instant, logger: quietLogger, resourceBudget,
    });
    const baselineActiveBytes = fixture.datasets.vigentes.reduce((sum, file) => sum + file.bytes, 0);
    const publicationMetrics = [];
    try {
      const emptyDatabaseBytes = (await stat(join(work, 'trabalho.duckdb'))).size;
      for (const sequence of [12, 45_678, 876_543]) {
        const putsBefore = puts.length;
        await writer.upsert([sampleContract(sequence, {
          pncpControlNumber: controlNumber(sequence), payloadHash: `alterado-${sequence}`, expiresOn: '2027-01-10',
        })]);
        const publicationStartedAt = performance.now();
        const summary = await writer.publish();
        assert.ok(summary);
        assert.deepEqual(summary.totals, fixture.totals);
        assert.equal((await stat(join(work, 'trabalho.duckdb'))).size, emptyDatabaseBytes);
        const activeBytesWritten = puts.slice(putsBefore).filter((entry) => entry.key.includes('/vigentes/')).reduce((sum, entry) => sum + entry.bytes, 0);
        assert.ok(activeBytesWritten < baselineActiveBytes / 5, 'uma alteracao regrava uma fracao dos vigentes');
        publicationMetrics.push({ durationMs: Math.round(performance.now() - publicationStartedAt), files: summary.filesWritten, bytesWritten: summary.bytesWritten, activeBytesWritten });
      }
      const growth = Array.from({ length: 1000 }, (_, index) => {
        const sequence = CONTRACTS + index + 1;
        return sampleContract(sequence, { pncpControlNumber: controlNumber(sequence), expiresOn: '2027-01-10' });
      });
      const growthStartedAt = performance.now();
      assert.equal((await writer.upsert(growth)).insertedCount, growth.length);
      const growthPublication = await writer.publish();
      assert.ok(growthPublication);
      assert.deepEqual(growthPublication.totals, { contracts: CONTRACTS + growth.length, active: ACTIVE + growth.length, withoutExpiry: WITHOUT_EXPIRY });
      const growthMetrics = { contractsAdded: growth.length, durationMs: Math.round(performance.now() - growthStartedAt), files: growthPublication.filesWritten, bytesWritten: growthPublication.bytesWritten };
      assert.equal((await writer.upsert(growth)).unchangedCount, growth.length);
      assert.equal(await writer.publish(), null, 'reler uma página confirmada não gera outra publicação');
      instant = new Date('2026-10-31T12:00:00Z');
      const rollover = await writer.publish();
      assert.equal(rollover?.changedContracts, 0);
      assert.equal(rollover?.totals.active, ACTIVE + growth.length - 1);
      assert.equal(rollover?.filesWritten, 0, 'o vencido era uma parte inteira; as outras partes continuam iguais');
      assert.equal(writer.currentManifest?.today, '2026-10-31');
      assert.equal(await writer.publish(), null);
      const measured = resourceBudget.summary();
      assert.ok(measured.peakBytes <= 1_600_000_000);
      context.diagnostic(JSON.stringify({
        scenario: 'synthetic-volume', contracts: CONTRACTS, active: ACTIVE, seedMs,
        publishedBytes: manifestFiles(fixture).reduce((sum, file) => sum + file.bytes, 0),
        baselineActiveBytesPerFullRewrite: baselineActiveBytes, publicationMetrics, growthMetrics, resources: measured,
        durationMs: Math.round(performance.now() - startedAt),
        limitations: 'Dados sinteticos com textos unicos; medicao local, sem CPU limitada ou faturamento real do Render/R2. Referencia de regravacao integral em bytes, sem executar o algoritmo legado.',
      }));
    } finally {
      await writer.close();
    }
  });
});
