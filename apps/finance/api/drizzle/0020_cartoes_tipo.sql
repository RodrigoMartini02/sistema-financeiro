-- Adiciona tipo (credito/debito/ambos) aos cartoes, permitindo distinguir
-- qual metodo de pagamento cada cartao suporta. Hoje o cadastro de cartao
-- nao declara isso, e uma despesa pode vincular o mesmo cartao ora como
-- credito ora como debito, sem nenhuma consistencia forcada.
--
-- Valores esperados: 'credito', 'debito', 'ambos', ou NULL (tipo ainda nao
-- definido — tratado como compativel com qualquer forma de pagamento ate
-- ser classificado).
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS tipo VARCHAR(10);
