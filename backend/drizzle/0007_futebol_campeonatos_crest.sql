-- Migration reference: escudo dos times no bolao de campeonatos externos
-- Do not execute automatically. Confirm target environment before applying.

ALTER TABLE futebol.championship_matches ADD COLUMN IF NOT EXISTS home_crest VARCHAR(500);
ALTER TABLE futebol.championship_matches ADD COLUMN IF NOT EXISTS away_crest VARCHAR(500);
