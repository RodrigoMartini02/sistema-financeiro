-- Corrige o modelo de categoria CUSTOM: ate aqui a unicidade e a gravacao
-- eram por (usuario_id, nome, conta_id) — a categoria pertencia a quem
-- criou, nao a conta. Isso quebra o catalogo compartilhado de familia (ver
-- 0031_lancamentos_compartilhados_familia.sql, que ja tornou a conta dona
-- dos LANCAMENTOS): categoria custom criada por um membro ficava presa ao
-- usuario_id dele e nao aparecia nem para ele nem para o resto da familia.
--
-- A partir desta migration, unicidade de categoria custom e por
-- (conta_id, nome) — a conta e a dona do catalogo, usuario_id continua
-- existindo apenas como autoria (quem criou).
--
-- Diagnostico rodado em produção antes desta migration (leitura, 2026-09-15):
-- nenhuma duplicata de nome dentro da mesma conta sob usuarios diferentes
-- (0 linhas), entao o indice novo pode ser criado direto, sem passo de
-- deduplicacao de dados.
--
-- Do not execute automatically. Confirm the target database before applying.

DROP INDEX IF EXISTS idx_categorias_usuario_nome_conta_custom;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_conta_nome_custom
  ON categorias (conta_id, LOWER(nome))
  WHERE conta_id IS NOT NULL;
