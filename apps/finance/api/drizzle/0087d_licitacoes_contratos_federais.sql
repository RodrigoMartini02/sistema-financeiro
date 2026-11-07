-- 0087d: módulo de Licitações: contratos federais do Compras.gov.br (plano
-- .plans/licitacoes-contratos-federais.md, Parte 5).
--
-- Os contratos dos órgãos federais que o PNCP não tem entram no mesmo armazém
-- Parquet do R2 (conjuntos contratos, fornecedor e vigentes): não há tabela de
-- contratos no Postgres. Aqui entra só o que a coleta registra no banco:
--   coleta_execucao   o CHECK de tipo passa a aceitar as duas execuções novas
--                     (FEDERAIS_CARGA e FEDERAIS_CICLO). Sem esta migration, o
--                     INSERT do início da execução falha;
--   federal_orgao     o andamento por órgão federal (cerca de 1.159 linhas): o
--                     CNPJ do cadastro e o que o PNCP usa para ele, até que ano
--                     a carga já leu (só vale depois de publicada no armazém), se
--                     o órgão tem contrato na fonte e quando o ciclo de 7 dias
--                     leu os vigentes e os recentes dele pela última vez.
--
-- Tabela global, como as outras do módulo: o contrato público não tem conta e
-- não tem RLS (mesmo molde de contrato_carga_dia e resultado_carga_dia).
--
-- Só acrescenta: o código atual continua funcionando.
--
-- ORDEM: aplicar depois da 0087c e ANTES do deploy do código que a usa. Fica antes
-- da 0088, que espera a exportação do JSON dos editais: a ferramenta aplica em
-- ordem, e esta migration não depende dessa exportação (por isso a letra, como
-- nas 0087a, 0087b e 0087c). Aplicar fora das 06:00 de Brasília: a rotina diária
-- grava em coleta_execucao.
--
-- REVERSÃO (apagar as execuções dos tipos novos antes de restaurar o CHECK):
--   DROP TABLE licitacoes.federal_orgao;
--   DELETE FROM licitacoes.coleta_execucao WHERE tipo LIKE 'FEDERAIS\_%';
--   ALTER TABLE licitacoes.coleta_execucao DROP CONSTRAINT coleta_execucao_tipo_check;
--   ALTER TABLE licitacoes.coleta_execucao ADD CONSTRAINT coleta_execucao_tipo_check
--     CHECK (tipo IN ('VARREDURA','INCREMENTAL','LEMBRETES','LIMPEZA','MANUAL',
--                     'CONTRATOS_DIARIA','CONTRATOS_CARGA','CONTRATOS_LIMPEZA','CONTRATOS_AVISOS',
--                     'VENCEDORES_DIARIA','VENCEDORES_CARGA'));
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- Global: o andamento da leitura de cada órgão federal do Compras.gov.br
CREATE TABLE licitacoes.federal_orgao (
  codigo_orgao           VARCHAR(20) PRIMARY KEY,
  nome                   TEXT NOT NULL,
  -- CNPJ do cadastro da fonte (14 dígitos válidos); nulo se o cadastro não tem um
  cnpj_cadastro          CHAR(14) CHECK (cnpj_cadastro ~ '^[0-9]{14}$'),
  -- CNPJ do órgão como o PNCP o usa, aprendido dos números de controle do PNCP das próprias linhas dele
  cnpj_pncp              CHAR(14) CHECK (cnpj_pncp ~ '^[0-9]{14}$'),
  -- Nulo: ainda não medido. Verdadeiro: a fonte tem contrato dele (entra no ciclo). Falso: nenhum, remedido a cada 90 dias
  com_dados              BOOLEAN,
  -- Ano de início da vigência mais antigo que a carga já leu por inteiro e publicou (a carga vai do ano atual para trás)
  carga_ano_mais_antigo  SMALLINT,
  -- Última vez que o ciclo leu, por inteiro e publicado, os vigentes (pelo fim da vigência) e os iniciados nos últimos 120 dias
  ciclo_lido_em          TIMESTAMPTZ,
  -- Maior fim de vigência visto (só os plausíveis): até onde o ciclo procura os vigentes
  maior_fim_visto        DATE,
  -- Última medição de um órgão sem dado
  medido_em              TIMESTAMPTZ,
  -- Maior data e hora de inclusão vista nas linhas do órgão (Brasília, sem fuso): até quando a fonte tem dado dele
  ultima_inclusao        TIMESTAMP,
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Os tipos de execução cabem em varchar(20): FEDERAIS_CARGA e FEDERAIS_CICLO têm 14 caracteres.
ALTER TABLE licitacoes.coleta_execucao DROP CONSTRAINT coleta_execucao_tipo_check;
ALTER TABLE licitacoes.coleta_execucao ADD CONSTRAINT coleta_execucao_tipo_check
  CHECK (tipo IN ('VARREDURA','INCREMENTAL','LEMBRETES','LIMPEZA','MANUAL',
                  'CONTRATOS_DIARIA','CONTRATOS_CARGA','CONTRATOS_LIMPEZA','CONTRATOS_AVISOS',
                  'VENCEDORES_DIARIA','VENCEDORES_CARGA',
                  'FEDERAIS_CARGA','FEDERAIS_CICLO'));

-- O coletor roda com o usuário restrito licitacoes_coletor, se ele existir
-- (no banco local, o coletor usa o usuário do app).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licitacoes_coletor') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON licitacoes.federal_orgao TO licitacoes_coletor;
  END IF;
END
$$;
