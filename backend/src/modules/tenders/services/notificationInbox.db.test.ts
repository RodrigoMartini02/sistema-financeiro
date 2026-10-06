import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertTestNotice,
  withRollback,
} from '../collector/dbTestSupport';
import { tenderNotifications } from '../db/schema';
import type { TenderNotificationType } from '../domains';
import { addAccountMember, requesterOf, uniqueToken } from './apiTestSupport';
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notificationInbox';

// Notificações (escopo, seção 8.3): cada pessoa só vê e marca as próprias, na conta.

async function notify(
  tx: TendersDb,
  owner: { accountId: number; userId: number },
  type: TenderNotificationType,
  options: { read?: boolean } = {},
): Promise<number> {
  const noticeId = await insertTestNotice(tx, { procurementObject: `Edital ${uniqueToken()}` });
  const [row] = await tx
    .insert(tenderNotifications)
    .values({
      ...owner,
      type,
      title: `Notificação ${type}`,
      link: `/editais/${noticeId}`,
      noticeId,
      reference: type === 'NOVO_EDITAL' ? null : uniqueToken(),
      readAt: options.read ? '2026-10-01T10:00:00' : null,
    })
    .returning({ id: tenderNotifications.id });
  return row?.id ?? 0;
}

describe('notificações da pessoa (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('lista, filtros, contagem e marcar: só as da própria pessoa, na conta', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'notif');
      const other = await createTestAccount(tx, 'notif-outra');
      const colleague = await addAccountMember(tx, account, 'notif-colega', { access: true });
      const me = requesterOf(account);
      const colleagueRequester = { accountId: account.accountId, userId: colleague };

      const newNotice = await notify(tx, me, 'NOVO_EDITAL');
      await notify(tx, me, 'PRAZO_1D');
      await notify(tx, me, 'EDITAL_ALTERADO', { read: true });
      const fromColleague = await notify(tx, colleagueRequester, 'NOVO_EDITAL');
      await notify(tx, requesterOf(other), 'NOVO_EDITAL');

      const all = await listNotifications(tx, me, { unreadOnly: false, type: null, page: 1, perPage: 20 });
      assert.equal(all.total, 3);
      assert.ok(all.items.every((item) => item.link.startsWith('/editais/')));

      const unread = await listNotifications(tx, me, { unreadOnly: true, type: null, page: 1, perPage: 20 });
      assert.equal(unread.total, 2);
      const deadlines = await listNotifications(tx, me, { unreadOnly: false, type: 'PRAZO_1D', page: 1, perPage: 20 });
      assert.equal(deadlines.total, 1);
      const paged = await listNotifications(tx, me, { unreadOnly: false, type: null, page: 2, perPage: 2 });
      assert.equal(paged.items.length, 1);
      assert.equal(paged.totalPages, 2);

      assert.equal(await countUnreadNotifications(tx, me), 2);
      await markNotificationRead(tx, me, newNotice);
      await markNotificationRead(tx, me, newNotice);
      assert.equal(await countUnreadNotifications(tx, me), 1);

      await assert.rejects(
        markNotificationRead(tx, me, fromColleague),
        (error: unknown) => error instanceof RequestInputError && error.status === 404,
      );
      assert.equal(await markAllNotificationsRead(tx, me), 1);
      assert.equal(await countUnreadNotifications(tx, me), 0);
      assert.equal(await countUnreadNotifications(tx, colleagueRequester), 1, 'as da colega continuam não lidas');
    });
  });
});
