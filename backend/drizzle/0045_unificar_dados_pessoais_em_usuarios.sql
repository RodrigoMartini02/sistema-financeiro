-- Fase 1 do plano de padronizacao de identidade (titular/membro/colaborador):
-- remove a duplicacao de dados pessoais entre `contas` e `usuarios`.
-- `usuarios` (telefone, data_nascimento, foto) ja existe e passa a ser a
-- unica fonte; `contas` mantem so o que e da carteira/empresa em si.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao. Esta migration e destrutiva e
-- irreversivel (DROP COLUMN) — os dados hoje gravados em contas.telefone,
-- contas.email, contas.data_nascimento e contas.foto serao perdidos.
-- Confirmar aceite de perda de dados antes de rodar; quem precisar desses
-- dados preenche novamente em "Editar conta"/"Meus dados" apos a migration.

ALTER TABLE contas DROP COLUMN IF EXISTS telefone;
ALTER TABLE contas DROP COLUMN IF EXISTS email;
ALTER TABLE contas DROP COLUMN IF EXISTS data_nascimento;
ALTER TABLE contas DROP COLUMN IF EXISTS foto;
