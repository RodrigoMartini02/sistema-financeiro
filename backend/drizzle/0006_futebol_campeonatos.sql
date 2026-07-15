-- Migration reference: futebol campeonatos externos (bolao de campeonatos)
-- Do not execute automatically. Confirm target environment before applying.

CREATE TABLE IF NOT EXISTS futebol.championship_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition VARCHAR(10) NOT NULL,
  external_match_id VARCHAR(50) NOT NULL UNIQUE,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  match_date TIMESTAMP NOT NULL,
  open BOOLEAN NOT NULL DEFAULT TRUE,
  home_score INTEGER,
  away_score INTEGER,
  finished BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_futebol_champ_matches_open ON futebol.championship_matches(open);

CREATE TABLE IF NOT EXISTS futebol.championship_guesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES futebol.championship_matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES futebol.users(id) ON DELETE CASCADE,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_futebol_champ_guesses_match_user
  ON futebol.championship_guesses(match_id, user_id);
