-- Fase 1 do plano de contas familiares multiusuário
-- (.plans/redefinicao-papeis-admin-gestor-padrao.md)
--
-- Redefine o significado de usuarios.tipo:
--   master -> admin  (desenvolvedor/dono da plataforma, acesso total)
--   admin  -> gestor (dono de conta, escopo restrito à própria conta)
--   padrao -> padrao (sem mudança nesta fase)
--
-- IMPORTANTE: NÃO EXECUTAR SEM CONFIRMAÇÃO EXPLÍCITA DO USUÁRIO.
-- O ambiente atual pode estar apontando para produção.
--
-- Ordem crítica: capturamos os conjuntos de IDs afetados ANTES de qualquer
-- UPDATE, para que a reclassificação 'admin' -> 'gestor' não pegue por
-- engano os usuários que acabaram de ser promovidos de 'master' -> 'admin'
-- nesta mesma migration.

DO $$
DECLARE
  master_ids INTEGER[];
  admin_ids INTEGER[];
BEGIN
  -- Captura os conjuntos fixos ANTES de qualquer alteração.
  SELECT array_agg(id) INTO master_ids FROM usuarios WHERE tipo = 'master';
  SELECT array_agg(id) INTO admin_ids FROM usuarios WHERE tipo = 'admin';

  -- master -> admin
  IF master_ids IS NOT NULL THEN
    UPDATE usuarios SET tipo = 'admin', data_atualizacao = CURRENT_TIMESTAMP
    WHERE id = ANY(master_ids);
  END IF;

  -- admin (conjunto original, capturado antes do UPDATE acima) -> gestor
  IF admin_ids IS NOT NULL THEN
    UPDATE usuarios SET tipo = 'gestor', data_atualizacao = CURRENT_TIMESTAMP
    WHERE id = ANY(admin_ids);
  END IF;
END $$;
