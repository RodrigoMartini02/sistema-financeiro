-- Torna estrutural a invariante do modelo de categorias, ja documentada em
-- categories.ts desde 0018_categorias_perfil_custom.sql: uma categoria e
-- PADRAO do sistema (tipo preenchido, conta_id nulo) OU CUSTOM criada pelo
-- usuario (conta_id preenchido, tipo nulo) — nunca os dois ao mesmo tempo.
--
-- Ate aqui essa regra so era respeitada por convencao no codigo (nenhuma
-- funcao atual grava os dois campos juntos), sem garantia no banco. 19
-- categorias foram encontradas violando isso em producao (tipo E conta_id
-- preenchidos), causando categorias empresa aparecerem misturadas em conta
-- pessoal do mesmo usuario — corrigidas manualmente antes desta migration
-- (UPDATE categorias SET conta_id = NULL WHERE tipo IS NOT NULL AND
-- conta_id IS NOT NULL, rodado em 2026-09-16, 19 linhas afetadas).
--
-- Este CHECK impede que a inconsistencia volte a acontecer por qualquer
-- caminho de codigo futuro, independente de qual rota ou script escreva.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE categorias
  ADD CONSTRAINT categorias_tipo_conta_exclusivos
  CHECK (tipo IS NULL OR conta_id IS NULL);
