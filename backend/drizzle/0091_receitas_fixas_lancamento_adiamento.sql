-- Aplicar apenas com autorização explícita, ANTES do novo backend.
-- Preserva IDs, vínculos e colunas anteriores para a troca compatível do código.
ALTER TABLE classificacoes_receita_fixas
  ADD COLUMN descricao VARCHAR(255),
  ADD COLUMN valor_bruto NUMERIC(12,2),
  ADD COLUMN data_referencia DATE,
  ADD COLUMN primeira_competencia DATE,
  ADD COLUMN mes_final DATE,
  ADD COLUMN cliente_id INTEGER,
  ADD COLUMN representante_id INTEGER,
  ADD COLUMN ativa BOOLEAN NOT NULL DEFAULT true;

WITH reference AS (
  SELECT f.id,
    COALESCE(min(r.fixa_competencia),
      date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
      + CASE WHEN extract(day FROM now() AT TIME ZONE 'America/Sao_Paulo') > f.dia_recebimento
          THEN interval '1 month' ELSE interval '0 month' END) AS first_month,
    max(r.fixa_competencia) AS last_month
  FROM classificacoes_receita_fixas f
  LEFT JOIN receitas r ON r.classificacao_fixa_id = f.id AND r.usuario_id = f.usuario_id AND r.conta_id = f.conta_id
  GROUP BY f.id
)
UPDATE classificacoes_receita_fixas f SET
  descricao = COALESCE(p.nome || ' › ', '') || c.nome,
  valor_bruto = f.valor,
  primeira_competencia = ref.first_month,
  data_referencia = ref.first_month::date + (LEAST(f.dia_recebimento,
    extract(day FROM ref.first_month + (interval '1 month' - interval '1 day'))::integer) - 1),
  -- O primeiro mês entra no GREATEST para a fonte sem ocorrências e com ano antigo não violar o intervalo.
  mes_final = GREATEST(make_date(COALESCE(f.ano_registrado, extract(year FROM ref.first_month)::integer), 12, 1),
    ref.last_month, ref.first_month::date)
FROM reference ref, classificacoes_receita c
LEFT JOIN classificacoes_receita p ON p.id = c.parent_id
WHERE ref.id = f.id AND c.id = f.classificacao_id;

-- Fontes antigas ainda não processadas recebem somente as competências que
-- a rotina anterior gravaria; o índice existente conserva todas as já gravadas.
INSERT INTO receitas (usuario_id, conta_id, descricao, valor_liquido, valor_bruto,
  data_recebimento, mes, ano, status, classificacao_id, classificacao_fixa_id, fixa_competencia)
SELECT f.usuario_id, f.conta_id, f.descricao, f.valor, f.valor_bruto,
  d.receipt_date, extract(month FROM d.receipt_date)::integer - 1,
  extract(year FROM d.receipt_date)::integer, 'prevista', f.classificacao_id, f.id, m.competence
FROM classificacoes_receita_fixas f
JOIN classificacoes_receita c ON c.id = f.classificacao_id AND c.ativo
JOIN contas a ON a.id = f.conta_id AND COALESCE(a.ativo, true)
CROSS JOIN LATERAL generate_series(f.primeira_competencia::timestamp, f.mes_final::timestamp, interval '1 month') m(competence)
CROSS JOIN LATERAL (SELECT m.competence::date + (LEAST(f.dia_recebimento,
  extract(day FROM m.competence + (interval '1 month' - interval '1 day'))::integer) - 1) AS receipt_date) d
WHERE f.ano_registrado IS NULL
ON CONFLICT DO NOTHING;

UPDATE classificacoes_receita_fixas SET ano_registrado = extract(year FROM mes_final)::integer
WHERE ano_registrado IS NULL;

ALTER TABLE classificacoes_receita_fixas
  ADD CONSTRAINT ck_receitas_fixas_intervalo CHECK (
    (primeira_competencia IS NULL OR extract(day FROM primeira_competencia) = 1)
    AND (mes_final IS NULL OR extract(day FROM mes_final) = 1)
    AND (primeira_competencia IS NULL OR mes_final IS NULL OR mes_final >= primeira_competencia));
ALTER TABLE receitas ADD COLUMN adiada BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_receitas_pendentes_data
  ON receitas(conta_id, usuario_id, data_recebimento) WHERE status IN ('prevista', 'faturada');
