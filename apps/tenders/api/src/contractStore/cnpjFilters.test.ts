import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { TenderContractRow } from '../collector/contractMapping';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { EMPTY_CONTRACT_CRITERIA, type ContractCriteria } from '../services/contractSearch';
import { SqlParameters, activeContractCondition, contractCriteriaCondition, phraseContractCriteria } from './criteria';
import { MANIFEST_KEY } from './layout';
import { parseManifest } from './manifest';
import { queryContractPage, type ContractListQuery } from './queries';
import { ContractStoreReader } from './reader';
import { publishWith, quietLogger, sampleContract, simplePhrases } from './storeTestSupport';

// Os filtros por CNPJ da lista de contratos (plano .plans/licitacoes-pagina-cnpj.md, passo 3): a poda do fornecedor
// por literais e o conjunto `fornecedor` têm de dar exatamente o resultado da varredura sem poda. O armazém tem
// arquivos de 3 linhas, então a poda por mínimos e máximos dos arquivos não é trivial.

const TODAY = '2026-10-19';
const day = (offset: number) => new Date(Date.UTC(2026, 9, 19 + offset)).toISOString().slice(0, 10);

const AGENCIES = ['00394460005887', '12345678000195', '33000167000101'];
const SUPPLIERS = ['11222333000181', '11222333000182', '99887766000155'];
const PERSON = '***.123.456-**';
const STATES = ['SP', 'MG', 'RJ'];

/** 18 contratos: o órgão e a UF giram de 3 em 3, o fornecedor troca a cada 3, e o último é de pessoa física. */
const contracts: TenderContractRow[] = Array.from({ length: 18 }, (_, index) => {
  const sequence = index + 1;
  const expiresOn = sequence % 4 === 0 ? null : day(sequence - 9);
  return sampleContract(sequence, {
    agencyCnpj: AGENCIES[sequence % 3]!,
    supplierDocument: sequence === 18 ? PERSON : SUPPLIERS[Math.floor(sequence / 3) % 3]!,
    state: STATES[sequence % 3]!,
    contractTypeId: sequence % 2 === 0 ? 1 : 7,
    contractTypeName: sequence % 2 === 0 ? 'Contrato' : 'Empenho',
    globalValue: sequence % 5 === 0 ? null : `${sequence * 100}.00`,
    expiresOn,
    originalTermEnd: expiresOn,
    publishedAt: `2026-03-${String(sequence).padStart(2, '0')}T10:00:00`,
  });
});

let directory: string;
let reader: ContractStoreReader;
let fornecedorFiles: number;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'armazem-cnpj-'));
  const { storage, objects } = createMemoryStorage();
  await publishWith(
    storage,
    join(directory, 'gravacao'),
    1,
    async (writer) => {
      await writer.upsert(contracts);
    },
    { maxRowsPerFile: { vigentes: 3, contratos: 3, fornecedor: 3 } },
  );
  reader = await ContractStoreReader.create({ storage, directory: join(directory, 'leitura'), logger: quietLogger });
  await reader.refresh();
  fornecedorFiles = parseManifest(objects.get(MANIFEST_KEY) ?? new Uint8Array()).datasets.fornecedor.length;
});

after(async () => {
  await reader.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 3 });
});

const keys = (rows: Array<{ numero_controle_pncp: string }>) => rows.map((row) => row.numero_controle_pncp);

async function phrased(criteria: Partial<ContractCriteria>) {
  return phraseContractCriteria(simplePhrases, { ...EMPTY_CONTRACT_CRITERIA, ...criteria });
}

async function baseQuery(dataset: ContractListQuery['dataset'], activeOn: string | null, criteria: Partial<ContractCriteria>, overrides: Partial<ContractListQuery> = {}) {
  const query: ContractListQuery = {
    dataset,
    phrased: await phrased(criteria),
    activeOn,
    keys: null,
    contractTypes: [],
    numberGroups: [],
    contractYear: null,
    publishedFrom: null,
    publishedBefore: null,
    expiryFrom: null,
    expiryTo: null,
    sort: 'expiryAsc',
    page: 1,
    perPage: 100,
    ...overrides,
  };
  return query;
}

const page = (query: ContractListQuery) => reader.query((connection) => queryContractPage(connection, query));

/** Os contratos que batem com os critérios, por varredura de `contratos` com a condição exata e sem poda nenhuma. */
async function scanned(criteria: Partial<ContractCriteria>, activeOn: string | null): Promise<string[]> {
  const params = new SqlParameters();
  const conditions = [contractCriteriaCondition(await phrased(criteria), params), ...(activeOn === null ? [] : [activeContractCondition(activeOn, params)])];
  return reader.query(async (connection) => {
    const result = await connection.runAndReadAll(
      `SELECT numero_controle_pncp FROM contratos WHERE ${conditions.join(' AND ')} ORDER BY numero_controle_pncp`,
      params.values,
    );
    return result.getRows().map(([key]) => String(key));
  });
}

