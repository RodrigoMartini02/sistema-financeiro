import { listValue, type DuckDBValue } from '@duckdb/node-api';
import { isCnpjFormat } from '../cnpj';
import type { ContractCriteria } from '../services/contractSearch';
import { sqlLiteral } from './duckdb';
import { SKIPPED_WORD, type SearchPhrasesProvider } from './textSearch';

// A regra única dos critérios de contratos no armazém (plano
// .plans/licitacoes-contratos-no-r2.md): a busca da tela, a prévia e o total
// das buscas salvas e os avisos montam o filtro aqui, como antes faziam com
// licitacoes.fn_contrato_atende_criterios e fn_contrato_vigente (migration 0086,
// que a 0087b removeu).
// Tudo o que vem da pessoa entra como parâmetro ($pN), nunca no texto do SQL.

/** Parâmetros nomeados de uma consulta do DuckDB ($p0, $p1...). */
export class SqlParameters {
  readonly values: Record<string, DuckDBValue> = {};
  private next = 0;

  add(value: DuckDBValue): string {
    const name = `p${this.next}`;
    this.next += 1;
    this.values[name] = value;
    return `$${name}`;
  }
}

/** Critérios com os termos já transformados nas sequências de radicais das suas frases (textSearch.ts). */
export interface PhrasedContractCriteria {
  criteria: ContractCriteria;
  /** Por termo não vazio, na ordem: as frases dele (lista vazia quando o termo não tem radical). */
  termPhrases: string[][];
  excludedPhrases: string[][];
}

/** Termo em branco não conta, como na licitacoes.fn_tsquery_termos. */
function nonBlank(terms: readonly string[]): string[] {
  return terms.filter((term) => term.trim() !== '');
}

export async function phraseContractCriteria(provider: SearchPhrasesProvider, criteria: ContractCriteria): Promise<PhrasedContractCriteria> {
  const [termPhrases, excludedPhrases] = await Promise.all([
    provider.toPhrases(nonBlank(criteria.terms)),
    provider.toPhrases(nonBlank(criteria.excludedTerms)),
  ]);
  return { criteria, termPhrases, excludedPhrases };
}

const REGEX_SPECIAL = /[\\^$.|?*+()[\]{}]/g;

/**
 * Uma frase no texto: sem palavra ignorada no meio, a sequência exata
 * (contains); com ela, cada marca "_" aceita uma palavra qualquer naquela
 * posição, como a distância do phraseto_tsquery ("material" <2> "expediente").
 */
function phraseMatch(phrase: string, params: SqlParameters): string {
  const tokens = phrase.trim().split(' ');
  if (!tokens.includes(SKIPPED_WORD)) {
    return `contains(radicais, ${params.add(phrase)})`;
  }
  const pattern = tokens.map((token) => (token === SKIPPED_WORD ? '[^ ]+' : token.replace(REGEX_SPECIAL, '\\$&'))).join(' ');
  return `regexp_matches(radicais, ${params.add(` ${pattern} `)})`;
}

/** O termo bate quando qualquer uma das suas frases aparece no texto. */
function termMatches(phrases: readonly string[], params: SqlParameters): string {
  return `(${phrases.map((phrase) => phraseMatch(phrase, params)).join(' OR ')})`;
}

function inList(column: string, values: readonly (string | number)[], params: SqlParameters): string {
  return `list_contains(${params.add(listValue([...values]))}, ${column})`;
}

/**
 * Condição dos critérios, como na função do Postgres:
 * - termos: cada termo vale pelas suas frases (com as formas de singular e
 *   plural); no modo E, todos; no OU, qualquer um. Termo sem radical não
 *   conta, e com termos que nenhum tem radical nada bate (como a consulta de
 *   texto vazia do Postgres);
 * - exclusões: nenhuma pode aparecer;
 * - UF, município, órgão, categoria e fornecedor: lista vazia = sem filtro;
 * - faixa de valor: contrato sem valor global só entra com "incluir sem valor".
 */
export function contractCriteriaCondition(phrased: PhrasedContractCriteria, params: SqlParameters): string {
  const { criteria } = phrased;
  const conditions: string[] = [];

  if (phrased.termPhrases.length > 0) {
    const terms = phrased.termPhrases.filter((phrases) => phrases.length > 0);
    const joiner = criteria.termsMode === 'E' ? ' AND ' : ' OR ';
    conditions.push(terms.length === 0 ? 'false' : `(${terms.map((phrases) => termMatches(phrases, params)).join(joiner)})`);
  }
  const excluded = phrased.excludedPhrases.filter((phrases) => phrases.length > 0);
  if (excluded.length > 0) {
    conditions.push(`NOT (${excluded.map((phrases) => termMatches(phrases, params)).join(' OR ')})`);
  }

  const lists: Array<[string, readonly (string | number)[]]> = [
    ['uf', criteria.states],
    ['municipio_ibge', criteria.cityIbgeCodes],
    ['orgao_cnpj', criteria.agencyCnpjs],
    ['categoria_id', criteria.categories],
    ['fornecedor_documento', criteria.supplierCnpjs],
  ];
  for (const [column, values] of lists) {
    if (values.length > 0) {
      conditions.push(inList(column, values, params));
    }
  }

  if (criteria.minValue !== null || criteria.maxValue !== null) {
    const bounds = [
      criteria.minValue !== null ? `valor_global >= ${params.add(criteria.minValue)}::DECIMAL(18,2)` : null,
      criteria.maxValue !== null ? `valor_global <= ${params.add(criteria.maxValue)}::DECIMAL(18,2)` : null,
    ].filter((bound): bound is string => bound !== null);
    const withoutValue = criteria.includeWithoutValue ? 'valor_global IS NULL OR ' : '';
    conditions.push(`(${withoutValue}(valor_global IS NOT NULL AND ${bounds.join(' AND ')}))`);
  }

  return conditions.length > 0 ? conditions.join(' AND ') : 'true';
}

