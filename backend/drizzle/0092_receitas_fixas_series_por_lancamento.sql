-- Aplicar somente com autorização explícita e DEPOIS do novo backend substituir
-- os escritores da configuração de fixa por subcategoria. Não executar antes:
-- o código antigo pressupõe uma configuração por classificação/conta/pessoa.
ALTER TABLE classificacoes_receita_fixas
  DROP CONSTRAINT uq_classificacoes_receita_fixas_conta_usuario;
