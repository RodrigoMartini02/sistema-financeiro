-- Fase 3 do plano de contas familiares multiusuário
-- (.plans/permissoes-configuraveis-por-membro.md)
--
-- Cria a tabela de permissões granulares por membro. Restritivo por
-- padrão (todas as colunas nascem false); o gestor libera explicitamente
-- pela tela de permissões.
--
-- IMPORTANTE: NÃO EXECUTAR SEM CONFIRMAÇÃO EXPLÍCITA DO USUÁRIO.
-- O ambiente atual pode estar apontando para produção.

CREATE TABLE membro_permissoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  ver_lancamentos_outros BOOLEAN NOT NULL DEFAULT false,
  editar_lancamentos_outros BOOLEAN NOT NULL DEFAULT false,
  excluir_lancamentos_outros BOOLEAN NOT NULL DEFAULT false,
  ver_visao_agregada BOOLEAN NOT NULL DEFAULT false,
  gerenciar_categorias BOOLEAN NOT NULL DEFAULT false,
  gerenciar_cartoes BOOLEAN NOT NULL DEFAULT false,
  acessar_dados_outros_membros BOOLEAN NOT NULL DEFAULT false,
  data_atualizacao TIMESTAMP DEFAULT NOW()
);

-- Backfill idempotente: garante que todo membro já criado na Fase 2 (antes
-- desta migration existir) também ganhe sua linha de permissões restritiva.
INSERT INTO membro_permissoes (usuario_id)
SELECT m.usuario_id
FROM conta_membros m
WHERE m.usuario_id NOT IN (SELECT usuario_id FROM membro_permissoes);