const S0 = SUPPLIERS[0]!;
const S1 = SUPPLIERS[1]!;
const S2 = SUPPLIERS[2]!;
const [A0, A1, A2] = AGENCIES as [string, string, string];

const CASES: Array<{ name: string; criteria: Partial<ContractCriteria>; empty?: true }> = [
  { name: 'um fornecedor', criteria: { supplierCnpjs: [S0] } },
  { name: 'dois fornecedores', criteria: { supplierCnpjs: [S0, S1] } },
  { name: 'fornecedor e UF', criteria: { supplierCnpjs: [S2], states: ['SP'] } },
  { name: 'fornecedor e valor mínimo', criteria: { supplierCnpjs: [S1], minValue: '1000' } },
  { name: 'um órgão', criteria: { agencyCnpjs: [A1] } },
  { name: 'dois órgãos', criteria: { agencyCnpjs: [A0, A2] } },
  { name: 'fornecedor e órgão', criteria: { supplierCnpjs: [S0], agencyCnpjs: [A1] } },
  { name: 'fornecedor sem contratos', criteria: { supplierCnpjs: ['55444333000122'] }, empty: true },
  { name: 'CNPJ de fornecedor vizinho que não existe', criteria: { supplierCnpjs: ['11222333000180'] }, empty: true },
  { name: 'CNPJ de órgão vizinho que não existe', criteria: { agencyCnpjs: ['00394460005880'] }, empty: true },
  { name: 'pessoa física (CPF mascarado, sem poda)', criteria: { supplierCnpjs: [PERSON] } },
  { name: 'lista com item fora do formato (sem poda)', criteria: { supplierCnpjs: [S0, 'lixo'] } },
  { name: 'tentativa de injeção no CNPJ', criteria: { supplierCnpjs: [`${S0}') OR true --`] }, empty: true },
];

for (const { name, criteria, empty } of CASES) {
  test(`filtro por CNPJ: ${name} dá o resultado da varredura sem poda, nos três conjuntos`, async () => {
    for (const [dataset, activeOn] of [
      ['contratos', null],
      ['fornecedor', null],
      ['vigentes', TODAY],
      ['contratos', TODAY],
      ['fornecedor', TODAY],
    ] as const) {
      const expected = await scanned(criteria, activeOn);
      assert.equal(expected.length === 0, empty === true, `${name}: a varredura devia ${empty ? 'não ter' : 'ter'} contratos (${activeOn ?? 'todos'})`);
      const result = await page(await baseQuery(dataset, activeOn, criteria));
      assert.deepEqual(keys(result.rows).sort(), expected, `${name}: ${dataset}, ${activeOn ?? 'todos'}`);
      assert.equal(result.total, expected.length, `${name}: total em ${dataset}`);
    }
  });
}

test('o armazém de exemplo tem vários arquivos por conjunto (a poda por faixa não é trivial)', () => {
  assert.ok(fornecedorFiles >= 5, `${fornecedorFiles} arquivos de fornecedor`);
});

test('fornecedor e contratos dão a mesma lista, com os mesmos filtros, ordens, páginas e totais', async () => {
  const criteria: Partial<ContractCriteria> = { supplierCnpjs: [S0, S1] };
  const variations: Array<Partial<ContractListQuery>> = [
    {},
    { contractTypes: [7] },
    { contractTypes: [1, 7], perPage: 4 },
    { contractYear: 2026, perPage: 4, page: 2 },
    { publishedFrom: '2026-03-02', publishedBefore: '2026-03-10' },
    { expiryFrom: day(0), expiryTo: day(4) },
    { sort: 'publishedDesc', perPage: 3, page: 3 },
    { sort: 'valueDesc', perPage: 5 },
    { sort: 'valueAsc', perPage: 5, page: 2 },
    { sort: 'relevance', perPage: 4 },
    { keys: [contracts[0]!.pncpControlNumber, contracts[8]!.pncpControlNumber, contracts[9]!.pncpControlNumber, 'lixo'] },
    { page: 9 },
  ];
  for (const activeOn of [null, TODAY]) {
    for (const overrides of variations) {
      const expected = await page(await baseQuery('contratos', activeOn, criteria, overrides));
      const actual = await page(await baseQuery('fornecedor', activeOn, criteria, overrides));
      assert.deepEqual(actual, expected, JSON.stringify({ activeOn, overrides }));
    }
  }
  const sample = await page(await baseQuery('fornecedor', null, criteria, { perPage: 4 }));
  assert.equal(sample.total, 11, 'os sequenciais 1, 2, 9, 10 e 11 (um fornecedor) e 3, 4, 5, 12, 13 e 14 (o outro)');
});
