import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { tenderContractFavorites } from '../db/schema';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, insertTestContract, withRollback } from '../collector/dbTestSupport';
import { requesterOf, uniqueToken } from './apiTestSupport';
import { countActiveMatchesBySearch, createContractSavedSearch } from './contractSavedSearches';
import {
  EMPTY_CONTRACT_CRITERIA,
  contractCriteriaOnlyFilters,
  searchContracts,
  type ContractCriteria,
  type ContractSearchFilters,
} from './contractSearch';
import { numberGroupsOf } from './noticeSearch';

// Busca de contratos (plano dos contratos a vencer, Parte B), no banco local:
// cada filtro, só vigentes, "Só favoritos" com os vencidos, ordenações e a
// paridade com a busca salva. Os contratos de teste têm palavra e números
// próprios, porque o banco local tem os contratos do piloto.

const FUTURE = '2030-06-30';
const PAST = '2025-01-31';

const randomCnpj = () => String(randomInt(10 ** 13, 10 ** 14 - 1));

function filtersFor(criteria: Partial<ContractCriteria>, overrides: Partial<ContractSearchFilters> = {}): ContractSearchFilters {
  return { ...contractCriteriaOnlyFilters({ ...EMPTY_CONTRACT_CRITERIA, ...criteria }, 100), ...overrides };
}

async function idsFor(tx: TendersDb, accountId: { accountId: number; userId: number }, filters: ContractSearchFilters): Promise<number[]> {
  const result = await searchContracts(tx, accountId, filters);
  return result.items.map((item) => item.id);
}

