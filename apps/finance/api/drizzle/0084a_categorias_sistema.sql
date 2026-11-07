-- 0084a: categoria de sistema (plano .plans/catalogo-padrao-categorias-pf.md).
-- Marca as categorias que o próprio sistema usa nos lançamentos que gera (os
-- encargos e a renegociação da fatura do cartão): elas deixam de aparecer para
-- escolha e para edição, mas continuam ligadas aos lançamentos que já têm.
-- As que já existem hoje são padrão visível; o UPDATE as marca.
--
-- Número: a letra mantém esta migration logo depois da 0084 e antes das 0085 a 0090,
-- que a branch de Licitações reserva. Uma não depende da outra.
--
-- ORDEM: é aditiva. Aplicar ANTES do deploy do código novo, que já lê a coluna
-- (GET /categories e o pagamento da fatura); o código anterior a ignora.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE categorias
  ADD COLUMN IF NOT EXISTS sistema boolean NOT NULL DEFAULT false;

UPDATE categorias
   SET sistema = true
 WHERE conta_id IS NULL
   AND tipo IS NOT NULL
   AND LOWER(nome) IN ('encargos de cartão', 'renegociação de fatura');
