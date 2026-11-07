-- 0082: recorrente até dezembro, renovação da série e data de compra em cada
-- ocorrência (plano .plans/recorrente-ano-e-contagem.md).
--
-- A série mensal nova vai da primeira ocorrência até dezembro do ano dela. De
-- 1º de dezembro até 31 de janeiro, o app pergunta, para cada série que termina
-- em dezembro, se ela renova para o ano seguinte. A decisão fica em
-- renovacoes_serie e não é perguntada de novo:
--   grupo_parcelamento_id  a série (a 1ª ocorrência, como no resto do sistema)
--   ano                    o ano que a decisão cobre (o seguinte ao da série)
--   renovar                true criou as ocorrências do ano; false recusou
--
-- O recorrente em aberto só conta nas somas a partir do dia seguinte à data
-- dele: no crédito com cartão, a data de compra (a cobrança). Por isso:
--   1. as recorrentes no crédito com cartão sem data de compra recebem a da
--      1ª ocorrência da série mais a distância em meses entre os vencimentos
--      (date + interval limita o fim do mês: 31/01 + 1 mês = 28/02);
--   2. as ocorrências recorrentes em aberto depois de 31/12 do ano corrente
--      são apagadas (não pagas, sem ligação com pagamento de fatura). Elas
--      voltam pela renovação de dezembro. A regra é pelo ano de CURRENT_DATE,
--      nunca por uma data fixa, para não apagar o ano em curso se a migration
--      for aplicada depois.
--
-- ORDEM: aplicar ANTES do deploy do código novo: as rotas da renovação leem a
-- tabela nova. Os passos 1 e 2 funcionam também com o código anterior.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao. O passo 2 apaga linhas.

CREATE TABLE IF NOT EXISTS renovacoes_serie (
  id SERIAL PRIMARY KEY,
  grupo_parcelamento_id INTEGER NOT NULL REFERENCES despesas(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  renovar BOOLEAN NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  decidido_em TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_renovacoes_serie_grupo_ano UNIQUE (grupo_parcelamento_id, ano)
);

-- 1. Data de compra em cada ocorrência recorrente no crédito com cartão.
UPDATE despesas d
SET data_compra = (
  a.data_compra + make_interval(months => (
    (EXTRACT(YEAR FROM d.data_vencimento)::int - EXTRACT(YEAR FROM a.data_vencimento)::int) * 12
    + (EXTRACT(MONTH FROM d.data_vencimento)::int - EXTRACT(MONTH FROM a.data_vencimento)::int)
  ))
)::date
FROM despesas a
WHERE d.recorrente = true
  AND d.data_compra IS NULL
  AND d.forma_pagamento = 'credito'
  AND d.cartao_id IS NOT NULL
  AND d.grupo_parcelamento_id IS NOT NULL
  AND a.id = d.grupo_parcelamento_id
  AND a.data_compra IS NOT NULL;

-- 2. Ocorrências recorrentes em aberto depois do ano corrente.
DELETE FROM despesas d
WHERE d.recorrente = true
  AND d.status = 'ativa'
  AND NOT COALESCE(d.pago, false)
  AND d.pagamento_fatura_id IS NULL
  AND d.origem_pagamento_fatura_id IS NULL
  AND d.data_vencimento > make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 12, 31);
