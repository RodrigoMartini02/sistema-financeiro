import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, count, eq } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertSavedSearch,
  insertTestNotice,
  withRollback,
} from '../collector/dbTestSupport';
import { tenderNotifications, tenderSavedSearches } from '../db/schema';
import { addAccountMember, requesterOf, uniqueToken } from './apiTestSupport';
import { EMPTY_CRITERIA } from './noticeSearch';
import {
  createSavedSearch,
  deleteSavedSearch,
  duplicateSavedSearch,
  listSavedSearches,
  MAX_SAVED_SEARCHES_PER_USER,
  patchSavedSearch,
  previewSavedSearch,
  updateSavedSearch,
  type SavedSearchInput,
} from './savedSearches';

// Buscas salvas (escopo, seção 8.2): validações, limite, total de abertos,
// prévia e isolamento entre pessoas e contas.

function inputFor(token: string, overrides: Partial<SavedSearchInput> = {}): SavedSearchInput {
  return { ...EMPTY_CRITERIA, termsMode: 'OU', name: `Busca ${token}`, terms: [token], ...overrides };
}

async function rejectsWith(promise: Promise<unknown>, status: number, message?: RegExp): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    return error instanceof RequestInputError && error.status === status && (!message || message.test(error.message));
  });
}

async function countSearches(tx: TendersDb, accountId: number, userId: number): Promise<number> {
  const [row] = await tx
    .select({ total: count() })
    .from(tenderSavedSearches)
    .where(and(eq(tenderSavedSearches.accountId, accountId), eq(tenderSavedSearches.userId, userId)));
  return row?.total ?? 0;
}

