import { eq, inArray, sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { tenderTrackings } from '../db/schema';
import { readLastDataUpdate } from './collectionOverview';
import { EMPTY_CRITERIA, openCondition, searchedNotice, searchNotices, type NoticeListItem } from './noticeSearch';
import { summarizeOpenMatches } from './savedSearchMatches';
import { listSavedSearches } from './savedSearches';

// Painel da tela Início (escopo, seção 9.4, com a decisão 5 do plano da Fase 2):
// - "Novos hoje": abertos coletados hoje que batem com alguma busca salva ativa do usuário;
// - "Encerrando em 7 dias": acompanhados pela conta (Analisar ou Vou participar);
// - "Em análise" e "Vou participar": acompanhamentos da conta com edital aberto.

export const CLOSING_SOON_LIMIT = 10;
const ACTIVE_TRACKING = ['ANALISAR', 'PARTICIPAR'] as const;

interface Requester {
  accountId: number;
  userId: number;
}

export interface DashboardView {
  cards: { newToday: number; closingIn7Days: number; analyzing: number; participating: number };
  closingSoon: NoticeListItem[];
  openByState: Array<{ state: string; count: number }>;
  savedSearches: Array<{ id: number; name: string; active: boolean; openCount: number }>;
  lastUpdateAt: string | null;
  lastRunFailed: boolean;
}

async function countAccountTrackings(db: TendersDb, accountId: number) {
  const [row] = await db
    .select({
      analyzing: sql<number>`count(*) FILTER (WHERE ${tenderTrackings.status} = 'ANALISAR' AND ${openCondition})`.mapWith(Number),
      participating: sql<number>`count(*) FILTER (WHERE ${tenderTrackings.status} = 'PARTICIPAR' AND ${openCondition})`.mapWith(Number),
      closingIn7Days: sql<number>`count(*) FILTER (
        WHERE ${inArray(tenderTrackings.status, [...ACTIVE_TRACKING])}
          AND ${openCondition}
          AND ${searchedNotice.proposalClosesAt} <= now() + interval '7 days')`.mapWith(Number),
    })
    .from(tenderTrackings)
    .innerJoin(searchedNotice, eq(searchedNotice.id, tenderTrackings.noticeId))
    .where(eq(tenderTrackings.accountId, accountId));
  return { analyzing: row?.analyzing ?? 0, participating: row?.participating ?? 0, closingIn7Days: row?.closingIn7Days ?? 0 };
}

export async function readDashboard(db: TendersDb, requester: Requester): Promise<DashboardView> {
  const [trackings, matches, closingSoon, savedSearches, lastUpdate] = await Promise.all([
    countAccountTrackings(db, requester.accountId),
    summarizeOpenMatches(db, requester.accountId, requester.userId),
    searchNotices(db, requester.accountId, {
      criteria: EMPTY_CRITERIA,
      publishedFrom: null,
      publishedTo: null,
      closingFrom: null,
      closingTo: null,
      openOnly: true,
      trackingStatuses: [...ACTIVE_TRACKING],
      hideDiscarded: true,
      sort: 'closingAsc',
      page: 1,
      perPage: CLOSING_SOON_LIMIT,
    }),
    listSavedSearches(db, requester),
    readLastDataUpdate(db),
  ]);

  return {
    cards: {
      newToday: matches.newToday,
      closingIn7Days: trackings.closingIn7Days,
      analyzing: trackings.analyzing,
      participating: trackings.participating,
    },
    closingSoon: closingSoon.items,
    openByState: matches.openByState,
    savedSearches: savedSearches.map(({ id, name, active, openCount }) => ({ id, name, active, openCount })),
    lastUpdateAt: lastUpdate.lastUpdateAt,
    lastRunFailed: lastUpdate.lastRunFailed,
  };
}
