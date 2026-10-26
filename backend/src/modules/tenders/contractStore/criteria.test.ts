import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { TenderContractRow } from '../collector/contractMapping';
import { EMPTY_CONTRACT_CRITERIA, type ContractCriteria } from '../services/contractSearch';
import {
  SqlParameters,
  activeContractCondition,
  contractCriteriaCondition,
  contractListDataset,
  phraseContractCriteria,
  supplierPruneCondition,
} from './criteria';
import { openDuckDb, sqlLiteral, toDuckDbPath, type OpenedDuckDb } from './duckdb';
import { columnDefinitions, columnList, columnsOf, toStoreRecord } from './layout';
import { sampleContract, simplePhrases, simpleSearchFields } from './storeTestSupport';
import type { SearchPhrasesProvider } from './textSearch';

// Os critérios da busca de contratos no DuckDB (criteria.ts), sobre 4 contratos.
// Os radicais aqui são simplificados (storeTestSupport.ts); a conta real do
// Postgres tem teste próprio (textSearch.db.test.ts).

const TODAY = '2026-10-19';

const contracts: TenderContractRow[] = [
  sampleContract(1, { contractObject: 'Serviço de limpeza predial', state: 'SP', categoryId: 8, supplierDocument: 'A', globalValue: '1000.00', expiresOn: '2027-01-10' }),
  sampleContract(2, { contractObject: 'Manutenção predial preventiva', state: 'MG', cityIbgeCode: '3106200', categoryId: 4, supplierDocument: 'B', globalValue: null, expiresOn: '2026-12-01' }),
  sampleContract(3, { contractObject: 'Obra de pavimentação', state: 'RJ', agencyCnpj: '29138278000101', categoryId: 8, supplierDocument: 'A', globalValue: '50000.00', expiresOn: '2026-10-18' }),
  sampleContract(4, { contractObject: 'Limpeza de vidros', state: 'SP', categoryId: 8, supplierDocument: 'C', globalValue: '200.00', expiresOn: null }),
];

let directory: string;
let duck: OpenedDuckDb;
let connection: DuckDBConnection;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'criterios-'));
  duck = await openDuckDb({ memoryLimitMb: 128, threads: 1, tempDirectory: join(directory, 'tmp') });
  connection = duck.connection;
  const fields = await simpleSearchFields.computeSearchFields(contracts);
  const records = contracts.map((contract, index) => toStoreRecord({ ...contract, firstCollectedAt: 'a', lastCollectedAt: 'b' }, fields[index]!));
  const path = join(directory, 'contratos.ndjson');
  await writeFile(path, records.map((record) => JSON.stringify(record)).join('\n'));
  const columns = `{${columnsOf('contratos').map((spec) => `${spec.column}: ${sqlLiteral(spec.type)}`).join(', ')}}`;
  await connection.run(`CREATE TABLE contratos (${columnDefinitions('contratos')})`);
  await connection.run(`INSERT INTO contratos SELECT ${columnList('contratos')} FROM read_json(${sqlLiteral(toDuckDbPath(path))}, format = 'newline_delimited', columns = ${columns})`);
});

after(async () => {
  connection.closeSync();
  duck.instance.closeSync();
  await rm(directory, { recursive: true, force: true, maxRetries: 3 });
});

/** Sequenciais dos contratos que batem com os critérios. */
async function matching(criteria: Partial<ContractCriteria>, today?: string, phrases: SearchPhrasesProvider = simplePhrases): Promise<number[]> {
  const phrased = await phraseContractCriteria(phrases, { ...EMPTY_CONTRACT_CRITERIA, ...criteria });
  const params = new SqlParameters();
  const conditions = [contractCriteriaCondition(phrased, params), ...(today ? [activeContractCondition(today, params)] : [])];
  const result = await connection.runAndReadAll(
    `SELECT sequencial_contrato FROM contratos WHERE ${conditions.join(' AND ')} ORDER BY sequencial_contrato`,
    params.values,
  );
  return result.getRows().map(([sequence]) => Number(sequence));
}

test('sem critérios, todos', async () => {
  assert.deepEqual(await matching({}), [1, 2, 3, 4]);
});

