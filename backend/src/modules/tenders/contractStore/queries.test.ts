import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { TenderContractRow } from '../collector/contractMapping';
import { EMPTY_CONTRACT_CRITERIA, type ContractCriteria } from '../services/contractSearch';
import { phraseContractCriteria } from './criteria';
import {
  contractExists,
  countActiveContracts,
  queryContractPage,
  readContract,
  readExpiringByCriteria,
  readExpiringByKeys,
  type ContractListQuery,
} from './queries';
import { openTestContractStore, sampleContract, simplePhrases, type TestContractStore } from './storeTestSupport';

// As consultas do armazém que a API e os avisos usam (queries.ts), sobre um
// armazém de exemplo e as frases simplificadas (sem o Postgres): paginação e
// total, ordens, filtros, chaves, janelas de vencimento e contagem. O encontro
// com o Postgres (radicais, singular e plural) tem teste de banco próprio.

const TODAY = '2026-10-19';
const day = (offset: number) => new Date(Date.UTC(2026, 9, 19 + offset)).toISOString().slice(0, 10);

const contracts: TenderContractRow[] = [
  sampleContract(1, { contractObject: 'Limpeza e conservação predial', expiresOn: day(10), globalValue: '300.00', publishedAt: '2026-03-01T10:00:00', state: 'SP', contractNumber: '11/2026', processNumber: 'P-900' }),
  sampleContract(2, { contractObject: 'Serviços de limpeza', expiresOn: day(5), globalValue: '100.00', publishedAt: '2026-03-02T23:59:59', state: 'MG', contractNumber: '22/2025', contractYear: 2025 }),
  sampleContract(3, { contractObject: 'Obra de pavimentação com limpeza do terreno', expiresOn: day(30), globalValue: null, publishedAt: '2026-03-03T00:00:00', state: 'SP', contractTypeId: 7, contractTypeName: 'Empenho' }),
  sampleContract(4, { contractObject: 'Vigilância armada', expiresOn: day(-3), originalTermEnd: day(-3), termStart: '2024-01-01', globalValue: '50.00', publishedAt: '2026-02-01T10:00:00', state: 'RJ' }),
  sampleContract(5, { contractObject: 'Fornecimento de material', expiresOn: null, originalTermEnd: null, globalValue: '900.00', publishedAt: '2026-04-01T10:00:00', state: 'SP' }),
];
const key = (sequence: number) => sampleContract(sequence, sequence === 2 ? { contractYear: 2025 } : {}).pncpControlNumber;
const keys = (rows: Array<{ numero_controle_pncp: string }>) => rows.map((row) => row.numero_controle_pncp);

let store: TestContractStore;

before(async () => {
  store = await openTestContractStore(contracts);
});

after(async () => {
  await store.close();
});

async function phrased(criteria: Partial<ContractCriteria> = {}) {
  return phraseContractCriteria(simplePhrases, { ...EMPTY_CONTRACT_CRITERIA, ...criteria });
}

async function baseQuery(overrides: Partial<ContractListQuery> = {}, criteria: Partial<ContractCriteria> = {}): Promise<ContractListQuery> {
  return {
    dataset: 'vigentes',
    phrased: await phrased(criteria),
    activeOn: TODAY,
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
    perPage: 10,
    ...overrides,
  };
}

const page = async (query: ContractListQuery) => store.reader.query((connection) => queryContractPage(connection, query));

test('vigentes: só quem vence de hoje em diante; "contratos" traz todos, até os sem vencimento por último', async () => {
  const active = await page(await baseQuery());
  assert.deepEqual(keys(active.rows), [key(2), key(1), key(3)], 'pelo vencimento mais próximo');
  assert.equal(active.total, 3);

  const all = await page(await baseQuery({ dataset: 'contratos', activeOn: null }));
  assert.deepEqual(keys(all.rows), [key(4), key(2), key(1), key(3), key(5)], 'o vencido primeiro e o sem vencimento por último');
  assert.equal(all.rows.at(-1)?.vencimento, null);
  assert.equal(all.total, 5);
});

