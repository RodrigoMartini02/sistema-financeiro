-- 0084c: receita com valor bruto e líquido, etapa 1 de 2 (plano .plans/receita-bruto-liquido.md).
-- Cria receitas.valor_liquido (o que entrou na conta), preenche valor_bruto onde faltava (nas receitas
-- antigas o bruto é igual ao líquido) e instala um gatilho de ponte que mantém `valor` (o nome antigo) e
-- `valor_liquido` iguais: o código anterior grava só `valor` e o novo grava só `valor_liquido`, então os
-- dois convivem sem erro entre esta migration e o deploy. O gatilho também completa o bruto com o líquido
-- quando a gravação não o informa.
--
-- A etapa 2 (0084d) remove o gatilho e a coluna `valor` e torna os dois valores obrigatórios.
--
-- ORDEM: é aditiva. Aplicar ANTES do deploy do código novo (que já usa valor_liquido e valor_bruto) e,
-- depois do deploy, aplicar a 0084d.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE receitas ADD COLUMN IF NOT EXISTS valor_liquido numeric(10,2);

UPDATE receitas SET valor_liquido = valor WHERE valor_liquido IS NULL;
UPDATE receitas SET valor_bruto = valor_liquido WHERE valor_bruto IS NULL;

CREATE OR REPLACE FUNCTION receitas_valores_ponte() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.valor_liquido := COALESCE(NEW.valor_liquido, NEW.valor);
    NEW.valor := COALESCE(NEW.valor, NEW.valor_liquido);
  ELSIF NEW.valor IS DISTINCT FROM OLD.valor AND NEW.valor_liquido IS NOT DISTINCT FROM OLD.valor_liquido THEN
    NEW.valor_liquido := NEW.valor;
  ELSIF NEW.valor_liquido IS DISTINCT FROM OLD.valor_liquido AND NEW.valor IS NOT DISTINCT FROM OLD.valor THEN
    NEW.valor := NEW.valor_liquido;
  END IF;
  NEW.valor_bruto := COALESCE(NEW.valor_bruto, NEW.valor_liquido);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS receitas_valores_ponte ON receitas;
CREATE TRIGGER receitas_valores_ponte
  BEFORE INSERT OR UPDATE ON receitas
  FOR EACH ROW EXECUTE FUNCTION receitas_valores_ponte();
