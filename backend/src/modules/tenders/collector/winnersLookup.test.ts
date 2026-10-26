import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { ContractStoreReader } from '../contractStore/reader';
import { InvalidWinnerCnpjError } from '../contractStore/winnerQueries';
import {
  publishWinnersWith,
  quietLogger,
  samplePurchase,
  sampleResult,
  sampleSupplier,
  withTempDirectory,
} from '../contractStore/storeTestSupport';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { lookupWinners, purchaseLink } from './winnersLookup';

// Consulta de vencedores por CNPJ (comando winners-lookup) sobre um armazém de exemplo no R2 simulado; a consulta dos
// editais no banco é trocada por uma função de teste.

const ALFA = sampleSupplier('11222333000181', 'ALFA LTDA');

test('endereço da compra: o CNPJ do órgão, o ano e o sequencial sem zeros à esquerda', () => {
  assert.equal(purchaseLink('03353358000196-1-000216/2026'), 'https://pncp.gov.br/app/editais/03353358000196/2026/216');
  assert.equal(purchaseLink('00394460005887-1-1234567/2021'), 'https://pncp.gov.br/app/editais/00394460005887/2021/1234567');
  assert.equal(purchaseLink('formato-diferente'), '');
});

test('relatório do fornecedor: resumo, órgãos, vitórias recentes com o edital ligado só onde ele existe', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await publishWinnersWith(storage, join(directory, 'gravacao'), 1, async (writer) => {
      await writer.apply([
        sampleResult(1, { purchaseControlNumber: samplePurchase(1), supplier: ALFA, valueCents: 100_000, resultDate: '2026-09-10' }),
        sampleResult(2, { purchaseControlNumber: samplePurchase(1), supplier: ALFA, valueCents: 50_000, resultDate: '2026-09-11' }),
        sampleResult(1, { purchaseControlNumber: samplePurchase(2), supplier: ALFA, valueCents: 20_000, resultDate: '2026-09-20' }),
        sampleResult(1, { purchaseControlNumber: samplePurchase(3), supplier: sampleSupplier('99887766000155', 'BETA LTDA') }),
      ]);
    });
    const reader = await ContractStoreReader.create({ storage, directory: join(directory, 'leitura'), logger: quietLogger, datasets: ['vencedores'] });
    try {
      await reader.refresh();
      const asked: string[][] = [];
      const report = await lookupWinners(
        {
          store: reader,
          noticeIds: async (controlNumbers) => {
            asked.push([...controlNumbers]);
            return new Map([[samplePurchase(2), 77]]);
          },
        },
        ALFA.key,
        10,
      );

      assert.equal(report.cnpj, ALFA.key);
      assert.equal(report.store.winnerRows, 3, 'três linhas no armazém: duas do ALFA (a compra 1 tem dois itens) e uma do BETA');
      assert.ok(report.store.revision);
      assert.equal(report.summary.purchases, 2);
      assert.equal(report.summary.items, 3);
      assert.equal(report.summary.totalValue, '1700.00');
      assert.deepEqual(report.agencies.map((agency) => [agency.agencyCnpj, agency.purchases, agency.totalValue]), [['00394460005887', 2, '1700.00']]);
      assert.deepEqual(
        report.recentWins.map((win) => [win.purchaseControlNumber, win.noticeId]),
        [[samplePurchase(2), 77], [samplePurchase(1), null]],
        'a mais recente primeiro, com o edital só na que existe no banco',
      );
      assert.equal(report.recentWins[1]?.link, purchaseLink(samplePurchase(1)));
      assert.deepEqual(asked, [[samplePurchase(2), samplePurchase(1)]], 'uma consulta de editais só, em lote');

      // O limite corta a lista, e o resumo continua inteiro.
      const limited = await lookupWinners({ store: reader, noticeIds: async () => new Map() }, ALFA.key, 1);
      assert.equal(limited.recentWins.length, 1);
      assert.equal(limited.summary.purchases, 2);
    } finally {
      await reader.close();
    }
  });
});

test('fornecedor sem vitórias e CNPJ inválido', async () => {
  await withTempDirectory(async (directory) => {
    const { storage } = createMemoryStorage();
    await publishWinnersWith(storage, join(directory, 'gravacao'), 1, async (writer) => void (await writer.apply([sampleResult(1)])));
    const reader = await ContractStoreReader.create({ storage, directory: join(directory, 'leitura'), logger: quietLogger, datasets: ['vencedores'] });
    try {
      await reader.refresh();
      const none = await lookupWinners({ store: reader, noticeIds: async () => new Map() }, '55444333000122');
      assert.equal(none.summary.purchases, 0);
      assert.deepEqual(none.recentWins, []);
      await assert.rejects(lookupWinners({ store: reader, noticeIds: async () => new Map() }, '1122'), InvalidWinnerCnpjError);
    } finally {
      await reader.close();
    }
  });
});
