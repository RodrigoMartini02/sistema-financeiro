import { and, asc, count, eq, exists, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { TendersDb } from '../collector/database';
import { tenderFavorites, tenderNotices, tenderTrackings } from '../db/schema';
import {
  TRACKING_FILTER_NONE,
  type NoticeSort,
  type SearchTermsMode,
  type TrackingFilter,
  type TrackingStatus,
} from '../domains';
import { toBrasiliaIso } from './dates';

// Busca de editais da tela. Os critérios em comum com a busca salva passam
// pelas funções do banco (migration 0076): licitacoes.fn_edital_atende_criterios
// e licitacoes.fn_edital_aberto, as mesmas que formam licitacoes.fn_edital_bate.
// Assim a busca da tela e a busca salva dão o mesmo resultado por construção.

/** Critérios que a busca da tela e a busca salva têm em comum. */
export interface NoticeCriteria {
  terms: string[];
  termsMode: SearchTermsMode;
  excludedTerms: string[];
  states: string[];
  cityIbgeCodes: string[];
  agencyCnpjs: string[];
  modalities: number[];
  /** Decimal em texto (ex.: "150000.50"); null = sem limite. */
  minValue: string | null;
  maxValue: string | null;
  includeWithoutValue: boolean;
  /** null = SRP indiferente. */
  priceRegistration: boolean | null;
}

export const EMPTY_CRITERIA: NoticeCriteria = {
  terms: [],
  termsMode: 'E',
  excludedTerms: [],
  states: [],
  cityIbgeCodes: [],
  agencyCnpjs: [],
  modalities: [],
  minValue: null,
  maxValue: null,
  includeWithoutValue: false,
  priceRegistration: null,
};

/** Filtros da tela, além dos critérios. Datas em AAAA-MM-DD (dias de Brasília). */
export interface NoticeSearchFilters {
  criteria: NoticeCriteria;
  publishedFrom: string | null;
  publishedTo: string | null;
  closingFrom: string | null;
  closingTo: string | null;
  openOnly: boolean;
  trackingStatuses: TrackingFilter[];
  hideDiscarded: boolean;
  /** Só os favoritos de quem busca (migration 0078). */
  favoritesOnly: boolean;
  sort: NoticeSort;
  page: number;
  perPage: number;
}

export interface NoticeTracking {
  status: TrackingStatus;
  updatedAt: string | null;
}

export interface NoticeListItem {
  id: number;
  pncpControlNumber: string;
  procurementObject: string;
  agencyCnpj: string | null;
  agencyName: string | null;
  state: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
  modalityId: number | null;
  modalityName: string | null;
  situationId: number | null;
  situationName: string | null;
  isPriceRegistration: boolean | null;
  estimatedTotalValue: number | null;
  publishedAt: string | null;
  proposalOpensAt: string | null;
  proposalClosesAt: string | null;
  pncpLink: string | null;
  sourceSystemLink: string | null;
  tracking: NoticeTracking | null;
  /** Favorito de quem busca (cada pessoa tem os seus). */
  isFavorite: boolean;
  /** Trecho do objeto com os termos entre << e >>; null sem termos de busca. */
  highlightedExcerpt: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/** Edital da busca, com o apelido `e` usado nas chamadas às funções do banco. */
export const searchedNotice = alias(tenderNotices, 'e');
const noticeRow = sql.identifier('e');
/** Acompanhamento do edital na conta da requisição (left join). */
const accountTracking = alias(tenderTrackings, 't');

const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';
const HEADLINE_OPTIONS = 'StartSel=<<, StopSel=>>, MinWords=15, MaxWords=35, MaxFragments=2, FragmentDelimiter=" … "';

/** Consulta de texto pelos termos (com singular e plural); NULL quando não há termos. */
export function termsQuery(terms: string[], mode: SearchTermsMode): SQL {
  if (terms.length === 0) {
    return sql`NULL::tsquery`;
  }
  return sql`licitacoes.fn_tsquery_termos(${sql.param(terms)}::text[], ${mode})`;
}

/** Critérios da busca, pela mesma função do banco que a busca salva usa. */
export function criteriaCondition(criteria: NoticeCriteria): SQL {
  return sql`licitacoes.fn_edital_atende_criterios(
    ${noticeRow},
    ${termsQuery(criteria.terms, criteria.termsMode)},
    ${termsQuery(criteria.excludedTerms, 'OU')},
    ${sql.param(criteria.states)}::bpchar[],
    ${sql.param(criteria.cityIbgeCodes)}::text[],
    ${sql.param(criteria.agencyCnpjs)}::text[],
    ${sql.param(criteria.modalities)}::smallint[],
    ${criteria.minValue}::numeric,
    ${criteria.maxValue}::numeric,
    ${criteria.includeWithoutValue}::boolean,
    ${criteria.priceRegistration}::boolean)`;
}

/** Edital ainda recebendo proposta (prazo não vencido e situação 1). */
export const openCondition = sql`licitacoes.fn_edital_aberto(${noticeRow})`;

function startOfBrasiliaDay(date: string): SQL {
  return sql`(${date}::date)::timestamp AT TIME ZONE ${BRASILIA_TIME_ZONE}`;
}

function startOfNextBrasiliaDay(date: string): SQL {
  return sql`(${date}::date + 1)::timestamp AT TIME ZONE ${BRASILIA_TIME_ZONE}`;
}

/** Conta e pessoa da busca: o acompanhamento é da conta, o favorito é da pessoa. */
export interface SearchRequester {
  accountId: number;
  userId: number;
}

/** O edital da busca (`e`) é favorito de quem busca. */
function favoriteOf(db: TendersDb, requester: SearchRequester): SQL {
  return exists(
    db
      .select({ found: sql`1` })
      .from(tenderFavorites)
      .where(
        and(
          eq(tenderFavorites.accountId, requester.accountId),
          eq(tenderFavorites.userId, requester.userId),
          eq(tenderFavorites.noticeId, searchedNotice.id),
        ),
      ),
  );
}

function filterConditions(filters: NoticeSearchFilters, favorite: SQL): SQL[] {
  const tracking = accountTracking;
  const conditions: SQL[] = [criteriaCondition(filters.criteria)];
  if (filters.openOnly) {
    conditions.push(openCondition);
  }
  if (filters.favoritesOnly) {
    conditions.push(favorite);
  }
  if (filters.publishedFrom) {
    conditions.push(sql`${searchedNotice.publishedAt} >= ${startOfBrasiliaDay(filters.publishedFrom)}`);
  }
  if (filters.publishedTo) {
    conditions.push(sql`${searchedNotice.publishedAt} < ${startOfNextBrasiliaDay(filters.publishedTo)}`);
  }
  if (filters.closingFrom) {
    conditions.push(sql`${searchedNotice.proposalClosesAt} >= ${startOfBrasiliaDay(filters.closingFrom)}`);
  }
  if (filters.closingTo) {
    conditions.push(sql`${searchedNotice.proposalClosesAt} < ${startOfNextBrasiliaDay(filters.closingTo)}`);
  }

  const statuses = filters.trackingStatuses.filter((status): status is TrackingStatus => status !== TRACKING_FILTER_NONE);
  const wantsUntracked = filters.trackingStatuses.includes(TRACKING_FILTER_NONE);
  const trackingFilter = or(
    statuses.length > 0 ? inArray(tracking.status, statuses) : undefined,
    wantsUntracked ? isNull(tracking.status) : undefined,
  );
  if (trackingFilter) {
    conditions.push(trackingFilter);
  }
  // Pedir os descartados explicitamente vence o "ocultar descartados".
  if (filters.hideDiscarded && !statuses.includes('DESCARTADO')) {
    const notDiscarded = or(isNull(tracking.status), ne(tracking.status, 'DESCARTADO'));
    if (notDiscarded) {
      conditions.push(notDiscarded);
    }
  }
  return conditions;
}

function sortOrder(sort: NoticeSort, consulta: SQL): SQL[] {
  const tieBreak = asc(searchedNotice.id);
  switch (sort) {
    case 'publishedDesc':
      return [sql`${searchedNotice.publishedAt} DESC NULLS LAST`, tieBreak];
    case 'valueDesc':
      return [sql`${searchedNotice.estimatedTotalValue} DESC NULLS LAST`, tieBreak];
    case 'valueAsc':
      return [sql`${searchedNotice.estimatedTotalValue} ASC NULLS LAST`, tieBreak];
    case 'relevance':
      return [sql`ts_rank_cd(${searchedNotice.searchVector}, ${consulta}) DESC`, tieBreak];
    case 'closingAsc':
      return [sql`${searchedNotice.proposalClosesAt} ASC NULLS LAST`, tieBreak];
  }
}

/** Busca paginada da tela, com o acompanhamento da conta e o favorito da pessoa em cada edital. */
export async function searchNotices(
  db: TendersDb,
  requester: SearchRequester,
  filters: NoticeSearchFilters,
): Promise<Paginated<NoticeListItem>> {
  const tracking = accountTracking;
  const trackingOfAccount = and(eq(tracking.noticeId, searchedNotice.id), eq(tracking.accountId, requester.accountId));
  const favorite = favoriteOf(db, requester);
  const where = and(...filterConditions(filters, favorite));
  const consulta = termsQuery(filters.criteria.terms, filters.criteria.termsMode);
  const excerpt =
    filters.criteria.terms.length > 0
      ? sql<string | null>`ts_headline('licitacoes.pt_unaccent', ${searchedNotice.procurementObject}, ${consulta}, ${HEADLINE_OPTIONS})`
      : sql<string | null>`NULL`;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: searchedNotice.id,
        pncpControlNumber: searchedNotice.pncpControlNumber,
        procurementObject: searchedNotice.procurementObject,
        agencyCnpj: searchedNotice.agencyCnpj,
        agencyName: searchedNotice.agencyName,
        state: searchedNotice.state,
        cityName: searchedNotice.cityName,
        cityIbgeCode: searchedNotice.cityIbgeCode,
        modalityId: searchedNotice.modalityId,
        modalityName: searchedNotice.modalityName,
        situationId: searchedNotice.situationId,
        situationName: searchedNotice.situationName,
        isPriceRegistration: searchedNotice.isPriceRegistration,
        estimatedTotalValue: searchedNotice.estimatedTotalValue,
        publishedAt: searchedNotice.publishedAt,
        proposalOpensAt: searchedNotice.proposalOpensAt,
        proposalClosesAt: searchedNotice.proposalClosesAt,
        pncpLink: searchedNotice.pncpLink,
        sourceSystemLink: searchedNotice.sourceSystemLink,
        trackingStatus: tracking.status,
        trackingUpdatedAt: tracking.updatedAt,
        isFavorite: sql<boolean>`${favorite}`,
        highlightedExcerpt: excerpt,
      })
      .from(searchedNotice)
      .leftJoin(tracking, trackingOfAccount)
      .where(where)
      .orderBy(...sortOrder(filters.sort, consulta))
      .limit(filters.perPage)
      .offset((filters.page - 1) * filters.perPage),
    db.select({ total: count() }).from(searchedNotice).leftJoin(tracking, trackingOfAccount).where(where),
  ]);

  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map(({ trackingStatus, trackingUpdatedAt, ...row }) => ({
      ...row,
      state: row.state?.trim() ?? null,
      estimatedTotalValue: row.estimatedTotalValue === null ? null : Number(row.estimatedTotalValue),
      publishedAt: toBrasiliaIso(row.publishedAt),
      proposalOpensAt: toBrasiliaIso(row.proposalOpensAt),
      proposalClosesAt: toBrasiliaIso(row.proposalClosesAt),
      tracking: trackingStatus ? { status: trackingStatus, updatedAt: toBrasiliaIso(trackingUpdatedAt) } : null,
      isFavorite: row.isFavorite === true,
      highlightedExcerpt: row.highlightedExcerpt ?? null,
    })),
    page: filters.page,
    perPage: filters.perPage,
    total,
    totalPages: Math.ceil(total / filters.perPage),
  };
}

/** Filtros para contar e listar só pelos critérios (prévia e "abertos que batem"): abertos, sem filtro de acompanhamento. */
export function criteriaOnlyFilters(criteria: NoticeCriteria, perPage: number): NoticeSearchFilters {
  return {
    criteria,
    publishedFrom: null,
    publishedTo: null,
    closingFrom: null,
    closingTo: null,
    openOnly: true,
    trackingStatuses: [],
    hideDiscarded: false,
    favoritesOnly: false,
    sort: 'closingAsc',
    page: 1,
    perPage,
  };
}
