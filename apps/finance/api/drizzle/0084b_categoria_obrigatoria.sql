-- 0084b: categoria obrigatória em todo lançamento (plano .plans/catalogo-padrao-categorias-pf.md, Fase 3).
-- despesas.categoria_id e receitas.classificacao_id passam a NOT NULL. O código já exige a
-- categoria na gravação e a migração de dados da conta 17 classificou os lançamentos que
-- estavam soltos. Se ainda houver algum sem categoria, o ALTER recusa e nada muda: a
-- migration roda numa transação.
--
-- Em receitas, a chave estrangeira da classificação era ON DELETE SET NULL, que não combina
-- com NOT NULL (a exclusão de classificação em uso já é recusada pela rota). Passa a NO ACTION,
-- como a das despesas.
--
-- ORDEM: depois da migração de dados da conta 17 e do deploy do código que exige a categoria.
-- Antes de aplicar, conferir que não há lançamento sem categoria em nenhuma conta.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE despesas ALTER COLUMN categoria_id SET NOT NULL;
ALTER TABLE receitas ALTER COLUMN classificacao_id SET NOT NULL;

ALTER TABLE receitas DROP CONSTRAINT IF EXISTS receitas_classificacao_id_fkey;
ALTER TABLE receitas ADD CONSTRAINT receitas_classificacao_id_fkey
  FOREIGN KEY (classificacao_id) REFERENCES classificacoes_receita(id);
