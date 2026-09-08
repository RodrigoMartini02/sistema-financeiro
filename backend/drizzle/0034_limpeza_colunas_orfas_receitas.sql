-- Colunas orfas de receitas.
--
-- Mesma natureza das que sairam de despesas na 0033: gravadas por codigo que
-- nao existe mais. Nenhuma referencia em todo o repositorio, e o schema Drizzle
-- de receitas nunca as mapeou.
--
--   numero          1 registro preenchido em 58
--   id_sequencial   1 registro preenchido em 58
--   id_registro     1 registro preenchido em 58
--
-- O unico registro que as preenche (id 1469) tem os tres valores iguais a 1 —
-- residuo de teste. O valor da receita vive em `valor`, coluna propria, e nao e
-- afetado.
--
-- Diferente das despesas, receitas NAO tem o problema de valor redundante: ha
-- uma unica coluna de valor.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE receitas
  DROP COLUMN IF EXISTS numero,
  DROP COLUMN IF EXISTS id_sequencial,
  DROP COLUMN IF EXISTS id_registro;
