-- Unificação "Perfil" -> "Conta". Renomeia a tabela `perfis` para `contas` e
-- a coluna `perfil_id` para `conta_id` em todas as tabelas relacionadas, além
-- de adicionar a flag `eh_padrao` (marca a Conta nascida no cadastro externo,
-- vinculada à cobrança do plano em `usuarios`).
--
-- RENAME TABLE/COLUMN no Postgres são operações de catálogo (não reescrevem
-- dados), mas o backend e o frontend devem subir juntos logo após aplicar,
-- já que o contrato de API muda (perfil_id -> conta_id) sem período de
-- transição com os dois nomes convivendo.
--
-- Nomes de constraints/índices confirmados diretamente no banco de produção
-- antes de escrever este arquivo (não são os nomes "assumidos" do plano).
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE perfis RENAME TO contas;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS eh_padrao BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE despesas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE receitas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE cartoes RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE categorias RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE reservas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE meses RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE socios RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE representantes RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE copilot_conversas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE orcamento_metas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE ia_eventos_uso RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE clientes RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE contratos RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE compromissos RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE movimentacoes_reservas RENAME COLUMN perfil_id TO conta_id;

-- Constraints (nomes confirmados via pg_constraint)
ALTER TABLE contas RENAME CONSTRAINT perfis_pkey TO contas_pkey;
ALTER TABLE contas RENAME CONSTRAINT perfis_id_not_null TO contas_id_not_null;
ALTER TABLE contas RENAME CONSTRAINT perfis_tipo_not_null TO contas_tipo_not_null;
ALTER TABLE contas RENAME CONSTRAINT perfis_nome_not_null TO contas_nome_not_null;
ALTER TABLE contas RENAME CONSTRAINT perfis_usuario_id_fkey TO contas_usuario_id_fkey;

ALTER TABLE despesas RENAME CONSTRAINT despesas_perfil_id_fkey TO despesas_conta_id_fkey;
ALTER TABLE receitas RENAME CONSTRAINT receitas_perfil_id_fkey TO receitas_conta_id_fkey;
ALTER TABLE cartoes RENAME CONSTRAINT cartoes_perfil_id_fkey TO cartoes_conta_id_fkey;
ALTER TABLE categorias RENAME CONSTRAINT categorias_perfil_id_fkey TO categorias_conta_id_fkey;
ALTER TABLE reservas RENAME CONSTRAINT reservas_perfil_id_fkey TO reservas_conta_id_fkey;
ALTER TABLE meses RENAME CONSTRAINT meses_perfil_id_fkey TO meses_conta_id_fkey;
ALTER TABLE socios RENAME CONSTRAINT socios_perfil_id_fkey TO socios_conta_id_fkey;
ALTER TABLE representantes RENAME CONSTRAINT representantes_perfil_id_fkey TO representantes_conta_id_fkey;
ALTER TABLE copilot_conversas RENAME CONSTRAINT copilot_conversas_perfil_id_fkey TO copilot_conversas_conta_id_fkey;
ALTER TABLE copilot_conversas RENAME CONSTRAINT copilot_conversas_perfil_id_not_null TO copilot_conversas_conta_id_not_null;
ALTER TABLE orcamento_metas RENAME CONSTRAINT orcamento_metas_perfil_id_fkey TO orcamento_metas_conta_id_fkey;
ALTER TABLE orcamento_metas RENAME CONSTRAINT orcamento_metas_perfil_id_not_null TO orcamento_metas_conta_id_not_null;
ALTER TABLE orcamento_metas RENAME CONSTRAINT orcamento_metas_usuario_id_perfil_id_categoria_id_key TO orcamento_metas_usuario_id_conta_id_categoria_id_key;
-- Nota: Drizzle nomeia essa constraint como "orcamento_metas_usuario_perfil_categoria_unico" no
-- código (unique('...')), mas o Postgres a criou com o nome padrão automático
-- (colunas concatenadas + _key). O RENAME acima usa o nome real confirmado via pg_constraint.
ALTER TABLE ia_eventos_uso RENAME CONSTRAINT ia_eventos_uso_perfil_id_fkey TO ia_eventos_uso_conta_id_fkey;
ALTER TABLE ia_eventos_uso RENAME CONSTRAINT ia_eventos_uso_perfil_id_not_null TO ia_eventos_uso_conta_id_not_null;
ALTER TABLE clientes RENAME CONSTRAINT clientes_perfil_id_fkey TO clientes_conta_id_fkey;
ALTER TABLE compromissos RENAME CONSTRAINT compromissos_perfil_id_fkey TO compromissos_conta_id_fkey;
ALTER TABLE movimentacoes_reservas RENAME CONSTRAINT movimentacoes_reservas_perfil_id_fkey TO movimentacoes_reservas_conta_id_fkey;

-- Índices (nomes confirmados via pg_indexes)
ALTER INDEX idx_perfis_usuario RENAME TO idx_contas_usuario;
ALTER INDEX idx_despesas_perfil RENAME TO idx_despesas_conta;
ALTER INDEX idx_receitas_perfil RENAME TO idx_receitas_conta;
ALTER INDEX idx_cartoes_perfil RENAME TO idx_cartoes_conta;
ALTER INDEX idx_cartoes_usuario_nome_perfil_unique RENAME TO idx_cartoes_usuario_nome_conta_unique;
ALTER INDEX idx_categorias_perfil RENAME TO idx_categorias_conta;
ALTER INDEX idx_categorias_usuario_nome_perfil_custom RENAME TO idx_categorias_usuario_nome_conta_custom;
ALTER INDEX idx_reservas_perfil RENAME TO idx_reservas_conta;
ALTER INDEX idx_meses_perfil RENAME TO idx_meses_conta;
ALTER INDEX meses_usuario_ano_mes_perfil_unique RENAME TO meses_usuario_ano_mes_conta_unique;
ALTER INDEX idx_representantes_perfil RENAME TO idx_representantes_conta;
ALTER INDEX idx_copilot_conversas_usuario_perfil_atualizado RENAME TO idx_copilot_conversas_usuario_conta_atualizado;
ALTER INDEX idx_orcamento_metas_usuario_perfil RENAME TO idx_orcamento_metas_usuario_conta;
ALTER INDEX idx_clientes_perfil RENAME TO idx_clientes_conta;
