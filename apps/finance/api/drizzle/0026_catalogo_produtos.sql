-- Migration reference: catalogo schema (catalogo publico de produtos)
-- Do not execute automatically. Confirm target environment before applying.

CREATE SCHEMA IF NOT EXISTS catalogo;

CREATE TABLE IF NOT EXISTS catalogo.contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_contas_usuario_unique ON catalogo.contas(usuario_id);

CREATE TABLE IF NOT EXISTS catalogo.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  valor NUMERIC(12, 2) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalogo_produtos_usuario ON catalogo.produtos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_produtos_usuario_ativo ON catalogo.produtos(usuario_id, ativo);

CREATE TABLE IF NOT EXISTS catalogo.produto_imagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES catalogo.produtos(id) ON DELETE CASCADE,
  nome_arquivo VARCHAR(255) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalogo_produto_imagens_produto ON catalogo.produto_imagens(produto_id);
