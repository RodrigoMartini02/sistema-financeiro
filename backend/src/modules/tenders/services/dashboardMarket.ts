import { and, count, desc, eq, gte, isNotNull, lt, min, sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { addCalendarDays, brasiliaDate } from '../collector/dates';
import { openCondition, searchedNotice, startOfBrasiliaDay } from './noticeSearch';

// Consultas do Dashboard sobre a base de editais inteira (plano .plans/licitacoes-dashboard-gestao.md): publicações por
// dia, mês e modalidade, editais abertos por modalidade e esfera, e os órgãos que mais publicam. `edital` é uma tabela
// global (dado público do PNCP): o resultado é o mesmo para todas as contas, e nada aqui filtra por conta.
//
// A coleta roda 1 vez por dia, então "hoje" é parcial: as séries vão até ontem (dia de Brasília). A base só tem os editais
// com prazo de proposta, nas modalidades coletadas, e a limpeza semanal apaga os encerrados há mais de 12 meses.

export const DAILY_DAYS = 30;
const MONTHLY_MONTHS = 12;
const TOP_AGENCIES_LIMIT = 10;

/** Situação 1 do PNCP (divulgada): a única que entra nas buscas e nas contagens do Dashboard. */
const DISCLOSED_SITUATION_ID = 1;

/** Quantidade por modalidade, pelo id da modalidade; a modalidade que não aparece tem zero. */
export type CountsByModality = Record<string, number>;

export interface DailyPublications {
  /** AAAA-MM-DD. */
  day: string;
  byModality: CountsByModality;
}

export interface MonthlyPublications {
  /** AAAA-MM. */
  month: string;
  /** O mês corrente, que só tem os dias até ontem. */
  partial: boolean;
  byModality: CountsByModality;
}

export interface PublicationRow {
  /** AAAA-MM-DD, dia de Brasília. */
  day: string;
  modalityId: number;
  total: number;
}

export interface OpenBySphere {
  /** Esfera do PNCP (F, E, M, D); null: o edital não informou. */
  sphere: string | null;
  count: number;
}

export interface TopAgency {
  cnpj: string;
  name: string | null;
  count: number;
}

export interface MarketView {
  publications: {
    /** Os últimos 30 dias, até ontem, do mais antigo ao mais novo, sem dia faltando. */
    daily: DailyPublications[];
    /** Os últimos 12 meses, até o corrente, sem mês faltando. */
    monthly: MonthlyPublications[];
    /** Quando a base começou a receber editais (AAAA-MM-DD, Brasília); antes disso as séries subestimam. */
    coverageSince: string | null;
  };
  open: { total: number; byModality: CountsByModality; bySphere: OpenBySphere[] };
  /** Órgãos com mais editais publicados nos últimos 30 dias. */
  topAgencies: TopAgency[];
}

function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function addCount(target: Map<string, CountsByModality>, key: string, modalityId: number, total: number): void {
  const counts = target.get(key) ?? {};
  counts[String(modalityId)] = (counts[String(modalityId)] ?? 0) + total;
  target.set(key, counts);
}

/** Os últimos 30 dias até ontem, do mais antigo ao mais novo; o dia sem edital vem com a contagem vazia. */
export function buildDailySeries(rows: readonly PublicationRow[], today: string): DailyPublications[] {
  const byDay = new Map<string, CountsByModality>();
  for (const row of rows) {
    addCount(byDay, row.day, row.modalityId, row.total);
  }
  return Array.from({ length: DAILY_DAYS }, (_, index) => {
    const day = addCalendarDays(today, index - DAILY_DAYS);
    return { day, byModality: byDay.get(day) ?? {} };
  });
}

/** Os últimos 12 meses até o corrente, do mais antigo ao mais novo; o mês sem edital vem com a contagem vazia. */
export function buildMonthlySeries(rows: readonly PublicationRow[], today: string): MonthlyPublications[] {
  const currentMonth = today.slice(0, 7);
  const byMonth = new Map<string, CountsByModality>();
  for (const row of rows) {
    addCount(byMonth, row.day.slice(0, 7), row.modalityId, row.total);
  }
  return Array.from({ length: MONTHLY_MONTHS }, (_, index) => {
    const month = shiftMonth(currentMonth, index - (MONTHLY_MONTHS - 1));
    return { month, partial: month === currentMonth, byModality: byMonth.get(month) ?? {} };
  });
}

/** Primeiro dia da janela das séries: o dia 1 do mês mais antigo. */
export function seriesStartDay(today: string): string {
  return `${shiftMonth(today.slice(0, 7), -(MONTHLY_MONTHS - 1))}-01`;
}

async function readPublicationRows(db: TendersDb, today: string): Promise<PublicationRow[]> {
  const publishedDay = sql<string>`to_char(${searchedNotice.publishedAt} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day: publishedDay, modalityId: searchedNotice.modalityId, total: count() })
    .from(searchedNotice)
    .where(
      and(
        eq(searchedNotice.situationId, DISCLOSED_SITUATION_ID),
        isNotNull(searchedNotice.modalityId),
        gte(searchedNotice.publishedAt, startOfBrasiliaDay(seriesStartDay(today))),
        lt(searchedNotice.publishedAt, startOfBrasiliaDay(today)),
      ),
    )
    .groupBy(publishedDay, searchedNotice.modalityId);
  return rows.flatMap((row) => (row.modalityId === null ? [] : [{ day: row.day, modalityId: row.modalityId, total: row.total }]));
}

async function readOpen(db: TendersDb): Promise<MarketView['open']> {
  const rows = await db
    .select({ modalityId: searchedNotice.modalityId, sphere: searchedNotice.governmentSphere, total: count() })
    .from(searchedNotice)
    .where(openCondition)
    .groupBy(searchedNotice.modalityId, searchedNotice.governmentSphere);
  const byModality: CountsByModality = {};
  const bySphere = new Map<string | null, number>();
  let total = 0;
  for (const row of rows) {
    total += row.total;
    if (row.modalityId !== null) {
      byModality[String(row.modalityId)] = (byModality[String(row.modalityId)] ?? 0) + row.total;
    }
    const sphere = row.sphere?.trim().toUpperCase() || null;
    bySphere.set(sphere, (bySphere.get(sphere) ?? 0) + row.total);
  }
  return {
    total,
    byModality,
    bySphere: [...bySphere].map(([sphere, amount]) => ({ sphere, count: amount })).sort((a, b) => b.count - a.count),
  };
}

async function readTopAgencies(db: TendersDb, today: string): Promise<TopAgency[]> {
  const total = count();
  const rows = await db
    .select({ cnpj: searchedNotice.agencyCnpj, name: sql<string | null>`max(${searchedNotice.agencyName})`, total })
    .from(searchedNotice)
    .where(
      and(
        eq(searchedNotice.situationId, DISCLOSED_SITUATION_ID),
        isNotNull(searchedNotice.agencyCnpj),
        gte(searchedNotice.publishedAt, startOfBrasiliaDay(addCalendarDays(today, -DAILY_DAYS))),
        lt(searchedNotice.publishedAt, startOfBrasiliaDay(today)),
      ),
    )
    .groupBy(searchedNotice.agencyCnpj)
    .orderBy(desc(total), searchedNotice.agencyCnpj)
    .limit(TOP_AGENCIES_LIMIT);
  return rows.flatMap((row) => (row.cnpj === null ? [] : [{ cnpj: row.cnpj, name: row.name, count: row.total }]));
}

async function readCoverageSince(db: TendersDb): Promise<string | null> {
  const [row] = await db
    .select({ since: sql<string | null>`to_char(${min(searchedNotice.firstCollectedAt)} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')` })
    .from(searchedNotice);
  return row?.since ?? null;
}

export async function readMarket(db: TendersDb, now: Date): Promise<MarketView> {
  const today = brasiliaDate(now);
  const [rows, open, topAgencies, coverageSince] = await Promise.all([
    readPublicationRows(db, today),
    readOpen(db),
    readTopAgencies(db, today),
    readCoverageSince(db),
  ]);
  return {
    publications: { daily: buildDailySeries(rows, today), monthly: buildMonthlySeries(rows, today), coverageSince },
    open,
    topAgencies,
  };
}