describe('buscas salvas (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('criar: total de abertos que já batem, sem notificação retroativa', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'salva-criar');
      const token = uniqueToken();
      await insertTestNotice(tx, { procurementObject: `Licitações de software ${token}` });
      await insertTestNotice(tx, { procurementObject: `Licitação encerrada ${token}`, proposalClosesAt: '2020-01-01T10:00:00' });

      const created = await createSavedSearch(tx, requesterOf(account), inputFor(token, { terms: [`licitação ${token}`, token] }));
      assert.equal(created.openCount, 1);
      assert.equal(created.notify, true);
      assert.equal(created.active, true);
      assert.equal(created.termsMode, 'OU');

      const [notifications] = await tx
        .select({ total: count() })
        .from(tenderNotifications)
        .where(eq(tenderNotifications.userId, account.ownerId));
      assert.equal(notifications?.total, 0);
    });
  });

  test('validações: ao menos um critério além do nome e mínimo ≤ máximo', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'salva-valida');
      await rejectsWith(createSavedSearch(tx, requesterOf(account), { ...EMPTY_CRITERIA, name: 'Vazia' }), 400, /ao menos um critério/);
      await rejectsWith(
        createSavedSearch(tx, requesterOf(account), inputFor(uniqueToken(), { minValue: '200', maxValue: '100' })),
        400,
        /mínimo/,
      );
      const onlyState = await createSavedSearch(tx, requesterOf(account), { ...EMPTY_CRITERIA, name: 'Só UF', states: ['MA'] });
      assert.deepEqual(onlyState.states, ['MA']);
    });
  });

  test('limite de 50 buscas por pessoa em cada conta (criar e duplicar)', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'salva-limite');
      for (let index = 0; index < MAX_SAVED_SEARCHES_PER_USER; index += 1) {
        await insertSavedSearch(tx, { ...requesterOf(account), terms: [`termo${index}`] });
      }
      await rejectsWith(createSavedSearch(tx, requesterOf(account), inputFor(uniqueToken())), 400, /50 buscas/);
      const [first] = await listSavedSearches(tx, requesterOf(account));
      await rejectsWith(duplicateSavedSearch(tx, requesterOf(account), first?.id ?? 0), 400, /50 buscas/);

      const colleague = await addAccountMember(tx, account, 'salva-limite-colega', { access: true });
      const fromColleague = await createSavedSearch(tx, { accountId: account.accountId, userId: colleague }, inputFor(uniqueToken()));
      assert.ok(fromColleague.id > 0, 'o limite é por pessoa');
    });
  });

  test('isolamento: só o dono vê e mexe; colega da mesma conta e outra conta recebem "não encontrada"', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'salva-isola');
      const other = await createTestAccount(tx, 'salva-isola-outra');
      const colleague = await addAccountMember(tx, account, 'salva-isola-colega', { access: true });
      const own = await createSavedSearch(tx, requesterOf(account), inputFor(uniqueToken()));

      const colleagueRequester = { accountId: account.accountId, userId: colleague };
      const otherRequester = requesterOf(other);
      assert.deepEqual(await listSavedSearches(tx, colleagueRequester), []);
      assert.deepEqual(await listSavedSearches(tx, otherRequester), []);
      for (const requester of [colleagueRequester, otherRequester]) {
        await rejectsWith(updateSavedSearch(tx, requester, own.id, inputFor(uniqueToken())), 404);
        await rejectsWith(patchSavedSearch(tx, requester, own.id, { active: false }), 404);
        await rejectsWith(deleteSavedSearch(tx, requester, own.id), 404);
        await rejectsWith(duplicateSavedSearch(tx, requester, own.id), 404);
      }
      assert.equal((await listSavedSearches(tx, requesterOf(account))).length, 1);
    });
  });

  test('alterar, ligar e desligar, duplicar e excluir', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'salva-crud');
      const token = uniqueToken();
      await insertTestNotice(tx, { procurementObject: `Material hospitalar ${token}`, estimatedTotalValue: null });
      const created = await createSavedSearch(tx, requesterOf(account), inputFor(token, { notify: false }));
      assert.equal(created.notify, false);

      const updated = await updateSavedSearch(
        tx,
        requesterOf(account),
        created.id,
        inputFor(token, { name: 'Hospitalar', minValue: '1000', includeWithoutValue: true }),
      );
      assert.equal(updated.name, 'Hospitalar');
      assert.equal(updated.notify, false, 'notify ausente na alteração é mantido');
      assert.equal(updated.minValue, 1000);
      assert.equal(updated.openCount, 1, 'edital sem valor entra com a opção');

      const paused = await patchSavedSearch(tx, requesterOf(account), created.id, { active: false });
      assert.equal(paused.active, false);
      assert.equal(paused.notify, false);

      const copy = await duplicateSavedSearch(tx, requesterOf(account), created.id);
      assert.equal(copy.name, 'Cópia de Hospitalar');
      assert.deepEqual(copy.terms, updated.terms);
      assert.notEqual(copy.id, created.id);

      await deleteSavedSearch(tx, requesterOf(account), created.id);
      assert.deepEqual((await listSavedSearches(tx, requesterOf(account))).map((search) => search.id), [copy.id]);
    });
  });

  test('prévia: contagem e 5 primeiros por prazo, sem gravar nada', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'salva-previa');
      const token = uniqueToken();
      for (let index = 0; index < 7; index += 1) {
        await insertTestNotice(tx, {
          procurementObject: `Digitalização ${token}`,
          proposalClosesAt: new Date(Date.now() + (index + 1) * 86_400_000).toISOString(),
        });
      }
      const before = await countSearches(tx, account.accountId, account.ownerId);
      const preview = await previewSavedSearch(tx, account.accountId, { ...EMPTY_CRITERIA, terms: [token] });
      assert.equal(preview.count, 7);
      assert.equal(preview.items.length, 5);
      const deadlines = preview.items.map((item) => item.proposalClosesAt ?? '');
      assert.deepEqual([...deadlines].sort(), deadlines, 'ordenados pelo prazo');
      assert.equal(await countSearches(tx, account.accountId, account.ownerId), before);
      await rejectsWith(previewSavedSearch(tx, account.accountId, EMPTY_CRITERIA), 400);
    });
  });
});
