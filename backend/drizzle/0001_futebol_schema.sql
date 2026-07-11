-- Migration reference: futebol schema
-- Do not execute automatically. Confirm target environment before applying.

CREATE SCHEMA IF NOT EXISTS futebol;

CREATE TABLE IF NOT EXISTS futebol.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS futebol.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES futebol.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(100) NOT NULL,
  foot VARCHAR(20) NOT NULL DEFAULT 'direito',
  color VARCHAR(20) NOT NULL DEFAULT '#22c55e',
  photo TEXT,
  age INTEGER,
  height INTEGER,
  weight INTEGER,
  skills JSONB NOT NULL,
  positions JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_futebol_players_user ON futebol.players(user_id);

CREATE TABLE IF NOT EXISTS futebol.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES futebol.users(id) ON DELETE CASCADE,
  date VARCHAR(20) NOT NULL,
  teams JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_futebol_matches_user ON futebol.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_futebol_matches_user_date ON futebol.matches(user_id, date);

CREATE TABLE IF NOT EXISTS futebol.confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES futebol.users(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  game_date VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_futebol_confirmations_user ON futebol.confirmations(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_futebol_confirmations_player_date_unique
  ON futebol.confirmations(player_id, game_date);

CREATE TABLE IF NOT EXISTS futebol.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES futebol.users(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  day_of_week INTEGER NOT NULL,
  hour INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  draw_type VARCHAR(30) NOT NULL DEFAULT 'balanced',
  team_size INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_futebol_schedules_user ON futebol.schedules(user_id);

CREATE TABLE IF NOT EXISTS futebol.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES futebol.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  game_date VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_futebol_guests_user ON futebol.guests(user_id);
CREATE INDEX IF NOT EXISTS idx_futebol_guests_user_date ON futebol.guests(user_id, game_date);