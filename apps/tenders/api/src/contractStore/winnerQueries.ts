import type { DuckDBConnection } from '@duckdb/node-api';
import { requireCnpjFormat } from '../cnpj';
import { integerOf, sqlLiteral, textOrNull } from './duckdb';

// Consultas de leitura dos vencedores (plano .plans/licitacoes-vencedores.md): o resumo de um fornecedor pelo CNPJ,
// os órgãos em que ele mais venceu e a lista das licitações. Rodam numa conexão do leitor (reader.ts) aberto com o
// conjunto `vencedores`; o comando `winners-lookup` e a página do CNPJ (services/cnpjPage.ts) as usam.
//
// O CNPJ é conferido contra o formato e entra como literal, nunca como parâmetro nem em `list_contains`: com literais o
// DuckDB usa os mínimos e máximos dos arquivos para pular os que não têm o fornecedor (medido: 4 a 5 ms contra 61 ms
// em 1,2 milhão de linhas). A faixa na chave (`<cnpj>|` até `<cnpj>}`) pega só as linhas daquele CNPJ, porque `}` vem
// logo depois de `|`, e as chaves das pessoas que não são PJ nunca começam por 14 dígitos seguidos de `|`.
// Contagens saem com `::INTEGER` (nunca BigInt) e as somas em reais chegam como texto, sem passar por ponto flutuante.

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 500;
const DEFAULT_AGENCY_LIMIT = 10;
const MAX_AGENCY_LIMIT = 100;

/** Condição das linhas de um fornecedor; o CNPJ é conferido contra o formato (fora dele, `InvalidCnpjError`). */
function supplierCondition(cnpj: string): string {
  requireCnpjFormat(cnpj);
  return `chave >= ${sqlLiteral(`${cnpj}|`)} AND chave < ${sqlLiteral(`${cnpj}}`)} AND fornecedor_documento = ${sqlLiteral(cnpj)}`;
}

export interface WinnerYearSummary {
  year: number;
  purchases: number;
  items: number;
  /** Reais com 2 casas ("1234.50"). */
  totalValue: string;
}

export interface WinnerSummary {
  /** O nome do fornecedor no resultado mais recente; null sem vitórias. */
  name: string | null;
  purchases: number;
  items: number;
  totalValue: string;
  firstResultDate: string | null;
  lastResultDate: string | null;
  /** Do ano mais recente para o mais antigo. */
  byYear: WinnerYearSummary[];
}

/** Licitações, itens e valor de um fornecedor, no total e por ano da compra. */
export async function queryWinnerSummary(connection: DuckDBConnection, cnpj: string): Promise<WinnerSummary> {
  const where = supplierCondition(cnpj);
  const total = await connection.runAndReadAll(`
    SELECT count(*)::INTEGER AS licitacoes, coalesce(sum(quantidade_itens), 0)::INTEGER AS itens,
           coalesce(sum(valor_homologado_total), 0)::DECIMAL(38,2) AS valor,
           min(primeira_data_resultado) AS primeira, max(ultima_data_resultado) AS ultima,
           arg_max(fornecedor_nome, ultima_data_resultado) AS nome
      FROM vencedores WHERE ${where}`);
  const byYear = await connection.runAndReadAll(`
    SELECT ano_compra, count(*)::INTEGER AS licitacoes, coalesce(sum(quantidade_itens), 0)::INTEGER AS itens,
           coalesce(sum(valor_homologado_total), 0)::DECIMAL(38,2) AS valor
      FROM vencedores WHERE ${where} GROUP BY ano_compra ORDER BY ano_compra DESC`);
  const row = total.getRowObjectsJson()[0] ?? {};
  return {
    name: textOrNull(row['nome']),
    purchases: integerOf(row['licitacoes']),
    items: integerOf(row['itens']),
    totalValue: String(row['valor'] ?? '0.00'),
    firstResultDate: textOrNull(row['primeira']),
    lastResultDate: textOrNull(row['ultima']),
    byYear: byYear.getRowObjectsJson().map((year) => ({
      year: integerOf(year['ano_compra']),
      purchases: integerOf(year['licitacoes']),
      items: integerOf(year['itens']),
      totalValue: String(year['valor'] ?? '0.00'),
    })),
  };
}

