-- Migration reference: valor do premio e prazo customizado do bolao de partida unica
-- Do not execute automatically. Confirm target environment before applying.

ALTER TABLE futebol.pools ADD COLUMN IF NOT EXISTS prize_value DECIMAL(10,2);
ALTER TABLE futebol.pools ADD COLUMN IF NOT EXISTS guess_deadline TIMESTAMP;