describe('busca de contratos (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('termos E e OU, exclusão e trecho destacado', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-termos');
      const token = uniqueToken();
      // Órgão próprio: o OU sem a palavra do teste acharia os contratos reais do piloto.
      const agency = randomCnpj();
      const cleaning = await insertTestContract(tx, { contractObject: `Limpeza predial ${token}`, agencyCnpj: agency, expiresOn: FUTURE });
      const security = await insertTestContract(tx, { contractObject: `Vigilância armada ${token}`, agencyCnpj: agency, expiresOn: FUTURE });
      await insertTestContract(tx, { contractObject: `Obra ${token}`, agencyCnpj: agency, expiresOn: FUTURE });
      const requester = requesterOf(account);

      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token, 'limpeza'], termsMode: 'E' })), [cleaning]);
      assert.deepEqual(
        (await idsFor(tx, requester, filtersFor({ terms: ['limpeza', 'vigilância'], termsMode: 'OU', agencyCnpjs: [agency] }))).sort(
          (a, b) => a - b,
        ),
        [cleaning, security].sort((a, b) => a - b),
      );
      assert.deepEqual(
        (await idsFor(tx, requester, filtersFor({ terms: [token], excludedTerms: ['vigilância', 'obra'] }))),
        [cleaning],
      );
      const [item] = (await searchContracts(tx, requester, filtersFor({ terms: [token, 'limpeza'], termsMode: 'E' }))).items;
      assert.match(item?.highlightedExcerpt ?? '', /<<Limpeza>>/);
    });
  });

  test('só vigentes; "Só favoritos" traz também o favorito vencido', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-vigentes');
      const token = uniqueToken();
      const active = await insertTestContract(tx, { contractObject: `Coleta de lixo ${token}`, expiresOn: FUTURE });
      const expired = await insertTestContract(tx, {
        contractObject: `Coleta de lixo ${token}`,
        termStart: '2024-01-01',
        originalTermEnd: PAST,
        expiresOn: PAST,
      });
      const requester = requesterOf(account);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token] })), [active]);

      await tx.insert(tenderContractFavorites).values([
        { accountId: account.accountId, userId: account.ownerId, contractId: expired },
        { accountId: account.accountId, userId: account.ownerId, contractId: active },
      ]);
      const favorites = await searchContracts(tx, requester, filtersFor({ terms: [token] }, { favoritesOnly: true }));
      assert.deepEqual(
        favorites.items.map((item) => item.id),
        [expired, active],
        'pelo vencimento: o vencido primeiro',
      );
      assert.ok(favorites.items.every((item) => item.isFavorite));

      const other = await createTestAccount(tx, 'contrato-vigentes-outra');
      assert.deepEqual(
        await idsFor(tx, requesterOf(other), filtersFor({ terms: [token] }, { favoritesOnly: true })),
        [],
        'o favorito é só de quem marcou',
      );
    });
  });

  test('tipo de contrato e "Incluir encerrados", que traz também os sem vencimento', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-tipos');
      const token = uniqueToken();
      const object = `Fornecimento de material ${token}`;
      const activeContract = await insertTestContract(tx, { contractObject: object, expiresOn: FUTURE });
      const activeEmpenho = await insertTestContract(tx, { contractObject: object, expiresOn: FUTURE, contractTypeId: 7, contractTypeName: 'Empenho' });
      const closedContract = await insertTestContract(tx, { contractObject: object, termStart: '2024-01-01', originalTermEnd: PAST, expiresOn: PAST });
      const withoutExpiry = await insertTestContract(tx, {
        contractObject: object,
        originalTermEnd: null,
        expiresOn: null,
        contractTypeId: 8,
        contractTypeName: 'Outros',
      });
      const requester = requesterOf(account);
      const byId = (ids: number[]) => [...ids].sort((a, b) => a - b);

      assert.deepEqual(byId(await idsFor(tx, requester, filtersFor({ terms: [token] }))), byId([activeContract, activeEmpenho]), 'padrão: só os vigentes');
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token] }, { contractTypes: [7] })), [activeEmpenho]);

      const all = await searchContracts(tx, requester, filtersFor({ terms: [token] }, { includeClosed: true, sort: 'publishedDesc' }));
      assert.deepEqual(byId(all.items.map((item) => item.id)), byId([activeContract, activeEmpenho, closedContract, withoutExpiry]));
      assert.deepEqual(
        byId(await idsFor(tx, requester, filtersFor({ terms: [token] }, { includeClosed: true, contractTypes: [1] }))),
        byId([activeContract, closedContract]),
      );

      const empenho = all.items.find((item) => item.id === activeEmpenho);
      assert.equal(empenho?.contractTypeName, 'Empenho');
      assert.equal(all.items.find((item) => item.id === activeContract)?.contractTypeName, 'Contrato', 'o nome curto da lista');
      const noExpiry = all.items.find((item) => item.id === withoutExpiry);
      assert.equal(noExpiry?.expiresOn, null);
      assert.equal(noExpiry?.originalTermEnd, null);
      assert.equal(noExpiry?.isExtended, false);

      const byExpiry = await idsFor(tx, requester, filtersFor({ terms: [token] }, { includeClosed: true, sort: 'expiryAsc' }));
      assert.equal(byExpiry.at(-1), withoutExpiry, 'pelo vencimento, o sem vencimento fica por último');
    });
  });

  test('número: contrato + ano, processo + ano, controle PNCP e controle da compra; e o ano do contrato', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-numero');
      const requester = requesterOf(account);
      const digits = () => String(randomInt(100_000_000, 999_999_999));
      const contractDigits = digits();
      const processDigits = digits();
      const purchaseDigits = digits();
      const byNumber = await insertTestContract(tx, { contractNumber: `CT ${contractDigits}`, contractYear: 2025, expiresOn: FUTURE });
      const byProcess = await insertTestContract(tx, { processNumber: `PROC-${processDigits}`, expiresOn: FUTURE });
      const byPurchase = await insertTestContract(tx, { purchaseControlNumber: `03353358000196-1-${purchaseDigits}/2026`, expiresOn: FUTURE });

      assert.deepEqual(await idsFor(tx, requester, filtersFor({}, { numberGroups: numberGroupsOf(`${contractDigits}/2025`) })), [byNumber]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({}, { numberGroups: numberGroupsOf(`${contractDigits}/2026`) })), [], 'ano errado');
      assert.deepEqual(await idsFor(tx, requester, filtersFor({}, { numberGroups: numberGroupsOf(processDigits) })), [byProcess]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({}, { numberGroups: numberGroupsOf(purchaseDigits) })), [byPurchase]);
      assert.deepEqual(
        await idsFor(tx, requester, filtersFor({}, { numberGroups: numberGroupsOf(contractDigits), contractYear: 2026 })),
        [],
        'o ano do contrato filtra',
      );
    });
  });

  test('fornecedor, órgão, categoria, UF e município', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-filtros');
      const requester = requesterOf(account);
      const token = uniqueToken();
      const supplier = randomCnpj();
      const agency = randomCnpj();
      const target = await insertTestContract(tx, {
        contractObject: `Obra de reforma ${token}`,
        supplierPersonType: 'PJ',
        supplierDocument: supplier,
        agencyCnpj: agency,
        categoryId: 7,
        state: 'MA',
        cityIbgeCode: '2111300',
        expiresOn: FUTURE,
      });
      await insertTestContract(tx, { contractObject: `Obra de reforma ${token}`, categoryId: 8, state: 'SP', expiresOn: FUTURE });

      assert.deepEqual(await idsFor(tx, requester, filtersFor({ supplierCnpjs: [supplier] })), [target]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ agencyCnpjs: [agency] })), [target]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token], categories: [7] })), [target]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token], states: ['MA'] })), [target]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token], cityIbgeCodes: ['2111300'] })), [target]);
    });
  });

  test('faixa de valor global, com e sem "incluir sem valor"', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-valor');
      const requester = requesterOf(account);
      const token = uniqueToken();
      const cheap = await insertTestContract(tx, { contractObject: `Serviço ${token}`, globalValue: '1000.00', expiresOn: FUTURE });
      const expensive = await insertTestContract(tx, { contractObject: `Serviço ${token}`, globalValue: '90000.00', expiresOn: FUTURE });
      const withoutValue = await insertTestContract(tx, { contractObject: `Serviço ${token}`, globalValue: null, expiresOn: FUTURE });

      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token], minValue: '5000' })), [expensive]);
      assert.deepEqual(
        (await idsFor(tx, requester, filtersFor({ terms: [token], maxValue: '5000', includeWithoutValue: true }))).sort((a, b) => a - b),
        [cheap, withoutValue].sort((a, b) => a - b),
      );
      assert.equal((await idsFor(tx, requester, filtersFor({ terms: [token] }))).length, 3, 'sem faixa, todos entram');
    });
  });

  test('vencimento de/até, publicação, ordenações e paginação', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-ordem');
      const requester = requesterOf(account);
      const token = uniqueToken();
      const soon = await insertTestContract(tx, {
        contractObject: `Locação ${token}`,
        expiresOn: '2029-01-10',
        globalValue: '500.00',
        publishedAt: '2026-01-05T10:00:00',
      });
      const later = await insertTestContract(tx, {
        contractObject: `Locação ${token}`,
        expiresOn: '2031-05-01',
        globalValue: '9000.00',
        publishedAt: '2026-03-05T10:00:00',
      });

      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token] }, { expiryTo: '2029-12-31' })), [soon]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token] }, { expiryFrom: '2030-01-01' })), [later]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token] }, { publishedFrom: '2026-03-01' })), [later]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token] }, { sort: 'expiryAsc' })), [soon, later]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token] }, { sort: 'valueDesc' })), [later, soon]);
      assert.deepEqual(await idsFor(tx, requester, filtersFor({ terms: [token] }, { sort: 'publishedDesc' })), [later, soon]);

      const page2 = await searchContracts(tx, requester, filtersFor({ terms: [token] }, { perPage: 1, page: 2 }));
      assert.deepEqual({ total: page2.total, totalPages: page2.totalPages, ids: page2.items.map((item) => item.id) }, { total: 2, totalPages: 2, ids: [later] });
      assert.equal(page2.items[0]?.pncpLink, `https://pncp.gov.br/app/contratos/03353358000196/2026/1`);
    });
  });

  test('prorrogado: vencimento atual diferente do fim original', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-prorrogado');
      const token = uniqueToken();
      await insertTestContract(tx, { contractObject: `Manutenção ${token}`, originalTermEnd: '2027-01-01', expiresOn: '2028-01-01' });
      const [item] = (await searchContracts(tx, requesterOf(account), filtersFor({ terms: [token] }))).items;
      assert.equal(item?.isExtended, true);
    });
  });

  test('paridade: o total "vigentes agora" da busca salva é o total da busca da tela', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-paridade');
      const requester = requesterOf(account);
      const token = uniqueToken();
      await insertTestContract(tx, { contractObject: `Limpeza ${token}`, globalValue: '2000.00', categoryId: 8, expiresOn: FUTURE });
      await insertTestContract(tx, { contractObject: `Limpeza ${token}`, globalValue: null, categoryId: 8, expiresOn: FUTURE });
      await insertTestContract(tx, { contractObject: `Limpeza ${token}`, categoryId: 2, expiresOn: FUTURE });
      await insertTestContract(tx, { contractObject: `Limpeza ${token}`, categoryId: 8, termStart: '2024-01-01', originalTermEnd: PAST, expiresOn: PAST });

      const criteria: ContractCriteria = {
        ...EMPTY_CONTRACT_CRITERIA,
        terms: [token],
        termsMode: 'OU',
        categories: [8],
        minValue: '1000',
        includeWithoutValue: true,
      };
      const saved = await createContractSavedSearch(tx, requester, { ...criteria, name: `Paridade ${token}` });
      const screen = await searchContracts(tx, requester, contractCriteriaOnlyFilters(criteria, 20));
      const counts = await countActiveMatchesBySearch(tx, requester, [saved.id]);
      assert.equal(screen.total, 2);
      assert.equal(saved.activeCount, 2);
      assert.equal(counts.get(saved.id), screen.total);
    });
  });
});
