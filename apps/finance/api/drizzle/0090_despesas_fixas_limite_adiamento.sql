-- Aplicar somente com autorização explícita, antes do código que usa as novas colunas.
-- Mantém as colunas antigas para compatibilidade durante a publicação.
ALTER TABLE despesas_fixas ADD COLUMN mes_final DATE;
UPDATE despesas_fixas f
SET mes_final = GREATEST(
  make_date(f.ano_registrado, 12, 1),
  date_trunc('month', f.data_vencimento_referencia)::date,
  (SELECT date_trunc('month', max(d.data_vencimento))::date
     FROM despesas d
    WHERE d.despesa_fixa_id = f.id AND d.usuario_id = f.usuario_id AND d.conta_id = f.conta_id)
);
ALTER TABLE despesas_fixas ADD CONSTRAINT ck_despesas_fixas_mes_final
  CHECK (mes_final IS NULL OR EXTRACT(DAY FROM mes_final) = 1);
-- Nullable somente para compatibilidade com o código antigo durante o deploy.
-- Novos cadastros exigem o limite na API.
ALTER TABLE despesas ADD COLUMN adiada BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_despesas_fixas_pendentes_vencimento
  ON despesas(conta_id, usuario_id, data_vencimento) WHERE status = 'prevista';
