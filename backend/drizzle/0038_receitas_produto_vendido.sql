-- Vinculo opcional entre receita e produto do catalogo.
--
-- Ao lancar a receita com um produto selecionado, a quantidade informada
-- baixa o estoque. O valor da receita continua livre: o preco do produto
-- apenas pre-preenche o campo, sem travar edicao.
--
-- FK fraca (sem REFERENCES), mesmo padrao ja usado por contrato_id e
-- representante_id nesta tabela: a posse e validada em codigo.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE receitas
  ADD COLUMN IF NOT EXISTS produto_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS quantidade_vendida NUMERIC(12, 3);
