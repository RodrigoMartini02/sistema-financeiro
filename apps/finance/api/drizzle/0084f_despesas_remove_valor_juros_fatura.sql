-- 0084f: juros da despesa, etapa 2 de 2 (plano .plans/juros-embutido-parcelado.md).
-- Confere que valor_juros e valor_juros_fatura estão iguais em todas as linhas (se alguma divergir,
-- para sem mudar nada), remove o gatilho de ponte da 0084e e a coluna valor_juros_fatura (agora só
-- existe valor_juros).
--
-- ORDEM: aplicar DEPOIS do deploy do código que usa valor_juros e da 0084e. Depois desta migration o
-- código anterior (que lê e grava valor_juros_fatura) deixa de funcionar.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

DO $$
DECLARE
  divergentes integer;
BEGIN
  SELECT COUNT(*) INTO divergentes FROM despesas WHERE valor_juros IS DISTINCT FROM valor_juros_fatura;
  IF divergentes > 0 THEN
    RAISE EXCEPTION '0084f: % despesas com valor_juros diferente de valor_juros_fatura; nada foi alterado', divergentes;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS despesas_juros_ponte ON despesas;
DROP FUNCTION IF EXISTS despesas_juros_ponte();

ALTER TABLE despesas DROP COLUMN valor_juros_fatura;