export interface WinnerAgencySummary {
  agencyCnpj: string;
  /** A fonte de resultados não traz o nome do órgão: fica nulo até outra fonte preencher. */
  agencyName: string | null;
  purchases: number;
  items: number;
  totalValue: string;
}

/** Os órgãos em que o fornecedor mais venceu, pelo valor e depois pelo número de licitações. */
export async function queryTopAgencies(connection: DuckDBConnection, cnpj: string, limit = DEFAULT_AGENCY_LIMIT): Promise<WinnerAgencySummary[]> {
  const where = supplierCondition(cnpj);
  const result = await connection.runAndReadAll(`
    SELECT orgao_cnpj, max(orgao_razao_social) AS orgao, count(*)::INTEGER AS licitacoes,
           coalesce(sum(quantidade_itens), 0)::INTEGER AS itens, coalesce(sum(valor_homologado_total), 0)::DECIMAL(38,2) AS valor
      FROM vencedores WHERE ${where}
     GROUP BY orgao_cnpj ORDER BY valor DESC, licitacoes DESC, orgao_cnpj
     LIMIT ${Math.min(Math.max(Math.trunc(limit), 1), MAX_AGENCY_LIMIT)}`);
  return result.getRowObjectsJson().map((row) => ({
    agencyCnpj: String(row['orgao_cnpj']),
    agencyName: textOrNull(row['orgao']),
    purchases: integerOf(row['licitacoes']),
    items: integerOf(row['itens']),
    totalValue: String(row['valor'] ?? '0.00'),
  }));
}

/** Quantas licitações o fornecedor venceu: o total da lista paginada. */
export async function queryWinnerCount(connection: DuckDBConnection, cnpj: string): Promise<number> {
  const result = await connection.runAndReadAll(`SELECT count(*)::INTEGER FROM vencedores WHERE ${supplierCondition(cnpj)}`);
  return integerOf(result.getRows()[0]?.[0]);
}

/** Uma licitação vencida, sem o mapa de itens (o Parquet é colunar: a coluna que não se pede não é lida). */
export interface WinnerListRow {
  key: string;
  purchaseControlNumber: string;
  year: number;
  agencyCnpj: string;
  agencyName: string | null;
  state: string | null;
  cityName: string | null;
  supplierName: string | null;
  items: number;
  totalValue: string;
  firstResultDate: string;
  lastResultDate: string;
}

export interface WinnerListQuery {
  limit?: number;
  offset?: number;
}

/** As licitações do fornecedor, da mais recente para a mais antiga, com desempate estável. */
export async function queryWinnerList(connection: DuckDBConnection, cnpj: string, query: WinnerListQuery = {}): Promise<WinnerListRow[]> {
  const where = supplierCondition(cnpj);
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? DEFAULT_LIST_LIMIT), 1), MAX_LIST_LIMIT);
  const offset = Math.max(Math.trunc(query.offset ?? 0), 0);
  const result = await connection.runAndReadAll(`
    SELECT chave, numero_controle_compra, ano_compra, orgao_cnpj, orgao_razao_social, uf, municipio_nome, fornecedor_nome,
           quantidade_itens, valor_homologado_total, primeira_data_resultado, ultima_data_resultado
      FROM vencedores WHERE ${where}
     ORDER BY ultima_data_resultado DESC, numero_controle_compra, chave
     LIMIT ${limit} OFFSET ${offset}`);
  return result.getRowObjectsJson().map((row) => ({
    key: String(row['chave']),
    purchaseControlNumber: String(row['numero_controle_compra']),
    year: integerOf(row['ano_compra']),
    agencyCnpj: String(row['orgao_cnpj']),
    agencyName: textOrNull(row['orgao_razao_social']),
    state: textOrNull(row['uf']),
    cityName: textOrNull(row['municipio_nome']),
    supplierName: textOrNull(row['fornecedor_nome']),
    items: integerOf(row['quantidade_itens']),
    totalValue: String(row['valor_homologado_total']),
    firstResultDate: String(row['primeira_data_resultado']),
    lastResultDate: String(row['ultima_data_resultado']),
  }));
}
