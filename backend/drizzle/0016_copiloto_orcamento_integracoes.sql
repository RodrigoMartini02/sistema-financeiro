-- Copiloto financeiro, metas de orcamento e integracoes de IA.
-- Do not execute automatically. Confirm the target database before applying.

CREATE TABLE IF NOT EXISTS ia_integracoes (
  id SERIAL PRIMARY KEY,
  provedor VARCHAR(20) NOT NULL UNIQUE,
  chave_api_cifrada TEXT NOT NULL,
  modelo VARCHAR(120) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  principal BOOLEAN NOT NULL DEFAULT FALSE,
  atualizado_por_usuario_id INTEGER REFERENCES usuarios(id),
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ia_integracoes_principal ON ia_integracoes (principal, ativo);

CREATE TABLE IF NOT EXISTS copilot_conversas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  titulo VARCHAR(120) NOT NULL DEFAULT 'Nova conversa',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversas_usuario_perfil_atualizado
  ON copilot_conversas (usuario_id, perfil_id, atualizado_em DESC);

CREATE TABLE IF NOT EXISTS copilot_mensagens (
  id SERIAL PRIMARY KEY,
  conversa_id INTEGER NOT NULL REFERENCES copilot_conversas(id) ON DELETE CASCADE,
  papel VARCHAR(12) NOT NULL CHECK (papel IN ('user', 'assistant')),
  conteudo TEXT NOT NULL,
  payload JSONB,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_copilot_mensagens_conversa_criado
  ON copilot_mensagens (conversa_id, criado_em ASC);

CREATE TABLE IF NOT EXISTS orcamento_metas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  modo VARCHAR(20) NOT NULL CHECK (modo IN ('amount', 'income_percent')),
  valor_meta NUMERIC(12, 2) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, perfil_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS idx_orcamento_metas_usuario_perfil
  ON orcamento_metas (usuario_id, perfil_id);

CREATE TABLE IF NOT EXISTS ia_eventos_uso (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  provedor VARCHAR(20) NOT NULL,
  modelo VARCHAR(120),
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_saida INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'limited')),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ia_eventos_uso_criado ON ia_eventos_uso (criado_em);
CREATE INDEX IF NOT EXISTS idx_ia_eventos_uso_usuario_criado ON ia_eventos_uso (usuario_id, criado_em);
