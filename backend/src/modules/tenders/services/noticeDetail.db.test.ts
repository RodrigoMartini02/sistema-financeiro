import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, count, eq } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertSavedSearch,
  insertTestNotice,
  withRollback,
} from '../collector/dbTestSupport';
import { tenderFavorites } from '../db/schema';
import { addAccountMember, requesterOf, uniqueToken } from './apiTestSupport';
import { addFavorite, getNoticeDetail, listTrackingHistory, removeFavorite, removeTracking, saveTracking } from './noticeDetail';
import { criteriaOnlyFilters, EMPTY_CRITERIA, searchNotices } from './noticeSearch';

// Detalhe do edital e acompanhamento da conta (escopo, seção 8.1).

const isNotFound = (error: unknown) => error instanceof RequestInputError && error.status === 404;

describe('detalhe e acompanhamento (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('detalhe: acompanhamento só da conta e buscas salvas ativas do próprio usuário que batem', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'detalhe');
      const other = await createTestAccount(tx, 'detalhe-outra');
      const colleague = await addAccountMember(tx, account, 'detalhe-colega', { access: true });
      const token = uniqueToken();
      const noticeId = await insertTestNotice(tx, {
        procurementObject: `Gestão de licitações ${token}`,
        proposalClosesAt: '2099-10-20T09:30:00',
      });
      const matching = await insertSavedSearch(tx, { ...requesterOf(account), name: 'Bate', terms: [`licitação ${token}`] });
      await insertSavedSearch(tx, { ...requesterOf(account), name: 'Inativa', terms: [token], active: false });
      await insertSavedSearch(tx, { ...requesterOf(account), name: 'Não bate', terms: [`impressora ${token}`] });
      await insertSavedSearch(tx, { accountId: account.accountId, userId: colleague, name: 'Do colega', terms: [token] });
      await saveTracking(tx, requesterOf(other), noticeId, { status: 'PARTICIPAR', note: 'outra conta' });

      const detail = await getNoticeDetail(tx, requesterOf(account), noticeId);
      assert.equal(detail.procurementObject, `Gestão de licitações ${token}`);
      assert.equal(detail.proposalClosesAt, '2099-10-20T09:30:00-03:00');
      assert.equal(detail.tracking, null, 'o acompanhamento de outra conta não aparece');
      assert.deepEqual(detail.matchingSavedSearches, [{ id: matching, name: 'Bate' }]);

      await assert.rejects(getNoticeDetail(tx, requesterOf(account), 999_999_999), isNotFound);
    });
  });

  test('acompanhar, mudar, repetir sem mudança e remover: histórico com quem mudou', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'acompanha');
      const colleague = await addAccountMember(tx, account, 'acompanha-colega', { access: true });
      const noticeId = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}` });

      const first = await saveTracking(tx, requesterOf(account), noticeId, { status: 'ANALISAR', note: '  ver edital  ' });
      assert.equal(first.status, 'ANALISAR');
      assert.equal(first.note, 'ver edital');
      await saveTracking(tx, requesterOf(account), noticeId, { status: 'ANALISAR', note: 'ver edital' });
      await saveTracking(tx, { accountId: account.accountId, userId: colleague }, noticeId, { status: 'PARTICIPAR', note: null });
      await removeTracking(tx, requesterOf(account), noticeId);

      const history = await listTrackingHistory(tx, account.accountId, noticeId);
      assert.deepEqual(
        history.map(({ previousStatus, newStatus, note, userId }) => ({ previousStatus, newStatus, note, userId })),
        [
          { previousStatus: 'PARTICIPAR', newStatus: 'REMOVIDO', note: null, userId: account.ownerId },
          { previousStatus: 'ANALISAR', newStatus: 'PARTICIPAR', note: null, userId: colleague },
          { previousStatus: null, newStatus: 'ANALISAR', note: 'ver edital', userId: account.ownerId },
        ],
        'repetir o mesmo status e a mesma observação não grava histórico',
      );
      assert.ok(history.every((entry) => entry.userName?.startsWith('Teste licitações')));
      assert.equal((await getNoticeDetail(tx, requesterOf(account), noticeId)).tracking, null);
    });
  });

  test('remover sem acompanhamento e acompanhar edital inexistente: não encontrado', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'acompanha-404');
      const other = await createTestAccount(tx, 'acompanha-404-outra');
      const noticeId = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}` });
      await saveTracking(tx, requesterOf(other), noticeId, { status: 'ANALISAR', note: null });

      await assert.rejects(removeTracking(tx, requesterOf(account), noticeId), isNotFound, 'o da outra conta não conta');
      await assert.rejects(saveTracking(tx, requesterOf(account), 999_999_999, { status: 'ANALISAR', note: null }), isNotFound);
      await assert.rejects(listTrackingHistory(tx, account.accountId, 999_999_999), isNotFound);
      assert.deepEqual(await listTrackingHistory(tx, account.accountId, noticeId), [], 'histórico da outra conta não aparece');
    });
  });

  test('favoritos: de cada pessoa, sem duplicar, no detalhe e na busca; edital inexistente: não encontrado', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'favorito');
      const colleague = await addAccountMember(tx, account, 'favorito-colega', { access: true });
      const token = uniqueToken();
      const favoriteId = await insertTestNotice(tx, { procurementObject: `Favorito ${token}`, proposalClosesAt: '2099-10-20T09:30:00' });
      const otherId = await insertTestNotice(tx, { procurementObject: `Outro ${token}`, proposalClosesAt: '2099-10-21T09:30:00' });
      const owner = requesterOf(account);
      const colleagueRequester = { accountId: account.accountId, userId: colleague };

      assert.deepEqual(await addFavorite(tx, owner, favoriteId), { noticeId: favoriteId, isFavorite: true });
      await addFavorite(tx, owner, favoriteId);
      const [stored] = await tx
        .select({ total: count() })
        .from(tenderFavorites)
        .where(and(eq(tenderFavorites.accountId, account.accountId), eq(tenderFavorites.noticeId, favoriteId)));
      assert.equal(stored?.total, 1, 'favoritar de novo não duplica');

      assert.equal((await getNoticeDetail(tx, owner, favoriteId)).isFavorite, true);
      assert.equal((await getNoticeDetail(tx, colleagueRequester, favoriteId)).isFavorite, false, 'o favorito é só de quem marcou');

      const filters = { ...criteriaOnlyFilters({ ...EMPTY_CRITERIA, terms: [token] }, 100), hideDiscarded: false };
      const all = await searchNotices(tx, owner, filters);
      assert.deepEqual(
        all.items.map((item) => [item.id, item.isFavorite]),
        [
          [favoriteId, true],
          [otherId, false],
        ],
      );
      assert.deepEqual((await searchNotices(tx, owner, { ...filters, favoritesOnly: true })).items.map((item) => item.id), [favoriteId]);
      assert.equal((await searchNotices(tx, colleagueRequester, { ...filters, favoritesOnly: true })).total, 0);

      assert.deepEqual(await removeFavorite(tx, owner, favoriteId), { noticeId: favoriteId, isFavorite: false });
      await removeFavorite(tx, owner, favoriteId);
      assert.equal((await getNoticeDetail(tx, owner, favoriteId)).isFavorite, false);

      await assert.rejects(addFavorite(tx, owner, 999_999_999_999), isNotFound);
      await assert.rejects(removeFavorite(tx, owner, 999_999_999_999), isNotFound);
    });
  });
});
