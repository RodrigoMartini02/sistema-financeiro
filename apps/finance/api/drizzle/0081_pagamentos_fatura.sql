-- 0081: pagamento da fatura do cartão ("Pagar fatura").
--
-- A fatura de um cartão no mês são as compras no crédito daquele cartão, em
-- aberto, que vencem no mês. pagamentos_fatura guarda cada pagamento dela:
--   total      as compras ficam pagas; o que passar da soma vira a despesa
--              "Encargos da fatura" (já paga)
--   parcial    as compras ficam pagas pela parte proporcional do valor pago; o
--              restante mais os juros vira "Restante da fatura" no mês seguinte
--   parcelado  as compras ficam pagas com 0; a soma mais os juros vira N
--              parcelas "Parcelamento da fatura" a partir do mês seguinte
--
-- Em despesas:
--   pagamento_fatura_id         o pagamento que pagou ou renegociou a linha
--   origem_pagamento_fatura_id  o pagamento que gerou a linha (restante,
--                               parcela ou encargos)
--   valor_juros_fatura          a parte do valor da linha que é juros ou
--                               encargos (só nas linhas geradas)
-- As somas continuam lendo status = 'ativa' pelo valor efetivo (o pago, quando
-- paga): a compra renegociada conta pelo que foi pago e as linhas geradas, nos
-- meses delas. Nada conta duas vezes.
--
-- ON DELETE SET NULL nas duas ligações: sem o pagamento, a linha continua
-- como lançamento comum. Desfazer um pagamento é feito pelo app (estorno),
-- nunca apagando o registro.
--
-- ORDEM: aplicar ANTES do deploy do código novo. Só acrescenta tabela, colunas e
-- índices; o código anterior não lê nem grava nada disso.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

CREATE TABLE IF NOT EXISTS pagamentos_fatura (
  id SERIAL PRIMARY KEY,
  cartao_id INTEGER NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 0 AND 11),
  ano INTEGER NOT NULL,
  forma VARCHAR(10) NOT NULL CHECK (forma IN ('total', 'parcial', 'parcelado')),
  valor_compras DECIMAL(10, 2) NOT NULL CHECK (valor_compras > 0),
  valor_pago DECIMAL(10, 2) NOT NULL CHECK (valor_pago >= 0),
  valor_encargos DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (valor_encargos >= 0),
  valor_juros DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (valor_juros >= 0),
  valor_juros_carregados DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (valor_juros_carregados >= 0),
  valor_para_frente DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (valor_para_frente >= 0),
  numero_parcelas INTEGER,
  valor_parcela DECIMAL(10, 2),
  data_pagamento DATE NOT NULL,
  data_criacao TIMESTAMP NOT NULL DEFAULT now(),
  estornado_em TIMESTAMP,
  estornado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT ck_pagamentos_fatura_forma CHECK (
    (forma = 'total' AND numero_parcelas IS NULL AND valor_parcela IS NULL
      AND valor_para_frente = 0 AND valor_pago = valor_compras + valor_encargos)
    OR (forma = 'parcial' AND numero_parcelas IS NULL AND valor_parcela IS NULL
      AND valor_pago > 0 AND valor_pago < valor_compras AND valor_encargos = 0)
    OR (forma = 'parcelado' AND numero_parcelas BETWEEN 2 AND 360 AND valor_parcela > 0
      AND valor_pago = 0 AND valor_encargos = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_fatura_cartao_mes
  ON pagamentos_fatura (cartao_id, ano, mes);

CREATE INDEX IF NOT EXISTS idx_pagamentos_fatura_usuario
  ON pagamentos_fatura (usuario_id);

ALTER TABLE despesas
  ADD COLUMN IF NOT EXISTS pagamento_fatura_id INTEGER REFERENCES pagamentos_fatura(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_pagamento_fatura_id INTEGER REFERENCES pagamentos_fatura(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_juros_fatura DECIMAL(10, 2);

CREATE INDEX IF NOT EXISTS idx_despesas_pagamento_fatura
  ON despesas (pagamento_fatura_id)
  WHERE pagamento_fatura_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_despesas_origem_pagamento_fatura
  ON despesas (origem_pagamento_fatura_id)
  WHERE origem_pagamento_fatura_id IS NOT NULL;
