-- Migration: revisao-receitas
-- Execute este arquivo no banco local antes de continuar a implementação.

ALTER TABLE perfis ADD COLUMN IF NOT EXISTS enquadramento VARCHAR(10);
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS aliquota_imposto DECIMAL(5,2);

ALTER TABLE receitas ADD COLUMN IF NOT EXISTS aliquota_aplicada DECIMAL(5,2);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS valor_imposto DECIMAL(10,2);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS valor_comissao DECIMAL(10,2);
