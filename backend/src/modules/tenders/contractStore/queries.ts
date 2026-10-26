import { listValue, type DuckDBConnection } from '@duckdb/node-api';
import type { ContractSort } from '../domains';
import {
  SqlParameters,
  activeContractCondition,
  contractCriteriaCondition,
  relevanceOrder,
  supplierPruneCondition,
  type ContractListDataset,
  type PhrasedContractCriteria,
} from './criteria';
import { integerOf, sqlLiteral } from './duckdb';
import { columnList, fromStoreRecord, isContractKey, type StoredContract } from './layout';

// As consultas que a API e os avisos fazem no armazém de contratos (plano
// .plans/licitacoes-contratos-no-r2.md, Parte R2). Rodam numa conexão do leitor
// (reader.ts): a lista da tela, o detalhe, o total das buscas salvas e os
// contratos que vencem numa janela de dias. Os critérios vêm de criteria.ts, e
// tudo o que vem da pessoa entra como parâmetro. As chaves dos contratos
// (favoritos) entram como literais, depois de conferidas contra o formato: com
// literais o DuckDB usa os mínimos e máximos dos arquivos para pular os que não
// têm o contrato, e com parâmetros, não.

/** Colunas da lista, as mesmas em `vigentes` e em `contratos`. */
const LIST_COLUMNS = [
  'numero_controle_pncp',
  'objeto',
  'orgao_cnpj',
  'orgao_razao_social',
  'uf',
  'municipio_nome',
  'municipio_ibge',
  'categoria_id',
  'categoria_nome',
  'tipo_contrato_id',
  'tipo_contrato_nome',
  'fornecedor_nome',
  'fornecedor_documento',
  'valor_global',
  'vigencia_inicio',
  'vigencia_fim_original',
  'vencimento',
  'data_publicacao_pncp',
  'ano_contrato',
  'sequencial_contrato',
].join(', ');

/** Linha da lista, com os nomes das colunas dos arquivos (DECIMAL e DATE chegam como texto). */
export interface ContractListRow {
  numero_controle_pncp: string;
  objeto: string;
  orgao_cnpj: string;
  orgao_razao_social: string | null;
  uf: string | null;
  municipio_nome: string | null;
  municipio_ibge: string | null;
  categoria_id: number | null;
  categoria_nome: string | null;
  tipo_contrato_id: number | null;
  tipo_contrato_nome: string | null;
  fornecedor_nome: string | null;
  fornecedor_documento: string | null;
  valor_global: string | null;
  vigencia_inicio: string;
  vigencia_fim_original: string | null;
  vencimento: string | null;
  data_publicacao_pncp: string;
  ano_contrato: number;
  sequencial_contrato: number;
}

export interface ContractListQuery {
  /**
   * `vigentes`: só os vigentes (arquivos por faixa de vencimento); `contratos`: todos, inclusive encerrados e sem vencimento;
   * `fornecedor`: todos, em arquivos ordenados pelo CNPJ do fornecedor (só sem critério de texto; ver contractListDataset).
   */
  dataset: ContractListDataset;
  phrased: PhrasedContractCriteria;
  /** Dia (AAAA-MM-DD, Brasília) a partir do qual o contrato é vigente; null = sem filtro de vigência. */
  activeOn: string | null;
  /** Só estes contratos (os favoritos da pessoa); null = qualquer um. */
  keys: readonly string[] | null;
  contractTypes: readonly number[];
  /** Grupos de dígitos do "Número, processo ou controle PNCP"; vazio = sem filtro. */
  numberGroups: readonly string[];
  contractYear: number | null;
  /** Publicados a partir deste dia (inclusive) e antes deste (exclusive), em Brasília. */
  publishedFrom: string | null;
  publishedBefore: string | null;
  expiryFrom: string | null;
  expiryTo: string | null;
  sort: ContractSort;
  page: number;
  perPage: number;
}

/** Os 4 campos de número: número do contrato + ano, processo + ano, controle do contrato e da compra. */
const NUMBER_GROUP_COLUMNS = ['grupos_numero', 'grupos_processo', 'grupos_controle', 'grupos_compra'];

