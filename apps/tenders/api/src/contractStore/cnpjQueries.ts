import type { DuckDBConnection } from '@duckdb/node-api';
import { requireCnpjFormat } from '../cnpj';
import { SqlParameters, activeContractCondition } from './criteria';
import { integerOf, sqlLiteral, textOrNull } from './duckdb';

// Consultas do armazém para a página do CNPJ (plano .plans/licitacoes-pagina-cnpj.md): os contratos de um CNPJ como
// fornecedor e como órgão, os principais parceiros de cada lado e a cobertura dos dados. Rodam numa conexão do leitor
// (reader.ts). O CNPJ é conferido contra o formato e entra como literal (com literais o DuckDB usa os mínimos e
// máximos dos arquivos); `today` entra como parâmetro. Contagens saem com `::INTEGER` (nunca BigInt) e as somas em
// reais chegam como texto, sem passar por ponto flutuante.
//
// Como fornecedor, a leitura é no conjunto `fornecedor` (ordenado pelo CNPJ do fornecedor: o DuckDB pula quase todos os
// arquivos). Como órgão, no `contratos`, que não é ordenado pelo órgão: a consulta varre o conjunto (medido em 351 mil
// contratos: cerca de 170 ms; ver o plano).

const DEFAULT_RANKING_LIMIT = 10;
const MAX_RANKING_LIMIT = 50;

const rankingLimit = (limit: number): number => Math.min(Math.max(Math.trunc(limit), 1), MAX_RANKING_LIMIT);

/** Os contratos de um CNPJ num dos papéis. */
export interface ContractRoleSummary {
  /** O nome no contrato mais recente que tem nome; null sem contratos. */
  name: string | null;
  total: number;
  /** Os vigentes: vencimento de hoje em diante (sem vencimento não conta). */
  active: number;
  /** Soma do valor global, em reais com 2 casas ("1234.50"). */
  totalValue: string;
  /** Datas e horas de publicação no PNCP como estão nos arquivos (AAAA-MM-DDTHH:mm:ss, Brasília); null sem contratos. */
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
}

async function summarizeContracts(
  connection: DuckDBConnection,
  source: 'fornecedor' | 'contratos',
  filter: string,
  nameColumn: 'fornecedor_nome' | 'orgao_razao_social',
  today: string,
): Promise<ContractRoleSummary> {
  const params = new SqlParameters();
  const active = activeContractCondition(today, params);
  const result = await connection.runAndReadAll(
    `SELECT count(*)::INTEGER AS total, count(*) FILTER (WHERE ${active})::INTEGER AS vigentes,
            coalesce(sum(valor_global), 0)::DECIMAL(38,2) AS valor,
            min(data_publicacao_pncp) AS primeira, max(data_publicacao_pncp) AS ultima,
            arg_max(${nameColumn}, data_publicacao_pncp) AS nome
       FROM ${source} WHERE ${filter}`,
    params.values,
  );
  const row = result.getRowObjectsJson()[0] ?? {};
  return {
    name: textOrNull(row['nome']),
    total: integerOf(row['total']),
    active: integerOf(row['vigentes']),
    totalValue: String(row['valor'] ?? '0.00'),
    firstPublishedAt: textOrNull(row['primeira']),
    lastPublishedAt: textOrNull(row['ultima']),
  };
}

/** Os contratos em que o CNPJ é o fornecedor. `today` é o dia (AAAA-MM-DD, Brasília) que separa os vigentes. */
export function queryContractsAsSupplier(connection: DuckDBConnection, cnpj: string, today: string): Promise<ContractRoleSummary> {
  return summarizeContracts(connection, 'fornecedor', `fornecedor_documento = ${sqlLiteral(requireCnpjFormat(cnpj))}`, 'fornecedor_nome', today);
}

/** Os contratos em que o CNPJ é o órgão contratante. */
export function queryContractsAsAgency(connection: DuckDBConnection, cnpj: string, today: string): Promise<ContractRoleSummary> {
  return summarizeContracts(connection, 'contratos', `orgao_cnpj = ${sqlLiteral(requireCnpjFormat(cnpj))}`, 'orgao_razao_social', today);
}

