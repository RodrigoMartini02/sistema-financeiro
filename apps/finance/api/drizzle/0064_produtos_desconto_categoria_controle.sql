-- 0064: desconto, categoria e controle de estoque opcional no produto do
-- catálogo; conta nos produtos antigos sem conta; e os índices do estorno de
-- venda (um impede devolver ao estoque a mesma venda duas vezes, o outro acha
-- as movimentações da receita).
--
-- Desconto: em R$ ('valor') ou em % ('percentual'), os dois campos juntos ou
-- nenhum. O preço final é calculado no código, nunca gravado: mudar o preço ou
-- o desconto não deixa valor velho no banco.
--
-- controla_estoque: desligado, a venda não mexe no estoque e a vitrine nunca
-- mostra o produto como esgotado. Nasce desligado e fica ligado em quem já
-- teve movimentação ou saldo, que é quem já usava o controle.
--
-- conta_id nulo (produtos de antes do controle de estoque): passa para a PJ do
-- dono, a ativa e padrão primeiro. Dono sem PJ continua nulo: o produto já não
-- aparecia no painel PJ e sai também das listas por conta.
--
-- ORDEM: aplicar ANTES do deploy do código novo. Só acrescenta colunas,
-- restrições e índices; o código anterior não lê nem grava as colunas novas e
-- nunca grava entrada com receita_id.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE catalogo.produtos
  ADD COLUMN IF NOT EXISTS desconto_tipo VARCHAR(10),
  ADD COLUMN IF NOT EXISTS desconto_valor NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(60),
  ADD COLUMN IF NOT EXISTS controla_estoque BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE catalogo.produtos DROP CONSTRAINT IF EXISTS produtos_desconto_tipo_check;
ALTER TABLE catalogo.produtos
  ADD CONSTRAINT produtos_desconto_tipo_check CHECK (desconto_tipo IN ('valor', 'percentual'));

ALTER TABLE catalogo.produtos DROP CONSTRAINT IF EXISTS produtos_desconto_completo_check;
ALTER TABLE catalogo.produtos
  ADD CONSTRAINT produtos_desconto_completo_check CHECK ((desconto_tipo IS NULL) = (desconto_valor IS NULL));

UPDATE catalogo.produtos p
   SET controla_estoque = true
 WHERE p.controla_estoque = false
   AND (p.quantidade_estoque <> 0
        OR EXISTS (SELECT 1 FROM catalogo.movimentacoes_estoque m WHERE m.produto_id = p.id));

UPDATE catalogo.produtos p
   SET conta_id = (
     SELECT c.id
       FROM contas c
      WHERE c.usuario_id = p.usuario_id AND c.tipo = 'empresa'
      ORDER BY (c.ativo IS NOT FALSE) DESC, c.eh_padrao DESC, c.id
      LIMIT 1)
 WHERE p.conta_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimentacoes_estoque_estorno_receita
  ON catalogo.movimentacoes_estoque (receita_id)
  WHERE tipo = 'entrada' AND receita_id IS NOT NULL;

-- O estorno procura as movimentações da receita cancelada ou excluída.
CREATE INDEX IF NOT EXISTS idx_catalogo_movimentacoes_receita
  ON catalogo.movimentacoes_estoque (receita_id)
  WHERE receita_id IS NOT NULL;
