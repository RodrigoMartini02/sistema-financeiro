-- Adiciona campo equivalente a "data de nascimento" (PF) para contas PJ:
-- data de abertura da empresa. So relevante para contas tipo='empresa',
-- fica NULL para contas existentes ate edicao manual (sem migracao
-- retroativa), mesmo padrao ja usado para sobrenome/outros campos novos.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE contas ADD COLUMN IF NOT EXISTS data_abertura DATE;
