-- Indices de leitura do painel financeiro.
--
-- 1) despesas.status: toda query financeira filtra por ela ("= 'ativa'"), e a
--    tabela nao tinha indice — receitas ja tinha o equivalente desde 0003.
--
-- 2) (ano * 12 + mes): o filtro de periodo do painel compara essa expressao,
--    e o indice composto (usuario_id, mes, ano) nao a atende. Como e um
--    indice de expressao, precisa ser criado sobre o calculo exato usado
--    nas queries.
--
-- Ambos sao IF NOT EXISTS: rodar duas vezes nao quebra.

CREATE INDEX IF NOT EXISTS idx_despesas_status
  ON despesas (status);

CREATE INDEX IF NOT EXISTS idx_despesas_periodo
  ON despesas ((ano * 12 + mes));

CREATE INDEX IF NOT EXISTS idx_receitas_periodo
  ON receitas ((ano * 12 + mes));
