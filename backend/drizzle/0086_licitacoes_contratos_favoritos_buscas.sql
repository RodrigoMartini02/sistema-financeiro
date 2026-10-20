-- 0086: módulo de Licitações: contratos a vencer, parte B (favoritos, buscas
-- salvas e avisos).
--
-- Plano .plans/licitacoes-contratos-a-vencer.md. Os contratos (0085) são dado
-- público; favoritos, buscas salvas e avisos são da pessoa, na conta:
--   favorito_contrato     favoritos de cada pessoa (como licitacoes.favorito);
--   busca_salva_contrato  buscas salvas de contratos, contadas à parte das de
--                         editais (limite de 50 por pessoa e conta no serviço);
--   notificacao           ganha contrato_id e os tipos CONTRATO_VENCE_90D,
--                         CONTRATO_VENCE_30D e CONTRATO_ALTERADO. O índice
--                         único dos contratos usa o vencimento como referência:
--                         um vencimento novo gera os avisos de novo.
--
-- Regra única, como na 0076: licitacoes.fn_contrato_atende_criterios (termos,
-- exclusões, UF, município, órgão, categoria, fornecedor e faixa de valor) e
-- licitacoes.fn_contrato_vigente (vencimento de hoje em diante, em Brasília).
-- A busca da tela, o total "vigentes agora" das buscas salvas e os avisos
-- chamam as duas, com a consulta de texto calculada uma vez por busca. Por
-- isso não há uma fn_contrato_bate: ela recalcularia a consulta a cada contrato.
--
-- Só acrescenta: o código atual continua funcionando.
--
-- ORDEM: aplicar depois da 0085 e ANTES do deploy do código que a usa (a busca,
-- o detalhe e a limpeza dos contratos consultam favorito_contrato). Aplicar
-- fora das 06:00 de Brasília: a rotina diária grava em notificacao.
--
-- REVERSÃO:
--   DROP FUNCTION licitacoes.fn_contrato_atende_criterios(licitacoes.contrato, tsquery, tsquery, bpchar[], TEXT[], TEXT[], SMALLINT[], TEXT[], NUMERIC, NUMERIC, BOOLEAN);
--   DROP FUNCTION licitacoes.fn_contrato_vigente(licitacoes.contrato);
--   DELETE FROM licitacoes.notificacao WHERE contrato_id IS NOT NULL;
--   DROP INDEX licitacoes.ux_notificacao_contrato_unica;
--   DROP INDEX licitacoes.ix_notificacao_contrato;
--   ALTER TABLE licitacoes.notificacao DROP CONSTRAINT notificacao_tipo_check;
--   ALTER TABLE licitacoes.notificacao ADD CONSTRAINT notificacao_tipo_check
--     CHECK (tipo IN ('NOVO_EDITAL','EDITAL_ALTERADO','PRAZO_3D','PRAZO_1D'));
--   ALTER TABLE licitacoes.notificacao DROP CONSTRAINT ck_notificacao_edital_ou_contrato;
--   ALTER TABLE licitacoes.notificacao DROP COLUMN contrato_id;
--   DROP TABLE licitacoes.busca_salva_contrato;
--   DROP TABLE licitacoes.favorito_contrato;
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- Favoritos de contratos de cada pessoa na conta: só ela vê os seus.
CREATE TABLE licitacoes.favorito_contrato (
  conta_id     INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id   INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  contrato_id  BIGINT  NOT NULL REFERENCES licitacoes.contrato(id) ON DELETE CASCADE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, usuario_id, contrato_id)
);

-- A limpeza, o detalhe e os avisos procuram por contrato.
CREATE INDEX ix_favorito_contrato_contrato ON licitacoes.favorito_contrato (contrato_id);

