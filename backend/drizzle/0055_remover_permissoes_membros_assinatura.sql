-- 0055: saem as permissões "Membros/Colaboradores" e "Assinatura/Planos" de
-- membro_permissoes. Nenhuma tinha efeito: gerenciar membros e permissões é só
-- do titular (requireTitular), e o plano do membro passou a ser o do titular
-- da conta, que é quem assina, paga e cancela (requireNotAccountMember).
--
-- ORDEM: aplicar só DEPOIS do deploy do código que já não usa as colunas. O
-- código anterior seleciona todas as colunas do schema e quebraria ao ler as
-- permissões se elas sumissem antes. Idempotente.
ALTER TABLE membro_permissoes
  DROP COLUMN IF EXISTS acesso_membros,
  DROP COLUMN IF EXISTS acesso_assinatura;
