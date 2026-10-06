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
import { tenderNotices } from '../db/schema';
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
      assert.deepEqual(dashboard.cards, { newToday: 2, closingIn7Days: 1, analyzing: 1, participating: 1 });
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
      assert.equal(typeof dashboard.lastRunFailed, 'boolean');
    });
  });
});
