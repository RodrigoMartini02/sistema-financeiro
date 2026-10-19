import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TenderContractRow } from '../collector/contractMapping';
import { createCollectorLogger } from '../collector/logger';
import type { ObjectStorage } from '../objectStorage';
import type { ContractSearchFields } from './layout';
import type { ContractSearchFieldsProvider, SearchPhrasesProvider } from './textSearch';
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
