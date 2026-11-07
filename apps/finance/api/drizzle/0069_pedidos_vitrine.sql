-- 0069: pedidos da vitrine e os itens de cada pedido.
--
-- O pedido nasce "aguardando_pagamento" com os itens separados até
-- reservado_ate (30 min); só o webhook ou a conferência ativa com o Mercado
-- Pago o marcam como pago. Pago, cada item vira uma receita "Vendas" na conta
-- PJ (pedido_itens.receita_id) e a taxa de entrega outra
-- (pedidos.receita_entrega_id). Estornado no Mercado Pago, as receitas são
-- canceladas e o estoque volta.
--
-- Os itens guardam nome e preços da hora da compra: mudar o produto depois não
-- muda o pedido. Os dados do cliente ficam só com a loja (LGPD).
--
-- Datas em TIMESTAMPTZ: a separação compara reservado_ate com o agora.
--
-- ORDEM: aplicar DEPOIS da 0068 e ANTES do deploy do código novo. Só cria
-- tabelas; o código anterior não as usa.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

CREATE TABLE IF NOT EXISTS catalogo.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vitrine_id UUID NOT NULL REFERENCES catalogo.contas(id) ON DELETE CASCADE,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  situacao VARCHAR(30) NOT NULL CHECK (situacao IN (
    'aguardando_pagamento', 'pago', 'enviado', 'pronto_retirada', 'entregue', 'recusado', 'expirado', 'estornado'
  )),
  forma_pagamento VARCHAR(10) NOT NULL CHECK (forma_pagamento IN ('pix', 'cartao')),
  cliente_nome VARCHAR(80) NOT NULL,
  cliente_email VARCHAR(150) NOT NULL,
  cliente_telefone VARCHAR(11) NOT NULL,
  cliente_cpf VARCHAR(11) NOT NULL,
  entrega_tipo VARCHAR(10) NOT NULL CHECK (entrega_tipo IN ('retirada', 'entrega')),
  endereco_cep VARCHAR(8),
  endereco_rua VARCHAR(150),
  endereco_numero VARCHAR(20),
  endereco_complemento VARCHAR(80),
  endereco_bairro VARCHAR(80),
  endereco_cidade VARCHAR(80),
  endereco_uf VARCHAR(2),
  observacao VARCHAR(300),
  subtotal NUMERIC(12, 2) NOT NULL,
  desconto NUMERIC(12, 2) NOT NULL,
  taxa_entrega NUMERIC(12, 2) NOT NULL,
  total NUMERIC(12, 2) NOT NULL,
  mp_payment_id VARCHAR(30),
  pix_qr_code TEXT,
  pix_qr_code_base64 TEXT,
  pix_expira_em TIMESTAMPTZ,
  reservado_ate TIMESTAMPTZ,
  conferido_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  receita_entrega_id INTEGER REFERENCES receitas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pedidos_vitrine_numero ON catalogo.pedidos (vitrine_id, numero);
CREATE INDEX IF NOT EXISTS idx_pedidos_conta_criacao ON catalogo.pedidos (conta_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_reserva ON catalogo.pedidos (situacao, reservado_ate)
  WHERE situacao = 'aguardando_pagamento';
CREATE INDEX IF NOT EXISTS idx_pedidos_pagamento ON catalogo.pedidos (mp_payment_id) WHERE mp_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalogo.pedido_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES catalogo.pedidos(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES catalogo.produtos(id) ON DELETE SET NULL,
  nome VARCHAR(255) NOT NULL,
  preco_original NUMERIC(12, 2) NOT NULL,
  preco_unitario NUMERIC(12, 2) NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  subtotal NUMERIC(12, 2) NOT NULL,
  receita_id INTEGER REFERENCES receitas(id) ON DELETE SET NULL,
  sem_estoque BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON catalogo.pedido_itens (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_produto ON catalogo.pedido_itens (produto_id) WHERE produto_id IS NOT NULL;
