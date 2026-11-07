-- Etapa B do plano .plans/unificar-anexos-no-r2.md: os anexos de contratos e as imagens do catálogo passaram a
-- viver na tabela `anexos` (arquivo no R2). Esta migration apaga as duas tabelas antigas:
--   comercial.anexos          anexos de contrato, com o arquivo em uploads/contratos no disco do Render
--   catalogo.produto_imagens  imagens de produto, com o arquivo em uploads/catalogo no disco do Render
--
-- ORDEM: depois do deploy do código da Etapa B, que não lê mais estas tabelas. O código antigo quebra sem elas.
--
-- TRAVA: se ainda houver anexo de contrato no formato antigo, a migration para com erro e nada é removido (na
-- produção não havia nenhum em 03/11/2026). As imagens de produto antigas NÃO têm trava: o dono reenvia as
-- imagens pela tela nova, e os arquivos antigos ficam no disco do Render até a Etapa D, que remove o disco.
--
-- REVERSÃO: não há para as linhas apagadas.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente pode estar apontando para producao.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM comercial.anexos) THEN
    RAISE EXCEPTION '0094: ainda há anexos de contrato no formato antigo (comercial.anexos); copie-os para a tabela anexos antes de apagar';
  END IF;
END
$$;

DROP TABLE comercial.anexos;
DROP TABLE catalogo.produto_imagens;
