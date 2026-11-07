-- Fase 2 do plano de contas familiares multiusuário
-- (.plans/vinculo-membros-conta-familiar.md)
--
-- Cria o vínculo membro <-> conta, e torna usuarios.documento opcional
-- (membro sem CPF, ex.: filho menor de idade), preservando unicidade
-- apenas entre documentos preenchidos (índice único parcial).
--
-- IMPORTANTE: NÃO EXECUTAR SEM CONFIRMAÇÃO EXPLÍCITA DO USUÁRIO.
-- O ambiente atual pode estar apontando para produção.
--
-- Diagnóstico prévio confirmado (somente leitura): 0 documentos NULL hoje,
-- constraint atual chama-se usuarios_documento_key.

CREATE TABLE conta_membros (
  id SERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  data_criacao TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conta_membros_conta ON conta_membros(conta_id);

ALTER TABLE usuarios ALTER COLUMN documento DROP NOT NULL;
ALTER TABLE usuarios DROP CONSTRAINT usuarios_documento_key;
CREATE UNIQUE INDEX usuarios_documento_unique_partial ON usuarios(documento) WHERE documento IS NOT NULL;
