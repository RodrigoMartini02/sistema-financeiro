import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import { closeLocalTestDatabase, databaseTestsSkipReason, insertTestNotice, withRollback } from '../collector/dbTestSupport';
import { PncpRequestError, type PncpDetailList } from '../collector/pncpClient';
import { tenderDetailCache } from '../db/schema';
import { uniqueToken } from './apiTestSupport';
import { DETAIL_PAGE_SIZE, getNoticeFiles, getNoticeItems, type PncpDetailSource } from './pncpDetails';

// Itens e arquivos do PNCP com cache de 24 h (escopo, seção 8.1), com o PNCP
// simulado a partir de respostas reais (collector/fixtures).

function fixture(name: string): unknown[] {
  return JSON.parse(readFileSync(path.join(__dirname, '..', 'collector', 'fixtures', name), 'utf8')) as unknown[];
}

type Reply = unknown[] | null | Error;

function fakeSource(replies: Reply[]): PncpDetailSource & { calls: Array<{ list: PncpDetailList; page: number }> } {
  const queue = [...replies];
  const calls: Array<{ list: PncpDetailList; page: number }> = [];
  return {
    calls,
    async fetchDetailList(list, _purchase, page) {
      calls.push({ list, page });
      const reply = queue.shift();
      if (reply === undefined) {
        throw new Error('PNCP simulado sem resposta preparada');
      }
      if (reply instanceof Error) {
        throw reply;
      }
      return reply;
    },
  };
}

const unavailable = () => new PncpRequestError('PNCP falhou após 2 tentativa(s): HTTP 503', { endpoint: 'itens', page: 1, attempts: 2, status: 503 });
const purchase = { agencyCnpj: '46634184000142', purchaseYear: 2026, purchaseSequence: 129 };

describe('itens e arquivos do PNCP (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('itens: mapeados da resposta real e guardados por 24 h', async () => {
    await withRollback(async (tx) => {
      const noticeId = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}`, ...purchase });
      const source = fakeSource([fixture('pncp-itens.json')]);

      const first = await getNoticeItems(tx, source, noticeId);
      assert.equal(first.foundOnPncp, true);
      assert.equal(first.stale, false);
      assert.equal(first.hasMore, false);
      assert.equal(first.records.length, 3);
      assert.deepEqual(first.records[0], {
        number: 1,
        description: 'Acebrofilina concentração: 5, forma farmaceutica: xarope',
        kind: 'Material',
        quantity: 900,
        unit: 'Frasco ML',
        estimatedUnitValue: 5.24,
        estimatedTotalValue: 4716,
        confidentialBudget: false,
        situationName: 'Em andamento',
        judgmentCriterionName: 'Menor preço',
      });

      const second = await getNoticeItems(tx, source, noticeId);
      assert.equal(second.records.length, 3);
      assert.equal(source.calls.length, 1, 'a segunda leitura vem do cache');
    });
  });

  test('arquivos: lista com título, tipo, link e data de publicação', async () => {
    await withRollback(async (tx) => {
      const noticeId = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}`, ...purchase });
      const files = await getNoticeFiles(tx, fakeSource([fixture('pncp-arquivos.json')]), noticeId);
      assert.equal(files.records.length, 3);
      assert.deepEqual(files.records[0], {
        sequence: 1,
        title: 'EDITAL',
        typeName: 'Edital',
        url: 'https://pncp.gov.br/pncp-api/v1/orgaos/46634184000142/compras/2026/129/arquivos/1',
        publishedAt: '2026-10-05T16:49:05-03:00',
      });
    });
  });

  test('cache vencido e PNCP fora: volta a cópia marcada como desatualizada; sem cópia, 503', async () => {
    await withRollback(async (tx) => {
      const noticeId = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}`, ...purchase });
      await getNoticeItems(tx, fakeSource([fixture('pncp-itens.json')]), noticeId);
      await tx
        .update(tenderDetailCache)
        .set({ fetchedAt: sql`now() - interval '25 hours'` })
        .where(eq(tenderDetailCache.noticeId, noticeId));

      const stale = await getNoticeItems(tx, fakeSource([unavailable()]), noticeId);
      assert.equal(stale.stale, true);
      assert.equal(stale.records.length, 3);

      const refreshed = await getNoticeItems(tx, fakeSource([[]]), noticeId);
      assert.equal(refreshed.stale, false);
      assert.equal(refreshed.records.length, 0, 'cache vencido é renovado quando o PNCP responde');

      const withoutCache = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}`, ...purchase });
      await assert.rejects(
        getNoticeFiles(tx, fakeSource([unavailable()]), withoutCache),
        (error: unknown) => error instanceof RequestInputError && error.status === 503,
      );
    });
  });

  test('compra que o PNCP ainda não tem: lista vazia, sem guardar no cache', async () => {
    await withRollback(async (tx) => {
      const noticeId = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}`, ...purchase });
      const source = fakeSource([null, fixture('pncp-itens.json')]);
      const missing = await getNoticeItems(tx, source, noticeId);
      assert.equal(missing.foundOnPncp, false);
      assert.deepEqual(missing.records, []);
      const later = await getNoticeItems(tx, source, noticeId);
      assert.equal(later.foundOnPncp, true);
      assert.equal(later.records.length, 3);
    });
  });

  test('página cheia busca a seguinte; duas cheias marcam que há mais no PNCP', async () => {
    await withRollback(async (tx) => {
      const noticeId = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}`, ...purchase });
      const [sample] = fixture('pncp-itens.json');
      const fullPage = Array.from({ length: DETAIL_PAGE_SIZE }, (_, index) => ({ ...(sample as object), numeroItem: index + 1 }));
      const source = fakeSource([fullPage, fullPage]);
      const items = await getNoticeItems(tx, source, noticeId);
      assert.equal(items.records.length, DETAIL_PAGE_SIZE * 2);
      assert.equal(items.hasMore, true);
      assert.deepEqual(source.calls.map((call) => call.page), [1, 2]);
    });
  });

  test('edital sem os dados da compra ou inexistente', async () => {
    await withRollback(async (tx) => {
      const withoutPurchase = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}`, agencyCnpj: null });
      const source = fakeSource([]);
      assert.equal((await getNoticeItems(tx, source, withoutPurchase)).foundOnPncp, false);
      assert.equal(source.calls.length, 0);
      await assert.rejects(
        getNoticeItems(tx, source, 999_999_999),
        (error: unknown) => error instanceof RequestInputError && error.status === 404,
      );
    });
  });
});
