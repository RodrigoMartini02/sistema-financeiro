-- 0072: módulo de Licitações, parte 1 de 3: schema, extensões e configuração de busca.
--
-- O módulo guarda tudo no schema `licitacoes`. Esta parte cria o schema, as
-- extensões unaccent (busca sem acento) e pg_trgm (busca por trechos) e a
-- configuração de busca `licitacoes.pt_unaccent`: português, sem acentos e
-- com radical (plural e singular batem). Nada do app de finanças muda.
--
-- unaccent e pg_trgm são extensões confiáveis desde o PostgreSQL 13: o dono do
-- banco pode criá-las. No banco local elas vêm com o PostgreSQL 18.
--
-- ORDEM: aplicar antes da 0073. A coluna gerada licitacoes.edital.busca_tsv
-- usa a configuração criada aqui.
--
-- REVERSÃO (destrutiva: apaga o módulo inteiro, com os dados):
--   DROP SCHEMA licitacoes CASCADE;
-- As extensões ficam, porque podem servir a outras partes do banco.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

CREATE SCHEMA IF NOT EXISTS licitacoes;

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent (COPY = pg_catalog.portuguese);
ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
