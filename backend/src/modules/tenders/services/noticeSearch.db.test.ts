import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertSavedSearch,
  insertTestNotice,
  trackNotice,
  withRollback,
} from '../collector/dbTestSupport';
import { requesterOf, uniqueToken, type TestAccount } from './apiTestSupport';
import { criteriaOnlyFilters, EMPTY_CRITERIA, searchNotices, type NoticeCriteria, type NoticeSearchFilters } from './noticeSearch';
import { parseSearchText } from './searchText';

// Busca da tela (escopo, seção 8.1). Cada teste usa uma palavra única nos
// objetos, para a base local (com editais reais) não interferir.

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function filtersFor(token: string, overrides: Partial<NoticeSearchFilters> = {}, criteria: Partial<NoticeCriteria> = {}): NoticeSearchFilters {
  return {
    ...criteriaOnlyFilters({ ...EMPTY_CRITERIA, terms: [token], ...criteria }, 100),
    hideDiscarded: true,
    ...overrides,
  };
}

async function idsOf(tx: TendersDb, accountId: number, filters: NoticeSearchFilters): Promise<number[]> {
  const result = await searchNotices(tx, accountId, filters);
  return result.items.map((item) => item.id);
}

describe('busca de editais (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('texto: frase, exclusão, modos E e OU, singular e plural, trecho destacado', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-texto');
      const token = uniqueToken();
      const software = await insertTestNotice(tx, { procurementObject: `Licença de softwares de gestão tributária ${token}` });
      const printer = await insertTestNotice(tx, { procurementObject: `Locação de impressoras e software ${token}` });

      const parsed = parseSearchText(`${token} "gestão tributária" -impressora`);
      const result = await searchNotices(tx, account.accountId, filtersFor(token, {}, parsed));
      assert.deepEqual(result.items.map((item) => item.id), [software]);
      assert.match(result.items[0]?.highlightedExcerpt ?? '', /<<gestão>> <<tributária>>/);

      assert.deepEqual(
        (await idsOf(tx, account.accountId, filtersFor(token, {}, { terms: [token, 'software'], termsMode: 'E' }))).sort(),
        [software, printer].sort(),
        'software também acha softwares',
      );
      assert.deepEqual(
        await idsOf(tx, account.accountId, filtersFor(token, {}, { terms: [token, 'impressora'], termsMode: 'E' })),
        [printer],
      );
      assert.deepEqual(
        (await idsOf(tx, account.accountId, filtersFor(token, {}, { terms: [`${token} tributária`, `${token} impressoras`], termsMode: 'OU' }))).length,
        0,
        'frase exige a ordem das palavras',
      );
    });
  });

  test('UF, modalidade, órgão, município, valor e "incluir sem valor"', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-filtros');
      const token = uniqueToken();
      const base = { procurementObject: `Aquisição ${token}` };
      const maPregao = await insertTestNotice(tx, {
        ...base,
        state: 'MA',
        modalityId: 6,
        agencyCnpj: '06307102000130',
        cityIbgeCode: '2111300',
        estimatedTotalValue: '50000.00',
      });
      const piDispensa = await insertTestNotice(tx, { ...base, state: 'PI', modalityId: 8, estimatedTotalValue: '500000.00' });
      const withoutValue = await insertTestNotice(tx, { ...base, state: 'MA', modalityId: 6, estimatedTotalValue: null });

      assert.deepEqual((await idsOf(tx, account.accountId, filtersFor(token, {}, { states: ['MA'] }))).sort(), [maPregao, withoutValue].sort());
      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, {}, { modalities: [8] })), [piDispensa]);
      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, {}, { agencyCnpjs: ['06307102000130'] })), [maPregao]);
      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, {}, { cityIbgeCodes: ['2111300'] })), [maPregao]);
      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, {}, { minValue: '100000' })), [piDispensa]);
      assert.deepEqual(
        (await idsOf(tx, account.accountId, filtersFor(token, {}, { minValue: '100000', includeWithoutValue: true }))).sort(),
        [piDispensa, withoutValue].sort(),
      );
    });
  });

  test('só abertos por padrão; períodos de publicação e encerramento em dias de Brasília', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-datas');
      const token = uniqueToken();
      const closed = await insertTestNotice(tx, { procurementObject: `Edital ${token}`, proposalClosesAt: inDays(-1) });
      const suspended = await insertTestNotice(tx, { procurementObject: `Edital ${token}`, situationId: 4 });
      const october = await insertTestNotice(tx, {
        procurementObject: `Edital ${token}`,
        publishedAt: '2026-10-01T23:30:00',
        proposalClosesAt: '2099-10-20T10:00:00',
      });

      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token)), [october]);
      assert.deepEqual(
        (await idsOf(tx, account.accountId, filtersFor(token, { openOnly: false }))).sort(),
        [closed, suspended, october].sort(),
      );
      assert.deepEqual(
        await idsOf(tx, account.accountId, filtersFor(token, { publishedFrom: '2026-10-01', publishedTo: '2026-10-01' })),
        [october],
        '23:30 de Brasília ainda é dia 1º',
      );
      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, { publishedFrom: '2026-10-02' })), []);
      assert.deepEqual(
        await idsOf(tx, account.accountId, filtersFor(token, { closingFrom: '2099-10-20', closingTo: '2099-10-20' })),
        [october],
      );
    });
  });

  test('acompanhamento: status da conta no item, filtro por status, sem acompanhamento e ocultar descartados', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-acomp');
      const other = await createTestAccount(tx, 'busca-acomp-outra');
      const token = uniqueToken();
      const analyzing = await insertTestNotice(tx, { procurementObject: `Edital ${token}` });
      const discarded = await insertTestNotice(tx, { procurementObject: `Edital ${token}` });
      const untracked = await insertTestNotice(tx, { procurementObject: `Edital ${token}` });
      await trackNotice(tx, { accountId: account.accountId, noticeId: analyzing, status: 'ANALISAR', userId: account.ownerId });
      await trackNotice(tx, { accountId: account.accountId, noticeId: discarded, status: 'DESCARTADO', userId: account.ownerId });
      await trackNotice(tx, { accountId: other.accountId, noticeId: untracked, status: 'PARTICIPAR', userId: other.ownerId });

      const all = await searchNotices(tx, account.accountId, filtersFor(token));
      assert.deepEqual(all.items.map((item) => item.id).sort(), [analyzing, untracked].sort(), 'descartado oculto por padrão');
      assert.equal(all.items.find((item) => item.id === analyzing)?.tracking?.status, 'ANALISAR');
      assert.equal(all.items.find((item) => item.id === untracked)?.tracking, null, 'acompanhamento de outra conta não aparece');

      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, { trackingStatuses: ['SEM'] })), [untracked]);
      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, { trackingStatuses: ['DESCARTADO'] })), [discarded]);
      assert.deepEqual(
        (await idsOf(tx, account.accountId, filtersFor(token, { hideDiscarded: false }))).length,
        3,
      );
    });
  });

  test('ordenações e paginação', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-ordem');
      const token = uniqueToken();
      const soon = await insertTestNotice(tx, {
        procurementObject: `Edital ${token}`,
        proposalClosesAt: inDays(2),
        publishedAt: '2026-09-01T10:00:00',
        estimatedTotalValue: '300.00',
      });
      const later = await insertTestNotice(tx, {
        procurementObject: `Edital ${token} ${token}`,
        proposalClosesAt: inDays(20),
        publishedAt: '2026-10-01T10:00:00',
        estimatedTotalValue: '100.00',
      });
      const noDeadline = await insertTestNotice(tx, {
        procurementObject: `Edital ${token}`,
        proposalClosesAt: null,
        publishedAt: '2026-08-01T10:00:00',
        estimatedTotalValue: null,
      });

      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, { sort: 'closingAsc' })), [soon, later, noDeadline]);
      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, { sort: 'publishedDesc' })), [later, soon, noDeadline]);
      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, { sort: 'valueDesc' })), [soon, later, noDeadline]);
      assert.deepEqual(await idsOf(tx, account.accountId, filtersFor(token, { sort: 'valueAsc' })), [later, soon, noDeadline]);
      assert.equal((await idsOf(tx, account.accountId, filtersFor(token, { sort: 'relevance' })))[0], later, 'termo repetido pesa mais');

      const page2 = await searchNotices(tx, account.accountId, filtersFor(token, { perPage: 2, page: 2 }));
      assert.deepEqual(page2.items.map((item) => item.id), [noDeadline]);
      assert.equal(page2.total, 3);
      assert.equal(page2.totalPages, 2);
      assert.equal(page2.page, 2);
    });
  });

  test('item da lista: datas em ISO de Brasília e valor numérico', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-item');
      const token = uniqueToken();
      await insertTestNotice(tx, {
        procurementObject: `Edital ${token}`,
        proposalClosesAt: '2099-10-20T09:30:00',
        estimatedTotalValue: '200895.14',
      });
      const [item] = (await searchNotices(tx, account.accountId, filtersFor(token))).items;
      assert.equal(item?.proposalClosesAt, '2099-10-20T09:30:00-03:00');
      assert.equal(item?.estimatedTotalValue, 200895.14);
      assert.equal(item?.highlightedExcerpt, `Edital <<${token}>>`);

      const withoutTerms = await searchNotices(tx, account.accountId, {
        ...filtersFor(token),
        criteria: { ...EMPTY_CRITERIA, states: ['ZZ'] },
      });
      assert.equal(withoutTerms.total, 0, 'UF inexistente não traz nada');
    });
  });

  // Paridade (escopo, seção 7.3): a busca da tela, com os mesmos critérios de
  // uma busca salva, traz os mesmos editais que licitacoes.fn_edital_bate.
  test('paridade: busca da tela × busca salva com os mesmos critérios', async () => {
    await withRollback(async (tx) => {
      const account: TestAccount = await createTestAccount(tx, 'busca-paridade');
      const token = uniqueToken();
      const notices = [
        { procurementObject: `Sistema de gestão de licitações ${token}`, state: 'MA', modalityId: 6, estimatedTotalValue: '80000.00' },
        { procurementObject: `Licitação de materiais ${token}`, state: 'PI', modalityId: 8, estimatedTotalValue: null },
        { procurementObject: `Software de gestão ${token}`, state: 'MA', modalityId: 6, estimatedTotalValue: '900000.00', isPriceRegistration: true },
        { procurementObject: `Impressoras e licitações ${token}`, state: 'MA', modalityId: 4, estimatedTotalValue: '1000.00' },
        { procurementObject: `Encerrado ${token} licitação`, state: 'MA', modalityId: 6, proposalClosesAt: inDays(-2) },
        { procurementObject: `Suspenso ${token} licitação`, state: 'MA', modalityId: 6, situationId: 4 },
      ];
      for (const notice of notices) {
        await insertTestNotice(tx, notice);
      }

      const criteriaSets: Array<Partial<NoticeCriteria>> = [
        { terms: [token] },
        { terms: [token, 'licitação'], termsMode: 'E' },
        { terms: [`gestão ${token}`, `licitações ${token}`], termsMode: 'OU' },
        { terms: [token], excludedTerms: ['impressora'] },
        { terms: [token], states: ['MA'], modalities: [6] },
        { terms: [token], minValue: '50000', maxValue: '100000' },
        { terms: [token], minValue: '50000', includeWithoutValue: true },
        { terms: [token], priceRegistration: true },
      ];

      for (const partial of criteriaSets) {
        const criteria: NoticeCriteria = { ...EMPTY_CRITERIA, ...partial };
        const screen = await idsOf(tx, account.accountId, criteriaOnlyFilters(criteria, 100));
        const searchId = await insertSavedSearch(tx, {
          ...requesterOf(account),
          terms: criteria.terms,
          termsMode: criteria.termsMode,
          excludedTerms: criteria.excludedTerms,
          states: criteria.states,
          modalities: criteria.modalities,
          minValue: criteria.minValue,
          maxValue: criteria.maxValue,
          includeWithoutValue: criteria.includeWithoutValue,
          onlyPriceRegistration: criteria.priceRegistration,
        });
        const saved = await tx.execute<{ id: string }>(sql`
          SELECT e.id FROM licitacoes.edital e, licitacoes.busca_salva b
           WHERE b.id = ${searchId} AND e.objeto ILIKE ${`%${token}%`} AND licitacoes.fn_edital_bate(e, b)`);
        assert.deepEqual(
          screen.sort((a, b) => a - b),
          saved.rows.map((row) => Number(row.id)).sort((a, b) => a - b),
          `critérios: ${JSON.stringify(partial)}`,
        );
      }
    });
  });
});