test('total: sai da própria página quando ela é a última; senão, uma contagem', async () => {
  const query = await baseQuery({ dataset: 'contratos', activeOn: null, perPage: 2 });
  const first = await page({ ...query, page: 1 });
  assert.deepEqual({ rows: first.rows.length, total: first.total }, { rows: 2, total: 5 });
  const last = await page({ ...query, page: 3 });
  assert.deepEqual({ rows: last.rows.length, total: last.total }, { rows: 1, total: 5 }, 'última página, incompleta: 4 + 1');
  const beyond = await page({ ...query, page: 4 });
  assert.deepEqual({ rows: beyond.rows.length, total: beyond.total }, { rows: 0, total: 5 }, 'depois da última: o total continua certo');

  const even = await baseQuery({ dataset: 'contratos', activeOn: null, perPage: 5 });
  assert.equal((await page(even)).total, 5, 'página cheia na última posição: a contagem confere');
  const none = await page(await baseQuery({}, { terms: ['inexistente'] }));
  assert.deepEqual({ rows: none.rows.length, total: none.total }, { rows: 0, total: 0 });
});

test('ordens: valor com os sem valor por último, publicação e desempate pelo número de controle', async () => {
  const all = { dataset: 'contratos', activeOn: null } as const;
  assert.deepEqual(keys((await page(await baseQuery({ ...all, sort: 'valueDesc' }))).rows), [key(5), key(1), key(2), key(4), key(3)]);
  assert.deepEqual(keys((await page(await baseQuery({ ...all, sort: 'valueAsc' }))).rows), [key(4), key(2), key(1), key(5), key(3)]);
  assert.deepEqual(keys((await page(await baseQuery({ ...all, sort: 'publishedDesc' }))).rows), [key(5), key(3), key(2), key(1), key(4)]);
});

test('relevância: mais termos batendo primeiro; no empate, o termo mais perto do começo; sem termos, pelo vencimento', async () => {
  const query = await baseQuery({ sort: 'relevance' }, { terms: ['limpeza', 'predial'], termsMode: 'OU' });
  assert.deepEqual(keys((await page(query)).rows), [key(1), key(2), key(3)], 'os dois termos; depois "limpeza" na posição 1 e na 5');
  const withoutTerms = await baseQuery({ sort: 'relevance' });
  assert.deepEqual(keys((await page(withoutTerms)).rows), [key(2), key(1), key(3)]);
});

test('filtros: tipo, UF, ano, publicação (dia inteiro) e vencimento', async () => {
  const all = { dataset: 'contratos', activeOn: null } as const;
  assert.deepEqual(keys((await page(await baseQuery({ ...all, contractTypes: [7] }))).rows), [key(3)]);
  assert.deepEqual(keys((await page(await baseQuery({ ...all, contractYear: 2025 }))).rows), [key(2)]);
  assert.deepEqual(keys((await page(await baseQuery({ ...all }, { states: ['SP'] }))).rows), [key(1), key(3), key(5)]);
  // O dia final vale inteiro (até 23:59:59): publicadoAntes é o dia seguinte, exclusivo.
  assert.deepEqual(
    keys((await page(await baseQuery({ ...all, publishedFrom: '2026-03-02', publishedBefore: '2026-03-03', sort: 'publishedDesc' }))).rows),
    [key(2)],
  );
  assert.deepEqual(keys((await page(await baseQuery({ ...all, publishedFrom: '2026-03-02', publishedBefore: '2026-03-04', sort: 'publishedDesc' }))).rows), [key(3), key(2)]);
  assert.deepEqual(keys((await page(await baseQuery({ expiryFrom: day(6), expiryTo: day(10) }))).rows), [key(1)]);
  assert.deepEqual(keys((await page(await baseQuery({ expiryTo: day(5) }))).rows), [key(2)], 'o vencimento do próprio dia entra');
});

test('número: todos os grupos no mesmo campo; grupos de campos diferentes não se misturam', async () => {
  const all = { dataset: 'contratos', activeOn: null } as const;
  // sampleContract: grupos do número = [número, ano do contrato]; do processo = [processo, ano].
  assert.deepEqual(keys((await page(await baseQuery({ ...all, numberGroups: ['11', '2026'] }))).rows), [key(1)]);
  assert.deepEqual(keys((await page(await baseQuery({ ...all, numberGroups: ['22', '2025'] }))).rows), [key(2)]);
  assert.deepEqual(keys((await page(await baseQuery({ ...all, numberGroups: ['22', '2026'] }))).rows), [], 'ano errado');
  assert.deepEqual(keys((await page(await baseQuery({ ...all, numberGroups: ['900', '2026'] }))).rows), [key(1)], 'o processo P-900 + ano');
  assert.deepEqual(keys((await page(await baseQuery({ ...all, numberGroups: ['11', '900'] }))).rows), [], 'número e processo são campos diferentes');
});

