import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import type { TenderContractRow } from '../collector/contractMapping';
import type { TendersDb } from '../collector/database';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertSavedSearch,
  withRollback,
} from '../collector/dbTestSupport';
import { ContractStoreUnavailableError } from '../contractStore/reader';
import { openTestContractStore, sampleContract } from '../contractStore/storeTestSupport';
import { postgresSearchFields } from '../contractStore/textSearch';
import { tenderContractSavedSearches } from '../db/schema';
import { addAccountMember, requesterOf } from './apiTestSupport';
import {
  countActiveMatches,
  createContractSavedSearch,
  deleteContractSavedSearch,
  duplicateContractSavedSearch,
  listContractSavedSearches,
  patchContractSavedSearch,
  previewContractSavedSearch,
  saveSavedSearchTotal,
  updateContractSavedSearch,
  type ContractSavedSearchInput,
} from './contractSavedSearches';
import { EMPTY_CONTRACT_CRITERIA, type ContractContext } from './contractSearch';
import { MAX_SAVED_SEARCHES_PER_USER } from './savedSearches';

// Buscas salvas de contratos (planos dos contratos a vencer, Parte B, e dos
// contratos no R2, Parte R2): validações, limite de 50 separado das de editais,
// total "vigentes agora" contado no armazém e gravado com a data, prévia, duplicar
// e isolamento entre pessoas e contas. Cada teste tem o seu armazém de exemplo.

const NOW = new Date('2026-10-19T12:00:00Z');

function inputFor(term: string, overrides: Partial<ContractSavedSearchInput> = {}): ContractSavedSearchInput {
  return { ...EMPTY_CONTRACT_CRITERIA, termsMode: 'OU', name: `Contratos ${term}`, terms: [term], ...overrides };
}

async function rejectsWith(promise: Promise<unknown>, status: number, message?: RegExp): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    return error instanceof RequestInputError && error.status === status && (!message || message.test(error.message));
  });
}

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

