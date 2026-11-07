-- 0087: módulo de Licitações: base enxuta e contratos de todos os tipos.
--
-- Parte 2 do plano .plans/licitacoes-base-nacional.md. Os contratos do PNCP
-- passam a entrar de todos os tipos (contrato, empenho, carta contrato, termo
-- de adesão e outros), vigentes e encerrados, e a limpeza dos vencidos acaba.
--   contrato.tipo_contrato_id e tipo_contrato_nome  o tipo do PNCP
--                       (tipoContrato), com índice para o filtro da tela. Os
--                       contratos gravados antes ficam com o tipo 1: só o termo
--                       inicial entrava;
--   contrato.vigencia_fim_original e vencimento  aceitam NULL: o contrato sem
--                       data de fim, ou com vigência fora do normal (mais de
--                       35 anos), entra sem vencimento;
--   edital.payload      aceita NULL: o coletor deixa de gravar o JSON bruto,
--                       que vai para o arquivo no R2 (parte 1). A coluna sai na
--                       0088, depois da exportação do que já está gravado.
--
-- licitacoes.fn_contrato_vigente não muda: sem vencimento, a comparação dá
-- NULL, e o WHERE trata NULL como falso, então o contrato fica fora dos
-- vigentes. Um coalesce ali impediria o uso do índice de vencimento na busca.
--
-- Só acrescenta ou afrouxa: o código atual continua funcionando.
--
-- ORDEM: aplicar depois da 0086 e ANTES do deploy do código que a usa (o
-- coletor grava o tipo, vencimento nulo e edital sem payload). Aplicar fora
-- das 06:00 de Brasília: a rotina diária grava em contrato e em edital.
--
-- REVERSÃO (os contratos sem vencimento saem antes de voltar o NOT NULL; o
-- JSON dos editais gravados sem ele fica só no R2):
--   DELETE FROM licitacoes.contrato WHERE vencimento IS NULL OR vigencia_fim_original IS NULL;
--   ALTER TABLE licitacoes.contrato ALTER COLUMN vencimento SET NOT NULL,
--     ALTER COLUMN vigencia_fim_original SET NOT NULL;
--   DROP INDEX licitacoes.ix_contrato_tipo;
--   ALTER TABLE licitacoes.contrato DROP COLUMN tipo_contrato_nome, DROP COLUMN tipo_contrato_id;
--   UPDATE licitacoes.edital SET payload = '{}'::jsonb WHERE payload IS NULL;
--   ALTER TABLE licitacoes.edital ALTER COLUMN payload SET NOT NULL;
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE licitacoes.contrato
  ADD COLUMN tipo_contrato_id   SMALLINT,
  ADD COLUMN tipo_contrato_nome TEXT;

-- Antes desta migration, só o "Contrato (termo inicial)" entrava.
UPDATE licitacoes.contrato
   SET tipo_contrato_id = 1, tipo_contrato_nome = 'Contrato (termo inicial)'
 WHERE tipo_contrato_id IS NULL;

CREATE INDEX ix_contrato_tipo ON licitacoes.contrato (tipo_contrato_id);

ALTER TABLE licitacoes.contrato
  ALTER COLUMN vigencia_fim_original DROP NOT NULL,
  ALTER COLUMN vencimento DROP NOT NULL;

ALTER TABLE licitacoes.edital ALTER COLUMN payload DROP NOT NULL;
