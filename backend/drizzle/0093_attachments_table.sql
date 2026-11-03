-- Anexos de todo o sistema numa tabela só (plano .plans/unificar-anexos-no-r2.md, etapa A).
-- Os metadados ficam aqui e o arquivo fica no R2 (chave `anexos/<id>`, dentro da pasta do ambiente).
-- Cada anexo tem no máximo um dono: despesa, receita, contrato ou produto. Sem dono, é um envio
-- pendente: o lançamento ainda vai reivindicá-lo ao ser salvo, e a varredura apaga o que passar de 24 horas.
-- Só cria a tabela nova e não altera nada que já existe, então pode ser aplicada antes do deploy do
-- código que a usa. Aplicar somente com autorização explícita.
CREATE TABLE IF NOT EXISTS anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quem enviou. Só ele enxerga e reivindica um envio pendente.
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Para qual tipo de dono o arquivo foi enviado (define as regras de tipo e tamanho).
  tipo_dono VARCHAR(16) NOT NULL,
  despesa_id INTEGER REFERENCES despesas(id) ON DELETE CASCADE,
  receita_id INTEGER REFERENCES receitas(id) ON DELETE CASCADE,
  contrato_id INTEGER REFERENCES comercial.contratos(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES catalogo.produtos(id) ON DELETE CASCADE,
  nome_original VARCHAR(255) NOT NULL,
  -- Tipo decidido pelo servidor, pelo conteúdo do arquivo.
  tipo_conteudo VARCHAR(100) NOT NULL,
  tamanho INTEGER NOT NULL,
  chave VARCHAR(200) NOT NULL UNIQUE,
  -- Ordem de exibição (imagens do catálogo).
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT anexos_tipo_dono_check CHECK (tipo_dono IN ('expense', 'income', 'contract', 'product')),
  CONSTRAINT anexos_tamanho_check CHECK (tamanho > 0),
  CONSTRAINT anexos_um_dono_check CHECK (
    num_nonnulls(despesa_id, receita_id, contrato_id, produto_id) <= 1
    AND (despesa_id IS NULL OR tipo_dono = 'expense')
    AND (receita_id IS NULL OR tipo_dono = 'income')
    AND (contrato_id IS NULL OR tipo_dono = 'contract')
    AND (produto_id IS NULL OR tipo_dono = 'product')
  )
);

CREATE INDEX IF NOT EXISTS idx_anexos_despesa_id ON anexos (despesa_id) WHERE despesa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anexos_receita_id ON anexos (receita_id) WHERE receita_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anexos_contrato_id ON anexos (contrato_id) WHERE contrato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anexos_produto_id ON anexos (produto_id) WHERE produto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anexos_usuario_id ON anexos (usuario_id) WHERE usuario_id IS NOT NULL;
-- A varredura procura os envios sem dono, do mais antigo para o mais novo.
CREATE INDEX IF NOT EXISTS idx_anexos_pendentes ON anexos (created_at)
  WHERE despesa_id IS NULL AND receita_id IS NULL AND contrato_id IS NULL AND produto_id IS NULL;
