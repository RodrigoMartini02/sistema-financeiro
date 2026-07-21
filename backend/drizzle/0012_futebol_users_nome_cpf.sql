-- Migration reference: nome e cpf do administrador
-- Do not execute automatically. Confirm target environment before applying.

ALTER TABLE futebol.users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE futebol.users ADD COLUMN IF NOT EXISTS cpf VARCHAR(11);
CREATE UNIQUE INDEX IF NOT EXISTS idx_futebol_users_cpf_unique ON futebol.users(cpf);
