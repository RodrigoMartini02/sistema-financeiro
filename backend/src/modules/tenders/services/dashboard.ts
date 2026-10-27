import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { addCalendarDays, brasiliaDate } from '../collector/dates';
import { tenderTrackingHistory, tenderTrackings } from '../db/schema';
import { TENDER_MODALITIES } from '../domains';
import { readLastDataUpdate } from './collectionOverview';
import { DAILY_DAYS, readMarket, type CountsByModality, type MarketView } from './dashboardMarket';
import { openCondition, searchedNotice, startOfBrasiliaDay } from './noticeSearch';
import { summarizeOpenMatches } from './savedSearchMatches';

// Dashboard do módulo (escopo, seção 9.4, e plano .plans/licitacoes-dashboard-gestao.md): só quantidades.
// - da base de editais inteira (dashboardMarket.ts): publicações por dia, mês e modalidade, abertos, esfera e órgãos;
// - da conta: acompanhamentos por modalidade (em análise, vou participar, participei), funil e carga de prazos;
// - das buscas salvas da pessoa: "Novos hoje" e abertos por UF.
// Os contratos que vencem ficam em dashboardContracts.ts: leem o armazém do R2 e têm rota própria.

const ACTIVE_TRACKING = ['ANALISAR', 'PARTICIPAR'] as const;
const FUNNEL_DAYS = 30;
const DEADLINE_WEEKS = 4;
const WEEK_DAYS = 7;

interface Requester {
  accountId: number;
  userId: number;
}

export interface ModalityCard {
  id: number;
  name: string;
  /** Publicados nos últimos 30 dias, até ontem. */
  published30Days: number;
  open: number;
  analyzing: number;
  participating: number;
  /** Vou participar com o prazo de proposta já vencido. */
  participated: number;
  /** Publicados por dia, 30 valores, do mais antigo ao mais novo (ontem). */
  daily: number[];
}

export interface DashboardView {
  cards: {
    publishedYesterday: number;
    published7Days: number;
    published30Days: number;
    openNow: number;
    newToday: number;
    analyzing: number;
    participating: number;
    closingIn7Days: number;
    participated: number;
  };
  /** As modalidades que a base tem (publicadas, abertas ou acompanhadas), por id. */
  modalities: ModalityCard[];
  publications: MarketView['publications'];
  /** Editais com entrada em Analisar ou Vou participar nos últimos 30 dias, e quantos deles estão em Vou participar e em Participei. */
  funnel: { tracked: number; participating: number; participated: number };
  /** Acompanhados abertos por semana de encerramento, a partir de hoje: 4 semanas. */
  deadlineLoad: Array<{ startDay: string; count: number }>;
  openByState: Array<{ state: string; count: number }>;
  openBySphere: MarketView['open']['bySphere'];
  topAgencies: MarketView['topAgencies'];
  lastUpdateAt: string | null;
  lastRunFailed: boolean;
}

interface TrackingByModality {
  modalityId: number | null;
  analyzing: number;
  participating: number;
  participated: number;
  closingIn7Days: number;
}

async function readTrackings(db: TendersDb, accountId: number): Promise<TrackingByModality[]> {
  const isActive = inArray(tenderTrackings.status, [...ACTIVE_TRACKING]);
  return db
    .select({
      modalityId: searchedNotice.modalityId,
      analyzing: sql<number>`count(*) FILTER (WHERE ${tenderTrackings.status} = 'ANALISAR' AND ${openCondition})`.mapWith(Number),
      participating: sql<number>`count(*) FILTER (WHERE ${tenderTrackings.status} = 'PARTICIPAR' AND ${openCondition})`.mapWith(Number),
      participated: sql<number>`count(*) FILTER (
        WHERE ${tenderTrackings.status} = 'PARTICIPAR' AND ${searchedNotice.proposalClosesAt} <= now())`.mapWith(Number),
      closingIn7Days: sql<number>`count(*) FILTER (
        WHERE ${isActive}
          AND ${openCondition}
          AND ${searchedNotice.proposalClosesAt} <= now() + interval '7 days')`.mapWith(Number),
    })
    .from(tenderTrackings)
    .innerJoin(searchedNotice, eq(searchedNotice.id, tenderTrackings.noticeId))
    .where(eq(tenderTrackings.accountId, accountId))
    .groupBy(searchedNotice.modalityId);
}

async function readFunnel(db: TendersDb, accountId: number): Promise<DashboardView['funnel']> {
  const [row] = await db
    .select({
      tracked: sql<number>`count(DISTINCT ${tenderTrackingHistory.noticeId})`.mapWith(Number),
      participating: sql<number>`count(DISTINCT ${tenderTrackingHistory.noticeId}) FILTER (
        WHERE ${tenderTrackings.status} = 'PARTICIPAR')`.mapWith(Number),
      participated: sql<number>`count(DISTINCT ${tenderTrackingHistory.noticeId}) FILTER (
        WHERE ${tenderTrackings.status} = 'PARTICIPAR' AND ${searchedNotice.proposalClosesAt} <= now())`.mapWith(Number),
    })
    .from(tenderTrackingHistory)
    .leftJoin(
      tenderTrackings,
      and(eq(tenderTrackings.accountId, tenderTrackingHistory.accountId), eq(tenderTrackings.noticeId, tenderTrackingHistory.noticeId)),
    )
    .innerJoin(searchedNotice, eq(searchedNotice.id, tenderTrackingHistory.noticeId))
    .where(
      and(
        eq(tenderTrackingHistory.accountId, accountId),
        inArray(tenderTrackingHistory.newStatus, [...ACTIVE_TRACKING]),
        sql`${tenderTrackingHistory.createdAt} >= now() - ${`${FUNNEL_DAYS} days`}::interval`,
      ),
    );
  return { tracked: row?.tracked ?? 0, participating: row?.participating ?? 0, participated: row?.participated ?? 0 };
}

