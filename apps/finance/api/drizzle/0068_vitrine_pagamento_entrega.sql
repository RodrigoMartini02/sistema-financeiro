-- 0068: pagamento e entrega da vitrine.
--
-- catalogo.mercado_pago_contas: a conta Mercado Pago que cada conta PJ conecta
-- (OAuth) para receber as vendas da vitrine direto, sem passar pelo FINGERENCE.
-- Os tokens ficam cifrados (AES-256-GCM, chave MP_TOKENS_KEY) e nunca saem da
-- API; a public_key é pública por natureza (vai para o formulário de cartão).
-- As datas são TIMESTAMPTZ: a validade do token é comparada com o agora.
--
-- Na vitrine (catalogo.contas): as formas de entrega que a loja oferece
-- (retirada no local e/ou entrega com taxa fixa), a política de troca e o
-- contador que numera os pedidos de cada loja (#1, #2...).
--
-- ORDEM: aplicar ANTES do deploy do código novo. Só acrescenta tabela e
-- colunas; o código anterior não as lê nem grava.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

CREATE TABLE IF NOT EXISTS catalogo.mercado_pago_contas (
  id SERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mp_user_id VARCHAR(30) NOT NULL,
  public_key VARCHAR(100) NOT NULL,
  access_token_cifrado TEXT NOT NULL,
  refresh_token_cifrado TEXT NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  live_mode BOOLEAN NOT NULL DEFAULT true,
  conectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mercado_pago_contas_conta ON catalogo.mercado_pago_contas (conta_id);

ALTER TABLE catalogo.contas
  ADD COLUMN IF NOT EXISTS retirada_ativa BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retirada_endereco VARCHAR(280),
  ADD COLUMN IF NOT EXISTS retirada_horario VARCHAR(120),
  ADD COLUMN IF NOT EXISTS entrega_ativa BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entrega_taxa NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS entrega_descricao VARCHAR(280),
  ADD COLUMN IF NOT EXISTS politica_troca TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_numero_pedido INTEGER NOT NULL DEFAULT 0;
