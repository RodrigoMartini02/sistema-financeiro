-- Adiciona telefone e data_nascimento a usuarios, espelhando as mesmas
-- colunas ja existentes em perfis (migration 0021). O formulario unificado
-- de "Minha conta" (PerfilDialog) ja exibe e captura esses campos, mas
-- ate agora eram descartados silenciosamente por falta de coluna
-- correspondente na tabela usuarios.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_nascimento DATE;
