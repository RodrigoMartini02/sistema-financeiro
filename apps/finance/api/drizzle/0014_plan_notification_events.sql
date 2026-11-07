-- Migration reference: idempotent plan expiration notifications.
-- Do not execute automatically. Confirm target environment before applying.

CREATE TABLE IF NOT EXISTS plan_notification_events (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_evento VARCHAR(50) NOT NULL,
  referencia_ciclo VARCHAR(120) NOT NULL,
  plano_tipo VARCHAR(10),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  enviado_em TIMESTAMP,
  data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_atualizacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT plan_notification_events_cycle_unique
    UNIQUE (usuario_id, tipo_evento, referencia_ciclo)
);

CREATE INDEX IF NOT EXISTS idx_plan_notification_events_pending
  ON plan_notification_events(status, data_criacao);

CREATE INDEX IF NOT EXISTS idx_usuarios_plano_status_expiracao
  ON usuarios(plano_status, plano_expiracao);
