import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { InvalidCnpjError } from '../cnpj';
import type { TenderContractRow } from '../collector/contractMapping';
import {
  queryContractsAsAgency,
  queryContractsAsSupplier,
  queryStoreCoverage,
  queryTopAgenciesByContracts,
  queryTopSuppliersOfAgency,
} from './cnpjQueries';
import { openTestContractStore, sampleContract, sampleResult, sampleSupplier, type TestContractStore } from './storeTestSupport';

// As consultas do armazém para a página do CNPJ (cnpjQueries.ts) sobre um armazém de exemplo com contratos e vencedores.

const TODAY = '2026-10-19';
const day = (offset: number) => new Date(Date.UTC(2026, 9, 19 + offset)).toISOString().slice(0, 10);

const AG0 = '00394460005887';
const AG1 = '12345678000195';
const ALFA = '11222333000181';
const BETA = '99887766000155';
const PERSON = '***.123.456-**';

/** O ALFA tem 3 contratos (2 no AG0, 1 no AG1) e dois nomes; o AG0 tem 5 (o BETA, e duas pessoas físicas com o mesmo CPF mascarado). */
const contracts: TenderContractRow[] = [
  sampleContract(1, { agencyCnpj: AG0, agencyName: 'Prefeitura A (antigo)', supplierDocument: ALFA, supplierName: 'ALFA ANTIGO', globalValue: '100.00', expiresOn: day(10), originalTermEnd: day(10), publishedAt: '2026-01-10T10:00:00' }),
  sampleContract(2, { agencyCnpj: AG0, agencyName: 'Prefeitura A', supplierDocument: ALFA, supplierName: 'ALFA NOVO', globalValue: '250.50', expiresOn: day(-5), originalTermEnd: day(-5), publishedAt: '2026-03-10T09:00:00' }),
  sampleContract(3, { agencyCnpj: AG1, agencyName: 'Câmara B', supplierDocument: ALFA, supplierName: 'ALFA NOVO', globalValue: '40.00', expiresOn: null, originalTermEnd: null, publishedAt: '2026-02-01T08:00:00' }),
  sampleContract(4, { agencyCnpj: AG0, agencyName: 'Prefeitura A', supplierDocument: BETA, supplierName: 'BETA LTDA', globalValue: '500.00', expiresOn: day(30), originalTermEnd: day(30), publishedAt: '2026-02-15T12:00:00' }),
  sampleContract(5, { agencyCnpj: AG0, agencyName: 'Prefeitura A', supplierDocument: PERSON, supplierName: 'MARIA DA SILVA', supplierPersonType: 'PF', globalValue: '10.00', expiresOn: day(5), originalTermEnd: day(5), publishedAt: '2026-02-16T12:00:00' }),
  sampleContract(6, { agencyCnpj: AG0, agencyName: 'Prefeitura A', supplierDocument: PERSON, supplierName: 'JOSE PEREIRA', supplierPersonType: 'PF', globalValue: '20.00', expiresOn: day(6), originalTermEnd: day(6), publishedAt: '2026-02-17T12:00:00' }),
];

let withWinners: TestContractStore;
let withoutWinners: TestContractStore;

before(async () => {
  withWinners = await openTestContractStore(contracts, {
    winners: [
      sampleResult(1, { supplier: sampleSupplier(ALFA, 'ALFA NOVO'), resultDate: '2026-09-10' }),
      sampleResult(1, { supplier: sampleSupplier(BETA, 'BETA LTDA'), resultDate: '2026-09-20', purchaseControlNumber: `${AG0}-1-000011/2026` }),
    ],
  });
  withoutWinners = await openTestContractStore(contracts);
});

after(async () => {
  await withWinners.close();
  await withoutWinners.close();
});

test('contratos como fornecedor: total, vigentes, valor, datas e o nome do contrato mais recente', async () => {
  const summary = await withWinners.reader.query((connection) => queryContractsAsSupplier(connection, ALFA, TODAY));
  assert.deepEqual(summary, {
    name: 'ALFA NOVO',
    total: 3,
    active: 1,
    totalValue: '390.50',
    firstPublishedAt: '2026-01-10T10:00:00',
    lastPublishedAt: '2026-03-10T09:00:00',
  });
  assert.equal(typeof summary.total, 'number');
  const later = await withWinners.reader.query((connection) => queryContractsAsSupplier(connection, ALFA, day(11)));
  assert.equal(later.active, 0, 'o vencimento do dia 10 já passou; o contrato sem vencimento nunca é vigente');
  const onTheDay = await withWinners.reader.query((connection) => queryContractsAsSupplier(connection, ALFA, day(10)));
  assert.equal(onTheDay.active, 1, 'vence no próprio dia: ainda vigente');
});

