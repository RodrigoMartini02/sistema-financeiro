-- Migration reference: fase/rodada dos jogos no bolao de campeonatos externos
-- Do not execute automatically. Confirm target environment before applying.

ALTER TABLE futebol.championship_matches ADD COLUMN IF NOT EXISTS matchday INTEGER;
ALTER TABLE futebol.championship_matches ADD COLUMN IF NOT EXISTS stage VARCHAR(50);
