-- Migration reference: coluna descricao ausente em contratos (usada em GET /api/contratos/faturamento)
-- Do not execute automatically. Confirm target environment before applying.

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS descricao VARCHAR(255);
