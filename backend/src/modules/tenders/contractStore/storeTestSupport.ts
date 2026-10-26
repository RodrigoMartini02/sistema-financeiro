import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TenderContractRow } from '../collector/contractMapping';
import { createCollectorLogger } from '../collector/logger';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { openDuckDb, sqlLiteral, toDuckDbPath } from './duckdb';
import type { ContractSearchFields } from './layout';
import { ContractStoreReader } from './reader';
import { WEB_STORE_DATASETS } from './service';
import type { ContractSearchFieldsProvider, SearchPhrasesProvider } from './textSearch';
import type { ResultRecord, SupplierIdentity } from './winnerRows';
import { WinnerStoreWriter, type WinnerStoreWriterOptions } from './winnerWriter';
import { ContractStoreWriter, type ContractStoreWriterOptions } from './writer';

// Apoio dos testes do armazém de contratos: contratos de exemplo, campos de
// busca simplificados (sem o Postgres: palavras minúsculas sem acento, no lugar
// dos radicais) e pastas temporárias.

export const quietLogger = createCollectorLogger('error', () => {});

/**
 * Palavras minúsculas e sem acento; "de" (a única palavra ignorada aqui) vira a
 * marca "_" no meio e sai das pontas, como as posições do Postgres.
 */
function plainWords(text: string): string[] {
  const tokens = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => (word === 'de' ? '_' : word));
  while (tokens[0] === '_') {
    tokens.shift();
  }
  while (tokens.at(-1) === '_') {
    tokens.pop();
  }
  return tokens;
}

function digitGroups(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\D+/)
    .filter((group) => group !== '')
    .map((group) => group.replace(/^0+(?=.)/, ''));
}

/** Como o Postgres, mas sem radicais: "de" fica de fora, como no dicionário. */
export const simpleSearchFields: ContractSearchFieldsProvider = {
  async computeSearchFields(rows) {
    return rows.map(
      (row): ContractSearchFields => ({
        stems: ` ${plainWords(`${row.contractObject ?? ''} ${row.additionalInformation ?? ''}`).join(' ')} `,
        numberGroups: digitGroups(`${row.contractNumber ?? ''} ${row.contractYear}`),
        processGroups: digitGroups(`${row.processNumber ?? ''} ${row.contractYear}`),
        controlGroups: digitGroups(row.pncpControlNumber),
        purchaseGroups: digitGroups(row.purchaseControlNumber),
      }),
    );
  },
};

/** Uma frase por termo (sem as formas de singular e plural, que são do Postgres). */
export const simplePhrases: SearchPhrasesProvider = {
  async toPhrases(terms) {
    return terms.map((term) => {
      const words = plainWords(term);
      return words.length > 0 ? [` ${words.join(' ')} `] : [];
    });
  },
};

const DEFAULT_AGENCY = '00394460005887';

/** Contrato de exemplo; o número de controle sai do órgão, da sequência e do ano. */
export function sampleContract(sequence: number, overrides: Partial<TenderContractRow> = {}): TenderContractRow {
  const agencyCnpj = overrides.agencyCnpj ?? DEFAULT_AGENCY;
  const contractYear = overrides.contractYear ?? 2026;
  return {
    pncpControlNumber: `${agencyCnpj}-2-${String(sequence).padStart(6, '0')}/${contractYear}`,
    purchaseControlNumber: null,
    contractYear,
    contractSequence: sequence,
    contractNumber: `${sequence}/${contractYear}`,
    processNumber: null,
    agencyCnpj,
    agencyName: 'Prefeitura de Teste',
    governmentSphere: 'M',
    unitCode: null,
    unitName: null,
    state: 'SP',
    cityName: 'São Paulo',
    cityIbgeCode: '3550308',
    categoryId: 8,
    categoryName: 'Serviços',
    contractObject: `Serviço de limpeza ${sequence}`,
    additionalInformation: null,
    supplierPersonType: 'PJ',
    supplierDocument: '11222333000181',
    supplierName: 'Fornecedor de Teste',
    initialValue: '1000.00',
    globalValue: '1000.00',
    signedAt: '2026-01-10',
    termStart: '2026-01-10',
    originalTermEnd: '2027-01-10',
    expiresOn: '2027-01-10',
    contractTypeId: 1,
    contractTypeName: 'Contrato (termo inicial)',
    publishedAt: '2026-01-12T10:00:00',
    pncpUpdatedAt: null,
    pncpGlobalUpdatedAt: null,
    amendments: null,
    amendmentsReference: null,
    payloadHash: `hash-${sequence}`,
    ...overrides,
  };
}