test('termos: cada termo é uma frase; no modo E todos, no OU qualquer um', async () => {
  assert.deepEqual(await matching({ terms: ['limpeza'] }), [1, 4]);
  assert.deepEqual(await matching({ terms: ['limpeza', 'predial'], termsMode: 'E' }), [1]);
  assert.deepEqual(await matching({ terms: ['limpeza', 'predial'], termsMode: 'OU' }), [1, 2, 4]);
  assert.deepEqual(await matching({ terms: ['limpeza predial'] }), [1], 'a frase bate em sequência');
  assert.deepEqual(await matching({ terms: ['predial limpeza'] }), [], 'fora de ordem, não bate');
  assert.deepEqual(await matching({ terms: ['LIMPEZA'] }), [1, 4], 'sem diferença de maiúsculas');
});

test('termo sem radical: sozinho, nada bate (como a consulta vazia do Postgres); com outro, não conta', async () => {
  assert.deepEqual(await matching({ terms: ['de'] }), []);
  assert.deepEqual(await matching({ terms: ['de', 'obra'], termsMode: 'E' }), [3]);
});

test('palavra ignorada no meio da frase ocupa a posição dela, como no phraseto_tsquery', async () => {
  assert.deepEqual(await matching({ terms: ['serviço de limpeza'] }), [1]);
  assert.deepEqual(await matching({ terms: ['serviço limpeza'] }), [], 'sem o "de", as palavras ficam a 2 posições, e não bate');
  assert.deepEqual(await matching({ terms: ['limpeza de vidros'] }), [4]);
  assert.deepEqual(await matching({ terms: ['limpeza vidros'] }), []);
  assert.deepEqual(await matching({ terms: ['de limpeza'] }), [1, 4], '"de" na ponta não conta');
});

test('na frase com posição livre, o resto do texto vale ao pé da letra (sem curinga de expressão regular)', async () => {
  const literal: SearchPhrasesProvider = { toPhrases: async (terms) => terms.map(() => [' servic. _ limpeza ']) };
  assert.deepEqual(await matching({ terms: ['qualquer'] }, undefined, literal), [], 'o ponto não vale como "qualquer letra"');
  const wildcard: SearchPhrasesProvider = { toPhrases: async (terms) => terms.map(() => [' servico _ limpeza ']) };
  assert.deepEqual(await matching({ terms: ['qualquer'] }, undefined, wildcard), [1]);
});

test('termo em branco não conta, como na fn_tsquery_termos', async () => {
  assert.deepEqual(await matching({ terms: ['  '] }), [1, 2, 3, 4]);
  assert.deepEqual(await matching({ terms: ['  ', 'vidros'] }), [4]);
});

test('termo com várias frases (formas de singular e plural): bate por qualquer uma; no modo E, cada termo por uma das suas', async () => {
  const variants: SearchPhrasesProvider = {
    async toPhrases(terms) {
      return terms.map((term) => (term === 'vidro' ? [' vidro ', ' vidros '] : term === 'obras' ? [' obras ', ' obra '] : [` ${term} `]));
    },
  };
  assert.deepEqual(await matching({ terms: ['vidro'] }, undefined, variants), [4]);
  assert.deepEqual(await matching({ terms: ['vidro', 'obras'], termsMode: 'OU' }, undefined, variants), [3, 4]);
  assert.deepEqual(await matching({ terms: ['vidro', 'limpeza'], termsMode: 'E' }, undefined, variants), [4]);
  assert.deepEqual(await matching({ excludedTerms: ['vidro', 'obras'] }, undefined, variants), [1, 2], 'exclusão por qualquer frase');
});

test('exclusões: nenhuma pode aparecer; exclusão sem radical não conta', async () => {
  assert.deepEqual(await matching({ terms: ['limpeza'], excludedTerms: ['vidros'] }), [1]);
  assert.deepEqual(await matching({ excludedTerms: ['predial', 'obra'] }), [4]);
  assert.deepEqual(await matching({ excludedTerms: ['de'] }), [1, 2, 3, 4]);
});

test('UF, município, órgão, categoria e fornecedor: lista vazia = sem filtro', async () => {
  assert.deepEqual(await matching({ states: ['SP'] }), [1, 4]);
  assert.deepEqual(await matching({ states: ['SP', 'RJ'] }), [1, 3, 4]);
  assert.deepEqual(await matching({ cityIbgeCodes: ['3106200'] }), [2]);
  assert.deepEqual(await matching({ agencyCnpjs: ['29138278000101'] }), [3]);
  assert.deepEqual(await matching({ categories: [8] }), [1, 3, 4]);
  assert.deepEqual(await matching({ supplierCnpjs: ['A'] }), [1, 3]);
  assert.deepEqual(await matching({ states: ['SP'], categories: [8], terms: ['vidros'] }), [4], 'os critérios se somam');
});

