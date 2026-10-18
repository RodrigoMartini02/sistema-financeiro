import { and, asc, count, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { TendersDb } from '../collector/database';
import { tenderContractFavorites, tenderContracts } from '../db/schema';
import { CONTRACT_TYPES, type ContractSort, type SearchTermsMode } from '../domains';
import { toBrasiliaIso } from './dates';
import { termsQuery, type Paginated, type SearchRequester } from './noticeSearch';

// Busca de contratos da tela "Contratos a vencer" (plano
// .plans/licitacoes-contratos-a-vencer.md, Parte B). Os critérios em comum com
// a busca salva passam pelas funções do banco (migration 0086):
// licitacoes.fn_contrato_atende_criterios e licitacoes.fn_contrato_vigente.
// Assim a tela, o total "vigentes agora" das buscas salvas e os avisos dão o
// mesmo resultado por construção. A tela mostra só os vigentes; com "Só
// favoritos", aparecem também os favoritos vencidos, e com "Incluir
// encerrados" (parte 2 do plano .plans/licitacoes-base-nacional.md), todos,
// inclusive os sem vencimento. O tipo de contrato e os encerrados são só da
// tela: a busca salva e os avisos continuam com os vigentes.

/** Critérios que a busca da tela e a busca salva de contratos têm em comum. */
export interface ContractCriteria {
  terms: string[];
  termsMode: SearchTermsMode;
  excludedTerms: string[];
  states: string[];
  cityIbgeCodes: string[];
  agencyCnpjs: string[];
  categories: number[];
  supplierCnpjs: string[];
  /** Valor global em texto decimal (ex.: "150000.50"); null = sem limite. */
  minValue: string | null;
  maxValue: string | null;
  includeWithoutValue: boolean;
}

export const EMPTY_CONTRACT_CRITERIA: ContractCriteria = {
  terms: [],
  termsMode: 'E',
  excludedTerms: [],
  states: [],
  cityIbgeCodes: [],
  agencyCnpjs: [],
  categories: [],
  supplierCnpjs: [],
  minValue: null,
  maxValue: null,
  includeWithoutValue: false,
};

/** Filtros da tela, além dos critérios. Datas em AAAA-MM-DD (dias de Brasília). */
export interface ContractSearchFilters {
  criteria: ContractCriteria;
  publishedFrom: string | null;
  publishedTo: string | null;
  expiryFrom: string | null;
  expiryTo: string | null;
  /** Só os favoritos de quem busca, inclusive os vencidos. */
  favoritesOnly: boolean;
  /** Também os encerrados e os sem vencimento; sem ele, só os vigentes. */
  includeClosed: boolean;
  /** Tipos de contrato (`CONTRACT_TYPES`); vazio = todos. */
  contractTypes: number[];
  /** Grupos de dígitos do "Número, processo ou controle PNCP" (`numberGroupsOf`); vazio = sem filtro. */
  numberGroups: string[];
  /** Ano do contrato no PNCP; null = qualquer ano. */
  contractYear: number | null;
  sort: ContractSort;
  page: number;
  perPage: number;
}

export interface ContractListItem {
  id: number;
  pncpControlNumber: string;
  contractObject: string;
  agencyCnpj: string;
  agencyName: string | null;
  state: string | null;
  cityName: string | null;
  cityIbgeCode: string | null;
  categoryId: number | null;
  categoryName: string | null;
  contractTypeId: number | null;
  /** Nome curto do tipo (`CONTRACT_TYPES`); tipo fora da lista, o nome que veio. */
  contractTypeName: string | null;
  supplierName: string | null;
  /** CNPJ (14 dígitos) ou, na pessoa física, o CPF mascarado. */
  supplierDocument: string | null;
  globalValue: number | null;
  termStart: string;
  /** null: sem data de fim, ou com uma fora do normal. */
  originalTermEnd: string | null;
  /** Vencimento atual: o fim original ou o do aditivo mais recente que muda a vigência; null = sem vencimento. */
  expiresOn: string | null;
  publishedAt: string | null;
  /** O vencimento atual é diferente do fim original (aditivo de prazo ou rescisão). */
  isExtended: boolean;
  /** Favorito de quem busca (cada pessoa tem os seus). */
  isFavorite: boolean;
  /** Trecho do objeto com os termos entre << e >>; null sem termos de busca. */
  highlightedExcerpt: string | null;
  pncpLink: string;
}

/** Contrato da busca, com o apelido `c` usado nas chamadas às funções do banco. */
export const searchedContract = alias(tenderContracts, 'c');
const contractRow = sql.identifier('c');

const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';
const HEADLINE_OPTIONS = 'StartSel=<<, StopSel=>>, MinWords=15, MaxWords=35, MaxFragments=2, FragmentDelimiter=" … "';

/** Página do contrato no site do PNCP (conferida no piloto: rota `contratos/:cnpj/:ano/:sequencial`). */
export function contractPncpLink(agencyCnpj: string, year: number, sequence: number): string {
  return `https://pncp.gov.br/app/contratos/${agencyCnpj}/${year}/${sequence}`;
}

const CONTRACT_TYPE_NAMES = new Map<number, string>(CONTRACT_TYPES.map((type) => [type.id, type.name]));

/** Nome curto do tipo para a tela; tipo fora da lista fica com o nome gravado. */
export function contractTypeLabel(id: number | null, storedName: string | null): string | null {
  return (id !== null ? CONTRACT_TYPE_NAMES.get(id) : undefined) ?? storedName;
}

/** Critérios da busca, pela mesma função do banco que a busca salva e os avisos usam. */
export function contractCriteriaCondition(criteria: ContractCriteria): SQL {
  return sql`licitacoes.fn_contrato_atende_criterios(
    ${contractRow},
    ${termsQuery(criteria.terms, criteria.termsMode)},
    ${termsQuery(criteria.excludedTerms, 'OU')},
    ${sql.param(criteria.states)}::bpchar[],
    ${sql.param(criteria.cityIbgeCodes)}::text[],
    ${sql.param(criteria.agencyCnpjs)}::text[],
    ${sql.param(criteria.categories)}::smallint[],
    ${sql.param(criteria.supplierCnpjs)}::text[],
    ${criteria.minValue}::numeric,
    ${criteria.maxValue}::numeric,
    ${criteria.includeWithoutValue}::boolean)`;
}

/** Contrato vigente: vencimento de hoje em diante (Brasília). */
export const activeContractCondition = sql`licitacoes.fn_contrato_vigente(${contractRow})`;

// As mesmas expressões dos índices da migration 0085, para o banco usá-los:
// mudar uma exige mudar a outra.
const NUMBER_FIELD_GROUPS: SQL[] = [
  sql`licitacoes.fn_grupos_digitos(coalesce(${searchedContract.contractNumber}, '') || ' ' || ${searchedContract.contractYear}::text)`,
  sql`licitacoes.fn_grupos_digitos(coalesce(${searchedContract.processNumber}, '') || ' ' || ${searchedContract.contractYear}::text)`,
  sql`licitacoes.fn_grupos_digitos(${searchedContract.pncpControlNumber})`,
  sql`licitacoes.fn_grupos_digitos(${searchedContract.purchaseControlNumber})`,
];

/** Todos os grupos num mesmo campo: número + ano, processo + ano, controle PNCP do contrato ou da compra. */
function numberCondition(groups: string[]): SQL {
  const matches = NUMBER_FIELD_GROUPS.map((field) => sql`${field} @> ${sql.param(groups)}::text[]`);
  return sql`(${sql.join(matches, sql` OR `)})`;
}

/** O contrato da busca (`c`) é favorito de quem busca. */
function favoriteOf(db: TendersDb, requester: SearchRequester): SQL {
  return exists(
    db
      .select({ found: sql`1` })
      .from(tenderContractFavorites)
      .where(
        and(
          eq(tenderContractFavorites.accountId, requester.accountId),
          eq(tenderContractFavorites.userId, requester.userId),
          eq(tenderContractFavorites.contractId, searchedContract.id),
        ),
      ),
  );
}

function startOfBrasiliaDay(date: string): SQL {
  return sql`(${date}::date)::timestamp AT TIME ZONE ${BRASILIA_TIME_ZONE}`;
}

function startOfNextBrasiliaDay(date: string): SQL {
  return sql`(${date}::date + 1)::timestamp AT TIME ZONE ${BRASILIA_TIME_ZONE}`;
}

function filterConditions(filters: ContractSearchFilters, favorite: SQL): SQL[] {
  const conditions: SQL[] = [contractCriteriaCondition(filters.criteria)];
  // Só os vigentes; "Só favoritos" mostra também os favoritos vencidos, e "Incluir encerrados", todos.
  if (filters.favoritesOnly) {
    conditions.push(favorite);
  } else if (!filters.includeClosed) {
    conditions.push(activeContractCondition);
  }
  if (filters.contractTypes.length > 0) {
    conditions.push(inArray(searchedContract.contractTypeId, filters.contractTypes));
  }
  if (filters.numberGroups.length > 0) {
    conditions.push(numberCondition(filters.numberGroups));
  }
  if (filters.contractYear !== null) {
    conditions.push(eq(searchedContract.contractYear, filters.contractYear));
  }
  if (filters.publishedFrom) {
    conditions.push(sql`${searchedContract.publishedAt} >= ${startOfBrasiliaDay(filters.publishedFrom)}`);
  }
  if (filters.publishedTo) {
    conditions.push(sql`${searchedContract.publishedAt} < ${startOfNextBrasiliaDay(filters.publishedTo)}`);
  }
  if (filters.expiryFrom) {
    conditions.push(sql`${searchedContract.expiresOn} >= ${filters.expiryFrom}::date`);
  }
  if (filters.expiryTo) {
    conditions.push(sql`${searchedContract.expiresOn} <= ${filters.expiryTo}::date`);
  }
  return conditions;
}

function sortOrder(sort: ContractSort, consulta: SQL): SQL[] {
  const tieBreak = asc(searchedContract.id);
  switch (sort) {
    case 'expiryAsc':
      return [asc(searchedContract.expiresOn), tieBreak];
    case 'publishedDesc':
      return [sql`${searchedContract.publishedAt} DESC`, tieBreak];
    case 'valueDesc':
      return [sql`${searchedContract.globalValue} DESC NULLS LAST`, tieBreak];
    case 'valueAsc':
      return [sql`${searchedContract.globalValue} ASC NULLS LAST`, tieBreak];
    case 'relevance':
      return [sql`ts_rank_cd(${searchedContract.searchVector}, ${consulta}) DESC`, tieBreak];
  }
}

/** Busca paginada da tela, com o favorito da pessoa em cada contrato. */
export async function searchContracts(
  db: TendersDb,
  requester: SearchRequester,
  filters: ContractSearchFilters,
): Promise<Paginated<ContractListItem>> {
  const favorite = favoriteOf(db, requester);
  const where = and(...filterConditions(filters, favorite));
  const consulta = termsQuery(filters.criteria.terms, filters.criteria.termsMode);
  const excerpt =
    filters.criteria.terms.length > 0
      ? sql<string | null>`ts_headline('licitacoes.pt_unaccent', ${searchedContract.contractObject}, ${consulta}, ${HEADLINE_OPTIONS})`
      : sql<string | null>`NULL`;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: searchedContract.id,
        pncpControlNumber: searchedContract.pncpControlNumber,
        contractObject: searchedContract.contractObject,
        agencyCnpj: searchedContract.agencyCnpj,
        agencyName: searchedContract.agencyName,
        state: searchedContract.state,
        cityName: searchedContract.cityName,
        cityIbgeCode: searchedContract.cityIbgeCode,
        categoryId: searchedContract.categoryId,
        categoryName: searchedContract.categoryName,
        contractTypeId: searchedContract.contractTypeId,
        contractTypeName: searchedContract.contractTypeName,
        supplierName: searchedContract.supplierName,
        supplierDocument: searchedContract.supplierDocument,
        globalValue: searchedContract.globalValue,
        termStart: searchedContract.termStart,
        originalTermEnd: searchedContract.originalTermEnd,
        expiresOn: searchedContract.expiresOn,
        publishedAt: searchedContract.publishedAt,
        contractYear: searchedContract.contractYear,
        contractSequence: searchedContract.contractSequence,
        isFavorite: sql<boolean>`${favorite}`,
        highlightedExcerpt: excerpt,
      })
      .from(searchedContract)
      .where(where)
      .orderBy(...sortOrder(filters.sort, consulta))
      .limit(filters.perPage)
      .offset((filters.page - 1) * filters.perPage),
    db.select({ total: count() }).from(searchedContract).where(where),
  ]);

  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map(({ contractYear, contractSequence, ...row }) => ({
      ...row,
      contractTypeName: contractTypeLabel(row.contractTypeId, row.contractTypeName),
      state: row.state?.trim() ?? null,
      globalValue: row.globalValue === null ? null : Number(row.globalValue),
      publishedAt: toBrasiliaIso(row.publishedAt),
      isExtended: row.expiresOn !== row.originalTermEnd,
      isFavorite: row.isFavorite === true,
      highlightedExcerpt: row.highlightedExcerpt ?? null,
      pncpLink: contractPncpLink(row.agencyCnpj, contractYear, contractSequence),
    })),
    page: filters.page,
    perPage: filters.perPage,
    total,
    totalPages: Math.ceil(total / filters.perPage),
  };
}

/** Filtros para contar e listar só pelos critérios (prévia da busca salva): vigentes, pelo vencimento. */
export function contractCriteriaOnlyFilters(criteria: ContractCriteria, perPage: number): ContractSearchFilters {
  return {
    criteria,
    publishedFrom: null,
    publishedTo: null,
    expiryFrom: null,
    expiryTo: null,
    favoritesOnly: false,
    includeClosed: false,
    contractTypes: [],
    numberGroups: [],
    contractYear: null,
    sort: 'expiryAsc',
    page: 1,
    perPage,
  };
}
