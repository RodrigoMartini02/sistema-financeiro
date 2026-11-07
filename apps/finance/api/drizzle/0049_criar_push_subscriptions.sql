-- Fase 3 da central de alertas de vencimento: tabela de subscriptions de
-- Web Push por usuario/dispositivo. Alimentada pelo frontend quando o
-- usuario ativa notificacoes explicitamente (gesto proprio, nunca
-- automatico); consumida pelo job de alertas (expenseAlerts.ts) para
-- disparar o push real.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent VARCHAR(255),
  data_criacao TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario
  ON push_subscriptions (usuario_id);
