import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { tenderNotifications } from '../db/schema';
import type { TenderNotificationType } from '../domains';
import { toBrasiliaIso } from './dates';
import type { Paginated } from './noticeSearch';

// Notificações do módulo (escopo, seção 8.3): o coletor grava, a API lê. Cada
// pessoa só vê e marca as próprias, na conta da requisição.

interface Requester {
  accountId: number;
  userId: number;
}

export interface NotificationView {
  id: number;
  type: TenderNotificationType;
  title: string;
  message: string | null;
  /** Caminho a partir do início do app do módulo (ex.: /editais/123 ou /contratos/<chave codificada>). */
  link: string;
  noticeId: number | null;
  /** Aviso de contrato (vencimento ou vencimento alterado): o número de controle do contrato. */
  contractKey: string | null;
  savedSearchId: number | null;
  readAt: string | null;
  createdAt: string | null;
}

export interface NotificationListFilters {
  unreadOnly: boolean;
  type: TenderNotificationType | null;
  page: number;
  perPage: number;
}

function ownNotifications(requester: Requester) {
  return and(eq(tenderNotifications.accountId, requester.accountId), eq(tenderNotifications.userId, requester.userId));
}

// Título antigo do EDITAL_ALTERADO, gravado antes da parte 7 do plano
// .plans/licitacoes-base-nacional.md: a tela mostra o título atual, sem citar a fonte.
const LEGACY_CHANGED_NOTICE_TITLE = 'Edital acompanhado foi alterado no PNCP';
const CHANGED_NOTICE_TITLE = 'Edital acompanhado foi alterado';

export function notificationTitle(storedTitle: string): string {
  return storedTitle === LEGACY_CHANGED_NOTICE_TITLE ? CHANGED_NOTICE_TITLE : storedTitle;
}

export async function listNotifications(
  db: TendersDb,
  requester: Requester,
  filters: NotificationListFilters,
): Promise<Paginated<NotificationView>> {
  const where = and(
    ownNotifications(requester),
    filters.unreadOnly ? isNull(tenderNotifications.readAt) : undefined,
    filters.type ? eq(tenderNotifications.type, filters.type) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(tenderNotifications)
      .where(where)
      .orderBy(desc(tenderNotifications.createdAt), desc(tenderNotifications.id))
      .limit(filters.perPage)
      .offset((filters.page - 1) * filters.perPage),
    db.select({ total: count() }).from(tenderNotifications).where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: notificationTitle(row.title),
      message: row.message,
      link: row.link,
      noticeId: row.noticeId,
      contractKey: row.contractKey,
      savedSearchId: row.savedSearchId,
      readAt: toBrasiliaIso(row.readAt),
      createdAt: toBrasiliaIso(row.createdAt),
    })),
    page: filters.page,
    perPage: filters.perPage,
    total,
    totalPages: Math.ceil(total / filters.perPage),
  };
}

export async function countUnreadNotifications(db: TendersDb, requester: Requester): Promise<number> {
  const [row] = await db
    .select({ unread: count() })
    .from(tenderNotifications)
    .where(and(ownNotifications(requester), isNull(tenderNotifications.readAt)));
  return row?.unread ?? 0;
}

/** Marca como lida; já lida continua com a data da primeira leitura. */
export async function markNotificationRead(db: TendersDb, requester: Requester, notificationId: number): Promise<void> {
  const updated = await db
    .update(tenderNotifications)
    .set({ readAt: sql`coalesce(${tenderNotifications.readAt}, now())` })
    .where(and(eq(tenderNotifications.id, notificationId), ownNotifications(requester)))
    .returning({ id: tenderNotifications.id });
  if (updated.length === 0) {
    throw new RequestInputError('Notificação não encontrada', 404);
  }
}

export async function markAllNotificationsRead(db: TendersDb, requester: Requester): Promise<number> {
  const updated = await db
    .update(tenderNotifications)
    .set({ readAt: sql`now()` })
    .where(and(ownNotifications(requester), isNull(tenderNotifications.readAt)))
    .returning({ id: tenderNotifications.id });
  return updated.length;
}