-- Buscas salvas de contratos: os critérios da tela, menos número, ano e "Só favoritos".
CREATE TABLE licitacoes.busca_salva_contrato (
  id                 BIGSERIAL PRIMARY KEY,
  conta_id           INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id         INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nome               VARCHAR(120) NOT NULL,
  termos             TEXT[]   NOT NULL DEFAULT '{}',
  modo_termos        VARCHAR(3) NOT NULL DEFAULT 'OU' CHECK (modo_termos IN ('OU','E')),
  termos_exclusao    TEXT[]   NOT NULL DEFAULT '{}',
  ufs                CHAR(2)[] NOT NULL DEFAULT '{}',
  municipios_ibge    VARCHAR(7)[] NOT NULL DEFAULT '{}',
  orgaos_cnpj        VARCHAR(14)[] NOT NULL DEFAULT '{}',
  categorias         SMALLINT[] NOT NULL DEFAULT '{}',
  fornecedores_cnpj  VARCHAR(14)[] NOT NULL DEFAULT '{}',
  valor_min          NUMERIC(18,2),
  valor_max          NUMERIC(18,2),
  -- Com faixa de valor, contrato sem valor global só entra com a opção ligada (como na 0076).
  incluir_sem_valor  BOOLEAN NOT NULL DEFAULT false,
  notificar          BOOLEAN NOT NULL DEFAULT true,
  ativa              BOOLEAN NOT NULL DEFAULT true,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_busca_contrato_conta_usuario ON licitacoes.busca_salva_contrato (conta_id, usuario_id) WHERE ativa;

-- Avisos de contratos: um aviso é de um edital ou de um contrato, nunca dos dois.
ALTER TABLE licitacoes.notificacao
  ADD COLUMN contrato_id BIGINT REFERENCES licitacoes.contrato(id) ON DELETE CASCADE,
  ADD CONSTRAINT ck_notificacao_edital_ou_contrato CHECK (edital_id IS NULL OR contrato_id IS NULL);

ALTER TABLE licitacoes.notificacao DROP CONSTRAINT notificacao_tipo_check;
ALTER TABLE licitacoes.notificacao ADD CONSTRAINT notificacao_tipo_check
  CHECK (tipo IN ('NOVO_EDITAL','EDITAL_ALTERADO','PRAZO_3D','PRAZO_1D',
                  'CONTRATO_VENCE_90D','CONTRATO_VENCE_30D','CONTRATO_ALTERADO'));

-- Sem repetir: referência = vencimento (AAAA-MM-DD).
CREATE UNIQUE INDEX ux_notificacao_contrato_unica
  ON licitacoes.notificacao (conta_id, usuario_id, tipo, contrato_id, coalesce(referencia, ''))
  WHERE contrato_id IS NOT NULL;

-- A limpeza diária apaga contratos vencidos, e os avisos deles saem junto (ON
-- DELETE CASCADE): sem este índice, cada contrato apagado leria a tabela inteira.
CREATE INDEX ix_notificacao_contrato ON licitacoes.notificacao (contrato_id) WHERE contrato_id IS NOT NULL;

-- Critérios da busca de contratos. Consulta e exclusão chegam prontas
-- (fn_tsquery_termos), para serem calculadas uma vez por busca. Parâmetro NULL
-- ou lista vazia = sem esse filtro. UFs como bpchar[], para o índice de uf servir.
CREATE FUNCTION licitacoes.fn_contrato_atende_criterios(
  c licitacoes.contrato,
  p_consulta tsquery,
  p_exclusao tsquery,
  p_ufs bpchar[],
  p_municipios TEXT[],
  p_orgaos TEXT[],
  p_categorias SMALLINT[],
  p_fornecedores TEXT[],
  p_valor_min NUMERIC,
  p_valor_max NUMERIC,
  p_incluir_sem_valor BOOLEAN)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT
        (p_consulta IS NULL OR c.busca_tsv @@ p_consulta)
    AND (p_exclusao IS NULL OR NOT (c.busca_tsv @@ p_exclusao))
    AND (coalesce(cardinality(p_ufs), 0) = 0 OR c.uf = ANY (p_ufs))
    AND (coalesce(cardinality(p_municipios), 0) = 0 OR c.municipio_ibge = ANY (p_municipios))
    AND (coalesce(cardinality(p_orgaos), 0) = 0 OR c.orgao_cnpj = ANY (p_orgaos))
    AND (coalesce(cardinality(p_categorias), 0) = 0 OR c.categoria_id = ANY (p_categorias))
    AND (coalesce(cardinality(p_fornecedores), 0) = 0 OR c.fornecedor_documento = ANY (p_fornecedores))
    AND (
          (p_valor_min IS NULL AND p_valor_max IS NULL)
       OR (c.valor_global IS NULL AND coalesce(p_incluir_sem_valor, false))
       OR (c.valor_global IS NOT NULL
           AND (p_valor_min IS NULL OR c.valor_global >= p_valor_min)
           AND (p_valor_max IS NULL OR c.valor_global <= p_valor_max))
        )
$$;

-- Contrato vigente: vencimento de hoje em diante, pelo dia de Brasília.
CREATE FUNCTION licitacoes.fn_contrato_vigente(c licitacoes.contrato)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT c.vencimento >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;

-- O coletor roda com o usuário restrito licitacoes_coletor, se ele existir
-- (no banco local, o coletor usa o usuário do app): ele lê favoritos e buscas
-- salvas para a limpeza e os avisos, e grava os avisos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licitacoes_coletor') THEN
    GRANT SELECT ON licitacoes.favorito_contrato, licitacoes.busca_salva_contrato TO licitacoes_coletor;
    GRANT SELECT, INSERT ON licitacoes.notificacao TO licitacoes_coletor;
    GRANT EXECUTE ON FUNCTION licitacoes.fn_contrato_atende_criterios(licitacoes.contrato, tsquery, tsquery, bpchar[], TEXT[], TEXT[], SMALLINT[], TEXT[], NUMERIC, NUMERIC, BOOLEAN) TO licitacoes_coletor;
    GRANT EXECUTE ON FUNCTION licitacoes.fn_contrato_vigente(licitacoes.contrato) TO licitacoes_coletor;
  END IF;
END
$$;
