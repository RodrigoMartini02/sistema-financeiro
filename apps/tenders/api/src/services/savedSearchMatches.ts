import { sql, type SQL } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';

// Editais abertos que batem com as buscas salvas do usuário na conta: o total
// de cada busca (openCount) e o resumo do painel (novos hoje e abertos por UF).
//
// SQL escrito à mão porque cada busca precisa da própria consulta de texto
// calculada uma vez (CTE materializada) e de uma contagem por busca (subconsulta
// correlacionada) que use o índice GIN. A condição solta `busca_tsv @@ consulta`
// existe só para o banco usar esse índice: quem decide se o edital bate é sempre
// licitacoes.fn_edital_atende_criterios + licitacoes.fn_edital_aberto (a mesma
// regra de licitacoes.fn_edital_bate).

interface SearchesScope {
  accountId: number;
  userId: number;
  onlyActive: boolean;
  searchIds?: number[];
}

function searchesWithQueries(scope: SearchesScope): SQL {
  const onlyActive = scope.onlyActive ? sql`AND b.ativa` : sql``;
  const onlyIds = scope.searchIds ? sql`AND b.id = ANY (${sql.param(scope.searchIds)}::bigint[])` : sql``;
  return sql`
    SELECT b.id, b.ufs, b.municipios_ibge::text[] AS municipios, b.orgaos_cnpj::text[] AS orgaos, b.modalidades,
           b.valor_min, b.valor_max, b.incluir_sem_valor, b.apenas_srp,
           licitacoes.fn_tsquery_termos(b.termos, b.modo_termos) AS consulta,
           licitacoes.fn_tsquery_termos(b.termos_exclusao, 'OU') AS exclusao
      FROM licitacoes.busca_salva b
     WHERE b.conta_id = ${scope.accountId} AND b.usuario_id = ${scope.userId} ${onlyActive} ${onlyIds}`;
}

const MATCHES_SEARCH = sql`
  licitacoes.fn_edital_atende_criterios(
    e, bs.consulta, bs.exclusao, bs.ufs, bs.municipios, bs.orgaos, bs.modalidades,
    bs.valor_min, bs.valor_max, bs.incluir_sem_valor, bs.apenas_srp)
  AND licitacoes.fn_edital_aberto(e)`;

/** Editais abertos que batem com cada busca, por id da busca (inclui as inativas, quando pedidas). */
export async function countOpenMatchesBySearch(
  db: TendersDb,
  accountId: number,
  userId: number,
  searchIds?: number[],
): Promise<Map<number, number>> {
  const result = await db.execute<{ id: string; open_count: string }>(sql`
    WITH buscas AS MATERIALIZED (${searchesWithQueries({ accountId, userId, onlyActive: false, searchIds })})
    SELECT bs.id,
           (SELECT count(*) FROM licitacoes.edital e
             WHERE bs.consulta IS NOT NULL AND e.busca_tsv @@ bs.consulta AND ${MATCHES_SEARCH})
         + (SELECT count(*) FROM licitacoes.edital e
             WHERE bs.consulta IS NULL AND ${MATCHES_SEARCH}) AS open_count
      FROM buscas bs`);
  return new Map(result.rows.map((row) => [Number(row.id), Number(row.open_count)]));
}

export interface OpenMatchesSummary {
  /** Abertos coletados pela primeira vez hoje (Brasília) que batem com alguma busca ativa. */
  newToday: number;
  /** As 10 UFs com mais editais abertos que batem com alguma busca ativa. */
  openByState: Array<{ state: string; count: number }>;
}

/** Resumo do painel pelas buscas salvas ativas do usuário na conta. */
export async function summarizeOpenMatches(db: TendersDb, accountId: number, userId: number): Promise<OpenMatchesSummary> {
  const result = await db.execute<{ new_today: string; open_by_state: Array<{ state: string; count: number }> }>(sql`
    WITH buscas AS MATERIALIZED (${searchesWithQueries({ accountId, userId, onlyActive: true })}),
    casados AS (
      SELECT DISTINCT m.id, m.uf, m.primeira_coleta_em
        FROM buscas bs
        CROSS JOIN LATERAL (
          SELECT e.id, e.uf, e.primeira_coleta_em FROM licitacoes.edital e
           WHERE bs.consulta IS NOT NULL AND e.busca_tsv @@ bs.consulta AND ${MATCHES_SEARCH}
          UNION ALL
          SELECT e.id, e.uf, e.primeira_coleta_em FROM licitacoes.edital e
           WHERE bs.consulta IS NULL AND ${MATCHES_SEARCH}
        ) m
    )
    SELECT
      (SELECT count(*) FROM casados
        WHERE primeira_coleta_em >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
      ) AS new_today,
      (SELECT coalesce(json_agg(json_build_object('state', por_uf.uf, 'count', por_uf.total) ORDER BY por_uf.total DESC, por_uf.uf), '[]'::json)
         FROM (SELECT uf, count(*) AS total FROM casados WHERE uf IS NOT NULL
                GROUP BY uf ORDER BY total DESC, uf LIMIT 10) por_uf
      ) AS open_by_state`);
  const row = result.rows[0];
  return {
    newToday: Number(row?.new_today ?? 0),
    openByState: (row?.open_by_state ?? []).map((item) => ({ state: String(item.state).trim(), count: Number(item.count) })),
  };
}
