import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import type { TenderContractRow } from '../collector/contractMapping';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import type { TendersDb } from '../collector/database';
import { openTestContractStore, sampleContract, type TestContractStore } from '../contractStore/storeTestSupport';
import { postgresSearchFields } from '../contractStore/textSearch';
import { tenderContractFavorites } from '../db/schema';
import { requesterOf } from './apiTestSupport';
import { countActiveMatches } from './contractSavedSearches';
import {
  EMPTY_CONTRACT_CRITERIA,
  contractCriteriaOnlyFilters,
  searchContracts,
  type ContractContext,
  type ContractCriteria,
  type ContractSearchFilters,
} from './contractSearch';
import { numberGroupsOf } from './noticeSearch';

// Busca de contratos no armazém (planos dos contratos a vencer, Parte B, e dos
// contratos no R2, Parte R2), com o Postgres do banco local para as frases dos
// termos, os favoritos e o trecho destacado: cada filtro, só vigentes, "Só
// favoritos" com os vencidos, ordenações, paginação e a paridade com o total das
// buscas salvas. Cada teste tem o seu armazém de exemplo.

const NOW = new Date('2026-10-19T12:00:00Z');
const FUTURE = '2030-06-30';
const PAST = '2025-01-31';

function filtersFor(criteria: Partial<ContractCriteria>, overrides: Partial<ContractSearchFilters> = {}): ContractSearchFilters {
  return { ...contractCriteriaOnlyFilters({ ...EMPTY_CONTRACT_CRITERIA, ...criteria }, 100), ...overrides };
}

const keyOf = (contract: TenderContractRow) => contract.pncpControlNumber;

/** Contratos em dois pedaços: o contexto da busca e o armazém, que o teste fecha no fim. */
async function withContracts(
  tx: TendersDb,
  contracts: readonly TenderContractRow[],
  run: (context: ContractContext, store: TestContractStore) => Promise<void>,
): Promise<void> {
  const store = await openTestContractStore(contracts, { searchFields: postgresSearchFields(tx) });
  try {
    await run({ db: tx, contractStore: store.reader, now: () => NOW }, store);
  } finally {
    await store.close();
  }
}

async function keysFor(context: ContractContext, requester: { accountId: number; userId: number }, filters: ContractSearchFilters): Promise<string[]> {
  const result = await searchContracts(context, requester, filters);
  return result.items.map((item) => item.pncpControlNumber);
}

const sorted = (keys: string[]) => [...keys].sort();