describe('buscas salvas de contratos (banco local e armazém de exemplo)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('criar: conta os vigentes que já batem no armazém, grava o total com a data; ativa e com aviso por padrão', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-criar');
      await withContracts(
        tx,
        [
          sampleContract(1, { contractObject: 'Limpeza predial', expiresOn: '2030-01-01' }),
          sampleContract(2, { contractObject: 'Limpeza predial', termStart: '2024-01-01', originalTermEnd: '2025-01-01', expiresOn: '2025-01-01' }),
        ],
        async (context) => {
          const created = await createContractSavedSearch(context, requesterOf(account), inputFor('limpeza', { categories: [], supplierCnpjs: [] }));
          assert.equal(created.activeCount, 1, 'só o vigente');
          assert.match(created.countedAt ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
          assert.equal(created.active, true);
          assert.equal(created.notify, true);
          assert.equal(created.termsMode, 'OU');
          assert.deepEqual((await listContractSavedSearches(tx, requesterOf(account))).map((search) => [search.id, search.activeCount]), [[created.id, 1]]);
        },
      );
    });
  });

  test('criar com o armazém atualizando: a busca é salva, sem total, e a lista mostra isso', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-atualizando');
      const updating: ContractContext = {
        db: tx,
        contractStore: {
          query: () => Promise.reject(new ContractStoreUnavailableError()),
          status: () => ({ ready: false, revision: null, publishedAt: null, today: null, totals: null }),
        },
        now: () => NOW,
      };
      const created = await createContractSavedSearch(updating, requesterOf(account), inputFor('limpeza'));
      assert.deepEqual({ activeCount: created.activeCount, countedAt: created.countedAt }, { activeCount: null, countedAt: null });
      assert.equal((await listContractSavedSearches(tx, requesterOf(account))).length, 1);
    });
  });

  test('validações: sem critério e mínimo maior que o máximo', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-validar');
      const requester = requesterOf(account);
      await withContracts(tx, [], async (context) => {
        await rejectsWith(createContractSavedSearch(context, requester, { ...EMPTY_CONTRACT_CRITERIA, name: 'Vazia' }), 400, /critério/);
        await rejectsWith(createContractSavedSearch(context, requester, inputFor('limpeza', { minValue: '500', maxValue: '100' })), 400, /mínimo/);
        // Categoria ou fornecedor sozinhos já são critério.
        const byCategory = await createContractSavedSearch(context, requester, { ...EMPTY_CONTRACT_CRITERIA, name: 'Obras', categories: [7] });
        assert.deepEqual(byCategory.categories, [7]);
        assert.equal(byCategory.activeCount, 0, 'armazém sem contratos: total zero, contado');
      });
    });
  });

  test('limite de 50 por pessoa e conta, contado à parte das buscas de editais', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-limite');
      // 50 buscas de editais não ocupam o limite dos contratos.
      for (let index = 0; index < MAX_SAVED_SEARCHES_PER_USER; index += 1) {
        await insertSavedSearch(tx, { accountId: account.accountId, userId: account.ownerId, terms: ['software'] });
      }
      await withContracts(tx, [], async (context) => {
        await createContractSavedSearch(context, requesterOf(account), inputFor('limpeza'));

        await tx.insert(tenderContractSavedSearches).values(
          Array.from({ length: MAX_SAVED_SEARCHES_PER_USER - 1 }, (_, index) => ({
            accountId: account.accountId,
            userId: account.ownerId,
            name: `Contratos ${index}`,
            terms: ['limpeza'],
          })),
        );
        await rejectsWith(createContractSavedSearch(context, requesterOf(account), inputFor('vigilância')), 400, /50 buscas salvas de contratos/);
        const [first] = await listContractSavedSearches(tx, requesterOf(account));
        await rejectsWith(duplicateContractSavedSearch(tx, requesterOf(account), first?.id ?? 0), 400, /50/);
      });
    });
  });

  test('alterar zera e refaz o total; ligar e desligar mantêm; duplicar leva o total; excluir', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-alterar');
      const requester = requesterOf(account);
      await withContracts(
        tx,
        [
          sampleContract(1, { contractObject: 'Limpeza predial', expiresOn: '2030-01-01', supplierDocument: '12345678000195' }),
          sampleContract(2, { contractObject: 'Limpeza urbana', expiresOn: '2030-01-01', supplierDocument: '99999999000191' }),
        ],
        async (context) => {
          const created = await createContractSavedSearch(context, requester, inputFor('limpeza'));
          assert.equal(created.activeCount, 2);

          const updated = await updateContractSavedSearch(context, requester, created.id, inputFor('limpeza', { name: 'Novo nome', supplierCnpjs: ['12345678000195'] }));
          assert.equal(updated.name, 'Novo nome');
          assert.deepEqual(updated.supplierCnpjs, ['12345678000195']);
          assert.equal(updated.notify, true, 'sem notify no corpo, mantém o gravado');
          assert.equal(updated.activeCount, 1, 'os critérios mudaram: o total foi contado de novo');

          const paused = await patchContractSavedSearch(tx, requester, created.id, { active: false });
          assert.equal(paused.active, false);
          assert.equal(paused.activeCount, 1, 'pausar não muda o total');
          const quiet = await patchContractSavedSearch(tx, requester, created.id, { notify: false });
          assert.deepEqual({ active: quiet.active, notify: quiet.notify }, { active: false, notify: false });

          const copy = await duplicateContractSavedSearch(tx, requester, created.id);
          assert.equal(copy.name, 'Cópia de Novo nome');
          assert.deepEqual(copy.supplierCnpjs, ['12345678000195']);
          assert.deepEqual({ activeCount: copy.activeCount, countedAt: copy.countedAt }, { activeCount: updated.activeCount, countedAt: updated.countedAt });

          await deleteContractSavedSearch(tx, requester, created.id);
          assert.deepEqual((await listContractSavedSearches(tx, requester)).map((search) => search.id), [copy.id]);
        },
      );
    });
  });

  test('alterar com o armazém atualizando: o total antigo não vale mais e fica vazio até a próxima contagem', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-alterar-atualizando');
      const requester = requesterOf(account);
      let created = 0;
      await withContracts(tx, [sampleContract(1, { contractObject: 'Limpeza predial', expiresOn: '2030-01-01' })], async (context) => {
        created = (await createContractSavedSearch(context, requester, inputFor('limpeza'))).id;
      });
      const updating: ContractContext = {
        db: tx,
        contractStore: {
          query: () => Promise.reject(new ContractStoreUnavailableError()),
          status: () => ({ ready: false, revision: null, publishedAt: null, today: null, totals: null }),
        },
        now: () => NOW,
      };
      const updated = await updateContractSavedSearch(updating, requester, created, inputFor('vigilância'));
      assert.deepEqual({ activeCount: updated.activeCount, countedAt: updated.countedAt }, { activeCount: null, countedAt: null });
    });
  });

  test('total da rotina diária: grava o total e a data da contagem', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-total');
      const requester = requesterOf(account);
      await withContracts(tx, [sampleContract(1, { contractObject: 'Limpeza predial', expiresOn: '2030-01-01' })], async (context) => {
        const created = await createContractSavedSearch(context, requester, inputFor('limpeza'));
        assert.equal(await countActiveMatches(context, inputFor('limpeza')), 1);
        await saveSavedSearchTotal(tx, created.id, 7);
        const [stored] = await tx.select().from(tenderContractSavedSearches).where(eq(tenderContractSavedSearches.id, created.id));
        assert.equal(stored?.activeTotal, 7);
        assert.ok(stored?.activeTotalAt);
        assert.equal((await listContractSavedSearches(tx, requester))[0]?.activeCount, 7);
      });
    });
  });

  test('isolamento: busca de outra pessoa da conta ou de outra conta dá 404', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-dono');
      const other = await createTestAccount(tx, 'busca-contrato-outra');
      const colleague = await addAccountMember(tx, account, 'busca-contrato-colega', { access: true });
      await withContracts(tx, [], async (context) => {
        const created = await createContractSavedSearch(context, requesterOf(account), inputFor('limpeza'));

        for (const requester of [requesterOf(other), { accountId: account.accountId, userId: colleague }]) {
          await rejectsWith(updateContractSavedSearch(context, requester, created.id, inputFor('x1')), 404);
          await rejectsWith(patchContractSavedSearch(tx, requester, created.id, { active: false }), 404);
          await rejectsWith(deleteContractSavedSearch(tx, requester, created.id), 404);
          await rejectsWith(duplicateContractSavedSearch(tx, requester, created.id), 404);
          assert.deepEqual(await listContractSavedSearches(tx, requester), []);
        }
      });
    });
  });

  test('prévia: quantos vigentes batem e os 5 primeiros pelo vencimento, sem gravar', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-previa');
      const contracts = Array.from({ length: 7 }, (_, index) =>
        sampleContract(index + 1, { contractObject: 'Vigilância armada', expiresOn: `2030-${String(index + 1).padStart(2, '0')}-10` }),
      );
      await withContracts(tx, contracts, async (context) => {
        const preview = await previewContractSavedSearch(context, requesterOf(account), { ...EMPTY_CONTRACT_CRITERIA, terms: ['vigilância'] });
        assert.equal(preview.count, 7);
        assert.deepEqual(
          preview.items.map((item) => item.expiresOn),
          ['2030-01-10', '2030-02-10', '2030-03-10', '2030-04-10', '2030-05-10'],
        );
        assert.deepEqual(await listContractSavedSearches(tx, requesterOf(account)), []);
      });
    });
  });
});
