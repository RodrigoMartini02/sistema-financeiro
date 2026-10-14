import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { RequestInputError } from '../../../utils/requestInput';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertSavedSearch,
  insertTestContract,
  withRollback,
} from '../collector/dbTestSupport';
import { tenderContractSavedSearches } from '../db/schema';
import { addAccountMember, requesterOf, uniqueToken } from './apiTestSupport';
import {
  createContractSavedSearch,
  deleteContractSavedSearch,
  duplicateContractSavedSearch,
  listContractSavedSearches,
  patchContractSavedSearch,
  previewContractSavedSearch,
  updateContractSavedSearch,
  type ContractSavedSearchInput,
} from './contractSavedSearches';
import { EMPTY_CONTRACT_CRITERIA } from './contractSearch';
import { MAX_SAVED_SEARCHES_PER_USER } from './savedSearches';

// Buscas salvas de contratos (plano dos contratos a vencer, Parte B):
// validações, limite de 50 separado das de editais, vigentes agora, prévia,
// duplicar e isolamento entre pessoas e contas.

function inputFor(token: string, overrides: Partial<ContractSavedSearchInput> = {}): ContractSavedSearchInput {
  return { ...EMPTY_CONTRACT_CRITERIA, termsMode: 'OU', name: `Contratos ${token}`, terms: [token], ...overrides };
}

async function rejectsWith(promise: Promise<unknown>, status: number, message?: RegExp): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    return error instanceof RequestInputError && error.status === status && (!message || message.test(error.message));
  });
}

describe('buscas salvas de contratos (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('criar: vigentes que já batem; ativa e com aviso por padrão', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-criar');
      const token = uniqueToken();
      await insertTestContract(tx, { contractObject: `Limpeza ${token}`, expiresOn: '2030-01-01' });
      await insertTestContract(tx, { contractObject: `Limpeza ${token}`, termStart: '2024-01-01', originalTermEnd: '2025-01-01', expiresOn: '2025-01-01' });

      const created = await createContractSavedSearch(tx, requesterOf(account), inputFor(token, { categories: [], supplierCnpjs: [] }));
      assert.equal(created.activeCount, 1);
      assert.equal(created.active, true);
      assert.equal(created.notify, true);
      assert.equal(created.termsMode, 'OU');
      assert.deepEqual((await listContractSavedSearches(tx, requesterOf(account))).map((search) => search.id), [created.id]);
    });
  });

  test('validações: sem critério e mínimo maior que o máximo', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-validar');
      const requester = requesterOf(account);
      await rejectsWith(createContractSavedSearch(tx, requester, { ...EMPTY_CONTRACT_CRITERIA, name: 'Vazia' }), 400, /critério/);
      await rejectsWith(
        createContractSavedSearch(tx, requester, inputFor(uniqueToken(), { minValue: '500', maxValue: '100' })),
        400,
        /mínimo/,
      );
      // Categoria ou fornecedor sozinhos já são critério.
      const byCategory = await createContractSavedSearch(tx, requester, { ...EMPTY_CONTRACT_CRITERIA, name: 'Obras', categories: [7] });
      assert.deepEqual(byCategory.categories, [7]);
    });
  });

  test('limite de 50 por pessoa e conta, contado à parte das buscas de editais', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-limite');
      // 50 buscas de editais não ocupam o limite dos contratos.
      for (let index = 0; index < MAX_SAVED_SEARCHES_PER_USER; index += 1) {
        await insertSavedSearch(tx, { accountId: account.accountId, userId: account.ownerId, terms: ['software'] });
      }
      await createContractSavedSearch(tx, requesterOf(account), inputFor(uniqueToken()));

      await tx.insert(tenderContractSavedSearches).values(
        Array.from({ length: MAX_SAVED_SEARCHES_PER_USER - 1 }, (_, index) => ({
          accountId: account.accountId,
          userId: account.ownerId,
          name: `Contratos ${index}`,
          terms: ['limpeza'],
        })),
      );
      await rejectsWith(createContractSavedSearch(tx, requesterOf(account), inputFor(uniqueToken())), 400, /50 buscas salvas de contratos/);
      const [first] = await listContractSavedSearches(tx, requesterOf(account));
      await rejectsWith(duplicateContractSavedSearch(tx, requesterOf(account), first?.id ?? 0), 400, /50/);
    });
  });

  test('alterar, ligar e desligar, duplicar e excluir', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-alterar');
      const requester = requesterOf(account);
      const token = uniqueToken();
      const created = await createContractSavedSearch(tx, requester, inputFor(token));

      const updated = await updateContractSavedSearch(tx, requester, created.id, inputFor(token, { name: 'Novo nome', supplierCnpjs: ['12345678000195'] }));
      assert.equal(updated.name, 'Novo nome');
      assert.deepEqual(updated.supplierCnpjs, ['12345678000195']);
      assert.equal(updated.notify, true, 'sem notify no corpo, mantém o gravado');

      const paused = await patchContractSavedSearch(tx, requester, created.id, { active: false });
      assert.equal(paused.active, false);
      const quiet = await patchContractSavedSearch(tx, requester, created.id, { notify: false });
      assert.deepEqual({ active: quiet.active, notify: quiet.notify }, { active: false, notify: false });

      const copy = await duplicateContractSavedSearch(tx, requester, created.id);
      assert.equal(copy.name, 'Cópia de Novo nome');
      assert.deepEqual(copy.supplierCnpjs, ['12345678000195']);

      await deleteContractSavedSearch(tx, requester, created.id);
      assert.deepEqual((await listContractSavedSearches(tx, requester)).map((search) => search.id), [copy.id]);
    });
  });

  test('isolamento: busca de outra pessoa da conta ou de outra conta dá 404', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-dono');
      const other = await createTestAccount(tx, 'busca-contrato-outra');
      const colleague = await addAccountMember(tx, account, 'busca-contrato-colega', { access: true });
      const created = await createContractSavedSearch(tx, requesterOf(account), inputFor(uniqueToken()));

      for (const requester of [requesterOf(other), { accountId: account.accountId, userId: colleague }]) {
        await rejectsWith(updateContractSavedSearch(tx, requester, created.id, inputFor('x1')), 404);
        await rejectsWith(patchContractSavedSearch(tx, requester, created.id, { active: false }), 404);
        await rejectsWith(deleteContractSavedSearch(tx, requester, created.id), 404);
        await rejectsWith(duplicateContractSavedSearch(tx, requester, created.id), 404);
        assert.deepEqual(await listContractSavedSearches(tx, requester), []);
      }
    });
  });

  test('prévia: quantos vigentes batem e os 5 primeiros pelo vencimento, sem gravar', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'busca-contrato-previa');
      const token = uniqueToken();
      for (let month = 1; month <= 7; month += 1) {
        await insertTestContract(tx, { contractObject: `Vigilância ${token}`, expiresOn: `2030-${String(month).padStart(2, '0')}-10` });
      }
      const preview = await previewContractSavedSearch(tx, requesterOf(account), { ...EMPTY_CONTRACT_CRITERIA, terms: [token] });
      assert.equal(preview.count, 7);
      assert.deepEqual(
        preview.items.map((item) => item.expiresOn),
        ['2030-01-10', '2030-02-10', '2030-03-10', '2030-04-10', '2030-05-10'],
      );
      assert.deepEqual(await listContractSavedSearches(tx, requesterOf(account)), []);
    });
  });
});
