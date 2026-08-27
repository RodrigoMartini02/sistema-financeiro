-- Migration reference: remove unused data_assinatura column from contratos
-- Do not execute automatically. Confirm target environment before applying.

ALTER TABLE contratos DROP COLUMN IF EXISTS data_assinatura;
