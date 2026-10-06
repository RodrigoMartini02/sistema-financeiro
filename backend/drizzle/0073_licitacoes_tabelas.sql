-- 0073: módulo de Licitações, parte 2 de 3: tabelas e índices.
--
-- Globais (dado público do PNCP ou estado técnico, sem conta):
--   edital, cache_detalhe e coleta_execucao.
-- Por conta (sempre filtradas por conta_id no servidor):
--   conta_habilitada (trava da plataforma, gerida pelo admin), acesso_membro
--   (trava da conta, gerida pelo titular), busca_salva, acompanhamento,
--   acompanhamento_historico e notificacao.
--
-- notificacao.link guarda o caminho a partir do início do app do módulo
-- (ex.: /editais/123); a tela completa com /licitacoes/app.
--
-- ORDEM: aplicar depois da 0072 (configuração de busca) e antes da 0074.
--
-- REVERSÃO (destrutiva): DROP SCHEMA licitacoes CASCADE; (ver 0072).
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- Global: dado público do PNCP, compartilhado por todas as contas
CREATE TABLE licitacoes.edital (
  id                          BIGSERIAL PRIMARY KEY,
  numero_controle_pncp        VARCHAR(60) NOT NULL UNIQUE,
  orgao_cnpj                  VARCHAR(14),
  orgao_razao_social          TEXT,
  esfera                      VARCHAR(2),
  unidade_codigo              VARCHAR(30),
  unidade_nome                TEXT,
  uf                          CHAR(2),
  municipio_nome              TEXT,
  municipio_ibge              VARCHAR(7),
  modalidade_id               SMALLINT,
  modalidade_nome             TEXT,
  modo_disputa_id             SMALLINT,
  modo_disputa_nome           TEXT,
  situacao_id                 SMALLINT,
  situacao_nome               TEXT,
  ano_compra                  INT,
  sequencial_compra           INT,
  numero_compra               TEXT,
  processo                    TEXT,
  objeto                      TEXT NOT NULL,
  informacao_complementar     TEXT,
  srp                         BOOLEAN,
  valor_total_estimado        NUMERIC(18,2),
  data_publicacao_pncp        TIMESTAMPTZ,
  data_abertura_proposta      TIMESTAMPTZ,
  data_encerramento_proposta  TIMESTAMPTZ,
  data_atualizacao_pncp       TIMESTAMPTZ,
  link_sistema_origem         TEXT,
  link_pncp                   TEXT,
  payload                     JSONB NOT NULL,
  hash_payload                CHAR(64) NOT NULL,
  busca_tsv                   TSVECTOR GENERATED ALWAYS AS (
                                to_tsvector('licitacoes.pt_unaccent',
                                  coalesce(objeto, '') || ' ' || coalesce(informacao_complementar, ''))
                              ) STORED,
  primeira_coleta_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_coleta_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_edital_tsv          ON licitacoes.edital USING GIN (busca_tsv);
CREATE INDEX ix_edital_objeto_trgm  ON licitacoes.edital USING GIN (objeto gin_trgm_ops);
CREATE INDEX ix_edital_uf           ON licitacoes.edital (uf);
CREATE INDEX ix_edital_municipio    ON licitacoes.edital (municipio_ibge);
CREATE INDEX ix_edital_modalidade   ON licitacoes.edital (modalidade_id);
CREATE INDEX ix_edital_encerramento ON licitacoes.edital (data_encerramento_proposta);
CREATE INDEX ix_edital_publicacao   ON licitacoes.edital (data_publicacao_pncp DESC);
CREATE INDEX ix_edital_valor        ON licitacoes.edital (valor_total_estimado);
CREATE INDEX ix_edital_orgao        ON licitacoes.edital (orgao_cnpj);

-- Contas com o módulo habilitado (trava da plataforma, gerida pelo admin)
CREATE TABLE licitacoes.conta_habilitada (
  conta_id         INTEGER PRIMARY KEY REFERENCES public.contas(id) ON DELETE CASCADE,
  ativa            BOOLEAN NOT NULL DEFAULT true,
  habilitada_por   INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  habilitada_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colaboradores com acesso ao módulo (trava da conta, gerida pelo titular).
-- O titular da conta habilitada tem acesso sem precisar de linha aqui.
CREATE TABLE licitacoes.acesso_membro (
  conta_id         INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id       INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  concedido_por    INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  concedido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, usuario_id)
);

CREATE TABLE licitacoes.busca_salva (
  id                BIGSERIAL PRIMARY KEY,
  conta_id          INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id        INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nome              VARCHAR(120) NOT NULL,
  termos            TEXT[]   NOT NULL DEFAULT '{}',
  modo_termos       VARCHAR(3) NOT NULL DEFAULT 'OU' CHECK (modo_termos IN ('OU','E')),
  termos_exclusao   TEXT[]   NOT NULL DEFAULT '{}',
  ufs               CHAR(2)[] NOT NULL DEFAULT '{}',
  municipios_ibge   VARCHAR(7)[] NOT NULL DEFAULT '{}',
  orgaos_cnpj       VARCHAR(14)[] NOT NULL DEFAULT '{}',
  modalidades       SMALLINT[] NOT NULL DEFAULT '{}',
  valor_min         NUMERIC(18,2),
  valor_max         NUMERIC(18,2),
  apenas_srp        BOOLEAN,                   -- NULL = indiferente
  notificar         BOOLEAN NOT NULL DEFAULT true,
  ativa             BOOLEAN NOT NULL DEFAULT true,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_busca_conta_usuario ON licitacoes.busca_salva (conta_id, usuario_id) WHERE ativa;

-- Acompanhamento compartilhado pela equipe da conta (uma linha por conta e edital)
CREATE TABLE licitacoes.acompanhamento (
  conta_id         INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  edital_id        BIGINT  NOT NULL REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  status           VARCHAR(20) NOT NULL CHECK (status IN ('ANALISAR','PARTICIPAR','DESCARTADO')),
  observacao       TEXT,
  atualizado_por   INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, edital_id)
);

CREATE TABLE licitacoes.acompanhamento_historico (
  id               BIGSERIAL PRIMARY KEY,
  conta_id         INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  edital_id        BIGINT NOT NULL REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  status_anterior  VARCHAR(20),
  status_novo      VARCHAR(20) NOT NULL,
  observacao       TEXT,
  usuario_id       INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_historico_conta_edital ON licitacoes.acompanhamento_historico (conta_id, edital_id);

CREATE TABLE licitacoes.notificacao (
  id               BIGSERIAL PRIMARY KEY,
  conta_id         INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id       INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo             VARCHAR(30) NOT NULL CHECK (tipo IN ('NOVO_EDITAL','EDITAL_ALTERADO','PRAZO_3D','PRAZO_1D')),
  titulo           TEXT NOT NULL,
  mensagem         TEXT,
  link             TEXT NOT NULL,              -- caminho a partir do início do app do módulo, ex.: /editais/123
  edital_id        BIGINT REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  busca_salva_id   BIGINT REFERENCES licitacoes.busca_salva(id) ON DELETE SET NULL,
  referencia       TEXT,                       -- desambigua EDITAL_ALTERADO e prazos (data de atualização ou de encerramento)
  lida_em          TIMESTAMPTZ,
  criada_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_notificacao_unica
  ON licitacoes.notificacao (conta_id, usuario_id, tipo, edital_id, coalesce(referencia, ''));
CREATE INDEX ix_notificacao_nao_lidas
  ON licitacoes.notificacao (conta_id, usuario_id, criada_em DESC) WHERE lida_em IS NULL;

-- Global: registro de cada execução do coletor
CREATE TABLE licitacoes.coleta_execucao (
  id                BIGSERIAL PRIMARY KEY,
  tipo              VARCHAR(20) NOT NULL CHECK (tipo IN ('VARREDURA','INCREMENTAL','LEMBRETES','LIMPEZA','MANUAL')),
  status            VARCHAR(20) NOT NULL CHECK (status IN ('EXECUTANDO','SUCESSO','PARCIAL','FALHA')),
  iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em     TIMESTAMPTZ,
  requisicoes       INT NOT NULL DEFAULT 0,
  registros_lidos   INT NOT NULL DEFAULT 0,
  novos             INT NOT NULL DEFAULT 0,
  atualizados       INT NOT NULL DEFAULT 0,
  notificacoes      INT NOT NULL DEFAULT 0,
  erros             INT NOT NULL DEFAULT 0,
  detalhes          JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Global: itens e arquivos do PNCP abertos na tela de detalhe (cache de 24 h)
CREATE TABLE licitacoes.cache_detalhe (
  edital_id        BIGINT NOT NULL REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  tipo             VARCHAR(10) NOT NULL CHECK (tipo IN ('ITENS','ARQUIVOS')),
  conteudo         JSONB NOT NULL,
  obtido_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (edital_id, tipo)
);
