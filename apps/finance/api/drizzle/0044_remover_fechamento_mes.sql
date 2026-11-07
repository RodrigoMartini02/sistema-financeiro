-- Remove por completo o mecanismo de fechar/reabrir mes: a tabela de
-- snapshot de saldo e a coluna de permissao correspondente em
-- membro_permissoes. O saldo anterior de qualquer mes passa a ser sempre
-- calculado em tempo real a partir do historico de lancamentos, sem mais
-- depender de um registro gravado manualmente.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao. Esta migration e destrutiva e
-- irreversivel (DROP TABLE) — confirmar backup/aceite de perda de dados
-- antes de rodar. Nenhuma tabela referencia meses.id (confirmado antes desta
-- migration), entao o DROP nao exige tratamento de dependencia adicional.

DROP TABLE IF EXISTS meses;
ALTER TABLE membro_permissoes DROP COLUMN IF EXISTS acesso_fechamento_mes;
