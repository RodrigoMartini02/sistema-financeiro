-- Adiciona coluna de foto a perfis, espelhando usuarios.foto. Cada Perfil
-- (Pessoal/Empresa) passa a ter sua propria foto, independente da foto da
-- conta principal (usuario/login).
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE perfis ADD COLUMN IF NOT EXISTS foto TEXT;
