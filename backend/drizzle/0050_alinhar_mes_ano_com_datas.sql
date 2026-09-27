-- Alinha mes/ano de receitas e despesas antigas com a data que define o
-- lancamento: data_recebimento (receitas) e data_vencimento (despesas).
--
-- Desde que o cadastro e a edicao passaram a derivar mes/ano da data
-- (routes/incomes.ts e routes/expenses.ts, getMonthYearFromIsoDate), so
-- registros antigos ficaram divergentes. O Painel financeiro filtra pela data
-- (o filtro e por dia); Movimentacoes e Relatorios filtram por mes/ano. Sem
-- este alinhamento, os meses desses registros mostravam totais diferentes
-- entre as telas. `mes` e base 0.
--
-- Idempotente: so toca linhas em que mes/ano ainda nao batem com a data.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

UPDATE receitas
   SET mes = EXTRACT(MONTH FROM data_recebimento)::int - 1,
       ano = EXTRACT(YEAR FROM data_recebimento)::int
 WHERE NOT (mes = EXTRACT(MONTH FROM data_recebimento)::int - 1
            AND ano = EXTRACT(YEAR FROM data_recebimento)::int);

UPDATE despesas
   SET mes = EXTRACT(MONTH FROM data_vencimento)::int - 1,
       ano = EXTRACT(YEAR FROM data_vencimento)::int
 WHERE NOT (mes = EXTRACT(MONTH FROM data_vencimento)::int - 1
            AND ano = EXTRACT(YEAR FROM data_vencimento)::int);
