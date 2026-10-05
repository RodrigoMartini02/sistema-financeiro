-- 0070: clientes, contratos e serviços refeitos no schema `comercial`.
--
-- O módulo é só de conta PJ: cada cliente, contrato e serviço pertence a uma
-- conta empresa (conta_id). O cliente tem tipo (pessoa física, empresa ou
-- órgão público) e documento único na conta. O contrato junta as cobranças
-- (mensalidade, implantação, projeto), os tipos de hora do banco de horas, os
-- empenhos por ano e os dados de órgão público (processo, modalidade e
-- percentuais de retenção por tributo).
--
-- Receitas: ganham o cliente pelo cadastro (cliente_id), a cobrança e o mês
-- que geraram a receita (cobranca_id, competencia), o bruto e as retenções.
-- O índice único (cobranca_id, competencia) impede o mesmo mês duas vezes. As
-- horas consumidas ficam em comercial.consumos_hora, ligadas à receita: o
-- saldo é calculado, e cancelar a receita devolve as horas.
--
-- Dados: os clientes antigos com CNPJ de 14 dígitos viram "empresa" na conta
-- PJ deles (ou na primeira PJ do dono); os serviços antigos (do dono) são
-- copiados para cada conta PJ do dono. Quem não tem PJ não é copiado: o
-- módulo não existe em conta pessoal. "Projeto" entra sob "Contratos" nas
-- categorias padrão de empresa.
--
-- ORDEM: aplicar ANTES do deploy do código novo. Só acrescenta: as tabelas
-- antigas continuam até a 0071, aplicada depois do deploy. A chave de
-- receitas.contrato_id passa a apontar para comercial.contratos; a migration
-- aborta se alguma receita estiver ligada a contrato antigo.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM receitas WHERE contrato_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Há receitas ligadas a contratos antigos: revise antes de aplicar a 0070';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS comercial;

CREATE TABLE comercial.clientes (
  id SERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('pessoa_fisica', 'empresa', 'orgao_publico')),
  nome VARCHAR(150) NOT NULL,
  documento VARCHAR(14) NOT NULL,
  esfera VARCHAR(10) CHECK (esfera IN ('municipal', 'estadual', 'federal')),
  orgao VARCHAR(150),
  contato_nome VARCHAR(100),
  contato_email VARCHAR(150),
  contato_telefone VARCHAR(11),
  cep VARCHAR(8),
  rua VARCHAR(150),
  numero VARCHAR(20),
  complemento VARCHAR(80),
  bairro VARCHAR(80),
  cidade VARCHAR(80),
  uf CHAR(2),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_clientes_documento CHECK (
    (tipo = 'pessoa_fisica' AND documento ~ '^[0-9]{11}$')
    OR (tipo <> 'pessoa_fisica' AND documento ~ '^[0-9]{14}$')
  ),
  CONSTRAINT ck_clientes_orgao_publico CHECK (
    tipo <> 'orgao_publico' OR (esfera IS NOT NULL AND orgao IS NOT NULL)
  )
);
CREATE UNIQUE INDEX ux_clientes_conta_documento ON comercial.clientes (conta_id, documento);
CREATE INDEX idx_clientes_conta_nome ON comercial.clientes (conta_id, nome);

