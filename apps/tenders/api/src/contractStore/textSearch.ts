import { sql, type SQL } from 'drizzle-orm';
import type { TenderContractRow } from '../collector/contractMapping';
import type { TendersDb } from '../collector/database';
import type { ContractSearchFields } from './layout';

// Campos de busca dos contratos, sempre pelo Postgres: o dicionário de texto
// (licitacoes.pt_unaccent, o mesmo dos editais: sem acento e com radical),
// licitacoes.fn_grupos_digitos (migration 0079) e as frases de cada termo
// (licitacoes.fn_frases_termo, migration 0087a: o termo com as formas de
// singular e plural de cada palavra, como na busca dos editais). Assim a regra
// continua num lugar só. O coletor grava nos arquivos os radicais de cada
// contrato, nas posições, entre espaços; cada frase do termo vira a sequência
// dos seus radicais, e o termo bate quando uma delas aparece no texto, com as
// palavras nas mesmas distâncias da busca do Postgres (criteria.ts).
// SQL parametrizado (via sql do Drizzle): são funções do banco, sem tabela.

/** Calcula os campos de busca de uma lista de contratos, na mesma ordem. */
export interface ContractSearchFieldsProvider {
  computeSearchFields(rows: readonly TenderContractRow[]): Promise<ContractSearchFields[]>;
}

/**
 * As frases de cada termo da busca como sequências de radicais, na ordem dos
 * termos: uma lista por termo, vazia quando o termo não tem radical (como "de").
 */
export interface SearchPhrasesProvider {
  toPhrases(terms: readonly string[]): Promise<string[][]>;
}

/** Marca de posição: palavra que o dicionário ignora (como "de"), que ocupa o lugar dela na frase. */
export const SKIPPED_WORD = '_';

// Sequência de radicais de um texto, nas posições do tsvector: cada palavra
// ignorada no meio vira a marca "_", para a distância entre as palavras ser a
// mesma do Postgres (o phraseto_tsquery exige "material" a 2 posições de
// "expediente" em "material de expediente"). As ignoradas no começo e no fim
// não entram, como no phraseto_tsquery.
const stemSequence = (text: SQL) => sql`(
  SELECT ' ' || coalesce(string_agg(repeat(${`${SKIPPED_WORD} `}, greatest(coalesce(s.pos - s.anterior - 1, 0), 0)) || s.lexeme, ' ' ORDER BY s.pos), '') || ' '
    FROM (SELECT u.lexeme, p.pos, lag(p.pos) OVER (ORDER BY p.pos) AS anterior
            FROM unnest(to_tsvector('licitacoes.pt_unaccent', ${text})) AS u, unnest(u.positions) AS p(pos)) AS s)`;

interface SearchFieldsRow extends Record<string, unknown> {
  ord: string;
  radicais: string;
  grupos_numero: string[];
  grupos_processo: string[];
  grupos_controle: string[];
  grupos_compra: string[];
}

export function postgresSearchFields(db: TendersDb): ContractSearchFieldsProvider {
  return {
    async computeSearchFields(rows) {
      if (rows.length === 0) {
        return [];
      }
      // Os mesmos textos da antiga coluna busca_tsv e dos antigos índices de número (migration 0085).
      const texts = rows.map((row) => `${row.contractObject ?? ''} ${row.additionalInformation ?? ''}`);
      const result = await db.execute<SearchFieldsRow>(sql`
        SELECT t.ord::text AS ord,
               ${stemSequence(sql`t.texto`)} AS radicais,
               licitacoes.fn_grupos_digitos(coalesce(t.numero, '') || ' ' || t.ano::text) AS grupos_numero,
               licitacoes.fn_grupos_digitos(coalesce(t.processo, '') || ' ' || t.ano::text) AS grupos_processo,
               licitacoes.fn_grupos_digitos(t.controle) AS grupos_controle,
               licitacoes.fn_grupos_digitos(t.compra) AS grupos_compra
          FROM unnest(
                 ${sql.param(texts)}::text[],
                 ${sql.param(rows.map((row) => row.contractNumber ?? null))}::text[],
                 ${sql.param(rows.map((row) => row.processNumber ?? null))}::text[],
                 ${sql.param(rows.map((row) => row.contractYear))}::int[],
                 ${sql.param(rows.map((row) => row.pncpControlNumber))}::text[],
                 ${sql.param(rows.map((row) => row.purchaseControlNumber ?? null))}::text[]
               ) WITH ORDINALITY AS t(texto, numero, processo, ano, controle, compra, ord)
         ORDER BY t.ord`);
      return result.rows.map((row) => ({
        stems: row.radicais,
        numberGroups: row.grupos_numero,
        processGroups: row.grupos_processo,
        controlGroups: row.grupos_controle,
        purchaseGroups: row.grupos_compra,
      }));
    },
  };
}

export function postgresSearchPhrases(db: TendersDb): SearchPhrasesProvider {
  return {
    async toPhrases(terms) {
      if (terms.length === 0) {
        return [];
      }
      // Frase sem radical (a sequência vazia é só "  ") não entra.
      const result = await db.execute<{ ord: string; frases: string[] }>(sql`
        SELECT t.ord::text AS ord,
               coalesce(array_agg(DISTINCT s.sequencia ORDER BY s.sequencia) FILTER (WHERE btrim(s.sequencia) <> ''), '{}') AS frases
          FROM unnest(${sql.param([...terms])}::text[]) WITH ORDINALITY AS t(termo, ord)
          LEFT JOIN LATERAL (
            SELECT ${stemSequence(sql`f.frase`)} AS sequencia
              FROM unnest(licitacoes.fn_frases_termo(t.termo)) AS f(frase)
          ) s ON true
         GROUP BY t.ord
         ORDER BY t.ord`);
      return result.rows.map((row) => row.frases);
    },
  };
}
