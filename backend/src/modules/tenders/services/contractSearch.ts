import { sql } from 'drizzle-orm';
import { addCalendarDays, brasiliaDate } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import { contractListDataset, phraseContractCriteria } from '../contractStore/criteria';
import { contractOriginOf } from '../contractStore/layout';
import { queryContractPage, type ContractListRow } from '../contractStore/queries';
import type { ContractStoreAccess } from '../contractStore/reader';
import { postgresSearchPhrases } from '../contractStore/textSearch';
import { CONTRACT_TYPES, type ContractSort, type SearchTermsMode } from '../domains';
import { favoriteKeysAmong, listFavoriteKeys } from './contractFavorites';
import { toBrasiliaIso } from './dates';
import { termsQuery, type Paginated, type SearchRequester } from './noticeSearch';

// Busca de contratos da tela "Contratos a vencer" (planos
// .plans/licitacoes-contratos-a-vencer.md, Parte B, e
// .plans/licitacoes-contratos-no-r2.md, Parte R2). Os contratos moram no
// armazém do R2 (contractStore) e a busca roda lá, no DuckDB; o Postgres
// responde só o que é da pessoa (favoritos) e o que é regra do texto (as frases
// de cada termo, com singular e plural, e o trecho destacado das linhas da
// página). Os critérios em comum com a busca salva e os avisos ficam em
// contractStore/criteria.ts, e dão o mesmo resultado por construção. A tela
// mostra só os vigentes; com "Só favoritos", aparecem também os favoritos
// vencidos, e com "Incluir encerrados", todos, inclusive os sem vencimento. O
// tipo de contrato e os encerrados são só da tela: a busca salva e os avisos
// continuam com os vigentes.

/** O que as buscas de contratos usam: o Postgres, o armazém e o relógio. */
export interface ContractContext {
  db: TendersDb;
  contractStore: ContractStoreAccess;
  now: () => Date;
}

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
  /** Número de controle do PNCP: o identificador do contrato nas rotas, nos favoritos e nos avisos. */
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
  /** Página do contrato no PNCP; null nos contratos federais do Compras.gov.br, que não têm. */
  pncpLink: string | null;
}

const HEADLINE_OPTIONS = 'StartSel=<<, StopSel=>>, MinWords=15, MaxWords=35, MaxFragments=2, FragmentDelimiter=" … "';

/**
 * Página do contrato no site do PNCP (conferida no piloto: rota `contratos/:cnpj/:ano/:sequencial`). O contrato federal do
 * Compras.gov.br não tem página pública do documento: sem link.
 */
export function contractPncpLink(key: string, agencyCnpj: string, year: number, sequence: number): string | null {
  return contractOriginOf(key) === 'NATIONAL' ? `https://pncp.gov.br/app/contratos/${agencyCnpj}/${year}/${sequence}` : null;
}

const CONTRACT_TYPE_NAMES = new Map<number, string>(CONTRACT_TYPES.map((type) => [type.id, type.name]));

/** Nome curto do tipo para a tela; tipo fora da lista fica com o nome gravado. */
export function contractTypeLabel(id: number | null, storedName: string | null): string | null {
  return (id !== null ? CONTRACT_TYPE_NAMES.get(id) : undefined) ?? storedName;
}

/**
 * Trecho do objeto de cada linha da página com os termos entre << e >>, pelo
 * ts_headline do Postgres (a regra do texto é a dele). Só as linhas da página
 * passam por aqui; sem termos, nenhum trecho.
 */
async function highlightedExcerpts(db: TendersDb, criteria: ContractCriteria, objects: readonly string[]): Promise<Array<string | null>> {
  if (criteria.terms.length === 0 || objects.length === 0) {
    return objects.map(() => null);
  }
  const result = await db.execute<{ trecho: string | null }>(sql`
    SELECT ts_headline('licitacoes.pt_unaccent', t.objeto, q.consulta, ${HEADLINE_OPTIONS}) AS trecho
      FROM unnest(${sql.param([...objects])}::text[]) WITH ORDINALITY AS t(objeto, ord)
     CROSS JOIN (SELECT ${termsQuery(criteria.terms, criteria.termsMode)} AS consulta) q
     ORDER BY t.ord`);
  return result.rows.map((row) => row.trecho ?? null);
}

