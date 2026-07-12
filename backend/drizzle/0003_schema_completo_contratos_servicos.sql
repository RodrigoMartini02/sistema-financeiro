-- Migration reference: schema completo do modulo contratos/servicos + colunas restantes do financeiro
-- Do not execute automatically. Confirm target environment before applying.

CREATE TABLE IF NOT EXISTS servicos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  valor_mensal_padrao DECIMAL(10,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_servicos_usuario ON servicos(usuario_id);

CREATE TABLE IF NOT EXISTS contratos_servicos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  valor_mensal DECIMAL(10,2) NOT NULL DEFAULT 0,
  implantado BOOLEAN DEFAULT false,
  faturando BOOLEAN DEFAULT false,
  data_inicio_faturamento DATE,
  UNIQUE (contrato_id, servico_id)
);
CREATE INDEX IF NOT EXISTS idx_contratos_servicos_contrato ON contratos_servicos(contrato_id);

CREATE TABLE IF NOT EXISTS contrato_anexos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome_original VARCHAR(255) NOT NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  tamanho INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contrato_anexos_contrato ON contrato_anexos(contrato_id);

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS parent_id INTEGER;

ALTER TABLE receitas ADD COLUMN IF NOT EXISTS cliente VARCHAR(100);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS tipo_receita VARCHAR(30);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS representante_id INTEGER;
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS valor_comissao DECIMAL(10,2);

ALTER TABLE despesas ADD COLUMN IF NOT EXISTS numero_nf VARCHAR(50);
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS data_emissao_nf DATE;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS tipo_despesa VARCHAR(10) DEFAULT 'opex';

ALTER TABLE perfis ADD COLUMN IF NOT EXISTS enquadramento VARCHAR(10);

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS representante_id INTEGER;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS perfil_id INTEGER;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS implantacao_parcelas INTEGER DEFAULT 1;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS implantacao_valor_parcela DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_presenciais_valor DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_presenciais_saldo_ini DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_presenciais_saldo_atual DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_remotas_valor DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_remotas_saldo_ini DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_remotas_saldo_atual DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_mensal DECIMAL(10,2) DEFAULT 0;