CREATE TABLE comercial.servicos (
  id SERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_servicos_conta_nome ON comercial.servicos (conta_id, LOWER(nome));

CREATE TABLE comercial.contratos (
  id SERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL REFERENCES comercial.clientes(id),
  numero VARCHAR(50),
  descricao VARCHAR(255),
  observacoes TEXT,
  inicio DATE NOT NULL,
  fim DATE,
  dia_vencimento SMALLINT NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
  status VARCHAR(10) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado')),
  encerrado_em DATE,
  contrato_anterior_id INTEGER REFERENCES comercial.contratos(id) ON DELETE SET NULL,
  numero_aditivo INTEGER NOT NULL DEFAULT 0 CHECK (numero_aditivo >= 0),
  representante_id INTEGER REFERENCES representantes(id) ON DELETE SET NULL,
  classificacao_mensalidade_id INTEGER REFERENCES classificacoes_receita(id) ON DELETE SET NULL,
  classificacao_implantacao_id INTEGER REFERENCES classificacoes_receita(id) ON DELETE SET NULL,
  classificacao_projeto_id INTEGER REFERENCES classificacoes_receita(id) ON DELETE SET NULL,
  processo VARCHAR(100),
  modalidade VARCHAR(100),
  retencao_ir NUMERIC(5,2) CHECK (retencao_ir BETWEEN 0 AND 100),
  retencao_pis_cofins_csll NUMERIC(5,2) CHECK (retencao_pis_cofins_csll BETWEEN 0 AND 100),
  retencao_iss NUMERIC(5,2) CHECK (retencao_iss BETWEEN 0 AND 100),
  retencao_inss NUMERIC(5,2) CHECK (retencao_inss BETWEEN 0 AND 100),
  reajuste_data_base DATE NOT NULL,
  reajuste_tratado_ate DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_contratos_vigencia CHECK (fim IS NULL OR fim >= inicio)
);
CREATE INDEX idx_contratos_conta_status ON comercial.contratos (conta_id, status);
CREATE INDEX idx_contratos_cliente ON comercial.contratos (cliente_id);

CREATE TABLE comercial.cobrancas (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES comercial.contratos(id) ON DELETE CASCADE,
  tipo VARCHAR(12) NOT NULL CHECK (tipo IN ('mensalidade', 'implantacao', 'projeto')),
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  parcelas SMALLINT CHECK (parcelas BETWEEN 1 AND 120),
  primeira_data DATE,
  CONSTRAINT ck_cobrancas_parcelas CHECK (
    (tipo = 'mensalidade' AND parcelas IS NULL AND primeira_data IS NULL)
    OR (tipo <> 'mensalidade' AND parcelas IS NOT NULL AND primeira_data IS NOT NULL)
  )
);
CREATE UNIQUE INDEX ux_cobrancas_contrato_tipo ON comercial.cobrancas (contrato_id, tipo);

CREATE TABLE comercial.tipos_hora (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES comercial.contratos(id) ON DELETE CASCADE,
  nome VARCHAR(60) NOT NULL,
  valor_hora NUMERIC(12,2) NOT NULL CHECK (valor_hora > 0),
  quantidade NUMERIC(10,2) NOT NULL CHECK (quantidade > 0)
);
CREATE UNIQUE INDEX ux_tipos_hora_contrato_nome ON comercial.tipos_hora (contrato_id, LOWER(nome));

CREATE TABLE comercial.consumos_hora (
  id SERIAL PRIMARY KEY,
  tipo_hora_id INTEGER NOT NULL REFERENCES comercial.tipos_hora(id) ON DELETE CASCADE,
  receita_id INTEGER NOT NULL UNIQUE REFERENCES receitas(id) ON DELETE CASCADE,
  horas NUMERIC(10,2) NOT NULL CHECK (horas > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_consumos_hora_tipo ON comercial.consumos_hora (tipo_hora_id);

CREATE TABLE comercial.empenhos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES comercial.contratos(id) ON DELETE CASCADE,
  ano SMALLINT NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  numero VARCHAR(50) NOT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0)
);
CREATE UNIQUE INDEX ux_empenhos_contrato_ano ON comercial.empenhos (contrato_id, ano);

CREATE TABLE comercial.contrato_servicos (
  contrato_id INTEGER NOT NULL REFERENCES comercial.contratos(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES comercial.servicos(id),
  implantado BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (contrato_id, servico_id)
);

CREATE TABLE comercial.anexos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES comercial.contratos(id) ON DELETE CASCADE,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  nome_original VARCHAR(255) NOT NULL,
  nome_arquivo VARCHAR(255) NOT NULL UNIQUE,
  tipo VARCHAR(4) NOT NULL CHECK (tipo IN ('pdf', 'jpg', 'png')),
  tamanho INTEGER NOT NULL CHECK (tamanho > 0 AND tamanho <= 20971520),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_anexos_contrato ON comercial.anexos (contrato_id);

-- receitas.contrato_id: a chave antiga (para public.contratos) sai; a nova
-- aponta para comercial.contratos. Nenhuma receita está ligada (conferido no
-- início).
DO $$
DECLARE
  restricao RECORD;
BEGIN
  FOR restricao IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'receitas'::regclass AND contype = 'f'
       AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (contrato_id)%'
  LOOP
    EXECUTE format('ALTER TABLE receitas DROP CONSTRAINT %I', restricao.conname);
  END LOOP;
END $$;

ALTER TABLE receitas
  ADD CONSTRAINT receitas_contrato_id_comercial_fkey
    FOREIGN KEY (contrato_id) REFERENCES comercial.contratos(id) ON DELETE SET NULL,
  ADD COLUMN cliente_id INTEGER REFERENCES comercial.clientes(id) ON DELETE SET NULL,
  ADD COLUMN cobranca_id INTEGER REFERENCES comercial.cobrancas(id) ON DELETE SET NULL,
  ADD COLUMN competencia DATE,
  ADD COLUMN valor_bruto NUMERIC(10,2),
  ADD COLUMN retencoes JSONB;

CREATE INDEX IF NOT EXISTS idx_receitas_cliente ON receitas (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receitas_contrato ON receitas (contrato_id) WHERE contrato_id IS NOT NULL;
CREATE UNIQUE INDEX ux_receitas_cobranca_competencia ON receitas (cobranca_id, competencia)
  WHERE cobranca_id IS NOT NULL AND status <> 'cancelada';

-- Clientes antigos com CNPJ de 14 dígitos: na conta PJ deles ou, se a conta
-- não for PJ, na primeira PJ do dono. Sem PJ, não são copiados.
INSERT INTO comercial.clientes (conta_id, usuario_id, tipo, nome, documento)
SELECT destino.id, destino.usuario_id, 'empresa', LEFT(TRIM(cl.nome), 150),
       regexp_replace(cl.cnpj, '\D', '', 'g')
  FROM clientes cl
  JOIN LATERAL (
    SELECT c.id, c.usuario_id
      FROM contas c
     WHERE c.tipo = 'empresa'
       AND (c.id = cl.conta_id OR c.usuario_id = cl.usuario_id)
     ORDER BY (c.id = cl.conta_id) DESC, c.id
     LIMIT 1
  ) destino ON true
 WHERE regexp_replace(COALESCE(cl.cnpj, ''), '\D', '', 'g') ~ '^[0-9]{14}$'
ON CONFLICT (conta_id, documento) DO NOTHING;

-- Receitas que guardavam o nome do cliente passam a apontar o cadastro.
UPDATE receitas r
   SET cliente_id = cl.id
  FROM comercial.clientes cl
 WHERE r.cliente IS NOT NULL AND TRIM(r.cliente) <> ''
   AND r.conta_id = cl.conta_id
   AND LOWER(TRIM(r.cliente)) = LOWER(cl.nome);

-- Serviços antigos (catálogo do dono) em cada conta PJ do dono.
INSERT INTO comercial.servicos (conta_id, usuario_id, nome, ativo)
SELECT c.id, c.usuario_id, LEFT(TRIM(s.nome), 150), COALESCE(s.ativo, true)
  FROM servicos s
  JOIN contas c ON c.usuario_id = s.usuario_id AND c.tipo = 'empresa'
ON CONFLICT (conta_id, LOWER(nome)) DO NOTHING;

-- "Projeto" sob "Contratos" nas categorias padrão de empresa.
INSERT INTO classificacoes_receita (usuario_id, tipo, nome, parent_id)
SELECT raiz.usuario_id, 'empresa', 'Projeto', raiz.id
  FROM classificacoes_receita raiz
 WHERE raiz.tipo = 'empresa' AND raiz.conta_id IS NULL AND raiz.parent_id IS NULL
   AND LOWER(raiz.nome) = 'contratos'
ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING;
