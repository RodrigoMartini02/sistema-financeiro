-- 0071: remove as tabelas antigas de clientes, contratos e serviços.
--
-- O módulo novo vive no schema `comercial` (0070). Saem as tabelas antigas do
-- public, inclusive as que nenhum código usava (consumo_horas,
-- modulos_contrato) e a legada servicos_tecnicos_contrato, e a coluna
-- receitas.cliente (o nome em texto), trocada por receitas.cliente_id.
--
-- Clientes e serviços antigos de quem não tem conta PJ não foram copiados na
-- 0070 (o módulo não existe em conta pessoal) e saem aqui.
--
-- ORDEM: aplicar DEPOIS do deploy do código novo, que não usa nada disto.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao. Remove dados de forma definitiva.

DROP TABLE IF EXISTS contrato_anexos;
DROP TABLE IF EXISTS contratos_servicos;
DROP TABLE IF EXISTS servicos_tecnicos_contrato;
DROP TABLE IF EXISTS consumo_horas;
DROP TABLE IF EXISTS modulos_contrato;
DROP TABLE IF EXISTS contratos;
DROP TABLE IF EXISTS servicos;
DROP TABLE IF EXISTS clientes;

ALTER TABLE receitas DROP COLUMN IF EXISTS cliente;