describe('busca de contratos no armazém (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('termos E e OU, exclusão e trecho destacado', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-termos');
      const cleaning = sampleContract(1, { contractObject: 'Limpeza predial', expiresOn: FUTURE });
      const security = sampleContract(2, { contractObject: 'Vigilância armada predial', expiresOn: FUTURE });
      const works = sampleContract(3, { contractObject: 'Obra predial', expiresOn: FUTURE });
      await withContracts(tx, [cleaning, security, works], async (context) => {
        const requester = requesterOf(account);

        assert.deepEqual(await keysFor(context, requester, filtersFor({ terms: ['predial', 'limpeza'], termsMode: 'E' })), [keyOf(cleaning)]);
        assert.deepEqual(
          sorted(await keysFor(context, requester, filtersFor({ terms: ['limpeza', 'vigilância'], termsMode: 'OU' }))),
          sorted([keyOf(cleaning), keyOf(security)]),
        );
        assert.deepEqual(await keysFor(context, requester, filtersFor({ terms: ['predial'], excludedTerms: ['vigilância', 'obra'] })), [keyOf(cleaning)]);
        const [item] = (await searchContracts(context, requester, filtersFor({ terms: ['predial', 'limpeza'], termsMode: 'E' }))).items;
        assert.match(item?.highlightedExcerpt ?? '', /<<Limpeza>>/);
        assert.equal((await searchContracts(context, requester, filtersFor({}))).items[0]?.highlightedExcerpt, null, 'sem termos, sem trecho');
      });
    });
  });

  test('singular e plural: o termo acha as duas formas, como na busca dos editais', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-plural');
      const plural = sampleContract(1, { contractObject: 'Fornecimento de materiais de expediente', expiresOn: FUTURE });
      const other = sampleContract(2, { contractObject: 'Fornecimento de combustível', expiresOn: FUTURE });
      await withContracts(tx, [plural, other], async (context) => {
        const requester = requesterOf(account);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ terms: ['material de expediente'] })), [keyOf(plural)]);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ terms: ['materiais'] })), [keyOf(plural)]);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ terms: ['material expediente'] })), [], 'a palavra "de" ocupa a posição dela');
      });
    });
  });

  test('só vigentes; "Só favoritos" traz também o favorito vencido, e sem favoritos não traz nada', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-vigentes');
      const active = sampleContract(1, { contractObject: 'Coleta de lixo urbano', expiresOn: FUTURE });
      const expired = sampleContract(2, { contractObject: 'Coleta de lixo urbano', termStart: '2024-01-01', originalTermEnd: PAST, expiresOn: PAST });
      await withContracts(tx, [active, expired], async (context) => {
        const requester = requesterOf(account);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ terms: ['lixo'] })), [keyOf(active)]);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ terms: ['lixo'] }, { favoritesOnly: true })), [], 'ainda sem favoritos');

        await tx.insert(tenderContractFavorites).values([
          { accountId: account.accountId, userId: account.ownerId, contractKey: keyOf(expired) },
          { accountId: account.accountId, userId: account.ownerId, contractKey: keyOf(active) },
        ]);
        const favorites = await searchContracts(context, requester, filtersFor({ terms: ['lixo'] }, { favoritesOnly: true }));
        assert.deepEqual(
          favorites.items.map((item) => item.pncpControlNumber),
          [keyOf(expired), keyOf(active)],
          'pelo vencimento: o vencido primeiro',
        );
        assert.ok(favorites.items.every((item) => item.isFavorite));
        assert.equal(favorites.total, 2);

        const other = await createTestAccount(tx, 'contrato-vigentes-outra');
        assert.deepEqual(
          await keysFor(context, requesterOf(other), filtersFor({ terms: ['lixo'] }, { favoritesOnly: true })),
          [],
          'o favorito é só de quem marcou',
        );
        const mine = await searchContracts(context, requester, filtersFor({ terms: ['lixo'] }));
        assert.deepEqual(mine.items.map((item) => item.isFavorite), [true], 'o favorito aparece marcado na busca comum');
        const theirs = await searchContracts(context, requesterOf(other), filtersFor({ terms: ['lixo'] }));
        assert.deepEqual(theirs.items.map((item) => item.isFavorite), [false]);
      });
    });
  });

  test('tipo de contrato e "Incluir encerrados", que traz também os sem vencimento', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-tipos');
      const activeContract = sampleContract(1, { contractObject: 'Fornecimento de material', expiresOn: FUTURE });
      const activeEmpenho = sampleContract(2, { contractObject: 'Fornecimento de material', expiresOn: FUTURE, contractTypeId: 7, contractTypeName: 'Empenho' });
      const closedContract = sampleContract(3, { contractObject: 'Fornecimento de material', termStart: '2024-01-01', originalTermEnd: PAST, expiresOn: PAST });
      const withoutExpiry = sampleContract(4, {
        contractObject: 'Fornecimento de material',
        originalTermEnd: null,
        expiresOn: null,
        contractTypeId: 8,
        contractTypeName: 'Outros',
      });
      await withContracts(tx, [activeContract, activeEmpenho, closedContract, withoutExpiry], async (context) => {
        const requester = requesterOf(account);

        assert.deepEqual(sorted(await keysFor(context, requester, filtersFor({ terms: ['material'] }))), sorted([keyOf(activeContract), keyOf(activeEmpenho)]), 'padrão: só os vigentes');
        assert.deepEqual(await keysFor(context, requester, filtersFor({ terms: ['material'] }, { contractTypes: [7] })), [keyOf(activeEmpenho)]);

        const all = await searchContracts(context, requester, filtersFor({ terms: ['material'] }, { includeClosed: true, sort: 'publishedDesc' }));
        assert.deepEqual(
          sorted(all.items.map((item) => item.pncpControlNumber)),
          sorted([keyOf(activeContract), keyOf(activeEmpenho), keyOf(closedContract), keyOf(withoutExpiry)]),
        );
        assert.deepEqual(
          sorted(await keysFor(context, requester, filtersFor({ terms: ['material'] }, { includeClosed: true, contractTypes: [1] }))),
          sorted([keyOf(activeContract), keyOf(closedContract)]),
        );

        assert.equal(all.items.find((item) => item.pncpControlNumber === keyOf(activeEmpenho))?.contractTypeName, 'Empenho');
        assert.equal(all.items.find((item) => item.pncpControlNumber === keyOf(activeContract))?.contractTypeName, 'Contrato', 'o nome curto da lista');
        const noExpiry = all.items.find((item) => item.pncpControlNumber === keyOf(withoutExpiry));
        assert.equal(noExpiry?.expiresOn, null);
        assert.equal(noExpiry?.originalTermEnd, null);
        assert.equal(noExpiry?.isExtended, false);

        const byExpiry = await keysFor(context, requester, filtersFor({ terms: ['material'] }, { includeClosed: true, sort: 'expiryAsc' }));
        assert.equal(byExpiry.at(-1), keyOf(withoutExpiry), 'pelo vencimento, o sem vencimento fica por último');
      });
    });
  });

  test('número: contrato + ano, processo + ano, controle PNCP e controle da compra; e o ano do contrato', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-numero');
      const byNumber = sampleContract(1, { contractNumber: 'CT 482913', contractYear: 2025, expiresOn: FUTURE });
      const byProcess = sampleContract(2, { processNumber: 'PROC-771355', expiresOn: FUTURE });
      const byPurchase = sampleContract(3, { purchaseControlNumber: '03353358000196-1-615204/2026', expiresOn: FUTURE });
      await withContracts(tx, [byNumber, byProcess, byPurchase], async (context) => {
        const requester = requesterOf(account);

        assert.deepEqual(await keysFor(context, requester, filtersFor({}, { numberGroups: numberGroupsOf('482913/2025') })), [keyOf(byNumber)]);
        assert.deepEqual(await keysFor(context, requester, filtersFor({}, { numberGroups: numberGroupsOf('482913/2026') })), [], 'ano errado');
        assert.deepEqual(await keysFor(context, requester, filtersFor({}, { numberGroups: numberGroupsOf('771355') })), [keyOf(byProcess)]);
        assert.deepEqual(await keysFor(context, requester, filtersFor({}, { numberGroups: numberGroupsOf('615204') })), [keyOf(byPurchase)]);
        assert.deepEqual(
          await keysFor(context, requester, filtersFor({}, { numberGroups: numberGroupsOf('482913'), contractYear: 2026 })),
          [],
          'o ano do contrato filtra',
        );
        assert.deepEqual(
          await keysFor(context, requester, filtersFor({}, { numberGroups: numberGroupsOf('482913'), contractYear: 2025 })),
          [keyOf(byNumber)],
        );
      });
    });
  });

  test('fornecedor, órgão, categoria, UF e município', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-filtros');
      const target = sampleContract(1, {
        contractObject: 'Obra de reforma',
        supplierPersonType: 'PJ',
        supplierDocument: '12345678000195',
        agencyCnpj: '29138278000101',
        categoryId: 7,
        state: 'MA',
        cityIbgeCode: '2111300',
        expiresOn: FUTURE,
      });
      const other = sampleContract(2, { contractObject: 'Obra de reforma', categoryId: 8, state: 'SP', expiresOn: FUTURE });
      await withContracts(tx, [target, other], async (context) => {
        const requester = requesterOf(account);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ supplierCnpjs: ['12345678000195'] })), [keyOf(target)]);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ agencyCnpjs: ['29138278000101'] })), [keyOf(target)]);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ categories: [7] })), [keyOf(target)]);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ states: ['MA'] })), [keyOf(target)]);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ cityIbgeCodes: ['2111300'] })), [keyOf(target)]);
      });
    });
  });

  test('faixa de valor global, com e sem "incluir sem valor"', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-valor');
      const cheap = sampleContract(1, { contractObject: 'Serviço de poda', globalValue: '1000.00', expiresOn: FUTURE });
      const expensive = sampleContract(2, { contractObject: 'Serviço de poda', globalValue: '90000.00', expiresOn: FUTURE });
      const withoutValue = sampleContract(3, { contractObject: 'Serviço de poda', globalValue: null, expiresOn: FUTURE });
      await withContracts(tx, [cheap, expensive, withoutValue], async (context) => {
        const requester = requesterOf(account);
        assert.deepEqual(await keysFor(context, requester, filtersFor({ minValue: '5000' })), [keyOf(expensive)]);
        assert.deepEqual(
          sorted(await keysFor(context, requester, filtersFor({ maxValue: '5000', includeWithoutValue: true }))),
          sorted([keyOf(cheap), keyOf(withoutValue)]),
        );
        assert.equal((await keysFor(context, requester, filtersFor({}))).length, 3, 'sem faixa, todos entram');
      });
    });
  });

  test('vencimento de/até, publicação (dia inteiro), ordenações e paginação', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-ordem');
      const soon = sampleContract(1, { contractObject: 'Locação de veículos', expiresOn: '2029-01-10', globalValue: '500.00', publishedAt: '2026-01-05T23:30:00' });
      const later = sampleContract(2, { contractObject: 'Locação de veículos', expiresOn: '2031-05-01', globalValue: '9000.00', publishedAt: '2026-03-05T10:00:00' });
      await withContracts(tx, [soon, later], async (context) => {
        const requester = requesterOf(account);
        const filters = (overrides: Partial<ContractSearchFilters>) => filtersFor({ terms: ['locação'] }, overrides);

        assert.deepEqual(await keysFor(context, requester, filters({ expiryTo: '2029-12-31' })), [keyOf(soon)]);
        assert.deepEqual(await keysFor(context, requester, filters({ expiryFrom: '2030-01-01' })), [keyOf(later)]);
        assert.deepEqual(await keysFor(context, requester, filters({ publishedFrom: '2026-03-01' })), [keyOf(later)]);
        assert.deepEqual(await keysFor(context, requester, filters({ publishedTo: '2026-01-05' })), [keyOf(soon)], 'o dia final vale inteiro, até 23:59');
        assert.deepEqual(await keysFor(context, requester, filters({ publishedTo: '2026-01-04' })), []);
        assert.deepEqual(await keysFor(context, requester, filters({ sort: 'expiryAsc' })), [keyOf(soon), keyOf(later)]);
        assert.deepEqual(await keysFor(context, requester, filters({ sort: 'valueDesc' })), [keyOf(later), keyOf(soon)]);
        assert.deepEqual(await keysFor(context, requester, filters({ sort: 'valueAsc' })), [keyOf(soon), keyOf(later)]);
        assert.deepEqual(await keysFor(context, requester, filters({ sort: 'publishedDesc' })), [keyOf(later), keyOf(soon)]);

        const page2 = await searchContracts(context, requester, filters({ perPage: 1, page: 2 }));
        assert.deepEqual(
          { total: page2.total, totalPages: page2.totalPages, keys: page2.items.map((item) => item.pncpControlNumber) },
          { total: 2, totalPages: 2, keys: [keyOf(later)] },
        );
        assert.equal(page2.items[0]?.pncpLink, 'https://pncp.gov.br/app/contratos/00394460005887/2026/2');
        const page1 = await searchContracts(context, requester, filters({ perPage: 1, page: 1 }));
        assert.deepEqual({ total: page1.total, totalPages: page1.totalPages }, { total: 2, totalPages: 2 });
        const beyond = await searchContracts(context, requester, filters({ perPage: 1, page: 3 }));
        assert.deepEqual({ total: beyond.total, items: beyond.items.length }, { total: 2, items: 0 }, 'depois da última página, o total continua certo');
      });
    });
  });

  test('relevância: mais termos batendo primeiro e, no empate, o termo mais perto do começo', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-relevancia');
      const both = sampleContract(1, { contractObject: 'Limpeza e conservação predial', expiresOn: '2031-01-01' });
      const earlyOnly = sampleContract(2, { contractObject: 'Limpeza de vidros e fachadas', expiresOn: '2030-01-01' });
      const lateOnly = sampleContract(3, { contractObject: 'Serviços diversos incluindo limpeza', expiresOn: '2029-01-01' });
      await withContracts(tx, [both, earlyOnly, lateOnly], async (context) => {
        const requester = requesterOf(account);
        const byRelevance = await keysFor(context, requester, filtersFor({ terms: ['limpeza', 'conservação'], termsMode: 'OU' }, { sort: 'relevance' }));
        assert.deepEqual(byRelevance, [keyOf(both), keyOf(earlyOnly), keyOf(lateOnly)]);
      });
    });
  });

  test('prorrogado: vencimento atual diferente do fim original', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-prorrogado');
      const extended = sampleContract(1, { contractObject: 'Manutenção de elevadores', originalTermEnd: '2027-01-01', expiresOn: '2031-01-01' });
      await withContracts(tx, [extended], async (context) => {
        const [item] = (await searchContracts(context, requesterOf(account), filtersFor({ terms: ['manutenção'] }))).items;
        assert.equal(item?.isExtended, true);
      });
    });
  });

  test('paridade: o total "vigentes agora" da busca salva é o total da busca da tela', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'contrato-paridade');
      const requester = requesterOf(account);
      const contracts = [
        sampleContract(1, { contractObject: 'Limpeza urbana', globalValue: '2000.00', categoryId: 8, expiresOn: FUTURE }),
        sampleContract(2, { contractObject: 'Limpeza urbana', globalValue: null, categoryId: 8, expiresOn: FUTURE }),
        sampleContract(3, { contractObject: 'Limpeza urbana', categoryId: 2, expiresOn: FUTURE }),
        sampleContract(4, { contractObject: 'Limpeza urbana', categoryId: 8, termStart: '2024-01-01', originalTermEnd: PAST, expiresOn: PAST }),
      ];
      await withContracts(tx, contracts, async (context) => {
        const criteria: ContractCriteria = {
          ...EMPTY_CONTRACT_CRITERIA,
          terms: ['limpeza'],
          termsMode: 'OU',
          categories: [8],
          minValue: '1000',
          includeWithoutValue: true,
        };
        const screen = await searchContracts(context, requester, contractCriteriaOnlyFilters(criteria, 20));
        assert.equal(screen.total, 2);
        assert.equal(await countActiveMatches(context, criteria), screen.total);
      });
    });
  });
});