export async function withTempDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'armazem-contratos-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** Abre o gravador, roda `work`, publica e fecha: uma execução do Cron Job. */
export async function publishWith(
  storage: ObjectStorage,
  directory: string,
  version: number,
  work: (writer: ContractStoreWriter) => Promise<void>,
  options: Partial<ContractStoreWriterOptions> = {},
) {
  const writer = await ContractStoreWriter.open({
    storage,
    searchFields: simpleSearchFields,
    directory,
    version,
    today: '2026-10-19',
    now: () => new Date('2026-10-19T12:00:00Z'),
    logger: quietLogger,
    ...options,
  });
  try {
    await work(writer);
    return await writer.publish();
  } finally {
    await writer.close();
  }
}

// ---- Vencedores (plano .plans/licitacoes-vencedores.md) ----

/** Fornecedor de exemplo: pessoa jurídica, com o CNPJ como chave. */
export function sampleSupplier(document = '11222333000181', name = 'Fornecedor de Teste'): SupplierIdentity {
  return { key: document, personType: 'PJ', document, name, size: 'ME' };
}

/** Número de controle de uma compra de exemplo: o órgão de teste, a sequência e o ano. */
export function samplePurchase(sequence: number, year = 2026): string {
  return `00394460005887-1-${String(sequence).padStart(6, '0')}/${year}`;
}

/** Resultado de exemplo: o item de uma compra, vencedor, de 14/09/2026. */
export function sampleResult(itemNumber: number, overrides: Partial<ResultRecord> = {}): ResultRecord {
  return {
    purchaseControlNumber: samplePurchase(10),
    itemNumber,
    sequence: 1,
    situation: 'winner',
    supplier: sampleSupplier(),
    valueCents: 10_000,
    resultDate: '2026-09-14',
    updatedAt: '2026-09-14T10:00:00',
    unitCode: '153103',
    state: 'SP',
    rank: 1,
    cancelledOn: null,
    ...overrides,
  };
}

/** Abre o gravador dos vencedores, roda `work`, publica e fecha: uma execução do Cron Job. */
export async function publishWinnersWith(
  storage: ObjectStorage,
  directory: string,
  version: number,
  work: (writer: WinnerStoreWriter) => Promise<void>,
  options: Partial<WinnerStoreWriterOptions> = {},
) {
  const writer = await WinnerStoreWriter.open({
    storage,
    directory,
    version,
    today: '2026-10-19',
    now: () => new Date('2026-10-19T12:00:00Z'),
    logger: quietLogger,
    ...options,
  });
  try {
    await work(writer);
    return await writer.publish();
  } finally {
    await writer.close();
  }
}

/** Linhas de um arquivo Parquet do bucket simulado, na ordem do arquivo (DATE e DECIMAL chegam como texto). */
export async function readParquetRows(objects: Map<string, Uint8Array>, key: string, columns: string): Promise<Record<string, unknown>[]> {
  return withTempDirectory(async (directory) => {
    const path = join(directory, 'arquivo.parquet');
    const body = objects.get(key);
    if (!body) {
      throw new Error(`arquivo no bucket: ${key}`);
    }
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

export interface TestContractStore {
  /** O leitor sobre a cópia local do armazém de exemplo, como o do Web Service. */
  reader: ContractStoreReader;
  storage: ObjectStorage;
  /** Os objetos do R2 simulado. */
  objects: Map<string, Uint8Array>;
  close(): Promise<void>;
}

/**
 * Armazém de exemplo pronto para ler: publica os contratos (e, em `winners`, os
 * resultados dos vencedores) num R2 simulado e abre o leitor sobre a cópia, com
 * os conjuntos do Web Service. Os campos de busca vêm de `searchFields` (os
 * simplificados, sem o Postgres, ou os do banco local nos testes de banco).
 */
export async function openTestContractStore(
  contracts: readonly TenderContractRow[],
  options: { searchFields?: ContractSearchFieldsProvider; today?: string; winners?: readonly ResultRecord[] } = {},
): Promise<TestContractStore> {
  const { storage, objects } = createMemoryStorage();
  const directory = await mkdtemp(join(tmpdir(), 'armazem-exemplo-'));
  try {
    await publishWith(storage, join(directory, 'gravacao'), 1, async (writer) => {
      await writer.upsert(contracts);
    }, { searchFields: options.searchFields ?? simpleSearchFields, ...(options.today ? { today: options.today } : {}) });
    if (options.winners) {
      const winners = options.winners;
      await publishWinnersWith(storage, join(directory, 'gravacao-vencedores'), 2, async (writer) => void (await writer.apply([...winners])));
    }
    const reader = await ContractStoreReader.create({ storage, directory: join(directory, 'leitura'), logger: quietLogger, datasets: WEB_STORE_DATASETS });
    await reader.refresh();
    return {
      reader,
      storage,
      objects,
      close: async () => {
        await reader.close();
        await rm(directory, { recursive: true, force: true, maxRetries: 3 });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    throw error;
  }
}
