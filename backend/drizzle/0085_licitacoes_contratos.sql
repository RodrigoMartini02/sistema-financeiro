-- 0085: módulo de Licitações: contratos a vencer, parte A (dados).
--
-- Guarda os contratos vigentes do PNCP: só "Contrato (termo inicial)" com
-- vigência original de 180 dias ou mais, com o vencimento atual calculado
-- pelos aditivos (plano .plans/licitacoes-contratos-a-vencer.md). Os contratos
-- são dado público, como os editais: tabelas globais, sem conta.
--   contrato            os contratos, sem o JSON completo do PNCP (espaço);
--   contrato_carga_dia  os dias de publicação que a carga inicial já concluiu;
--   coleta_execucao     o CHECK de tipo passa a aceitar as execuções de
--                       contratos (CONTRATOS_AVISOS é usado a partir da parte B).
--
-- aditivos: NULL = termos não conferidos (sem sinal de alteração no PNCP);
-- [] = conferidos, sem termo; senão, o resumo dos termos. aditivos_referencia
-- guarda a data de atualização global da última conferência: com a mesma data,
-- os termos não são consultados de novo.
--
-- Sem índice de trigramas: nenhuma consulta do módulo usa. A busca por número
-- (parte B) usa as mesmas expressões dos índices de grupos de dígitos abaixo,
-- como na 0079; mudar uma exige mudar a outra.
--
-- Só acrescenta: o código atual continua funcionando.
--
-- ORDEM: aplicar depois da 0084 e ANTES do deploy do código que a usa (a rotina
-- diária grava em contrato e em contrato_carga_dia). Aplicar fora das 06:00 de
-- Brasília: a rotina diária grava em coleta_execucao.
--
-- REVERSÃO:
--   ALTER TABLE licitacoes.coleta_execucao DROP CONSTRAINT coleta_execucao_tipo_check;
--   DELETE FROM licitacoes.coleta_execucao WHERE tipo LIKE 'CONTRATOS\_%';
--   ALTER TABLE licitacoes.coleta_execucao ADD CONSTRAINT coleta_execucao_tipo_check
--     CHECK (tipo IN ('VARREDURA','INCREMENTAL','LEMBRETES','LIMPEZA','MANUAL'));
--   DROP TABLE licitacoes.contrato_carga_dia;
--   DROP TABLE licitacoes.contrato;
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- Global: contratos vigentes do PNCP, compartilhados por todas as contas
CREATE TABLE licitacoes.contrato (
  id                          BIGSERIAL PRIMARY KEY,
  numero_controle_pncp        VARCHAR(60) NOT NULL UNIQUE,
  numero_controle_compra      VARCHAR(60),
  ano_contrato                INT NOT NULL,
  sequencial_contrato         INT NOT NULL,
  numero_contrato             TEXT,
  processo                    TEXT,
  orgao_cnpj                  VARCHAR(14) NOT NULL,
  orgao_razao_social          TEXT,
  esfera                      VARCHAR(2),
  unidade_codigo              VARCHAR(30),
  unidade_nome                TEXT,
  uf                          CHAR(2),
  municipio_nome              TEXT,
  municipio_ibge              VARCHAR(7),
  categoria_id                SMALLINT,
  categoria_nome              TEXT,
  objeto                      TEXT NOT NULL,
  informacao_complementar     TEXT,
  -- Pessoa física: só o CPF mascarado (***.456.789-**); pessoa jurídica: o CNPJ.
  fornecedor_tipo_pessoa      VARCHAR(2),
  fornecedor_documento        VARCHAR(30),
  fornecedor_nome             TEXT,
  valor_inicial               NUMERIC(18,2),
  valor_global                NUMERIC(18,2),
  data_assinatura             DATE,
  vigencia_inicio             DATE NOT NULL,
  vigencia_fim_original       DATE NOT NULL,
  -- Vencimento atual: o fim original ou o do aditivo mais recente que muda a vigência.
  vencimento                  DATE NOT NULL,
  data_publicacao_pncp        TIMESTAMPTZ NOT NULL,
  data_atualizacao_pncp       TIMESTAMPTZ,
  data_atualizacao_global     TIMESTAMPTZ,
  aditivos                    JSONB,
  aditivos_referencia         TIMESTAMPTZ,
  hash_payload                CHAR(64) NOT NULL,
  busca_tsv                   TSVECTOR GENERATED ALWAYS AS (
                                to_tsvector('licitacoes.pt_unaccent',
                                  coalesce(objeto, '') || ' ' || coalesce(informacao_complementar, ''))
                              ) STORED,
  primeira_coleta_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_coleta_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_contrato_vigencia CHECK (vigencia_fim_original >= vigencia_inicio)
);