test('chaves: só as indicadas (os favoritos); chave fora do formato é ignorada, e sem nenhuma válida, nada', async () => {
  const all = { dataset: 'contratos', activeOn: null } as const;
  const some = await page(await baseQuery({ ...all, keys: [key(4), key(1), 'lixo', "x'; DROP TABLE contratos; --"] }));
  assert.deepEqual(keys(some.rows), [key(4), key(1)]);
  assert.equal(some.total, 2);
  assert.deepEqual(await page(await baseQuery({ ...all, keys: [] })), { rows: [], total: 0 });
  assert.deepEqual(await page(await baseQuery({ ...all, keys: ['lixo'] })), { rows: [], total: 0 });
});

test('detalhe e existência pela chave; chave fora do formato não consulta nada', async () => {
  const found = await store.reader.query((connection) => readContract(connection, key(1)));
  assert.equal(found?.contractObject, 'Limpeza e conservação predial');
  assert.equal(found?.globalValue, '300.00');
  assert.equal(found?.expiresOn, day(10));
  assert.equal((await store.reader.query((connection) => readContract(connection, key(5))))?.expiresOn, null);
  assert.equal(await store.reader.query((connection) => readContract(connection, '99999999999999-2-999999/2026')), null);
  assert.equal(await store.reader.query((connection) => readContract(connection, "1'; DROP TABLE x; --")), null);
  assert.equal(await store.reader.query((connection) => contractExists(connection, key(2))), true);
  assert.equal(await store.reader.query((connection) => contractExists(connection, '99999999999999-2-999999/2026')), false);
  assert.equal(await store.reader.query((connection) => contractExists(connection, 'lixo')), false);
});

test('contagem dos vigentes pelos critérios, no dia informado', async () => {
  const count = (criteria: Partial<ContractCriteria>, today: string) =>
    phrased(criteria).then((p) => store.reader.query((connection) => countActiveContracts(connection, p, today)));
  assert.equal(await count({ terms: ['limpeza'] }, TODAY), 3);
  assert.equal(await count({}, TODAY), 3);
  assert.equal(await count({ terms: ['limpeza'] }, day(6)), 2, 'o vencimento do dia 5 já passou');
  assert.equal(await count({ terms: ['limpeza'], states: ['SP'] }, TODAY), 2);
});

test('janelas de vencimento: as duas pontas entram; critérios ou chaves; na ordem do vencimento', async () => {
  const byCriteria = (criteria: Partial<ContractCriteria>, window: { from: number; to: number }) =>
    phrased(criteria).then((p) => store.reader.query((connection) => readExpiringByCriteria(connection, TODAY, window, p)));
  assert.deepEqual((await byCriteria({ terms: ['limpeza'] }, { from: 5, to: 10 })).map((item) => item.controlNumber), [key(2), key(1)]);
  assert.deepEqual((await byCriteria({ terms: ['limpeza'] }, { from: 6, to: 29 })).map((item) => item.controlNumber), [key(1)]);
  assert.deepEqual((await byCriteria({ terms: ['limpeza'] }, { from: 0, to: 30 })).map((item) => item.controlNumber), [key(2), key(1), key(3)]);
  assert.deepEqual(await byCriteria({ terms: ['limpeza'] }, { from: 31, to: 90 }), []);
  const [first] = await byCriteria({}, { from: 5, to: 5 });
  assert.deepEqual(first, { controlNumber: key(2), expiresOn: day(5), contractObject: 'Serviços de limpeza' });

  const byKeys = (list: string[], window: { from: number; to: number }) =>
    store.reader.query((connection) => readExpiringByKeys(connection, TODAY, window, list));
  assert.deepEqual((await byKeys([key(3), key(1), key(4), key(5)], { from: 0, to: 30 })).map((item) => item.controlNumber), [key(1), key(3)], 'o vencido e o sem vencimento não entram');
  assert.deepEqual(await byKeys([], { from: 0, to: 30 }), []);
  assert.deepEqual(await byKeys(['lixo'], { from: 0, to: 30 }), []);
});