/** Um parceiro nos contratos (o órgão de um fornecedor, ou o fornecedor de um órgão). */
export interface ContractPartner {
  cnpj: string;
  name: string | null;
  contracts: number;
  totalValue: string;
}

function toPartners(rows: Array<Record<string, unknown>>): ContractPartner[] {
  return rows.map((row) => ({
    cnpj: String(row['documento']),
    name: textOrNull(row['nome']),
    contracts: integerOf(row['contratos']),
    totalValue: String(row['valor'] ?? '0.00'),
  }));
}

/** Os órgãos que mais contrataram o fornecedor, pelo valor e depois pelo número de contratos. */
export async function queryTopAgenciesByContracts(
  connection: DuckDBConnection,
  cnpj: string,
  limit = DEFAULT_RANKING_LIMIT,
): Promise<ContractPartner[]> {
  const result = await connection.runAndReadAll(
    `SELECT orgao_cnpj AS documento, arg_max(orgao_razao_social, data_publicacao_pncp) AS nome, count(*)::INTEGER AS contratos,
            coalesce(sum(valor_global), 0)::DECIMAL(38,2) AS valor
       FROM fornecedor WHERE fornecedor_documento = ${sqlLiteral(requireCnpjFormat(cnpj))}
      GROUP BY orgao_cnpj ORDER BY valor DESC, contratos DESC, orgao_cnpj
      LIMIT ${rankingLimit(limit)}`,
  );
  return toPartners(result.getRowObjectsJson());
}

/**
 * Os fornecedores que mais foram contratados pelo órgão, pelo valor e depois pelo número de contratos. Só entram os que
 * têm CNPJ: o CPF mascarado serve a várias pessoas ao mesmo tempo (os mesmos 6 dígitos do meio), e somá-los seria
 * inventar um fornecedor.
 */
export async function queryTopSuppliersOfAgency(
  connection: DuckDBConnection,
  cnpj: string,
  limit = DEFAULT_RANKING_LIMIT,
): Promise<ContractPartner[]> {
  const result = await connection.runAndReadAll(
    `SELECT fornecedor_documento AS documento, arg_max(fornecedor_nome, data_publicacao_pncp) AS nome, count(*)::INTEGER AS contratos,
            coalesce(sum(valor_global), 0)::DECIMAL(38,2) AS valor
       FROM contratos WHERE orgao_cnpj = ${sqlLiteral(requireCnpjFormat(cnpj))} AND regexp_matches(fornecedor_documento, '^[0-9]{14}$')
      GROUP BY fornecedor_documento ORDER BY valor DESC, contratos DESC, fornecedor_documento
      LIMIT ${rankingLimit(limit)}`,
  );
  return toPartners(result.getRowObjectsJson());
}

/** O que os arquivos cobrem, para a nota da página ("contratos desde ...", "resultados de ... a ..."). */
export interface StoreCoverage {
  /** Dia (AAAA-MM-DD) da publicação mais antiga entre os contratos; null sem contratos. */
  contractsFrom: string | null;
  /** Primeiro e último dia (AAAA-MM-DD) de resultado entre os vencedores; null sem vencedores. */
  winnersFrom: string | null;
  winnersTo: string | null;
}

export async function queryStoreCoverage(connection: DuckDBConnection): Promise<StoreCoverage> {
  const result = await connection.runAndReadAll(
    `SELECT (SELECT substr(min(data_publicacao_pncp), 1, 10) FROM fornecedor) AS contratos,
            (SELECT min(primeira_data_resultado) FROM vencedores) AS de,
            (SELECT max(ultima_data_resultado) FROM vencedores) AS ate`,
  );
  const row = result.getRowObjectsJson()[0] ?? {};
  return { contractsFrom: textOrNull(row['contratos']), winnersFrom: textOrNull(row['de']), winnersTo: textOrNull(row['ate']) };
}
