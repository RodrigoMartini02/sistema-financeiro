-- Limpeza dos campos redundantes de despesa.
--
-- A tabela acumulou tres colunas para um unico dado. `valor_original` e o que o
-- usuario digita no modal; `valor_final` recebia uma copia dela e `valor` uma
-- copia de `valor_final` — as tres gravadas na mesma query, nunca divergindo.
-- Verificado nos quatro caminhos de gravacao: modal, assistente, pagamento
-- individual e pagamento em lote.
--
-- Quem guarda o valor com juros ou desconto e `valor_pago`, preenchido no
-- pagamento. Esse par — valor da compra e valor pago — e o que o modal sempre
-- ofereceu.
--
-- As demais colunas:
--
--   valor_total_com_juros  nenhuma referencia no codigo; nem o Drizzle mapeava
--   numero                 contador sequencial por usuario, gravado e nunca
--                          lido de volta (nenhum SELECT, API ou tela o expunha)
--   tipo_despesa           OPEX/CAPEX; 549 registros, todos 'opex', porque o
--                          formulario gravava valor fixo e nenhuma tela permitia
--                          escolher. O painel exibia um rotulo que nao
--                          distinguia nada
--
-- PRE-REQUISITO OBRIGATORIO: `valor_original` precisa estar preenchida em todas
-- as linhas antes deste DROP. Registros antigos nasceram so com `valor`, e sem o
-- UPDATE previo o dado se perde aqui. Rodar antes:
--
--   UPDATE despesas SET valor_original = valor WHERE valor_original IS NULL;
--
-- E fazer backup das colunas antes de remover:
--
--   CREATE TABLE backup_colunas_despesas_20260907 AS
--     SELECT id, valor, valor_final, valor_total_com_juros, numero, tipo_despesa
--       FROM despesas;
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE despesas
  DROP COLUMN IF EXISTS valor,
  DROP COLUMN IF EXISTS valor_final,
  DROP COLUMN IF EXISTS valor_total_com_juros,
  DROP COLUMN IF EXISTS numero,
  DROP COLUMN IF EXISTS tipo_despesa;
