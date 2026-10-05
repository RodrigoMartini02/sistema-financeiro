import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { tenderEnabledAccounts, tenderNotices, tenderNotifications } from '../db/schema';
import type { TendersDb } from './database';
import {
  buildNoticeRow,
  closeLocalTestDatabase,
  createTestAccount,
  createTestUser,
  databaseTestsSkipReason,
  insertSavedSearch,
  insertTestNotice,
  trackNotice,
  withRollback,
} from './dbTestSupport';
import { notifyChangedNotices, notifyNewNotices, notifyNewNoticesCollectedSince, notifyUpcomingDeadlines } from './notifications';
import { upsertNoticePage } from './repository';

// Geração de notificações pelo coletor (seção 7.4 do escopo). Banco local,
// cada teste numa transação desfeita. As conferências olham só as contas do
// teste, nunca a contagem global.

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

async function notificationsOf(tx: TendersDb, accountIds: number[]) {
  return tx
    .select({
      accountId: tenderNotifications.accountId,
      userId: tenderNotifications.userId,
      type: tenderNotifications.type,
      title: tenderNotifications.title,
      link: tenderNotifications.link,
      noticeId: tenderNotifications.noticeId,
      savedSearchId: tenderNotifications.savedSearchId,
      reference: tenderNotifications.reference,
    })
    .from(tenderNotifications)
    .where(inArray(tenderNotifications.accountId, accountIds))
    .orderBy(asc(tenderNotifications.userId), asc(tenderNotifications.type));
}

