-- Adicionar campo numero_cartao na tabela cartoes
-- Este campo representa a posição do cartão (1, 2 ou 3)

ALTER TABLE cartoes
ADD COLUMN IF NOT EXISTS numero_cartao INTEGER;

-- Criar índice para facilitar consultas
CREATE INDEX IF NOT EXISTS idx_cartoes_numero_cartao
ON cartoes(usuario_id, numero_cartao);

-- Comentário da coluna
COMMENT ON COLUMN cartoes.numero_cartao IS 'Posição do cartão (1, 2 ou 3) - usado para mapeamento no frontend';
