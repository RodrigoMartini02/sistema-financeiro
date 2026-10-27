import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { tenderContractFavorites, tenderFavorites, tenderNotifications, tenderTrackingHistory, tenderTrackings } from '../db/schema';
import { readLastDataUpdate } from './collectionOverview';
import { listContractSavedSearches } from './contractSavedSearches';
import { EMPTY_CRITERIA, openCondition, searchedNotice, searchNotices, type NoticeListItem } from './noticeSearch';
import { listNotifications, type NotificationView } from './notificationInbox';
import { summarizeOpenMatches } from './savedSearchMatches';
import { listSavedSearches } from './savedSearches';

// Painel da tela Início (escopo, seção 9.4, com a decisão 5 do plano da Fase 2 e o plano
// .plans/licitacoes-inicio-painel.md):
// - "Novos hoje": abertos coletados hoje que batem com alguma busca salva ativa do usuário;
// - "Encerrando em 7 dias": acompanhados pela conta (Analisar ou Vou participar);
// - "Em análise" e "Vou participar": acompanhamentos da conta com edital aberto;
// - valor estimado em disputa e funil de acompanhamento da conta;
// - alterações e notificações não lidas da pessoa, favoritos com prazo aberto e buscas salvas.
// Os contratos que vencem ficam em dashboardContracts.ts: leem o armazém do R2 e têm rota própria.

export const CLOSING_SOON_LIMIT = 10;
export const FAVORITES_LIMIT = 5;
export const RECENT_NOTIFICATIONS_LIMIT = 5;
const ACTIVE_TRACKING = ['ANALISAR', 'PARTICIPAR'] as const;
const FUNNEL_ENTRY_DAYS = { short: 7, long: 30 } as const;

interface Requester {
  accountId: number;
  userId: number;
}

export interface DashboardView {
  cards: { newToday: number; closingIn7Days: number; analyzing: number; participating: number; unreadChanges: number };
  /** Valor estimado (não é receita) dos editais abertos acompanhados como Analisar ou Vou participar. */
  pipeline: { estimatedValue: number; noticesWithoutValue: number };
  funnel: { analyzing: number; participating: number; discarded: number; enteredLast7Days: number; enteredLast30Days: number };
  closingSoon: NoticeListItem[];
  openByState: Array<{ state: string; count: number }>;
  savedSearches: Array<{
    id: number;
    name: string;
    active: boolean;
    openCount: number;
    newToday: number;
    newLast7Days: number;
    newLast30Days: number;
  }>;
  contractSavedSearches: Array<{ id: number; name: string; active: boolean; activeCount: number | null; countedAt: string | null }>;
  favorites: NoticeListItem[];
  notifications: { unreadCount: number; recent: NotificationView[] };
  /** O que a pessoa já fez no módulo; o Início usa para mostrar o guia da conta vazia. */
  setup: { hasSavedSearch: boolean; hasTracking: boolean; hasFavorite: boolean; notificationsEnabled: boolean };
  lastUpdateAt: string | null;
  lastRunFailed: boolean;
}

async function countAccountTrackings(db: TendersDb, accountId: number) {
  const isActive = inArray(tenderTrackings.status, [...ACTIVE_TRACKING]);
  const [row] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      analyzing: sql<number>`count(*) FILTER (WHERE ${tenderTrackings.status} = 'ANALISAR' AND ${openCondition})`.mapWith(Number),
      participating: sql<number>`count(*) FILTER (WHERE ${tenderTrackings.status} = 'PARTICIPAR' AND ${openCondition})`.mapWith(Number),
      discarded: sql<number>`count(*) FILTER (WHERE ${tenderTrackings.status} = 'DESCARTADO')`.mapWith(Number),
      closingIn7Days: sql<number>`count(*) FILTER (
        WHERE ${isActive}
          AND ${openCondition}
          AND ${searchedNotice.proposalClosesAt} <= now() + interval '7 days')`.mapWith(Number),
      estimatedValue: sql<number>`coalesce(sum(${searchedNotice.estimatedTotalValue}) FILTER (WHERE ${isActive} AND ${openCondition}), 0)`.mapWith(Number),
      noticesWithoutValue: sql<number>`count(*) FILTER (
        WHERE ${isActive} AND ${openCondition} AND ${searchedNotice.estimatedTotalValue} IS NULL)`.mapWith(Number),
    })
    .from(tenderTrackings)
    .innerJoin(searchedNotice, eq(searchedNotice.id, tenderTrackings.noticeId))
    .where(eq(tenderTrackings.accountId, accountId));
  return {
    total: row?.total ?? 0,
    analyzing: row?.analyzing ?? 0,
    participating: row?.participating ?? 0,
    discarded: row?.discarded ?? 0,
    closingIn7Days: row?.closingIn7Days ?? 0,
    estimatedValue: row?.estimatedValue ?? 0,
    noticesWithoutValue: row?.noticesWithoutValue ?? 0,
  };
}

