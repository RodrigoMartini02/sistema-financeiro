-- Migration reference: amarrar clientes ao sistema de perfis
-- Do not execute automatically. Confirm target environment before applying.

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS perfil_id INTEGER REFERENCES perfis(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_perfil ON clientes(perfil_id);
