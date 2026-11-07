-- 0066: a despesa de comissão passa a guardar a receita que a gerou
-- (receita_origem_id). Cancelar ou excluir a receita cancela só a comissão
-- ligada a ela, e só se ainda não foi paga — antes, o cancelamento pegava
-- todas as comissões do mês.
--
-- ON DELETE SET NULL, como socios.receita_capital_id: apagar a receita não
-- apaga a despesa (o código cancela a comissão antes de apagar a receita). As
-- comissões antigas são ligadas pela 0067, depois do deploy.
--
-- ORDEM: aplicar ANTES do deploy do código novo. Só acrescenta a coluna e o
-- índice; o código anterior não lê nem grava a coluna.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE despesas
  ADD COLUMN IF NOT EXISTS receita_origem_id INTEGER REFERENCES receitas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_despesas_receita_origem
  ON despesas (receita_origem_id)
  WHERE receita_origem_id IS NOT NULL;
