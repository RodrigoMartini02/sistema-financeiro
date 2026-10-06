import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { users } from '../../../db/schema/users';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { tenderFavorites, tenderNotices, tenderSavedSearches, tenderTrackingHistory, tenderTrackings } from '../db/schema';
import { TRACKING_REMOVED, type TrackingHistoryStatus, type TrackingStatus } from '../domains';
import { toBrasiliaIso } from './dates';
import type { NoticeTracking } from './noticeSearch';

// Detalhe do edital e acompanhamento da conta (escopo, seção 8.1). O edital é
// público (tabela global); acompanhamento e histórico são sempre da conta da
// requisição, e as buscas salvas e os favoritos, do próprio usuário.

export const MAX_TRACKING_NOTE_LENGTH = 2000;

const NOTICE_NOT_FOUND = 'Edital não encontrado';
const TRACKING_NOT_FOUND = 'Este edital não está acompanhado nesta conta';

interface Requester {
  accountId: number;
  userId: number;
}

export interface NoticeDetail {
  id: number;
  pncpControlNumber: string;
  procurementObject: string;
  additionalInformation: string | null;
  agencyCnpj: string | null;
  agencyName: string | null;
  governmentSphere: string | null;
  unitCode: string | null;
  unitName: string | null;
  state: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
  modalityId: number | null;
  modalityName: string | null;
  disputeModeId: number | null;
  disputeModeName: string | null;
  situationId: number | null;
  situationName: string | null;
  purchaseYear: number | null;
  purchaseSequence: number | null;
  purchaseNumber: string | null;
  processNumber: string | null;
  isPriceRegistration: boolean | null;
  estimatedTotalValue: number | null;
  publishedAt: string | null;
  proposalOpensAt: string | null;
  proposalClosesAt: string | null;
  pncpUpdatedAt: string | null;
  pncpLink: string | null;
  sourceSystemLink: string | null;
  firstCollectedAt: string | null;
  lastCollectedAt: string | null;
  tracking: (NoticeTracking & { note: string | null }) | null;
  /** Favorito de quem abriu o edital (cada pessoa tem os seus). */
  isFavorite: boolean;
  matchingSavedSearches: Array<{ id: number; name: string }>;
}

export interface TrackingHistoryEntry {
  id: number;
  previousStatus: TrackingHistoryStatus | null;
  newStatus: TrackingHistoryStatus;
  note: string | null;
  userId: number | null;
  userName: string | null;
  createdAt: string | null;
}

/** Favorito da pessoa na conta, para o edital informado. */
function favoriteOf(requester: Requester, noticeId: typeof tenderNotices.id | number) {
  return and(
    eq(tenderFavorites.accountId, requester.accountId),
    eq(tenderFavorites.userId, requester.userId),
    eq(tenderFavorites.noticeId, noticeId),
  );
}

export async function assertNoticeExists(db: TendersDb, noticeId: number): Promise<void> {
  const [notice] = await db.select({ id: tenderNotices.id }).from(tenderNotices).where(eq(tenderNotices.id, noticeId)).limit(1);
  if (!notice) {
    throw new RequestInputError(NOTICE_NOT_FOUND, 404);
  }
}

export async function getNoticeDetail(db: TendersDb, requester: Requester, noticeId: number): Promise<NoticeDetail> {
  const [row] = await db
    .select({
      notice: tenderNotices,
      trackingStatus: tenderTrackings.status,
      trackingNote: tenderTrackings.note,
      trackingUpdatedAt: tenderTrackings.updatedAt,
      favoritedAt: tenderFavorites.createdAt,
    })
    .from(tenderNotices)
    .leftJoin(
      tenderTrackings,
      and(eq(tenderTrackings.noticeId, tenderNotices.id), eq(tenderTrackings.accountId, requester.accountId)),
    )
    .leftJoin(tenderFavorites, favoriteOf(requester, tenderNotices.id))
    .where(eq(tenderNotices.id, noticeId))
    .limit(1);
  if (!row) {
    throw new RequestInputError(NOTICE_NOT_FOUND, 404);
  }

  const notice = alias(tenderNotices, 'e');
  const search = alias(tenderSavedSearches, 'b');
  const matchingSavedSearches = await db
    .select({ id: search.id, name: search.name })
    .from(search)
    .innerJoin(notice, eq(notice.id, noticeId))
    .where(
      and(
        eq(search.accountId, requester.accountId),
        eq(search.userId, requester.userId),
        eq(search.active, true),
        sql`licitacoes.fn_edital_bate(${sql.identifier('e')}, ${sql.identifier('b')})`,
      ),
    )
    .orderBy(asc(search.name));

  const { notice: data } = row;
  return {
    id: data.id,
    pncpControlNumber: data.pncpControlNumber,
    procurementObject: data.procurementObject,
    additionalInformation: data.additionalInformation,
    agencyCnpj: data.agencyCnpj,
    agencyName: data.agencyName,
    governmentSphere: data.governmentSphere,
    unitCode: data.unitCode,
    unitName: data.unitName,
    state: data.state?.trim() ?? null,
    cityName: data.cityName,
    cityIbgeCode: data.cityIbgeCode,
    modalityId: data.modalityId,
    modalityName: data.modalityName,
    disputeModeId: data.disputeModeId,
    disputeModeName: data.disputeModeName,
    situationId: data.situationId,
    situationName: data.situationName,
    purchaseYear: data.purchaseYear,
    purchaseSequence: data.purchaseSequence,
    purchaseNumber: data.purchaseNumber,
    processNumber: data.processNumber,
    isPriceRegistration: data.isPriceRegistration,
    estimatedTotalValue: data.estimatedTotalValue === null ? null : Number(data.estimatedTotalValue),
    publishedAt: toBrasiliaIso(data.publishedAt),
    proposalOpensAt: toBrasiliaIso(data.proposalOpensAt),
    proposalClosesAt: toBrasiliaIso(data.proposalClosesAt),
    pncpUpdatedAt: toBrasiliaIso(data.pncpUpdatedAt),
    pncpLink: data.pncpLink,
    sourceSystemLink: data.sourceSystemLink,
    firstCollectedAt: toBrasiliaIso(data.firstCollectedAt),
    lastCollectedAt: toBrasiliaIso(data.lastCollectedAt),
    tracking: row.trackingStatus
      ? { status: row.trackingStatus, note: row.trackingNote, updatedAt: toBrasiliaIso(row.trackingUpdatedAt) }
      : null,
    isFavorite: row.favoritedAt !== null,
    matchingSavedSearches,
  };
}

