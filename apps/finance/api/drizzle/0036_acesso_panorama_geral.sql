-- Panorama Geral: visao agregada entre TODAS as contas do dono (PF + PJs).
--
-- Diferente das demais flags de membro_permissoes, esta nao trata de uma tela
-- da PROPRIA conta — ela decide se um membro/colaborador pode ver totais
-- agregados de contas alem daquela a que ele esta vinculado. Nasce false,
-- como as demais: ninguem enxerga o panorama do dono ate ele liberar.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE membro_permissoes
  ADD COLUMN IF NOT EXISTS acesso_panorama_geral BOOLEAN NOT NULL DEFAULT false;
