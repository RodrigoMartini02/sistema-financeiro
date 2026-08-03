-- Migration reference: eventos de acesso e login.
-- Do not execute automatically. Confirm target environment before applying.

CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(40) NOT NULL,
  path VARCHAR(255),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_data_criacao ON analytics_events(data_criacao);
CREATE INDEX IF NOT EXISTS idx_analytics_events_usuario_id ON analytics_events(usuario_id);
