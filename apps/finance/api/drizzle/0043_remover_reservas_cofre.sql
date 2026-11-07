-- Remove por completo a feature de Reservas/Cofre: tabelas de dados e a
-- coluna de permissao correspondente em membro_permissoes.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao. Esta migration e destrutiva e
-- irreversivel (DROP TABLE) — confirmar backup/aceite de perda de dados
-- antes de rodar.

DROP TABLE IF EXISTS movimentacoes_reservas;
DROP TABLE IF EXISTS reservas;
ALTER TABLE membro_permissoes DROP COLUMN IF EXISTS acesso_reservas;
