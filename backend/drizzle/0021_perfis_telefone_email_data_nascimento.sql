-- Adiciona telefone, email e data_nascimento a perfis, campos ja enviados
-- pelo formulario de perfil pessoa fisica no frontend (PerfilDialog) mas
-- descartados silenciosamente pelo backend ate agora, sem coluna correspondente.
--
-- Parte da unificacao entre conta principal e perfis: os mesmos campos
-- passam a ser suportados tambem para perfis tipo empresa.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE perfis ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS data_nascimento DATE;
