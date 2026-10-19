-- 0084d: receita com valor bruto e líquido, etapa 2 de 2 (plano .plans/receita-bruto-liquido.md).
-- Remove o gatilho de ponte da 0084c e a coluna `valor` (agora só existe valor_liquido), torna
-- valor_liquido e valor_bruto obrigatórios e garante, no banco, que o bruto nunca é menor que o líquido.
-- Antes de tirar a ponte, completa qualquer linha que ainda tenha só um dos valores.
--
-- ORDEM: aplicar DEPOIS do deploy do código que usa valor_liquido e valor_bruto e da 0084c. Depois
-- desta migration o código anterior (que lê e grava `valor`) deixa de funcionar.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

DROP TRIGGER IF EXISTS receitas_valores_ponte ON receitas;
DROP FUNCTION IF EXISTS receitas_valores_ponte();

UPDATE receitas SET valor_liquido = valor WHERE valor_liquido IS NULL;
UPDATE receitas SET valor_bruto = valor_liquido WHERE valor_bruto IS NULL;

ALTER TABLE receitas ALTER COLUMN valor_liquido SET NOT NULL;
ALTER TABLE receitas ALTER COLUMN valor_bruto SET NOT NULL;
ALTER TABLE receitas DROP COLUMN valor;
ALTER TABLE receitas
  ADD CONSTRAINT receitas_bruto_maior_ou_igual_liquido CHECK (valor_bruto >= valor_liquido);
