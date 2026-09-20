-- Renomeia os valores de usuarios.tipo: 'gestor' -> 'titular', 'padrao' -> 'membro'.
-- 'admin' permanece inalterado. Remove o valor legado 'master' (de uma
-- migracao anterior, 0027_redefinir_papeis_usuarios.sql) e corrige o CHECK
-- constraint, que estava desatualizado em producao e nao permitia 'gestor'.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- 1. Relaxa o CHECK constraint temporariamente para aceitar tanto os valores
--    antigos quanto os novos, permitindo o UPDATE abaixo rodar sem violar o
--    dominio em nenhum momento.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_tipo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_tipo_check
  CHECK (tipo IN ('padrao', 'gestor', 'admin', 'master', 'membro', 'titular'));

-- 2. Atualiza dados existentes.
UPDATE usuarios SET tipo = 'membro' WHERE tipo = 'padrao';
UPDATE usuarios SET tipo = 'titular' WHERE tipo = 'gestor';

-- 3. Aperta o CHECK constraint para o dominio final.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_tipo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_tipo_check
  CHECK (tipo IN ('membro', 'titular', 'admin'));

-- 4. Atualiza o default da coluna.
ALTER TABLE usuarios ALTER COLUMN tipo SET DEFAULT 'titular';
