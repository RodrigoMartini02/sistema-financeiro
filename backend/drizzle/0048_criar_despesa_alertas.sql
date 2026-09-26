-- Fase 1 da central de alertas de vencimento: tabela de eventos gerados pelo
-- job que verifica despesas vencendo/vencidas. So grava eventos aqui — a UI
-- do sininho (Fase 2) e o push (Fase 3) sao trabalho posterior.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

CREATE TABLE IF NOT EXISTS despesa_alertas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  despesa_id INTEGER NOT NULL REFERENCES despesas(id) ON DELETE CASCADE,
  conta_id INTEGER REFERENCES contas(id),
  tipo_alerta VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  data_vencimento DATE NOT NULL,
  lido_em TIMESTAMP,
  data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
  data_atualizacao TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_despesa_alertas_dedupe
  ON despesa_alertas (despesa_id, tipo_alerta, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_despesa_alertas_usuario_status
  ON despesa_alertas (usuario_id, status);
