import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import type { TenderContractRow } from '../collector/contractMapping';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { openTestContractStore, sampleContract } from '../contractStore/storeTestSupport';
import { postgresSearchFields } from '../contractStore/textSearch';
import { tenderContractFavorites, tenderContractSavedSearches } from '../db/schema';
import { requesterOf } from './apiTestSupport';
import { readExpiringContracts } from './dashboardContracts';
import type { ContractContext } from './contractSearch';

// Contratos que vencem no Início (plano .plans/licitacoes-inicio-painel.md, fase 2): as buscas de contratos ativas e os
// favoritos da pessoa, sobre um armazém de exemplo. Hoje, no teste, é 19/10/2026 (Brasília).

const NOW = new Date('2026-10-19T12:00:00Z');

async function withContracts(
  tx: TendersDb,
  contracts: readonly TenderContractRow[],
  run: (context: ContractContext) => Promise<void>,
): Promise<void> {
  const store = await openTestContractStore(contracts, { searchFields: postgresSearchFields(tx) });
  try {
    await run({ db: tx, contractStore: store.reader, now: () => NOW });
  } finally {
    await store.close();
  }
}

describe('contratos que vencem no Início (banco local e armazém de exemplo)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('buscas ativas e favoritos da pessoa: janelas, mais próximos e dias restantes; busca pausada e de outra pessoa ficam de fora', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'inicio-contratos');
      const other = await createTestAccount(tx, 'inicio-contratos-outra');
      const contracts = [
        sampleContract(1, { contractObject: 'Limpeza predial', expiresOn: '2026-10-29', globalValue: '300.00' }),
        sampleContract(2, { contractObject: 'Limpeza viária', expiresOn: '2026-12-03', globalValue: null }),
        sampleContract(3, { contractObject: 'Obra de pavimentação', expiresOn: '2026-10-25' }),
        sampleContract(4, { contractObject: 'Vigilância armada', expiresOn: '2026-11-08' }),
        sampleContract(5, { contractObject: 'Limpeza vencida', expiresOn: '2026-10-18', originalTermEnd: '2026-10-18', termStart: '2024-01-01' }),
      ];
      await tx.insert(tenderContractSavedSearches).values([
        { accountId: account.accountId, userId: account.ownerId, name: 'Limpeza', terms: ['limpeza'] },
        { accountId: account.accountId, userId: account.ownerId, name: 'Obras (pausada)', terms: ['obra'], active: false },
        { accountId: other.accountId, userId: other.ownerId, name: 'Vigilância de outra pessoa', terms: ['vigilancia'] },
      ]);
      await tx.insert(tenderContractFavorites).values([
        { accountId: account.accountId, userId: account.ownerId, contractKey: sampleContract(4).pncpControlNumber },
        { accountId: other.accountId, userId: other.ownerId, contractKey: sampleContract(3).pncpControlNumber },
      ]);

      await withContracts(tx, contracts, async (context) => {
        const view = await readExpiringContracts(context, requesterOf(account));
        assert.deepEqual(view.sources, { savedSearches: 1, favorites: 1 });
        assert.deepEqual([view.within30Days, view.within60Days, view.within90Days], [2, 3, 3], 'limpeza (10 e 45 dias) e o favorito (20 dias)');
        assert.deepEqual(
          view.nearest.map(({ controlNumber, daysLeft, globalValue }) => ({ controlNumber, daysLeft, globalValue })),
          [
            { controlNumber: sampleContract(1).pncpControlNumber, daysLeft: 10, globalValue: 300 },
            { controlNumber: sampleContract(4).pncpControlNumber, daysLeft: 20, globalValue: 1000 },
            { controlNumber: sampleContract(2).pncpControlNumber, daysLeft: 45, globalValue: null },
          ],
        );
        assert.equal(view.nearest[0]?.agencyName, 'Prefeitura de Teste');
        assert.equal(view.nearest[0]?.expiresOn, '2026-10-29');
      });
    });
  });

  test('sem busca de contratos ativa nem favorito: tudo zerado, sem consultar o armazém', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'inicio-contratos-vazio');
      await tx
        .insert(tenderContractSavedSearches)
        .values({ accountId: account.accountId, userId: account.ownerId, name: 'Pausada', terms: ['limpeza'], active: false });
      const neverQueried: ContractContext = {
        db: tx,
        contractStore: {
          query: () => Promise.reject(new Error('o armazém não deveria ser consultado')),
          status: () => ({ ready: false, revision: null, publishedAt: null, today: null, totals: null }),
        },
        now: () => NOW,
      };
      const view = await readExpiringContracts(neverQueried, requesterOf(account));
      assert.deepEqual(view, {
        within30Days: 0,
        within60Days: 0,
        within90Days: 0,
        nearest: [],
        sources: { savedSearches: 0, favorites: 0 },
      });
    });
  });
});
