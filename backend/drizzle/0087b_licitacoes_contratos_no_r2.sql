-- 0087b: módulo de Licitações: os contratos saem do Postgres e vão para o R2
-- (plano .plans/licitacoes-contratos-no-r2.md, Parte R2).
--
-- Os contratos passam a viver em arquivos Parquet no R2, lidos com o DuckDB
-- (Parte R1), e o número de controle do PNCP é o identificador deles. No
-- Postgres ficam só os dados de cada conta e os dias da carga:
--   favorito_contrato     contrato_chave (número de controle) no lugar de
--                         contrato_id; chave primária (conta, pessoa, chave) e
--                         índice por chave (CONTRATO_ALTERADO procura quem
--                         favoritou o contrato que mudou);
--   notificacao           contrato_chave no lugar de contrato_id (e o link do
--                         aviso, com a chave no lugar do id), com o mesmo CHECK
--                         (aviso de edital ou de contrato, nunca dos dois) e o
--                         mesmo índice único (conta, pessoa, tipo, chave,
--                         referência). O índice só por contrato não volta: ele
--                         existia para a cascata da chave estrangeira, que sai
--                         com a tabela de contratos;
--   busca_salva_contrato  total_vigentes e total_em: o total "vigentes agora"
--                         é contado no armazém ao salvar e na rotina diária, e
--                         a lista mostra o gravado e a data da contagem;
--   contrato              sai, com licitacoes.fn_contrato_atende_criterios e
--                         licitacoes.fn_contrato_vigente (a regra dos critérios
--                         fica em contractStore/criteria.ts). Os contratos
--                         estão nos arquivos do R2: confira o armazém antes
--                         (versão publicada e totais no manifesto);
--   contrato_carga_dia    fica: os dias da carga continuam no Postgres.
--
-- As chaves dos favoritos e dos avisos são preenchidas a partir de
-- licitacoes.contrato antes de a coluna sair. A chave estrangeira da 0086
-- garante que todo favorito e todo aviso de contrato tem o contrato na tabela,
-- então nenhuma linha se perde: elas só mudam de coluna.
--
-- O código que está na main não usa contratos: esta migration vem depois da
-- 0085 a 0087a, na mesma janela, e antes do merge desta parte.
--
-- ORDEM: aplicar depois da 0087a, ANTES do deploy do código que a usa e fora
-- das 06:00 de Brasília: a rotina diária grava em notificacao. Antes de
-- aplicar, os contratos precisam estar no armazém (a carga ou a importação):
-- depois, a tabela não existe mais e não há como recuperar os contratos dela.
--
-- REVERSÃO (os dados da tabela de contratos não voltam sozinhos: recarregar
-- pela carga do coletor, ou do armazém):
--   1. recriar licitacoes.contrato como na 0085 + 0087 e as duas funções como
--      na 0086;
--   2. ALTER TABLE licitacoes.busca_salva_contrato DROP COLUMN total_vigentes,
--      DROP COLUMN total_em;
--   3. favorito_contrato e notificacao: recriar contrato_id, preencher pelo
--      numero_controle_pncp e voltar a chave primária, o CHECK, os índices e a
--      chave estrangeira da 0086; depois DROP COLUMN contrato_chave.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- Favoritos de contratos: a chave no lugar do id.
ALTER TABLE licitacoes.favorito_contrato ADD COLUMN contrato_chave VARCHAR(60);

UPDATE licitacoes.favorito_contrato f
   SET contrato_chave = c.numero_controle_pncp
  FROM licitacoes.contrato c
 WHERE c.id = f.contrato_id;

ALTER TABLE licitacoes.favorito_contrato ALTER COLUMN contrato_chave SET NOT NULL;
ALTER TABLE licitacoes.favorito_contrato DROP CONSTRAINT favorito_contrato_pkey;
DROP INDEX licitacoes.ix_favorito_contrato_contrato;
ALTER TABLE licitacoes.favorito_contrato DROP COLUMN contrato_id;
ALTER TABLE licitacoes.favorito_contrato ADD PRIMARY KEY (conta_id, usuario_id, contrato_chave);
CREATE INDEX ix_favorito_contrato_chave ON licitacoes.favorito_contrato (contrato_chave);

-- Avisos de contratos: a chave no lugar do id.
ALTER TABLE licitacoes.notificacao ADD COLUMN contrato_chave VARCHAR(60);

-- O link do aviso trazia o id (/contratos/45) e passa a trazer a chave, com a
-- barra codificada como o app faz (encodeURIComponent: "/" vira "%2F").
UPDATE licitacoes.notificacao n
   SET contrato_chave = c.numero_controle_pncp,
       link = '/contratos/' || replace(c.numero_controle_pncp, '/', '%2F')
  FROM licitacoes.contrato c
 WHERE c.id = n.contrato_id;

DROP INDEX licitacoes.ux_notificacao_contrato_unica;
DROP INDEX licitacoes.ix_notificacao_contrato;
ALTER TABLE licitacoes.notificacao DROP CONSTRAINT ck_notificacao_edital_ou_contrato;
ALTER TABLE licitacoes.notificacao DROP COLUMN contrato_id;
ALTER TABLE licitacoes.notificacao
  ADD CONSTRAINT ck_notificacao_edital_ou_contrato CHECK (edital_id IS NULL OR contrato_chave IS NULL);

-- Sem repetir: referência = vencimento (AAAA-MM-DD).
CREATE UNIQUE INDEX ux_notificacao_contrato_unica
  ON licitacoes.notificacao (conta_id, usuario_id, tipo, contrato_chave, coalesce(referencia, ''))
  WHERE contrato_chave IS NOT NULL;

-- Buscas salvas: o total de vigentes que batem e quando foi contado.
ALTER TABLE licitacoes.busca_salva_contrato
  ADD COLUMN total_vigentes INTEGER,
  ADD COLUMN total_em TIMESTAMPTZ;

-- Os contratos saem (as funções dependem do tipo da tabela, então saem antes).
DROP FUNCTION licitacoes.fn_contrato_atende_criterios(licitacoes.contrato, tsquery, tsquery, bpchar[], TEXT[], TEXT[], SMALLINT[], TEXT[], NUMERIC, NUMERIC, BOOLEAN);
DROP FUNCTION licitacoes.fn_contrato_vigente(licitacoes.contrato);
DROP TABLE licitacoes.contrato;

-- O coletor roda com o usuário restrito licitacoes_coletor, se ele existir (no
-- banco local, o coletor usa o usuário do app). Os privilégios sobre a tabela e
-- as funções que saíram saem com elas; o que sobra é o total das buscas salvas,
-- que a rotina diária atualiza (só estas duas colunas).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licitacoes_coletor') THEN
    GRANT UPDATE (total_vigentes, total_em) ON licitacoes.busca_salva_contrato TO licitacoes_coletor;
  END IF;
END
$$;
