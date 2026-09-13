-- Controle de estoque no catalogo de produtos.
--
-- `conta_id` aponta para a conta FINANCEIRA (contas/accounts, PF ou PJ) —
-- nao confundir com catalogo.contas, que e o identificador da vitrine
-- publica. Nasce nulo nos produtos ja cadastrados: eles seguem funcionando
-- na vitrine, e passam a ter conta ao serem editados.
--
-- `quantidade_estoque` e o saldo derivado das movimentacoes; nasce zerado.
-- `estoque_minimo` nulo significa produto sem alerta de estoque baixo.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE catalogo.produtos
  ADD COLUMN IF NOT EXISTS conta_id INTEGER REFERENCES contas(id),
  ADD COLUMN IF NOT EXISTS quantidade_estoque NUMERIC(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo NUMERIC(12, 3);

CREATE INDEX IF NOT EXISTS idx_catalogo_produtos_conta ON catalogo.produtos(conta_id);

-- Historico auditavel de entradas e saidas. `receita_id` so e preenchido na
-- baixa automatica de venda; saida manual (perda, ajuste) fica sem receita.
CREATE TABLE IF NOT EXISTS catalogo.movimentacoes_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES catalogo.produtos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
  motivo TEXT,
  receita_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalogo_movimentacoes_produto ON catalogo.movimentacoes_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_movimentacoes_produto_data ON catalogo.movimentacoes_estoque(produto_id, created_at);