/** Conjunto do armazém que uma lista de contratos lê: os vigentes, todos os contratos ou o ordenado por fornecedor. */
export type ContractListDataset = 'vigentes' | 'contratos' | 'fornecedor';

/**
 * O conjunto que atende a busca (plano .plans/licitacoes-pagina-cnpj.md). Com filtro de fornecedor e sem critério que
 * precise do texto do contrato (termos, exclusões e grupos de dígitos do número, que só `vigentes` e `contratos`
 * guardam), a busca lê o `fornecedor`: todos os contratos, em arquivos ordenados pelo CNPJ do fornecedor, dos quais
 * o DuckDB pula quase todos. Nos outros casos, `contratos` (todos) ou `vigentes`, como sempre.
 */
export function contractListDataset(
  phrased: PhrasedContractCriteria,
  options: { allContracts: boolean; numberGroups: readonly string[] },
): ContractListDataset {
  const usesText = phrased.termPhrases.length > 0 || phrased.excludedPhrases.some((phrases) => phrases.length > 0);
  if (phrased.criteria.supplierCnpjs.length > 0 && !usesText && options.numberGroups.length === 0) {
    return 'fornecedor';
  }
  return options.allContracts ? 'contratos' : 'vigentes';
}

/**
 * Condição só para o DuckDB pular arquivos, somada às de `contractCriteriaCondition` (que continuam valendo e dão o
 * resultado): `fornecedor_documento IN (...)`, com os CNPJs como literais, depois de conferidos contra o formato, porque
 * com `list_contains` e parâmetro o DuckDB não usa os mínimos e máximos dos arquivos. Lista com algum CNPJ fora do
 * formato (CPF mascarado, texto) fica sem a poda, e a condição exata decide.
 * Não há poda por órgão: medida no armazém local (351 mil contratos), a faixa do CNPJ do órgão no número de controle
 * não pula arquivo nenhum, porque `contratos` é ordenado por UF antes do número, e só soma custo.
 */
export function supplierPruneCondition(criteria: Pick<ContractCriteria, 'supplierCnpjs'>): string | null {
  if (criteria.supplierCnpjs.length === 0 || !criteria.supplierCnpjs.every(isCnpjFormat)) {
    return null;
  }
  return `fornecedor_documento IN (${criteria.supplierCnpjs.map(sqlLiteral).join(', ')})`;
}

/** Contrato vigente: vencimento de hoje (AAAA-MM-DD, Brasília) em diante; sem vencimento não é vigente. */
export function activeContractCondition(today: string, params: SqlParameters): string {
  return `vencimento >= ${params.add(today)}::DATE`;
}

/** Posição de um termo que não aparece: depois de qualquer texto real. */
const MISSING_POSITION = 1_000_000_000;

/** Onde a frase começa no texto (1 = no começo), pela primeira palavra dela; nulo quando não aparece. */
function phrasePosition(phrase: string, params: SqlParameters): string {
  const first = phrase.trim().split(' ')[0] ?? '';
  return `nullif(instr(radicais, ${params.add(` ${first} `)}), 0)`;
}

/** Posição de um termo no texto: a primeira das suas frases. */
function termPosition(phrases: readonly string[], params: SqlParameters): string {
  return `least(${phrases.map((phrase) => phrasePosition(phrase, params)).join(', ')})`;
}

/**
 * Ordem por relevância, simplificada (o ts_rank_cd do Postgres não existe nos
 * arquivos): primeiro os contratos em que mais termos aparecem e, no empate,
 * aquele em que um termo aparece mais perto do começo do texto. Sem termos com
 * radical, não ordena por nada (a ordem de desempate da consulta decide).
 */
export function relevanceOrder(phrased: PhrasedContractCriteria, params: SqlParameters): string | null {
  const terms = phrased.termPhrases.filter((phrases) => phrases.length > 0);
  if (terms.length === 0) {
    return null;
  }
  const matched = terms.map((phrases) => `CASE WHEN ${termMatches(phrases, params)} THEN 1 ELSE 0 END`).join(' + ');
  const earliest = terms.map((phrases) => `coalesce(${termPosition(phrases, params)}, ${MISSING_POSITION})`).join(', ');
  return `(${matched}) DESC, least(${earliest}) ASC`;
}
