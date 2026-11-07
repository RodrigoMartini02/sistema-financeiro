-- Despesas fixas mensais: migration aditiva, sem converter despesas existentes.
-- Aplicar somente com autorização explícita e ambiente verificado, antes do
-- código que consulta as novas colunas. Não executada pela implementação.
CREATE TABLE despesas_fixas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  descricao VARCHAR(255) NOT NULL,
  valor_referencia NUMERIC(10,2) NOT NULL CHECK (valor_referencia > 0),
  forma_pagamento VARCHAR(50) NOT NULL CHECK (forma_pagamento IN ('pix','dinheiro','debito','credito')),
  cartao_id INTEGER REFERENCES cartoes(id),
  data_compra_referencia DATE NOT NULL,
  data_vencimento_referencia DATE NOT NULL,
  primeira_competencia DATE NOT NULL CHECK (EXTRACT(DAY FROM primeira_competencia) = 1),
  ano_registrado INTEGER NOT NULL,
  ativa BOOLEAN NOT NULL DEFAULT true,
  data_criacao TIMESTAMP NOT NULL DEFAULT now(),
  data_atualizacao TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_despesas_fixas_conta_usuario ON despesas_fixas(conta_id, usuario_id);
ALTER TABLE despesas
  ADD COLUMN despesa_fixa_id INTEGER REFERENCES despesas_fixas(id) ON DELETE RESTRICT,
  ADD COLUMN fixa_competencia DATE,
  ADD COLUMN valor_previsto NUMERIC(10,2),
  ADD CONSTRAINT ck_despesas_fixa_vinculo CHECK (
    (despesa_fixa_id IS NULL AND fixa_competencia IS NULL) OR
    (despesa_fixa_id IS NOT NULL AND fixa_competencia IS NOT NULL AND EXTRACT(DAY FROM fixa_competencia) = 1)
  ),
  ADD CONSTRAINT ck_despesas_previsao CHECK (
    status <> 'prevista' OR (
      despesa_fixa_id IS NOT NULL AND NOT COALESCE(pago,false) AND data_pagamento IS NULL
      AND valor_pago IS NULL AND pagamento_fatura_id IS NULL AND origem_pagamento_fatura_id IS NULL
      AND NOT COALESCE(parcelado,false) AND NOT COALESCE(recorrente,false)
    )
  );
-- Inclui canceladas: retirar um mês não libera sua identidade para recriação.
CREATE UNIQUE INDEX uq_despesas_fixa_competencia ON despesas(despesa_fixa_id, fixa_competencia)
  WHERE despesa_fixa_id IS NOT NULL;
CREATE INDEX idx_despesas_fixas_pendentes ON despesas(conta_id, usuario_id, fixa_competencia)
  WHERE status = 'prevista';
-- O projeto autoriza por conta/pessoa na aplicação. Não habilitar RLS sem
-- contexto de tenant compatível na conexão; essa avaliação não foi presumida.
