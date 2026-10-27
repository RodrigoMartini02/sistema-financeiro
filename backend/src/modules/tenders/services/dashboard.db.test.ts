import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertSavedSearch,
  insertTestNotice,
  trackNotice,
  withRollback,
} from '../collector/dbTestSupport';
import { tenderContractSavedSearches, tenderFavorites, tenderNotices, tenderNotifications } from '../db/schema';
import { requesterOf, uniqueToken } from './apiTestSupport';
import { readDashboard } from './dashboard';

// Painel (escopo, seção 9.4, decisão 5 do plano da Fase 2).

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('painel (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('cards, encerrando em breve, abertos por UF e buscas salvas', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'painel');
      const other = await createTestAccount(tx, 'painel-outra');
      const token = uniqueToken();
      const inactiveToken = uniqueToken();

      // Batem com a busca ativa: dois do MA (um coletado ontem) e um do PI.
      const todayMa = await insertTestNotice(tx, { procurementObject: `Sistema ${token}`, state: 'MA', proposalClosesAt: inDays(3) });
      const yesterdayMa = await insertTestNotice(tx, { procurementObject: `Sistema ${token}`, state: 'MA', proposalClosesAt: inDays(30) });
      await insertTestNotice(tx, { procurementObject: `Sistema ${token}`, state: 'PI', proposalClosesAt: inDays(30) });
      await tx
        .update(tenderNotices)
        .set({ firstCollectedAt: sql`now() - interval '1 day'` })
        .where(eq(tenderNotices.id, yesterdayMa));
      // Só bate com a busca inativa: não conta.
      await insertTestNotice(tx, { procurementObject: `Sistema ${inactiveToken}`, state: 'SP' });

      const activeSearch = await insertSavedSearch(tx, { ...requesterOf(account), name: 'Ativa', terms: [token] });
      await insertSavedSearch(tx, { ...requesterOf(account), name: 'Inativa', terms: [inactiveToken], active: false });

      // Acompanhamentos da conta: um encerra em 3 dias, outro em 30; o descartado e o da outra conta não contam.
      await trackNotice(tx, { accountId: account.accountId, noticeId: todayMa, status: 'PARTICIPAR', userId: account.ownerId });
      await trackNotice(tx, { accountId: account.accountId, noticeId: yesterdayMa, status: 'ANALISAR', userId: account.ownerId });
      const discarded = await insertTestNotice(tx, { procurementObject: `Outro ${uniqueToken()}`, proposalClosesAt: inDays(1) });
      await trackNotice(tx, { accountId: account.accountId, noticeId: discarded, status: 'DESCARTADO', userId: account.ownerId });
      const closed = await insertTestNotice(tx, { procurementObject: `Outro ${uniqueToken()}`, proposalClosesAt: inDays(-1) });
      await trackNotice(tx, { accountId: account.accountId, noticeId: closed, status: 'ANALISAR', userId: account.ownerId });
      await trackNotice(tx, { accountId: other.accountId, noticeId: todayMa, status: 'ANALISAR', userId: other.ownerId });

      const dashboard = await readDashboard(tx, requesterOf(account));
      assert.deepEqual(dashboard.cards, { newToday: 2, closingIn7Days: 1, analyzing: 1, participating: 1, unreadChanges: 0 });
      assert.deepEqual(dashboard.pipeline, { estimatedValue: 200_000, noticesWithoutValue: 0 }, 'só os abertos em Analisar ou Vou participar, da própria conta');
      assert.deepEqual(
        dashboard.funnel,
        { analyzing: 1, participating: 1, discarded: 1, enteredLast7Days: 3, enteredLast30Days: 3 },
        'no histórico entram os 3 que viraram Analisar ou Vou participar, mesmo o de prazo já encerrado; a outra conta não conta',
      );
      assert.deepEqual(dashboard.closingSoon.map((item) => item.id), [todayMa, yesterdayMa]);
      assert.deepEqual(dashboard.openByState, [
        { state: 'MA', count: 2 },
        { state: 'PI', count: 1 },
      ]);
      assert.deepEqual(
        dashboard.savedSearches.map(({ name, active, openCount }) => ({ name, active, openCount })),
        [
          { name: 'Ativa', active: true, openCount: 3 },
          { name: 'Inativa', active: false, openCount: 1 },
        ],
      );
      assert.ok(dashboard.savedSearches.some((search) => search.id === activeSearch));
      assert.deepEqual(
        dashboard.savedSearches.map(({ name, newToday, newLast7Days, newLast30Days }) => ({ name, newToday, newLast7Days, newLast30Days })),
        [
          { name: 'Ativa', newToday: 2, newLast7Days: 3, newLast30Days: 3 },
          { name: 'Inativa', newToday: 0, newLast7Days: 0, newLast30Days: 0 },
        ],
        'o coletado ontem não é "novo hoje", mas entra nos 7 e 30 dias; a busca inativa não conta',
      );
      assert.equal(typeof dashboard.lastRunFailed, 'boolean');
    });
  });

  test('conta vazia, valor em disputa, favoritos com prazo aberto, notificações, buscas de contratos e guia', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'painel-blocos');
      const other = await createTestAccount(tx, 'painel-blocos-outra');
      const requester = requesterOf(account);

      const empty = await readDashboard(tx, requester);
      assert.deepEqual(empty.setup, { hasSavedSearch: false, hasTracking: false, hasFavorite: false, notificationsEnabled: false });
      assert.deepEqual(empty.pipeline, { estimatedValue: 0, noticesWithoutValue: 0 });
      assert.deepEqual(empty.funnel, { analyzing: 0, participating: 0, discarded: 0, enteredLast7Days: 0, enteredLast30Days: 0 });
      assert.deepEqual(empty.notifications, { unreadCount: 0, recent: [] });
      assert.deepEqual(empty.favorites, []);
      assert.deepEqual(empty.contractSavedSearches, []);

      // Valor em disputa: soma só os abertos acompanhados como Analisar ou Vou participar; o sem valor é contado à parte.
      const withValue = await insertTestNotice(tx, { procurementObject: `Com valor ${uniqueToken()}`, estimatedTotalValue: '1500.50', proposalClosesAt: inDays(5) });
      const withoutValue = await insertTestNotice(tx, { procurementObject: `Sem valor ${uniqueToken()}`, estimatedTotalValue: null, proposalClosesAt: inDays(8) });
      const closedWithValue = await insertTestNotice(tx, { procurementObject: `Encerrado ${uniqueToken()}`, estimatedTotalValue: '900.00', proposalClosesAt: inDays(-1) });
      await trackNotice(tx, { accountId: account.accountId, noticeId: withValue, status: 'ANALISAR', userId: account.ownerId });
      await trackNotice(tx, { accountId: account.accountId, noticeId: withoutValue, status: 'PARTICIPAR', userId: account.ownerId });
      await trackNotice(tx, { accountId: account.accountId, noticeId: closedWithValue, status: 'ANALISAR', userId: account.ownerId });
      await trackNotice(tx, { accountId: other.accountId, noticeId: withValue, status: 'PARTICIPAR', userId: other.ownerId });

      // Favoritos: só os da própria pessoa e com prazo aberto.
      const favoriteOpen = await insertTestNotice(tx, { procurementObject: `Favorito ${uniqueToken()}`, proposalClosesAt: inDays(3) });
      const favoriteClosed = await insertTestNotice(tx, { procurementObject: `Favorito encerrado ${uniqueToken()}`, proposalClosesAt: inDays(-2) });
      await tx.insert(tenderFavorites).values([
        { accountId: account.accountId, userId: account.ownerId, noticeId: favoriteOpen },
        { accountId: account.accountId, userId: account.ownerId, noticeId: favoriteClosed },
        { accountId: other.accountId, userId: other.ownerId, noticeId: withValue },
      ]);

      // Notificações: 6 não lidas da pessoa (uma é edital alterado), uma alterada já lida e uma de outra pessoa.
      const unread = Array.from({ length: 5 }, (_, index) => ({
        accountId: account.accountId,
        userId: account.ownerId,
        type: 'NOVO_EDITAL' as const,
        title: `Novo edital ${index}`,
        link: `/editais/${withValue}`,
        noticeId: null,
        reference: String(index),
      }));
      await tx.insert(tenderNotifications).values([
        ...unread,
        { accountId: account.accountId, userId: account.ownerId, type: 'EDITAL_ALTERADO', title: 'Alterado', link: `/editais/${withValue}`, noticeId: withValue, reference: 'a' },
        { accountId: account.accountId, userId: account.ownerId, type: 'EDITAL_ALTERADO', title: 'Alterado lido', link: `/editais/${withoutValue}`, noticeId: withoutValue, reference: 'b', readAt: new Date().toISOString() },
        { accountId: other.accountId, userId: other.ownerId, type: 'EDITAL_ALTERADO', title: 'De outra pessoa', link: `/editais/${withValue}`, noticeId: withValue, reference: 'c' },
      ]);

      // Buscas de contratos: o total já gravado, sem ler o armazém; só as da própria pessoa.
      await tx.insert(tenderContractSavedSearches).values([
        { accountId: account.accountId, userId: account.ownerId, name: 'Contratos de limpeza', terms: ['limpeza'], activeTotal: 12, activeTotalAt: new Date().toISOString() },
        { accountId: account.accountId, userId: account.ownerId, name: 'Contratos pausada', terms: ['obra'], active: false, notify: false },
        { accountId: other.accountId, userId: other.ownerId, name: 'Contratos de outra pessoa', terms: ['limpeza'] },
      ]);

      const dashboard = await readDashboard(tx, requester);
      assert.deepEqual(dashboard.pipeline, { estimatedValue: 1500.5, noticesWithoutValue: 1 });
      assert.deepEqual(dashboard.funnel, { analyzing: 1, participating: 1, discarded: 0, enteredLast7Days: 3, enteredLast30Days: 3 });
      assert.deepEqual(dashboard.favorites.map((item) => item.id), [favoriteOpen]);
      assert.equal(dashboard.favorites[0]?.isFavorite, true);
      assert.equal(dashboard.cards.unreadChanges, 1, 'só o edital alterado não lido da própria pessoa');
      assert.equal(dashboard.notifications.unreadCount, 6);
      assert.equal(dashboard.notifications.recent.length, 5, 'as 5 mais recentes');
      assert.ok(dashboard.notifications.recent.every((item) => item.readAt === null));
      assert.deepEqual(
        dashboard.contractSavedSearches.map(({ name, active, activeCount }) => ({ name, active, activeCount })),
        [
          { name: 'Contratos de limpeza', active: true, activeCount: 12 },
          { name: 'Contratos pausada', active: false, activeCount: null },
        ],
      );
      assert.match(dashboard.contractSavedSearches[0]?.countedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(dashboard.contractSavedSearches[1]?.countedAt, null);
      assert.deepEqual(dashboard.setup, { hasSavedSearch: true, hasTracking: true, hasFavorite: true, notificationsEnabled: true });

      // Só a busca pausada (com ou sem aviso) não liga os avisos.
      const pausedOnly = await createTestAccount(tx, 'painel-pausada');
      await tx
        .insert(tenderContractSavedSearches)
        .values({ accountId: pausedOnly.accountId, userId: pausedOnly.ownerId, name: 'Pausada', terms: ['obra'], active: false });
      const paused = await readDashboard(tx, requesterOf(pausedOnly));
      assert.deepEqual(paused.setup, { hasSavedSearch: true, hasTracking: false, hasFavorite: false, notificationsEnabled: false });
    });
  });
});