describe('notificações do coletor (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('NOVO_EDITAL: uma por usuário e edital, com o link /editais/<id>', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'novo');
      const searchId = await insertSavedSearch(tx, {
        accountId: account.accountId,
        userId: account.ownerId,
        name: 'Gestão tributária',
        terms: ['tributária'],
      });
      // Segunda busca do mesmo usuário que também bate: continua uma notificação só.
      const secondSearchId = await insertSavedSearch(tx, { accountId: account.accountId, userId: account.ownerId, name: 'ISS', terms: ['gestão'] });
      const noticeId = await insertTestNotice(tx, { procurementObject: 'Sistema de gestão tributária e ISS' });

      assert.equal(await notifyNewNotices(tx, [noticeId]), 1);
      assert.equal(await notifyNewNotices(tx, [noticeId]), 0, 'rodar de novo não duplica');

      const [notification, ...others] = await notificationsOf(tx, [account.accountId]);
      assert.equal(others.length, 0);
      assert.equal(notification?.type, 'NOVO_EDITAL');
      assert.equal(notification?.userId, account.ownerId);
      assert.equal(notification?.link, `/editais/${noticeId}`);
      assert.equal(notification?.noticeId, noticeId);
      assert.ok([searchId, secondSearchId].includes(notification?.savedSearchId ?? -1), 'registra uma das buscas que bateram');
      assert.match(notification?.title ?? '', /^Novo edital: /);
    });
  });

  test('nada para conta não habilitada, habilitação inativa, busca inativa ou sem aviso', async () => {
    await withRollback(async (tx) => {
      const notEnabled = await createTestAccount(tx, 'sem-modulo', { enabled: false });
      const inactiveEnabling = await createTestAccount(tx, 'habilitacao-inativa');
      await tx.update(tenderEnabledAccounts).set({ active: false }).where(eq(tenderEnabledAccounts.accountId, inactiveEnabling.accountId));
      const searches = await createTestAccount(tx, 'buscas');

      const terms = ['digitalização'];
      await insertSavedSearch(tx, { accountId: notEnabled.accountId, userId: notEnabled.ownerId, terms });
      await insertSavedSearch(tx, { accountId: inactiveEnabling.accountId, userId: inactiveEnabling.ownerId, terms });
      await insertSavedSearch(tx, { accountId: searches.accountId, userId: searches.ownerId, terms, active: false });
      await insertSavedSearch(tx, { accountId: searches.accountId, userId: searches.ownerId, terms, notify: false });

      const noticeId = await insertTestNotice(tx, { procurementObject: 'Digitalização de documentos' });
      assert.equal(await notifyNewNotices(tx, [noticeId]), 0);
      assert.deepEqual(await notificationsOf(tx, [notEnabled.accountId, inactiveEnabling.accountId, searches.accountId]), []);
    });
  });

  test('busca criada depois não gera notificação retroativa', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'retroativa');
      const row = buildNoticeRow({ procurementObject: 'Prontuário eletrônico para a rede de saúde' });

      // Primeira coleta: o edital entra, mas ninguém tem busca ainda.
      const firstPage = await upsertNoticePage(tx, [row]);
      assert.equal(await notifyNewNotices(tx, firstPage.insertedIds), 0);

      await insertSavedSearch(tx, { accountId: account.accountId, userId: account.ownerId, terms: ['prontuário eletrônico'] });

      // Coletas seguintes: o edital não mudou, então não é novo e nada é gerado.
      const secondPage = await upsertNoticePage(tx, [row]);
      assert.deepEqual(secondPage.insertedIds, []);
      assert.equal(await notifyNewNotices(tx, secondPage.insertedIds), 0);
      assert.deepEqual(await notificationsOf(tx, [account.accountId]), []);
    });
  });

  test('EDITAL_ALTERADO: quem tem busca que bate e quem mexeu no acompanhamento; referência = data de atualização', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'alterado');
      const member = await createTestUser(tx, 'alterado-colaborador');
      const otherMember = await createTestUser(tx, 'alterado-outra-busca');
      const otherAccount = await createTestAccount(tx, 'alterado-outra-conta');

      const noticeId = await insertTestNotice(tx, {
        procurementObject: 'Sistema integrado de gestão pública',
        pncpUpdatedAt: '2026-10-01T10:00:00',
      });
      await insertSavedSearch(tx, { accountId: account.accountId, userId: account.ownerId, terms: ['gestão pública'] });
      await insertSavedSearch(tx, { accountId: account.accountId, userId: otherMember, terms: ['impressora'] });
      await trackNotice(tx, { accountId: account.accountId, noticeId, status: 'ANALISAR', userId: member });
      // A outra conta tem busca que bate, mas não acompanha: não recebe "alterado".
      await insertSavedSearch(tx, { accountId: otherAccount.accountId, userId: otherAccount.ownerId, terms: ['gestão pública'] });

      assert.equal(await notifyChangedNotices(tx, [noticeId]), 2);
      assert.equal(await notifyChangedNotices(tx, [noticeId]), 0, 'a mesma alteração não notifica de novo');

      const notifications = await notificationsOf(tx, [account.accountId, otherAccount.accountId]);
      assert.deepEqual(
        notifications.map((item) => [item.accountId, item.userId, item.type, item.reference, item.link]).sort(),
        [
          [account.accountId, account.ownerId, 'EDITAL_ALTERADO', '2026-10-01T10:00:00', `/editais/${noticeId}`],
          [account.accountId, member, 'EDITAL_ALTERADO', '2026-10-01T10:00:00', `/editais/${noticeId}`],
        ].sort(),
      );

      // Nova alteração no PNCP: nova referência, nova notificação.
      await tx.update(tenderNotices).set({ pncpUpdatedAt: '2026-10-03T08:15:00' }).where(eq(tenderNotices.id, noticeId));
      assert.equal(await notifyChangedNotices(tx, [noticeId]), 2);
    });
  });

  test('EDITAL_ALTERADO: nada para conta que acompanha mas não está habilitada', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'alterado-sem-modulo', { enabled: false });
      const noticeId = await insertTestNotice(tx, { pncpUpdatedAt: '2026-10-01T10:00:00' });
      await trackNotice(tx, { accountId: account.accountId, noticeId, status: 'PARTICIPAR', userId: account.ownerId });
      assert.equal(await notifyChangedNotices(tx, [noticeId]), 0);
      assert.deepEqual(await notificationsOf(tx, [account.accountId]), []);
    });
  });

  test('prazos: só "Vou participar"; 3 dias e 1 dia pelas janelas de 72 h e 24 h; sem repetir', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'prazo');
      const inTwoDays = await insertTestNotice(tx, { proposalClosesAt: inHours(48) });
      const inHalfDay = await insertTestNotice(tx, { proposalClosesAt: inHours(12) });
      const inFiveDays = await insertTestNotice(tx, { proposalClosesAt: inHours(120) });
      const closed = await insertTestNotice(tx, { proposalClosesAt: inHours(-2) });
      const onlyAnalysing = await insertTestNotice(tx, { proposalClosesAt: inHours(12) });
      for (const noticeId of [inTwoDays, inHalfDay, inFiveDays, closed]) {
        await trackNotice(tx, { accountId: account.accountId, noticeId, status: 'PARTICIPAR', userId: account.ownerId });
      }
      await trackNotice(tx, { accountId: account.accountId, noticeId: onlyAnalysing, status: 'ANALISAR', userId: account.ownerId });

      await notifyUpcomingDeadlines(tx);
      const firstRound = await notificationsOf(tx, [account.accountId]);
      assert.deepEqual(
        firstRound.map((item) => [item.noticeId, item.type]).sort(),
        [
          [inHalfDay, 'PRAZO_1D'],
          [inHalfDay, 'PRAZO_3D'],
          [inTwoDays, 'PRAZO_3D'],
        ].sort(),
      );
      for (const item of firstRound) {
        assert.equal(item.link, `/editais/${item.noticeId}`);
        assert.match(item.reference ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'referência = data de encerramento');
      }

      await notifyUpcomingDeadlines(tx);
      assert.equal((await notificationsOf(tx, [account.accountId])).length, firstRound.length, 'rodar de novo não repete');

      // Prazo alterado por retificação: novo lembrete.
      await tx.update(tenderNotices).set({ proposalClosesAt: inHours(40) }).where(eq(tenderNotices.id, inTwoDays));
      await notifyUpcomingDeadlines(tx);
      assert.equal((await notificationsOf(tx, [account.accountId])).length, firstRound.length + 1);
    });
  });

  test('reprocessamento: só editais coletados desde a data e sem duplicar', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'reprocessar');
      await insertSavedSearch(tx, { accountId: account.accountId, userId: account.ownerId, terms: ['saúde'] });
      const recent = await insertTestNotice(tx, { procurementObject: 'Sistema de gestão em saúde' });
      const old = await insertTestNotice(tx, { procurementObject: 'Software de saúde da família' });
      await tx.update(tenderNotices).set({ firstCollectedAt: sql`now() - interval '40 days'` }).where(eq(tenderNotices.id, old));

      const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      assert.equal(await notifyNewNoticesCollectedSince(tx, since), 1);
      assert.equal(await notifyNewNoticesCollectedSince(tx, since), 0, 'reprocessar de novo não duplica');
      const notifications = await notificationsOf(tx, [account.accountId]);
      assert.deepEqual(notifications.map((item) => item.noticeId), [recent]);
    });
  });

  test('a busca de uma conta não gera notificação em outra', async () => {
    await withRollback(async (tx) => {
      const first = await createTestAccount(tx, 'isolamento-a');
      const second = await createTestAccount(tx, 'isolamento-b');
      await insertSavedSearch(tx, { accountId: first.accountId, userId: first.ownerId, terms: ['GED'] });
      const noticeId = await insertTestNotice(tx, { procurementObject: 'Implantação de GED e protocolo eletrônico' });
      assert.equal(await notifyNewNotices(tx, [noticeId]), 1);
      assert.equal((await notificationsOf(tx, [first.accountId])).length, 1);
      assert.deepEqual(await notificationsOf(tx, [second.accountId]), []);
    });
  });
});