async function readDeadlineLoad(db: TendersDb, accountId: number, today: string): Promise<DashboardView['deadlineLoad']> {
  const weekOfDeadline = sql<number>`(((${searchedNotice.proposalClosesAt} AT TIME ZONE 'America/Sao_Paulo')::date - ${today}::date) / ${WEEK_DAYS})::int`;
  const rows = await db
    .select({ week: weekOfDeadline, total: sql<number>`count(*)`.mapWith(Number) })
    .from(tenderTrackings)
    .innerJoin(searchedNotice, eq(searchedNotice.id, tenderTrackings.noticeId))
    .where(
      and(
        eq(tenderTrackings.accountId, accountId),
        inArray(tenderTrackings.status, [...ACTIVE_TRACKING]),
        openCondition,
        lt(searchedNotice.proposalClosesAt, startOfBrasiliaDay(addCalendarDays(today, DEADLINE_WEEKS * WEEK_DAYS))),
      ),
    )
    // Posição 1: a expressão leva parâmetro, e o banco só a reconhece como a mesma do select por posição.
    .groupBy(sql`1`);
  const byWeek = new Map(rows.map((row) => [row.week, row.total]));
  return Array.from({ length: DEADLINE_WEEKS }, (_, week) => ({
    startDay: addCalendarDays(today, week * WEEK_DAYS),
    count: byWeek.get(week) ?? 0,
  }));
}

const MODALITY_NAMES = new Map<number, string>(TENDER_MODALITIES.map((modality) => [modality.id, modality.name]));

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

function countOf(counts: CountsByModality, modalityId: number): number {
  return counts[String(modalityId)] ?? 0;
}

/** Um card por modalidade que a base tem: com publicação nos últimos 12 meses, edital aberto ou acompanhamento da conta. */
export function buildModalityCards(market: MarketView, trackings: readonly TrackingByModality[]): ModalityCard[] {
  const ids = new Set<number>();
  for (const point of [...market.publications.daily, ...market.publications.monthly]) {
    Object.keys(point.byModality).forEach((id) => ids.add(Number(id)));
  }
  Object.keys(market.open.byModality).forEach((id) => ids.add(Number(id)));
  for (const tracking of trackings) {
    if (tracking.modalityId !== null) ids.add(tracking.modalityId);
  }

  return [...ids]
    .sort((a, b) => a - b)
    .map((id) => {
      const tracking = trackings.find((item) => item.modalityId === id);
      const daily = market.publications.daily.map((point) => countOf(point.byModality, id));
      return {
        id,
        name: MODALITY_NAMES.get(id) ?? `Modalidade ${id}`,
        published30Days: sum(daily),
        open: countOf(market.open.byModality, id),
        analyzing: tracking?.analyzing ?? 0,
        participating: tracking?.participating ?? 0,
        participated: tracking?.participated ?? 0,
        daily,
      };
    });
}

export async function readDashboard(db: TendersDb, requester: Requester, now: Date): Promise<DashboardView> {
  const today = brasiliaDate(now);
  const [market, trackings, funnel, deadlineLoad, matches, lastUpdate] = await Promise.all([
    readMarket(db, now),
    readTrackings(db, requester.accountId),
    readFunnel(db, requester.accountId),
    readDeadlineLoad(db, requester.accountId, today),
    summarizeOpenMatches(db, requester.accountId, requester.userId),
    readLastDataUpdate(db),
  ]);

  const dailyTotals = market.publications.daily.map((point) => sum(Object.values(point.byModality)));
  return {
    cards: {
      publishedYesterday: dailyTotals[DAILY_DAYS - 1] ?? 0,
      published7Days: sum(dailyTotals.slice(-WEEK_DAYS)),
      published30Days: sum(dailyTotals),
      openNow: market.open.total,
      newToday: matches.newToday,
      analyzing: sum(trackings.map((item) => item.analyzing)),
      participating: sum(trackings.map((item) => item.participating)),
      closingIn7Days: sum(trackings.map((item) => item.closingIn7Days)),
      participated: sum(trackings.map((item) => item.participated)),
    },
    modalities: buildModalityCards(market, trackings),
    publications: market.publications,
    funnel,
    deadlineLoad,
    openByState: matches.openByState,
    openBySphere: market.open.bySphere,
    topAgencies: market.topAgencies,
    lastUpdateAt: lastUpdate.lastUpdateAt,
    lastRunFailed: lastUpdate.lastRunFailed,
  };
}
