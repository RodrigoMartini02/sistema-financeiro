-- Migration reference: futebol reset de senha
-- Do not execute automatically. Confirm target environment before applying.

ALTER TABLE futebol.users
  ADD COLUMN IF NOT EXISTS reset_code VARCHAR(6),
  ADD COLUMN IF NOT EXISTS reset_code_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reset_attempts INTEGER NOT NULL DEFAULT 0;