/**
 * Cria ou altera o acompanhamento da conta. O histórico entra na mesma
 * transação, e só quando o status ou a observação mudam.
 */
export async function saveTracking(
  db: TendersDb,
  requester: Requester,
  noticeId: number,
  input: { status: TrackingStatus; note: string | null },
): Promise<NoticeTracking & { note: string | null }> {
  const note = input.note?.trim() ? input.note.trim() : null;
  return db.transaction(async (tx) => {
    await assertNoticeExists(tx, noticeId);
    const [current] = await tx
      .select()
      .from(tenderTrackings)
      .where(and(eq(tenderTrackings.accountId, requester.accountId), eq(tenderTrackings.noticeId, noticeId)))
      .for('update');
    if (current && current.status === input.status && current.note === note) {
      return { status: current.status, note: current.note, updatedAt: toBrasiliaIso(current.updatedAt) };
    }

    const [saved] = await tx
      .insert(tenderTrackings)
      .values({ accountId: requester.accountId, noticeId, status: input.status, note, updatedBy: requester.userId })
      .onConflictDoUpdate({
        target: [tenderTrackings.accountId, tenderTrackings.noticeId],
        set: { status: input.status, note, updatedBy: requester.userId, updatedAt: sql`now()` },
      })
      .returning();
    if (!saved) {
      throw new Error('acompanhamento não gravado');
    }
    await tx.insert(tenderTrackingHistory).values({
      accountId: requester.accountId,
      noticeId,
      previousStatus: current?.status ?? null,
      newStatus: input.status,
      note,
      userId: requester.userId,
    });
    return { status: saved.status, note: saved.note, updatedAt: toBrasiliaIso(saved.updatedAt) };
  });
}

/** Remove o acompanhamento da conta e registra a remoção no histórico (REMOVIDO). */
export async function removeTracking(db: TendersDb, requester: Requester, noticeId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(tenderTrackings)
      .where(and(eq(tenderTrackings.accountId, requester.accountId), eq(tenderTrackings.noticeId, noticeId)))
      .returning({ status: tenderTrackings.status });
    if (!removed) {
      throw new RequestInputError(TRACKING_NOT_FOUND, 404);
    }
    await tx.insert(tenderTrackingHistory).values({
      accountId: requester.accountId,
      noticeId,
      previousStatus: removed.status,
      newStatus: TRACKING_REMOVED,
      userId: requester.userId,
    });
  });
}

/** Histórico do acompanhamento na conta, do mais recente para o mais antigo. */
export async function listTrackingHistory(db: TendersDb, accountId: number, noticeId: number): Promise<TrackingHistoryEntry[]> {
  await assertNoticeExists(db, noticeId);
  const rows = await db
    .select({
      id: tenderTrackingHistory.id,
      previousStatus: tenderTrackingHistory.previousStatus,
      newStatus: tenderTrackingHistory.newStatus,
      note: tenderTrackingHistory.note,
      userId: tenderTrackingHistory.userId,
      userName: users.name,
      createdAt: tenderTrackingHistory.createdAt,
    })
    .from(tenderTrackingHistory)
    .leftJoin(users, eq(users.id, tenderTrackingHistory.userId))
    .where(and(eq(tenderTrackingHistory.accountId, accountId), eq(tenderTrackingHistory.noticeId, noticeId)))
    .orderBy(desc(tenderTrackingHistory.createdAt), desc(tenderTrackingHistory.id));
  return rows.map((row) => ({ ...row, createdAt: toBrasiliaIso(row.createdAt) }));
}

/** Marca o edital como favorito da pessoa na conta. Repetir não duplica; edital inexistente: 404. */
export async function addFavorite(db: TendersDb, requester: Requester, noticeId: number): Promise<{ noticeId: number; isFavorite: true }> {
  await assertNoticeExists(db, noticeId);
  await db
    .insert(tenderFavorites)
    .values({ accountId: requester.accountId, userId: requester.userId, noticeId })
    .onConflictDoNothing();
  return { noticeId, isFavorite: true };
}

/** Tira o edital dos favoritos da pessoa na conta. Se não era favorito, nada muda; edital inexistente: 404. */
export async function removeFavorite(db: TendersDb, requester: Requester, noticeId: number): Promise<{ noticeId: number; isFavorite: false }> {
  await assertNoticeExists(db, noticeId);
  await db.delete(tenderFavorites).where(favoriteOf(requester, noticeId));
  return { noticeId, isFavorite: false };
}
