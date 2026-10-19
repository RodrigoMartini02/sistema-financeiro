-- 0084e: juros da despesa, etapa 1 de 2 (plano .plans/juros-embutido-parcelado.md).
-- Cria despesas.valor_juros (a parte do valor da linha que é juros: encargos, restante ou parcela da
-- fatura do cartão e o juros embutido das parcelas de um parcelado), copia o que já existe em
-- valor_juros_fatura e instala um gatilho de ponte que mantém as duas colunas iguais: o código anterior
-- grava só valor_juros_fatura e o novo grava só valor_juros, então os dois convivem sem erro entre esta
-- migration e o deploy.
--
-- A etapa 2 (0084f) remove o gatilho e a coluna valor_juros_fatura.
--
-- ORDEM: é aditiva. Aplicar ANTES do deploy do código novo (que já usa valor_juros) e, depois do
-- deploy, aplicar a 0084f.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE despesas ADD COLUMN IF NOT EXISTS valor_juros numeric(10,2);

UPDATE despesas SET valor_juros = valor_juros_fatura
  WHERE valor_juros_fatura IS NOT NULL AND valor_juros IS NULL;

CREATE OR REPLACE FUNCTION despesas_juros_ponte() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.valor_juros := COALESCE(NEW.valor_juros, NEW.valor_juros_fatura);
    NEW.valor_juros_fatura := COALESCE(NEW.valor_juros_fatura, NEW.valor_juros);
  ELSIF NEW.valor_juros_fatura IS DISTINCT FROM OLD.valor_juros_fatura AND NEW.valor_juros IS NOT DISTINCT FROM OLD.valor_juros THEN
    NEW.valor_juros := NEW.valor_juros_fatura;
  ELSIF NEW.valor_juros IS DISTINCT FROM OLD.valor_juros AND NEW.valor_juros_fatura IS NOT DISTINCT FROM OLD.valor_juros_fatura THEN
    NEW.valor_juros_fatura := NEW.valor_juros;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS despesas_juros_ponte ON despesas;
CREATE TRIGGER despesas_juros_ponte
  BEFORE INSERT OR UPDATE ON despesas
  FOR EACH ROW EXECUTE FUNCTION despesas_juros_ponte();
