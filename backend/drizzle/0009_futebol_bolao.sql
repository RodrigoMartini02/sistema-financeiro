-- Migration reference: futebol bolao (pools de palpites por partida)
-- Do not execute automatically. Confirm target environment before applying.

CREATE TABLE IF NOT EXISTS futebol.pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES futebol.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES futebol.matches(id) ON DELETE CASCADE,
  prize TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_futebol_pools_user ON futebol.pools(user_id);

CREATE TABLE IF NOT EXISTS futebol.pool_guesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES futebol.pools(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES futebol.players(id) ON DELETE CASCADE,
  guess_teams JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_futebol_pool_guesses_pool ON futebol.pool_guesses(pool_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_futebol_pool_guesses_pool_player
  ON futebol.pool_guesses(pool_id, player_id);