CREATE INDEX ix_contrato_tsv          ON licitacoes.contrato USING GIN (busca_tsv);
CREATE INDEX ix_contrato_vencimento   ON licitacoes.contrato (vencimento);
CREATE INDEX ix_contrato_uf           ON licitacoes.contrato (uf);
CREATE INDEX ix_contrato_municipio    ON licitacoes.contrato (municipio_ibge);
CREATE INDEX ix_contrato_orgao        ON licitacoes.contrato (orgao_cnpj);
CREATE INDEX ix_contrato_categoria    ON licitacoes.contrato (categoria_id);
CREATE INDEX ix_contrato_publicacao   ON licitacoes.contrato (data_publicacao_pncp DESC);
CREATE INDEX ix_contrato_valor        ON licitacoes.contrato (valor_global);
CREATE INDEX ix_contrato_fornecedor   ON licitacoes.contrato (fornecedor_documento);

-- Busca por número (parte B): número do contrato + ano, processo + ano, controle
-- PNCP do contrato e controle da compra de origem, pelos grupos de dígitos (0079).
CREATE INDEX ix_contrato_numero_grupos ON licitacoes.contrato
  USING GIN (licitacoes.fn_grupos_digitos(coalesce(numero_contrato, '') || ' ' || ano_contrato::text));

CREATE INDEX ix_contrato_processo_grupos ON licitacoes.contrato
  USING GIN (licitacoes.fn_grupos_digitos(coalesce(processo, '') || ' ' || ano_contrato::text));

CREATE INDEX ix_contrato_controle_grupos ON licitacoes.contrato
  USING GIN (licitacoes.fn_grupos_digitos(numero_controle_pncp));

CREATE INDEX ix_contrato_compra_grupos ON licitacoes.contrato
  USING GIN (licitacoes.fn_grupos_digitos(numero_controle_compra));

-- Global: dias de publicação que a carga inicial já concluiu (só o dia concluído ganha linha)
CREATE TABLE licitacoes.contrato_carga_dia (
  dia                   DATE PRIMARY KEY,
  concluido_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  registros_lidos       INT NOT NULL DEFAULT 0,
  gravados              INT NOT NULL DEFAULT 0,
  aditivos_consultados  INT NOT NULL DEFAULT 0
);

ALTER TABLE licitacoes.coleta_execucao DROP CONSTRAINT coleta_execucao_tipo_check;
ALTER TABLE licitacoes.coleta_execucao ADD CONSTRAINT coleta_execucao_tipo_check
  CHECK (tipo IN ('VARREDURA','INCREMENTAL','LEMBRETES','LIMPEZA','MANUAL',
                  'CONTRATOS_DIARIA','CONTRATOS_CARGA','CONTRATOS_LIMPEZA','CONTRATOS_AVISOS'));

-- O coletor roda com o usuário restrito licitacoes_coletor, se ele existir
-- (no banco local, o coletor usa o usuário do app).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licitacoes_coletor') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON licitacoes.contrato, licitacoes.contrato_carga_dia TO licitacoes_coletor;
    GRANT USAGE ON SEQUENCE licitacoes.contrato_id_seq TO licitacoes_coletor;
  END IF;
END
$$;
