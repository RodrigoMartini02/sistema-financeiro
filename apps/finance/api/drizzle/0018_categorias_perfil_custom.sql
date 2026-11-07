-- Adiciona perfil_id em categorias para distinguir categorias PADRAO do
-- sistema (globais por tipo, tipo preenchido / perfil_id nulo) de
-- categorias CUSTOM criadas pelo usuario (exclusivas de um perfil
-- especifico, perfil_id preenchido / tipo nulo).
--
-- O modelo anterior (migration 0017) tratava toda categoria — padrao ou
-- custom — como global por tipo. Isso estava errado: categorias criadas
-- manualmente pelo usuario nao devem ser compartilhadas entre perfis do
-- mesmo tipo (ex: uma categoria criada em "PJ" nao deve aparecer em
-- "Aether", mesmo os dois sendo tipo empresa).
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS perfil_id INTEGER REFERENCES perfis(id);

CREATE INDEX IF NOT EXISTS idx_categorias_perfil ON categorias (perfil_id);

-- Substitui o indice unico da migration 0017 (que so cobria o caso "padrao
-- por tipo") por dois indices unicos parciais: um para categorias padrao
-- (tipo preenchido, perfil_id nulo) e outro para categorias custom
-- (perfil_id preenchido, tipo nulo). Cada categoria so pode se enquadrar em
-- um dos dois casos.
DROP INDEX IF EXISTS idx_categorias_usuario_nome_tipo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_usuario_nome_tipo_padrao
  ON categorias (usuario_id, LOWER(nome), tipo)
  WHERE perfil_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_usuario_nome_perfil_custom
  ON categorias (usuario_id, LOWER(nome), perfil_id)
  WHERE perfil_id IS NOT NULL;
