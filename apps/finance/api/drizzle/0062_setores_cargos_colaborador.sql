-- 0062: setores e cargos de cada conta PJ (telas "Setores" e "Cargos" em
-- Configurações → Pessoas), o setor, o cargo e a data de admissão de cada
-- colaborador (no vínculo dele com a empresa, conta_membros) e as permissões
-- das duas telas para colaboradores (membro_permissoes, desligadas por padrão).
-- O nome é único entre os ativos da conta: desativar libera o nome.
--
-- ORDEM: aplicar ANTES do deploy do código novo. Só acrescenta tabelas e
-- colunas; o código anterior lê colunas explícitas e não é afetado. Sem ela, o
-- código novo falha ao listar colaboradores e permissões.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.
CREATE TABLE IF NOT EXISTS setores (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_criacao TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_setores_conta ON setores(conta_id);
CREATE UNIQUE INDEX IF NOT EXISTS setores_conta_nome_ativo_unique ON setores(conta_id, LOWER(nome)) WHERE ativo;

CREATE TABLE IF NOT EXISTS cargos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_criacao TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cargos_conta ON cargos(conta_id);
CREATE UNIQUE INDEX IF NOT EXISTS cargos_conta_nome_ativo_unique ON cargos(conta_id, LOWER(nome)) WHERE ativo;

ALTER TABLE conta_membros ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setores(id) ON DELETE SET NULL;
ALTER TABLE conta_membros ADD COLUMN IF NOT EXISTS cargo_id INTEGER REFERENCES cargos(id) ON DELETE SET NULL;
ALTER TABLE conta_membros ADD COLUMN IF NOT EXISTS data_admissao DATE;

ALTER TABLE membro_permissoes ADD COLUMN IF NOT EXISTS acesso_setores BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE membro_permissoes ADD COLUMN IF NOT EXISTS acesso_cargos BOOLEAN NOT NULL DEFAULT false;
