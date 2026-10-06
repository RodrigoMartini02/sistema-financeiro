import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { tenderFavorites, tenderNotices, tenderNotifications } from '../db/schema';
import {
  buildNoticeRow,
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertTestNotice,
  localTestPool,
  trackNotice,
  withRollback,
} from './dbTestSupport';
import { COLLECTOR_LOCK_KEYS, deleteExpiredNotices, tryAcquireCollectorLock, upsertNoticePage } from './repository';

describe('repositório do coletor (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('upsert: novo, inalterado e atualizado', async () => {
    await withRollback(async (tx) => {
      const first = buildNoticeRow({ procurementObject: 'Sistema de gestão tributária' });
      const second = buildNoticeRow({ procurementObject: 'Digitalização de documentos' });

      const inserted = await upsertNoticePage(tx, [first, second]);
      assert.equal(inserted.insertedIds.length, 2);
      assert.equal(inserted.updatedIds.length, 0);

      const unchanged = await upsertNoticePage(tx, [first, second]);
      assert.deepEqual(unchanged, { insertedIds: [], updatedIds: [], unchangedCount: 2 });

      const changedPayload = { ...(first.payload as object), objetoCompra: 'Sistema de gestão tributária e ISS' };
      const changedFirst = buildNoticeRow({
        ...first,
        procurementObject: 'Sistema de gestão tributária e ISS',
        payload: changedPayload,
        payloadHash: undefined,
      });
      const updated = await upsertNoticePage(tx, [changedFirst, second]);
      assert.equal(updated.insertedIds.length, 0);
      assert.equal(updated.updatedIds.length, 1);
      assert.equal(updated.unchangedCount, 1);

      const [stored] = await tx
        .select({ procurementObject: tenderNotices.procurementObject })
        .from(tenderNotices)
        .where(eq(tenderNotices.pncpControlNumber, first.pncpControlNumber));
      assert.equal(stored?.procurementObject, 'Sistema de gestão tributária e ISS');
    });
  });

  test('upsert: só a data de atualização mudou também regrava', async () => {
    await withRollback(async (tx) => {
      const row = buildNoticeRow({ pncpUpdatedAt: '2026-10-01T10:00:00' });
      await upsertNoticePage(tx, [row]);
      const result = await upsertNoticePage(tx, [{ ...row, pncpUpdatedAt: '2026-10-02T10:00:00' }]);
      assert.equal(result.updatedIds.length, 1);
    });
  });

  test('upsert: o mesmo edital duas vezes na página não quebra', async () => {
    await withRollback(async (tx) => {
      const row = buildNoticeRow();
      const result = await upsertNoticePage(tx, [row, { ...row, procurementObject: 'Versão mais nova' }]);
      assert.equal(result.insertedIds.length, 1);
      const [stored] = await tx
        .select({ procurementObject: tenderNotices.procurementObject })
        .from(tenderNotices)
        .where(eq(tenderNotices.pncpControlNumber, row.pncpControlNumber));
      assert.equal(stored?.procurementObject, 'Versão mais nova');
    });
  });

  test('limpeza: apaga encerrados há mais de 12 meses e os sem prazo, menos acompanhados, favoritos ou com notificação não lida', async () => {
    await withRollback(async (tx) => {
      const { accountId, ownerId } = await createTestAccount(tx, 'limpeza');
      const withoutDeadline = await insertTestNotice(tx, { proposalClosesAt: null });
      const withoutDeadlineTracked = await insertTestNotice(tx, { proposalClosesAt: null });
      const withoutDeadlineUnread = await insertTestNotice(tx, { proposalClosesAt: null });
      const withoutDeadlineRead = await insertTestNotice(tx, { proposalClosesAt: null });
      const closedLongAgo = await insertTestNotice(tx, { proposalClosesAt: '2025-08-01T10:00:00' });
      const closedLongAgoFavorite = await insertTestNotice(tx, { proposalClosesAt: '2025-08-01T10:00:00' });
      const closedRecently = await insertTestNotice(tx, { proposalClosesAt: '2026-09-01T10:00:00' });
      const open = await insertTestNotice(tx, { proposalClosesAt: '2099-01-01T10:00:00' });

      await trackNotice(tx, { accountId, noticeId: withoutDeadlineTracked, status: 'ANALISAR', userId: ownerId });
      await tx.insert(tenderFavorites).values({ accountId, userId: ownerId, noticeId: closedLongAgoFavorite });
      const notification = { accountId, userId: ownerId, type: 'NOVO_EDITAL' as const, title: 'Novo edital: teste' };
      await tx.insert(tenderNotifications).values([
        { ...notification, link: `/editais/${withoutDeadlineUnread}`, noticeId: withoutDeadlineUnread },
        { ...notification, link: `/editais/${withoutDeadlineRead}`, noticeId: withoutDeadlineRead, readAt: '2026-10-01T10:00:00' },
      ]);

      const removed = await deleteExpiredNotices(tx, 12);
      assert.ok(removed >= 3, 'ao menos os três editais de teste sem proteção');

      const remaining = await tx
        .select({ id: tenderNotices.id })
        .from(tenderNotices)
        .where(
          inArray(tenderNotices.id, [
            withoutDeadline,
            withoutDeadlineTracked,
            withoutDeadlineUnread,
            withoutDeadlineRead,
            closedLongAgo,
            closedLongAgoFavorite,
            closedRecently,
            open,
          ]),
        );
      assert.deepEqual(
        remaining.map((row) => row.id).sort((a, b) => a - b),
        [withoutDeadlineTracked, withoutDeadlineUnread, closedLongAgoFavorite, closedRecently, open].sort((a, b) => a - b),
      );
    });
  });

  test('lock: com uma coleta em andamento, a segunda não consegue o lock', async () => {
    const pool = localTestPool();
    const firstLock = await tryAcquireCollectorLock(pool, COLLECTOR_LOCK_KEYS.collection);
    assert.ok(firstLock, 'a primeira coleta deveria obter o lock');
    try {
      const secondLock = await tryAcquireCollectorLock(pool, COLLECTOR_LOCK_KEYS.collection);
      assert.equal(secondLock, null);
      const maintenanceLock = await tryAcquireCollectorLock(pool, COLLECTOR_LOCK_KEYS.maintenance);
      assert.ok(maintenanceLock, 'lembretes e limpeza usam outro lock');
      await maintenanceLock.release();
    } finally {
      await firstLock.release();
    }
    const afterRelease = await tryAcquireCollectorLock(pool, COLLECTOR_LOCK_KEYS.collection);
    assert.ok(afterRelease, 'liberado o lock, a próxima coleta consegue');
    await afterRelease.release();
  });
});