/** Editais que a conta passou a acompanhar (Analisar ou Vou participar) nos últimos 7 e 30 dias, cada edital uma vez. */
async function countRecentEntries(db: TendersDb, accountId: number) {
  const [row] = await db
    .select({
      last7Days: sql<number>`count(DISTINCT ${tenderTrackingHistory.noticeId}) FILTER (
        WHERE ${tenderTrackingHistory.createdAt} >= now() - ${`${FUNNEL_ENTRY_DAYS.short} days`}::interval)`.mapWith(Number),
      last30Days: sql<number>`count(DISTINCT ${tenderTrackingHistory.noticeId})`.mapWith(Number),
    })
    .from(tenderTrackingHistory)
    .where(
      and(
        eq(tenderTrackingHistory.accountId, accountId),
        inArray(tenderTrackingHistory.newStatus, [...ACTIVE_TRACKING]),
        sql`${tenderTrackingHistory.createdAt} >= now() - ${`${FUNNEL_ENTRY_DAYS.long} days`}::interval`,
      ),
    );
  return { last7Days: row?.last7Days ?? 0, last30Days: row?.last30Days ?? 0 };
}

async function countUnreadChanges(db: TendersDb, requester: Requester): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(tenderNotifications)
    .where(
      and(
        eq(tenderNotifications.accountId, requester.accountId),
        eq(tenderNotifications.userId, requester.userId),
        eq(tenderNotifications.type, 'EDITAL_ALTERADO'),
        isNull(tenderNotifications.readAt),
      ),
    );
  return row?.total ?? 0;
}

/** Se a pessoa tem algum favorito na conta, de edital ou de contrato. */
async function hasAnyFavorite(db: TendersDb, requester: Requester): Promise<boolean> {
  const [notices, contracts] = await Promise.all([
    db
      .select({ noticeId: tenderFavorites.noticeId })
      .from(tenderFavorites)
      .where(and(eq(tenderFavorites.accountId, requester.accountId), eq(tenderFavorites.userId, requester.userId)))
      .limit(1),
    db
      .select({ contractKey: tenderContractFavorites.contractKey })
      .from(tenderContractFavorites)
      .where(and(eq(tenderContractFavorites.accountId, requester.accountId), eq(tenderContractFavorites.userId, requester.userId)))
      .limit(1),
  ]);
  return notices.length > 0 || contracts.length > 0;
}

export async function readDashboard(db: TendersDb, requester: Requester): Promise<DashboardView> {
  const [
    trackings,
    recentEntries,
    matches,
    closingSoon,
    favorites,
    savedSearches,
    contractSavedSearches,
    unreadNotifications,
    unreadChanges,
    hasFavorite,
    lastUpdate,
  ] = await Promise.all([
    countAccountTrackings(db, requester.accountId),
    countRecentEntries(db, requester.accountId),
    summarizeOpenMatches(db, requester.accountId, requester.userId),
    searchNotices(db, requester, {
      criteria: EMPTY_CRITERIA,
      publishedFrom: null,
      publishedTo: null,
      closingFrom: null,
      closingTo: null,
      openOnly: true,
      trackingStatuses: [...ACTIVE_TRACKING],
      hideDiscarded: true,
      favoritesOnly: false,
      numberGroups: [],
      purchaseYear: null,
      sort: 'closingAsc',
      page: 1,
      perPage: CLOSING_SOON_LIMIT,
    }),
    searchNotices(db, requester, {
      criteria: EMPTY_CRITERIA,
      publishedFrom: null,
      publishedTo: null,
      closingFrom: null,
      closingTo: null,
      openOnly: true,
      trackingStatuses: [],
      hideDiscarded: true,
      favoritesOnly: true,
      numberGroups: [],
      purchaseYear: null,
      sort: 'closingAsc',
      page: 1,
      perPage: FAVORITES_LIMIT,
    }),
    listSavedSearches(db, requester),
    listContractSavedSearches(db, requester),
    listNotifications(db, requester, { unreadOnly: true, type: null, page: 1, perPage: RECENT_NOTIFICATIONS_LIMIT }),
    countUnreadChanges(db, requester),
    hasAnyFavorite(db, requester),
    readLastDataUpdate(db),
  ]);

  const newBySearch = new Map(matches.newBySearch.map((item) => [item.searchId, item]));

  return {
    cards: {
      newToday: matches.newToday,
      closingIn7Days: trackings.closingIn7Days,
      analyzing: trackings.analyzing,
      participating: trackings.participating,
      unreadChanges,
    },
    pipeline: { estimatedValue: trackings.estimatedValue, noticesWithoutValue: trackings.noticesWithoutValue },
    funnel: {
      analyzing: trackings.analyzing,
      participating: trackings.participating,
      discarded: trackings.discarded,
      enteredLast7Days: recentEntries.last7Days,
      enteredLast30Days: recentEntries.last30Days,
    },
    closingSoon: closingSoon.items,
    openByState: matches.openByState,
    savedSearches: savedSearches.map(({ id, name, active, openCount }) => ({
      id,
      name,
      active,
      openCount,
      newToday: newBySearch.get(id)?.newToday ?? 0,
      newLast7Days: newBySearch.get(id)?.newLast7Days ?? 0,
      newLast30Days: newBySearch.get(id)?.newLast30Days ?? 0,
    })),
    contractSavedSearches: contractSavedSearches.map(({ id, name, active, activeCount, countedAt }) => ({
      id,
      name,
      active,
      activeCount,
      countedAt,
    })),
    favorites: favorites.items,
    notifications: { unreadCount: unreadNotifications.total, recent: unreadNotifications.items },
    setup: {
      hasSavedSearch: savedSearches.length > 0 || contractSavedSearches.length > 0,
      hasTracking: trackings.total > 0,
      hasFavorite,
      notificationsEnabled: [...savedSearches, ...contractSavedSearches].some((search) => search.active && search.notify),
    },
    lastUpdateAt: lastUpdate.lastUpdateAt,
    lastRunFailed: lastUpdate.lastRunFailed,
  };
}