/** Lista de chaves como literais SQL; chave fora do formato não pode ser consultada e fica de fora. */
function keyLiterals(keys: readonly string[]): string {
  return keys.filter(isContractKey).map(sqlLiteral).join(', ');
}

function listConditions(query: ContractListQuery, params: SqlParameters): string[] {
  const conditions = [contractCriteriaCondition(query.phrased, params)];
  const prune = supplierPruneCondition(query.phrased.criteria);
  if (prune !== null) {
    conditions.push(prune);
  }
  if (query.activeOn !== null) {
    conditions.push(activeContractCondition(query.activeOn, params));
  }
  if (query.keys !== null) {
    conditions.push(`numero_controle_pncp IN (${keyLiterals(query.keys)})`);
  }
  if (query.contractTypes.length > 0) {
    conditions.push(`list_contains(${params.add(listValue([...query.contractTypes]))}, tipo_contrato_id)`);
  }
  if (query.numberGroups.length > 0) {
    const groups = params.add(listValue([...query.numberGroups]));
    conditions.push(`(${NUMBER_GROUP_COLUMNS.map((column) => `list_has_all(${column}, ${groups})`).join(' OR ')})`);
  }
  if (query.contractYear !== null) {
    conditions.push(`ano_contrato = ${Math.trunc(query.contractYear)}`);
  }
  if (query.publishedFrom !== null) {
    conditions.push(`data_publicacao_pncp >= ${params.add(query.publishedFrom)}`);
  }
  if (query.publishedBefore !== null) {
    conditions.push(`data_publicacao_pncp < ${params.add(query.publishedBefore)}`);
  }
  if (query.expiryFrom !== null) {
    conditions.push(`vencimento >= ${params.add(query.expiryFrom)}::DATE`);
  }
  if (query.expiryTo !== null) {
    conditions.push(`vencimento <= ${params.add(query.expiryTo)}::DATE`);
  }
  return conditions;
}

/** Ordem da lista; o número de controle desempata, para a paginação não repetir nem perder contrato. */
function orderBy(query: ContractListQuery, params: SqlParameters): string {
  const tieBreak = 'numero_controle_pncp ASC';
  switch (query.sort) {
    case 'expiryAsc':
      return `vencimento ASC NULLS LAST, ${tieBreak}`;
    case 'publishedDesc':
      return `data_publicacao_pncp DESC, ${tieBreak}`;
    case 'valueDesc':
      return `valor_global DESC NULLS LAST, ${tieBreak}`;
    case 'valueAsc':
      return `valor_global ASC NULLS LAST, ${tieBreak}`;
    case 'relevance': {
      const relevance = relevanceOrder(query.phrased, params);
      return relevance === null ? `vencimento ASC NULLS LAST, ${tieBreak}` : `${relevance}, vencimento ASC NULLS LAST, ${tieBreak}`;
    }
  }
}

/**
 * Uma página da lista e o total que bate com os filtros. O total sai da própria
 * página quando ela é a última (menos linhas que o tamanho da página); senão,
 * uma segunda consulta conta.
 */
export async function queryContractPage(
  connection: DuckDBConnection,
  query: ContractListQuery,
): Promise<{ rows: ContractListRow[]; total: number }> {
  if (query.keys !== null && keyLiterals(query.keys) === '') {
    return { rows: [], total: 0 };
  }
  const offset = (query.page - 1) * query.perPage;
  const pageParams = new SqlParameters();
  const pageWhere = listConditions(query, pageParams).join(' AND ');
  const pageOrder = orderBy(query, pageParams);
  const pageResult = await connection.runAndReadAll(
    `SELECT ${LIST_COLUMNS} FROM ${query.dataset} WHERE ${pageWhere} ORDER BY ${pageOrder}
      LIMIT ${Math.trunc(query.perPage)} OFFSET ${Math.trunc(offset)}`,
    pageParams.values,
  );
  const rows = pageResult.getRowObjectsJson() as unknown as ContractListRow[];
  if (rows.length < query.perPage && (rows.length > 0 || offset === 0)) {
    return { rows, total: offset + rows.length };
  }

  const countParams = new SqlParameters();
  const countWhere = listConditions(query, countParams).join(' AND ');
  const countResult = await connection.runAndReadAll(
    `SELECT count(*)::INTEGER FROM ${query.dataset} WHERE ${countWhere}`,
    countParams.values,
  );
  return { rows, total: integerOf(countResult.getRows()[0]?.[0]) };
}

