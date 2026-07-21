-- Migration reference: cpf do jogador (login de atleta)
-- Do not execute automatically. Confirm target environment before applying.

ALTER TABLE futebol.players ADD COLUMN IF NOT EXISTS cpf VARCHAR(11);
CREATE UNIQUE INDEX IF NOT EXISTS idx_futebol_players_cpf_unique ON futebol.players(cpf);
