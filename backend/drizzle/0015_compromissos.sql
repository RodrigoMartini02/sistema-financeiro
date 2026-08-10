-- Migration reference: appointments (compromissos) — calendar entries with no financial value.
-- Do not execute automatically. Confirm target environment before applying.

CREATE TABLE IF NOT EXISTS compromissos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER REFERENCES perfis(id),
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  data DATE NOT NULL,
  hora TIME,
  duracao_minutos INTEGER,
  local VARCHAR(255),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_compromissos_usuario_data
  ON compromissos(usuario_id, data);
