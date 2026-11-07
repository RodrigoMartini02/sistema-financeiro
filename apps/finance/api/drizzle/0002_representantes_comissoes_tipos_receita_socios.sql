-- Migration reference: tabelas do financeiro ausentes apos a unificacao de banco
-- Do not execute automatically. Confirm target environment before applying.

CREATE TABLE IF NOT EXISTS representantes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER REFERENCES perfis(id) ON DELETE SET NULL,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150),
  telefone VARCHAR(20),
  ativo BOOLEAN DEFAULT true,
  data_criacao TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_representantes_usuario ON representantes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_representantes_perfil ON representantes(perfil_id);

CREATE TABLE IF NOT EXISTS comissoes (
  id SERIAL PRIMARY KEY,
  representante_id INTEGER NOT NULL REFERENCES representantes(id) ON DELETE CASCADE,
  tipo_receita VARCHAR(30) NOT NULL,
  percentual DECIMAL(5,2) NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'mensal',
  ativo BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_comissoes_representante ON comissoes(representante_id);

CREATE TABLE IF NOT EXISTS tipos_receita (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tipos_receita_usuario ON tipos_receita(usuario_id);

CREATE TABLE IF NOT EXISTS socios (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER REFERENCES perfis(id) ON DELETE SET NULL,
  nome VARCHAR(100) NOT NULL,
  percentual DECIMAL(5,2) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  data_criacao TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_socios_usuario ON socios(usuario_id);
