-- 0067: liga as despesas de comissão antigas (de antes da 0066) à receita que
-- as gerou. Só dados e idempotente: mexe apenas em despesa e receita ainda sem
-- vínculo.
--
-- A comissão era gravada com a descrição "Comissão - <representante>", o valor
-- da comissão da receita (receitas.valor_comissao), vencimento na data do
-- recebimento, o mesmo autor e a mesma conta. Pares com a mesma chave (duas
-- comissões iguais no mesmo dia) são casados um a um pela ordem de criação
-- (ROW_NUMBER), para nenhuma receita ficar com duas despesas. O que não bater
-- fica sem vínculo e não é cancelado sozinho.
--
-- ORDEM: aplicar DEPOIS do deploy do código novo, para cobrir também as
-- comissões gravadas pelo código anterior até o deploy.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

WITH receitas_com_comissao AS (
  SELECT r.id, r.usuario_id, r.conta_id, r.valor_comissao, r.data_recebimento,
         ROW_NUMBER() OVER (
           PARTITION BY r.usuario_id, r.conta_id, r.valor_comissao, r.data_recebimento
           ORDER BY r.id) AS ordem
    FROM receitas r
   WHERE r.valor_comissao IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM despesas vinculada WHERE vinculada.receita_origem_id = r.id)
),
comissoes_sem_vinculo AS (
  SELECT d.id, d.usuario_id, d.conta_id, d.valor_original, d.data_vencimento,
         ROW_NUMBER() OVER (
           PARTITION BY d.usuario_id, d.conta_id, d.valor_original, d.data_vencimento
           ORDER BY d.id) AS ordem
    FROM despesas d
   WHERE d.receita_origem_id IS NULL
     AND d.descricao LIKE 'Comissão - %'
)
UPDATE despesas d
   SET receita_origem_id = r.id
  FROM comissoes_sem_vinculo c
  JOIN receitas_com_comissao r
    ON r.usuario_id = c.usuario_id
   AND r.conta_id IS NOT DISTINCT FROM c.conta_id
   AND r.valor_comissao = c.valor_original
   AND r.data_recebimento = c.data_vencimento
   AND r.ordem = c.ordem
 WHERE d.id = c.id;
