import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { InvalidCnpjError } from '../cnpj';
import type { TenderContractRow } from '../collector/contractMapping';
import { queryCompetitorSummaries, queryContractsPublishedSince } from './competitorQueries';
import { openTestContractStore, sampleContract, type TestContractStore } from './storeTestSupport';

// As consultas do armazém dos concorrentes monitorados (competitorQueries.ts), sobre um armazém de exemplo: o resumo de
// cada CNPJ em lote e os contratos publicados desde um dia.

const TODAY = '2026-10-19';
const day = (offset: number) => new Date(Date.UTC(2026, 9, 19 + offset)).toISOString().slice(0, 10);

const ALFA = '11222333000181';
const BETA = '99887766000155';
/** Monitorado, mas sem contrato nenhum. */
const GAMA = '55444333000122';
/** Fornecedor que ninguém pediu. */
const OUTRO = '22493902000140';
const PERSON = '***.123.456-**';
const FEDERAL_KEY = 'comprasgov-153254-50-00586/2023';

const contracts: TenderContractRow[] = [
  sampleContract(1, { supplierDocument: ALFA, supplierName: 'Alfa Antiga Ltda', publishedAt: '2026-08-01T10:00:00', expiresOn: null, originalTermEnd: null, contractObject: 'Serviço antigo' }),
  sampleContract(2, { supplierDocument: ALFA, supplierName: 'Alfa Ltda', publishedAt: '2026-09-25T10:00:00', expiresOn: day(-5), originalTermEnd: day(-5), contractObject: 'Limpeza predial' }),
  sampleContract(3, { supplierDocument: ALFA, supplierName: 'Alfa Ltda', publishedAt: '2026-10-18T09:00:00', expiresOn: day(30), contractObject: 'Manutenção de elevadores' }),
  sampleContract(4, { supplierDocument: BETA, supplierName: 'Beta SA', publishedAt: '2026-10-19T00:00:00', expiresOn: day(10), contractObject: 'Material de escritório' }),
  sampleContract(5, { supplierDocument: BETA, supplierName: 'Beta Antiga SA', publishedAt: '2026-03-01T10:00:00', expiresOn: day(200), contractObject: 'Papel' }),
  sampleContract(6, { supplierDocument: OUTRO, supplierName: 'Outro Ltda', publishedAt: '2026-10-19T08:00:00' }),
  sampleContract(7, { supplierDocument: PERSON, supplierName: 'Pessoa Física', publishedAt: '2026-10-19T08:00:00' }),
  // Contrato federal do Compras.gov.br: a chave não é o número de controle do PNCP, mas é uma chave válida.
  sampleContract(8, { pncpControlNumber: FEDERAL_KEY, supplierDocument: ALFA, supplierName: 'Alfa Ltda', publishedAt: '2026-10-19T12:00:00', contractObject: 'Contrato federal' }),
];
const key = (sequence: number) => sampleContract(sequence).pncpControlNumber;

let store: TestContractStore;

before(async () => {
  store = await openTestContractStore(contracts);
});

after(async () => {
  await store.close();
});

const summaries = async (cnpjs: string[], recentSince = day(-30)) =>
  (await store.reader.query((connection) => queryCompetitorSummaries(connection, cnpjs, TODAY, recentSince))).sort((a, b) => a.cnpj.localeCompare(b.cnpj));
const published = async (cnpjs: string[], since: string) => store.reader.query((connection) => queryContractsPublishedSince(connection, cnpjs, since));

test('resumo: total, vigentes, recentes, última publicação e o nome do contrato mais recente, por CNPJ e numa consulta só', async () => {
  assert.deepEqual(await summaries([ALFA, BETA, GAMA]), [
    { cnpj: ALFA, name: 'Alfa Ltda', total: 4, active: 2, recent: 3, lastPublishedAt: '2026-10-19T12:00:00' },
    { cnpj: BETA, name: 'Beta SA', total: 2, active: 2, recent: 1, lastPublishedAt: '2026-10-19T00:00:00' },
  ]);
});

test('resumo: CNPJ sem contrato não volta (quem chama completa com zeros); só os CNPJs pedidos entram', async () => {
  assert.deepEqual(await summaries([GAMA]), []);
  assert.deepEqual(
    (await summaries([OUTRO])).map((row) => [row.cnpj, row.total]),
    [[OUTRO, 1]],
  );
  assert.deepEqual(await summaries([]), []);
});

test('resumo: a janela dos recentes é de `recentSince` em diante, o dia inteiro', async () => {
  const recent = async (since: string) => (await summaries([ALFA], since))[0]?.recent;
  assert.equal(await recent('2026-10-19'), 1, 'só o federal, de 12:00 do dia 19');
  assert.equal(await recent('2026-10-18'), 2, 'o do dia 18 às 09:00 e o do dia 19');
  assert.equal(await recent('2026-10-20'), 0);
  assert.equal(await recent('2026-01-01'), 4);
});

test('CNPJ fora do formato recusa a consulta inteira: nada de CPF mascarado, texto nem tentativa de injeção', async () => {
  for (const invalid of [PERSON, 'lixo', `${ALFA}') OR true --`, '1122233300018']) {
    await assert.rejects(summaries([ALFA, invalid]), InvalidCnpjError, invalid);
    await assert.rejects(published([ALFA, invalid], '2026-10-01'), InvalidCnpjError, invalid);
  }
});

test('publicados desde um dia: do dia em diante (o dia inteiro), por CNPJ e pela publicação; a chave federal vale', async () => {
  const since18 = await published([ALFA, BETA, GAMA], '2026-10-18');
  assert.deepEqual(
    since18.map((item) => [item.supplierCnpj, item.controlNumber, item.publishedOn]),
    [
      [ALFA, key(3), '2026-10-18'],
      [ALFA, FEDERAL_KEY, '2026-10-19'],
      [BETA, key(4), '2026-10-19'],
    ],
  );
  assert.deepEqual(since18[0], {
    controlNumber: key(3),
    contractObject: 'Manutenção de elevadores',
    supplierCnpj: ALFA,
    supplierName: 'Alfa Ltda',
    publishedOn: '2026-10-18',
  });
  assert.deepEqual((await published([ALFA, BETA], '2026-10-19')).map((item) => item.controlNumber), [FEDERAL_KEY, key(4)]);
  assert.deepEqual(await published([ALFA, BETA], '2026-10-20'), []);
  assert.deepEqual((await published([BETA], '2026-01-01')).map((item) => item.controlNumber), [key(5), key(4)], 'mais antigo primeiro');
});

test('publicados desde um dia: só os CNPJs pedidos; lista vazia não consulta', async () => {
  assert.deepEqual((await published([OUTRO], '2026-10-01')).map((item) => item.supplierCnpj), [OUTRO]);
  assert.deepEqual(await published([GAMA], '2026-01-01'), []);
  assert.deepEqual(await published([], '2026-01-01'), []);
});