function toListItem(row: ContractListRow, isFavorite: boolean, highlightedExcerpt: string | null): ContractListItem {
  return {
    pncpControlNumber: row.numero_controle_pncp,
    contractObject: row.objeto,
    agencyCnpj: row.orgao_cnpj,
    agencyName: row.orgao_razao_social,
    state: row.uf,
    cityName: row.municipio_nome,
    cityIbgeCode: row.municipio_ibge,
    categoryId: row.categoria_id,
    categoryName: row.categoria_nome,
    contractTypeId: row.tipo_contrato_id,
    contractTypeName: contractTypeLabel(row.tipo_contrato_id, row.tipo_contrato_nome),
    supplierName: row.fornecedor_nome,
    supplierDocument: row.fornecedor_documento,
    globalValue: row.valor_global === null ? null : Number(row.valor_global),
    termStart: row.vigencia_inicio,
    originalTermEnd: row.vigencia_fim_original,
    expiresOn: row.vencimento,
    publishedAt: toBrasiliaIso(row.data_publicacao_pncp),
    isExtended: row.vencimento !== row.vigencia_fim_original,
    isFavorite,
    highlightedExcerpt,
    pncpLink: contractPncpLink(row.numero_controle_pncp, row.orgao_cnpj, row.ano_contrato, row.sequencial_contrato),
  };
}

/**
 * Busca paginada da tela, com o favorito da pessoa em cada contrato. A consulta
 * do armazém e a contagem usam uma só vaga da fila do leitor; o 503 do
 * armazém sem cópia pronta e o limite de tempo sobem como ContractStoreUnavailableError
 * e ContractStoreTimeoutError.
 */
export async function searchContracts(
  context: ContractContext,
  requester: SearchRequester,
  filters: ContractSearchFilters,
): Promise<Paginated<ContractListItem>> {
  const today = brasiliaDate(context.now());
  const phrased = await phraseContractCriteria(postgresSearchPhrases(context.db), filters.criteria);
  const keys = filters.favoritesOnly ? await listFavoriteKeys(context.db, requester) : null;
  // Só os vigentes; "Só favoritos" mostra também os favoritos vencidos, e "Incluir encerrados", todos.
  const allContracts = filters.favoritesOnly || filters.includeClosed;

  const { rows, total } = await context.contractStore.query((connection) =>
    queryContractPage(connection, {
      dataset: contractListDataset(phrased, { allContracts, numberGroups: filters.numberGroups }),
      phrased,
      activeOn: allContracts ? null : today,
      keys,
      contractTypes: filters.contractTypes,
      numberGroups: filters.numberGroups,
      contractYear: filters.contractYear,
      publishedFrom: filters.publishedFrom,
      // O dia final vale inteiro: as publicações são datas e horas de Brasília em texto.
      publishedBefore: filters.publishedTo === null ? null : addCalendarDays(filters.publishedTo, 1),
      expiryFrom: filters.expiryFrom,
      expiryTo: filters.expiryTo,
      sort: filters.sort,
      page: filters.page,
      perPage: filters.perPage,
    }),
  );

  const [favorites, excerpts] = await Promise.all([
    favoriteKeysAmong(context.db, requester, rows.map((row) => row.numero_controle_pncp)),
    highlightedExcerpts(context.db, filters.criteria, rows.map((row) => row.objeto)),
  ]);
  return {
    items: rows.map((row, index) => toListItem(row, favorites.has(row.numero_controle_pncp), excerpts[index] ?? null)),
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
