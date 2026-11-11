import type { DuckDBConnection } from '@duckdb/node-api';
import { requireCnpjFormat } from '../cnpj';
import { SqlParameters, activeContractCondition } from './criteria';
import { integerOf, sqlLiteral, textOrNull } from './duckdb';
import { isContractKey } from './layout';

// Consultas do armazém para os concorrentes monitorados (plano .plans/licitacoes-4-concorrentes-monitorados.md): o
// resumo de cada CNPJ como fornecedor e os contratos publicados desde um dia. Leem o conjunto `fornecedor` (ordenado pelo
// CNPJ do fornecedor), com os CNPJs como literais, conferidos antes contra o formato: com literais o DuckDB usa os mínimos
// e máximos dos arquivos e pula os que não têm o CNPJ (com parâmetro, não). As datas entram como parâmetro. Contagens
// saem com `::INTEGER` (nunca BigInt). Rodam numa conexão do leitor (reader.ts); sem cópia pronta, o leitor lança o erro
// que a rota responde como 503.

/** CNPJs por consulta: o aviso diário junta os de todas as contas e os manda em lotes. */
export const COMPETITOR_CNPJS_PER_QUERY = 500;

/** Os CNPJs como literais SQL; um fora do formato lança `InvalidCnpjError` e nenhuma consulta é feita. */
function cnpjLiterals(cnpjs: readonly string[]): string {
  return cnpjs.map((cnpj) => sqlLiteral(requireCnpjFormat(cnpj))).join(', ');
}

/** Os contratos de um concorrente como fornecedor. */
export interface CompetitorContractSummary {
  cnpj: string;
  /** O nome no contrato mais recente; null se nenhum contrato tem nome. */
  name: string | null;
  total: number;
  /** Os vigentes: vencimento de hoje em diante (sem vencimento não conta). */
  active: number;
  /** Os publicados de `recentSince` em diante. */
  recent: number;
  /** Data e hora da publicação mais recente, como estão nos arquivos (AAAA-MM-DDTHH:mm:ss, Brasília). */
  lastPublishedAt: string | null;
}

/**
 * O resumo dos CNPJs pedidos, numa consulta só. Só voltam os CNPJs que têm contrato como fornecedor; quem chama
 * completa os outros com zeros. `today` e `recentSince` são dias AAAA-MM-DD de Brasília.
 */
export async function queryCompetitorSummaries(
  connection: DuckDBConnection,
  cnpjs: readonly string[],
  today: string,
  recentSince: string,
): Promise<CompetitorContractSummary[]> {
  if (cnpjs.length === 0) {
    return [];
  }
  const params = new SqlParameters();
  const active = activeContractCondition(today, params);
  const recent = `data_publicacao_pncp >= ${params.add(recentSince)}`;
  const result = await connection.runAndReadAll(
    `SELECT fornecedor_documento AS cnpj, count(*)::INTEGER AS total,
            count(*) FILTER (WHERE ${active})::INTEGER AS vigentes,
            count(*) FILTER (WHERE ${recent})::INTEGER AS recentes,
            max(data_publicacao_pncp) AS ultima,
            arg_max(fornecedor_nome, data_publicacao_pncp) AS nome
       FROM fornecedor WHERE fornecedor_documento IN (${cnpjLiterals(cnpjs)})
      GROUP BY fornecedor_documento`,
    params.values,
  );
  return result.getRowObjectsJson().map((row) => ({
    cnpj: String(row['cnpj']),
    name: textOrNull(row['nome']),
    total: integerOf(row['total']),
    active: integerOf(row['vigentes']),
    recent: integerOf(row['recentes']),
    lastPublishedAt: textOrNull(row['ultima']),
  }));
}

/** Um contrato publicado, o bastante para o aviso. */
export interface PublishedContract {
  /** A chave do contrato (número de controle). */
  controlNumber: string;
  contractObject: string;
  supplierCnpj: string;
  supplierName: string | null;
  /** O dia da publicação (AAAA-MM-DD, Brasília). */
  publishedOn: string;
}

/**
 * Os contratos dos CNPJs pedidos publicados de `sinceDay` (AAAA-MM-DD, Brasília) em diante, por CNPJ e pela publicação.
 * A publicação está nos arquivos como AAAA-MM-DDTHH:mm:ss, então comparar com o dia inclui o dia inteiro.
 */
export async function queryContractsPublishedSince(
  connection: DuckDBConnection,
  cnpjs: readonly string[],
  sinceDay: string,
): Promise<PublishedContract[]> {
  if (cnpjs.length === 0) {
    return [];
  }
  const params = new SqlParameters();
  const since = params.add(sinceDay);
  const result = await connection.runAndReadAll(
    `SELECT numero_controle_pncp AS chave, objeto, fornecedor_documento AS cnpj, fornecedor_nome AS nome,
            substr(data_publicacao_pncp, 1, 10) AS dia
       FROM fornecedor
      WHERE fornecedor_documento IN (${cnpjLiterals(cnpjs)}) AND data_publicacao_pncp >= ${since}
      ORDER BY fornecedor_documento, data_publicacao_pncp, numero_controle_pncp`,
    params.values,
  );
  return result.getRowObjectsJson().flatMap((row) => {
    const controlNumber = String(row['chave']);
    // Só a chave no formato vira link e aviso (como nos avisos de vencimento).
    if (!isContractKey(controlNumber)) {
      return [];
    }
    return [
      {
        controlNumber,
        contractObject: String(row['objeto'] ?? ''),
        supplierCnpj: String(row['cnpj']),
        supplierName: textOrNull(row['nome']),
        publishedOn: String(row['dia']),
      },
    ];
  });
}
