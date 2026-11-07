-- Substitui o sistema de permissoes de 7 flags (sobre lancamentos de
-- terceiros) pelo novo modelo de acesso por tela: um toggle por
-- funcionalidade, acesso completo quando ligado, sem conceito de "editar
-- dado de outro membro" (ver .plans/permissoes-por-tela-grupos.md).
--
-- IMPORTANTE: NAO EXECUTAR SEM CONFIRMACAO EXPLICITA DO USUARIO.
-- O ambiente atual pode estar apontando para producao.
--
-- Diagnostico previo confirmado (somente leitura): 0 linhas em
-- membro_permissoes hoje, nenhuma flag configurada — seguro recriar a
-- tabela do zero (Opcao B do plano).

DROP TABLE IF EXISTS membro_permissoes;

CREATE TABLE membro_permissoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,

  -- Financeiro
  acesso_despesas BOOLEAN NOT NULL DEFAULT false,
  acesso_receitas BOOLEAN NOT NULL DEFAULT false,
  acesso_fechamento_mes BOOLEAN NOT NULL DEFAULT false,
  acesso_reservas BOOLEAN NOT NULL DEFAULT false,
  acesso_planejamento BOOLEAN NOT NULL DEFAULT false,
  acesso_calendario BOOLEAN NOT NULL DEFAULT false,

  -- Relatórios e painel
  acesso_painel BOOLEAN NOT NULL DEFAULT false,
  acesso_relatorios BOOLEAN NOT NULL DEFAULT false,
  acesso_notificacoes BOOLEAN NOT NULL DEFAULT false,
  acesso_assistente BOOLEAN NOT NULL DEFAULT false,

  -- Configurações
  acesso_contas BOOLEAN NOT NULL DEFAULT false,
  acesso_categorias BOOLEAN NOT NULL DEFAULT false,
  acesso_cartoes BOOLEAN NOT NULL DEFAULT false,
  acesso_servicos BOOLEAN NOT NULL DEFAULT false,
  acesso_representantes BOOLEAN NOT NULL DEFAULT false,
  acesso_socios BOOLEAN NOT NULL DEFAULT false,
  acesso_membros BOOLEAN NOT NULL DEFAULT false,
  acesso_assinatura BOOLEAN NOT NULL DEFAULT false,

  -- Comercial (visível apenas em conta tipo empresa)
  acesso_clientes BOOLEAN NOT NULL DEFAULT false,
  acesso_contratos BOOLEAN NOT NULL DEFAULT false,
  acesso_catalogo_produtos BOOLEAN NOT NULL DEFAULT false,

  data_atualizacao TIMESTAMP DEFAULT NOW()
);

-- Backfill idempotente: garante que todo membro já vinculado (Fase 2) ganhe
-- sua linha de permissões restritiva no novo modelo.
INSERT INTO membro_permissoes (usuario_id)
SELECT m.usuario_id
FROM conta_membros m
WHERE m.usuario_id NOT IN (SELECT usuario_id FROM membro_permissoes);
