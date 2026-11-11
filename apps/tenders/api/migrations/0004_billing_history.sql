-- 0004: histórico de cobrança e de cancelamento da assinatura (item 1B de Licitações, plano
-- .plans/licitacoes-1b-assinatura-e-historico.md).
--
-- Tabela nova, uma linha por evento da cobrança de uma conta: pagamento aprovado ou recusado, assinatura recorrente
-- ativada e assinatura recorrente cancelada. É aditiva: o código anterior continua funcionando sem ela. O código novo,
-- porém, grava nela dentro da transação que libera o acesso depois de um pagamento, então esta migration precisa estar
-- aplicada no banco ANTES de a API que a usa ser publicada (sem a tabela, o aviso do Mercado Pago não aplicaria o
-- pagamento).
--
-- Tipo, status, meio e origem guardam o código da lista do módulo (src/domains.ts); as listas são validadas no código,
-- sem CHECK, para poder crescer sem nova migration. Nada de dado de cartão ou do pagador é guardado: só o valor, o meio
-- e os identificadores do pagamento e da assinatura no Mercado Pago. `detalhe` guarda o código da recusa.
--
-- O índice único parcial impede que o mesmo aviso do Mercado Pago grave o mesmo pagamento duas vezes com o mesmo status.
--
-- Aplicar com o runner (o runner abre a transação; não colocar BEGIN/COMMIT aqui):
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0004 --banco local --projeto tenders
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0004 --banco producao --projeto tenders --confirmo
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente pode estar apontando para producao.
-- Nao editar depois de aplicada: o runner guarda a assinatura do arquivo.

CREATE TABLE licitacoes.cobranca_historico (
  id BIGSERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES public.contas (id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  meio VARCHAR(20),
  origem VARCHAR(30),
  valor_centavos INTEGER,
  usuarios INTEGER,
  pagamento_id VARCHAR(40),
  recorrente_id VARCHAR(100),
  detalhe VARCHAR(100),
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A lista da tela: os eventos de uma conta, do mais recente para o mais antigo.
CREATE INDEX ix_cobranca_historico_conta ON licitacoes.cobranca_historico (conta_id, ocorrido_em DESC, id DESC);

CREATE UNIQUE INDEX ux_cobranca_historico_pagamento
  ON licitacoes.cobranca_historico (conta_id, pagamento_id, status)
  WHERE pagamento_id IS NOT NULL;