/** O contrato inteiro pela chave; null quando não está no armazém. */
export async function readContract(connection: DuckDBConnection, key: string): Promise<StoredContract | null> {
  if (!isContractKey(key)) {
    return null;
  }
  const result = await connection.runAndReadAll(
    `SELECT ${columnList('contratos')} FROM contratos WHERE numero_controle_pncp = ${sqlLiteral(key)} LIMIT 1`,
  );
  const row = result.getRowObjectsJson()[0];
  return row ? fromStoreRecord(row) : null;
}

export async function contractExists(connection: DuckDBConnection, key: string): Promise<boolean> {
  if (!isContractKey(key)) {
    return false;
  }
  const result = await connection.runAndReadAll(`SELECT 1 FROM contratos WHERE numero_controle_pncp = ${sqlLiteral(key)} LIMIT 1`);
  return result.getRows().length > 0;
}

/** Quantos vigentes batem com os critérios (o total "vigentes agora" das buscas salvas). */
export async function countActiveContracts(connection: DuckDBConnection, phrased: PhrasedContractCriteria, today: string): Promise<number> {
  const params = new SqlParameters();
  const where = [contractCriteriaCondition(phrased, params), activeContractCondition(today, params)].join(' AND ');
  const result = await connection.runAndReadAll(`SELECT count(*)::INTEGER FROM vigentes WHERE ${where}`, params.values);
  return integerOf(result.getRows()[0]?.[0]);
}

/** Contrato que vence numa janela de dias, para os avisos. */
export interface ExpiringContract {
  controlNumber: string;
  /** AAAA-MM-DD. */
  expiresOn: string;
  contractObject: string;
}

/** Janela de dias depois de hoje (Brasília), inclusive nos dois lados. */
export interface DayWindow {
  from: number;
  to: number;
}

async function readExpiring(
  connection: DuckDBConnection,
  today: string,
  window: DayWindow,
  condition: (params: SqlParameters) => string,
): Promise<ExpiringContract[]> {
  const params = new SqlParameters();
  const day = params.add(today);
  const where = [
    `vencimento BETWEEN ${day}::DATE + ${Math.trunc(window.from)} AND ${day}::DATE + ${Math.trunc(window.to)}`,
    condition(params),
  ].join(' AND ');
  const result = await connection.runAndReadAll(
    `SELECT numero_controle_pncp, vencimento, objeto FROM vigentes WHERE ${where} ORDER BY vencimento, numero_controle_pncp`,
    params.values,
  );
  return result.getRowObjectsJson().map((row) => ({
    controlNumber: String(row['numero_controle_pncp']),
    expiresOn: String(row['vencimento']),
    contractObject: String(row['objeto']),
  }));
}

/** Vigentes que vencem na janela e batem com os critérios (as buscas salvas). */
export function readExpiringByCriteria(
  connection: DuckDBConnection,
  today: string,
  window: DayWindow,
  phrased: PhrasedContractCriteria,
): Promise<ExpiringContract[]> {
  return readExpiring(connection, today, window, (params) => contractCriteriaCondition(phrased, params));
}

/** Vigentes que vencem na janela entre os contratos indicados (os favoritos). */
export function readExpiringByKeys(
  connection: DuckDBConnection,
  today: string,
  window: DayWindow,
  keys: readonly string[],
): Promise<ExpiringContract[]> {
  const literals = keyLiterals(keys);
  if (literals === '') {
    return Promise.resolve([]);
  }
  return readExpiring(connection, today, window, () => `numero_controle_pncp IN (${literals})`);
}
