-- 0079: módulo de Licitações: busca por número da compra, processo e controle PNCP.
--
-- O campo "Número, processo ou controle PNCP" de Buscar compara só os dígitos,
-- em grupos e sem os zeros à esquerda ("PE 352/2026" vira 352 e 2026). O edital
-- entra se todos os grupos estiverem num mesmo campo: número da compra + ano,
-- processo + ano, ou controle PNCP. Cada órgão escreve o número de um jeito
-- ("PE 352/26", "00002826", "154.00015971/2026-66"), por isso a comparação é
-- pelos grupos. Os três índices GIN deixam a busca em milissegundos; sem eles,
-- cada busca lia a tabela inteira (140 a 250 ms com 25 mil editais).
--
-- A consulta (services/noticeSearch.ts) usa exatamente as mesmas expressões dos
-- índices; mudar uma exige mudar a outra. concat_ws não serve aqui porque não é
-- imutável: a concatenação usa || com coalesce.
--
-- Sem coluna nova: a tabela não é reescrita. O CREATE INDEX trava só a gravação
-- (a coleta) durante a criação, por alguns segundos; a leitura continua.
--
-- ORDEM: aplicar depois da 0078 e ANTES do deploy do código que a usa (sem a
-- função, só a busca por número falha).
--
-- REVERSÃO:
--   DROP INDEX licitacoes.ix_edital_numero_grupos;
--   DROP INDEX licitacoes.ix_edital_processo_grupos;
--   DROP INDEX licitacoes.ix_edital_controle_grupos;
--   DROP FUNCTION licitacoes.fn_grupos_digitos(TEXT);
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- Grupos de dígitos do texto, sem os zeros à esquerda ("000" vira "0").
CREATE FUNCTION licitacoes.fn_grupos_digitos(p_texto TEXT) RETURNS TEXT[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(array_agg(coalesce(nullif(ltrim(g, '0'), ''), '0')), '{}')
    FROM regexp_split_to_table(coalesce(p_texto, ''), '\D+') AS g
   WHERE g <> ''
$$;

CREATE INDEX ix_edital_numero_grupos ON licitacoes.edital
  USING GIN (licitacoes.fn_grupos_digitos(coalesce(numero_compra, '') || ' ' || coalesce(ano_compra::text, '')));

CREATE INDEX ix_edital_processo_grupos ON licitacoes.edital
  USING GIN (licitacoes.fn_grupos_digitos(coalesce(processo, '') || ' ' || coalesce(ano_compra::text, '')));

CREATE INDEX ix_edital_controle_grupos ON licitacoes.edital
  USING GIN (licitacoes.fn_grupos_digitos(numero_controle_pncp));
