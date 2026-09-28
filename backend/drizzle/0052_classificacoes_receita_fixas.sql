-- Classificação de receitas, etapa 2 de 3 (.plans/classificacao-receitas-etapa-2.md).
--
-- Classificação fixa: valor, dia do recebimento e lançamento automático. A
-- configuração é por (classificação, conta) — as classificações padrão são
-- compartilhadas entre as contas do mesmo tipo, então marcar "Serviços" como
-- fixa numa empresa não pode valer para outra.
--
-- O lançamento automático grava a prevista com a configuração e o mês de
-- competência; o índice único impede lançar a mesma receita duas vezes, mesmo
-- com a rotina diária e a checagem ao abrir o sistema rodando juntas.
--
-- ATENÇÃO: não executar sem confirmação explícita do usuário. O ambiente pode
-- estar apontando para produção.

CREATE TABLE IF NOT EXISTS classificacoes_receita_fixas (
  id SERIAL PRIMARY KEY,
  classificacao_id INTEGER NOT NULL REFERENCES classificacoes_receita(id) ON DELETE CASCADE,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  -- Quem configurou: autor das previstas lançadas automaticamente.
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  valor DECIMAL(12, 2) NOT NULL CHECK (valor > 0),
  dia_recebimento SMALLINT NOT NULL CHECK (dia_recebimento BETWEEN 1 AND 31),
  lancar_automatico BOOLEAN NOT NULL DEFAULT false,
  -- Dia em que o automático foi ligado: nada é lançado antes dele.
  automatico_desde DATE,
  data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
  data_atualizacao TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_classificacoes_receita_fixas_conta UNIQUE (classificacao_id, conta_id)
);

CREATE INDEX IF NOT EXISTS idx_classificacoes_receita_fixas_conta ON classificacoes_receita_fixas (conta_id);
CREATE INDEX IF NOT EXISTS idx_classificacoes_receita_fixas_usuario ON classificacoes_receita_fixas (usuario_id);

ALTER TABLE receitas
  ADD COLUMN IF NOT EXISTS classificacao_fixa_id INTEGER REFERENCES classificacoes_receita_fixas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fixa_competencia DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_receitas_fixa_competencia
  ON receitas (classificacao_fixa_id, fixa_competencia)
  WHERE fixa_competencia IS NOT NULL;
