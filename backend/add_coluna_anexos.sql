-- Migração: Adicionar coluna anexos nas tabelas despesas e receitas
-- Execute este script no banco de dados PostgreSQL

-- ================================================================
-- TABELA DESPESAS
-- ================================================================

-- Adicionar coluna anexos (tipo JSONB para armazenar array de anexos)
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT NULL;

-- Criar índice para buscas em anexos (opcional, melhora performance)
CREATE INDEX IF NOT EXISTS idx_despesas_anexos ON despesas USING GIN (anexos);

-- Comentário na coluna
COMMENT ON COLUMN despesas.anexos IS 'Array de anexos em formato JSON com nome, tipo, dados (base64) e data de upload';

-- ================================================================
-- TABELA RECEITAS
-- ================================================================

-- Adicionar coluna anexos (tipo JSONB para armazenar array de anexos)
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT NULL;

-- Criar índice para buscas em anexos (opcional, melhora performance)
CREATE INDEX IF NOT EXISTS idx_receitas_anexos ON receitas USING GIN (anexos);

-- Comentário na coluna
COMMENT ON COLUMN receitas.anexos IS 'Array de anexos em formato JSON com nome, tipo, dados (base64) e data de upload';
