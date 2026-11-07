-- Fase 2 do plano de padronizacao de identidade (titular/membro/colaborador):
-- separa nome em nome + sobrenome. Nao ha split automatico do nome ja
-- existente — decisao explicita do usuario: sobrenome nasce vazio ate
-- edicao manual, mesmo para quem ja tem nome cadastrado.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sobrenome VARCHAR(255);
