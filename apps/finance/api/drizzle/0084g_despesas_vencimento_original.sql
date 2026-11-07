-- 0084g: vencimento original da despesa (plano .plans/painel-resultado-regime-caixa.md).
-- Cria despesas.data_vencimento_original: o vencimento que a despesa tinha antes de ser movida de
-- mês. Fica em branco enquanto a despesa nunca foi movida. Quem move grava aqui o vencimento de antes
-- (só na primeira vez), para o atraso continuar visível no "Em dia com as contas" mesmo depois de a
-- conta ser movida para o mês atual.
--
-- ORDEM: é aditiva (coluna nova, opcional). Aplicar ANTES do deploy do código novo, que já lê e grava
-- esta coluna. Sem backfill: as despesas já movidas não guardaram o vencimento de antes.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE despesas ADD COLUMN IF NOT EXISTS data_vencimento_original date;