test('faixa de valor: sem valor global só entra com "incluir sem valor"', async () => {
  assert.deepEqual(await matching({ minValue: '500' }), [1, 3]);
  assert.deepEqual(await matching({ minValue: '500', includeWithoutValue: true }), [1, 2, 3]);
  assert.deepEqual(await matching({ maxValue: '1000' }), [1, 4]);
  assert.deepEqual(await matching({ minValue: '200', maxValue: '1000.00' }), [1, 4]);
});

test('vigente: vencimento de hoje em diante; sem vencimento não é vigente', async () => {
  assert.deepEqual(await matching({}, TODAY), [1, 2]);
  assert.deepEqual(await matching({}, '2026-10-18'), [1, 2, 3], 'vence no próprio dia: ainda vigente');
});

test('conjunto da lista: "fornecedor" só com filtro de fornecedor e sem critério que use o texto do contrato', async () => {
  const dataset = async (criteria: Partial<ContractCriteria>, options: { allContracts?: boolean; numberGroups?: string[] } = {}) =>
    contractListDataset(await phraseContractCriteria(simplePhrases, { ...EMPTY_CONTRACT_CRITERIA, ...criteria }), {
      allContracts: false,
      numberGroups: [],
      ...options,
    });
  const supplierCnpjs = ['11222333000181'];
  assert.equal(await dataset({ supplierCnpjs }), 'fornecedor', 'só os vigentes: o filtro de vigência continua na consulta');
  assert.equal(await dataset({ supplierCnpjs }, { allContracts: true }), 'fornecedor');
  assert.equal(await dataset({ supplierCnpjs, states: ['SP'], agencyCnpjs: ['29138278000101'], minValue: '10' }), 'fornecedor');
  assert.equal(await dataset({ supplierCnpjs, terms: ['limpeza'] }), 'vigentes', 'termos pedem o texto do contrato');
  assert.equal(await dataset({ supplierCnpjs, terms: ['limpeza'] }, { allContracts: true }), 'contratos');
  assert.equal(await dataset({ supplierCnpjs, terms: ['de'] }), 'vigentes', 'termo sem radical também fica fora (a consulta já nasce com termos)');
  assert.equal(await dataset({ supplierCnpjs, excludedTerms: ['vidros'] }), 'vigentes', 'exclusões pedem o texto do contrato');
  assert.equal(await dataset({ supplierCnpjs, excludedTerms: ['de'] }), 'fornecedor', 'exclusão sem radical não vira condição');
  assert.equal(await dataset({ supplierCnpjs }, { numberGroups: ['11', '2026'] }), 'vigentes', 'os grupos de dígitos só existem em vigentes e contratos');
  assert.equal(await dataset({ supplierCnpjs }, { allContracts: true, numberGroups: ['11'] }), 'contratos');
  assert.equal(await dataset({}), 'vigentes');
  assert.equal(await dataset({ agencyCnpjs: ['29138278000101'] }, { allContracts: true }), 'contratos', 'só o fornecedor tem conjunto próprio');
});

test('poda por fornecedor: literais só para CNPJ no formato; lista com item fora do formato fica sem poda', () => {
  const prune = (supplierCnpjs: string[]) => supplierPruneCondition({ supplierCnpjs });
  assert.equal(prune([]), null);
  assert.equal(prune(['11222333000181']), "fornecedor_documento IN ('11222333000181')");
  assert.equal(prune(['11222333000181', '99887766000155']), "fornecedor_documento IN ('11222333000181', '99887766000155')");
  // CPF mascarado, texto e tentativa de injeção não são CNPJ: sem poda (a condição exata decide, com parâmetros).
  assert.equal(prune(['***.123.456-**']), null);
  assert.equal(prune(['11222333000181', 'lixo']), null, 'um item fora do formato desliga a poda da lista toda');
  assert.equal(prune(["11222333000181') OR true --"]), null);
  assert.equal(prune(['1122233300018']), null);
});

test('o que vem da pessoa vai como parâmetro: aspas e barras não quebram a consulta', async () => {
  assert.deepEqual(await matching({ terms: ["o'brien"], states: ["S'P"], minValue: null }), []);
  assert.deepEqual(await matching({ excludedTerms: ["x') OR ('1'='1"] }), [1, 2, 3, 4]);
});