test('fornecedor sem contratos, ou pessoa física: zeros e nome nulo', async () => {
  const empty = { name: null, total: 0, active: 0, totalValue: '0.00', firstPublishedAt: null, lastPublishedAt: null };
  assert.deepEqual(await withWinners.reader.query((connection) => queryContractsAsSupplier(connection, '55444333000122', TODAY)), empty);
  assert.deepEqual(await withWinners.reader.query((connection) => queryContractsAsSupplier(connection, '11222333000180', TODAY)), empty, 'o CNPJ vizinho não pega o ALFA');
});

test('contratos como órgão: o AG0 e o AG1, com o nome mais recente do órgão', async () => {
  assert.deepEqual(await withWinners.reader.query((connection) => queryContractsAsAgency(connection, AG0, TODAY)), {
    name: 'Prefeitura A',
    total: 5,
    active: 4,
    totalValue: '880.50',
    firstPublishedAt: '2026-01-10T10:00:00',
    lastPublishedAt: '2026-03-10T09:00:00',
  });
  const small = await withWinners.reader.query((connection) => queryContractsAsAgency(connection, AG1, TODAY));
  assert.deepEqual([small.name, small.total, small.active, small.totalValue], ['Câmara B', 1, 0, '40.00']);
  assert.equal((await withWinners.reader.query((connection) => queryContractsAsAgency(connection, ALFA, TODAY))).total, 0, 'o ALFA não é órgão');
});

test('principais órgãos do fornecedor: pelo valor, depois pelo número de contratos, com o nome mais recente', async () => {
  const agencies = await withWinners.reader.query((connection) => queryTopAgenciesByContracts(connection, ALFA));
  assert.deepEqual(agencies, [
    { cnpj: AG0, name: 'Prefeitura A', contracts: 2, totalValue: '350.50' },
    { cnpj: AG1, name: 'Câmara B', contracts: 1, totalValue: '40.00' },
  ]);
  assert.equal((await withWinners.reader.query((connection) => queryTopAgenciesByContracts(connection, ALFA, 1))).length, 1);
  assert.equal((await withWinners.reader.query((connection) => queryTopAgenciesByContracts(connection, ALFA, 0))).length, 1, 'limite fora da faixa vira o mais próximo');
  assert.deepEqual(await withWinners.reader.query((connection) => queryTopAgenciesByContracts(connection, '55444333000122')), []);
});

test('principais fornecedores do órgão: pelo valor; pessoa física (CPF mascarado) fica fora', async () => {
  const suppliers = await withWinners.reader.query((connection) => queryTopSuppliersOfAgency(connection, AG0));
  assert.deepEqual(suppliers, [
    { cnpj: BETA, name: 'BETA LTDA', contracts: 1, totalValue: '500.00' },
    { cnpj: ALFA, name: 'ALFA NOVO', contracts: 2, totalValue: '350.50' },
  ]);
  assert.deepEqual(await withWinners.reader.query((connection) => queryTopSuppliersOfAgency(connection, ALFA)), []);
});

test('cobertura: a primeira publicação dos contratos e o intervalo dos resultados; sem vencedores, nulos', async () => {
  assert.deepEqual(await withWinners.reader.query((connection) => queryStoreCoverage(connection)), {
    contractsFrom: '2026-01-10',
    winnersFrom: '2026-09-10',
    winnersTo: '2026-09-20',
  });
  assert.deepEqual(await withoutWinners.reader.query((connection) => queryStoreCoverage(connection)), {
    contractsFrom: '2026-01-10',
    winnersFrom: null,
    winnersTo: null,
  });
});

test('CNPJ fora do formato é recusado antes de virar consulta', async () => {
  for (const invalid of ['1122233300018A', '1122233300018', '11.222.333/0001-81', '', `${ALFA}' OR '1'='1`]) {
    await assert.rejects(withWinners.reader.query((connection) => queryContractsAsSupplier(connection, invalid, TODAY)), InvalidCnpjError, invalid);
    await assert.rejects(withWinners.reader.query((connection) => queryContractsAsAgency(connection, invalid, TODAY)), InvalidCnpjError, invalid);
    await assert.rejects(withWinners.reader.query((connection) => queryTopAgenciesByContracts(connection, invalid)), InvalidCnpjError, invalid);
    await assert.rejects(withWinners.reader.query((connection) => queryTopSuppliersOfAgency(connection, invalid)), InvalidCnpjError, invalid);
  }
});
