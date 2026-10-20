-- 0088: módulo de Licitações: o edital deixa de guardar o JSON bruto.
--
-- Parte 2 do plano .plans/licitacoes-base-nacional.md. Remove
-- licitacoes.edital.payload, o JSON completo de cada edital, que só servia de
-- cópia. O JSON novo vai para o arquivo no R2 desde a parte 1, e o já
-- gravado sai antes pelo comando `notices-payload-export`
-- (pncp/editais-legado/...). O código da parte 2 não usa mais a coluna: ele
-- funciona antes e depois desta migration.
--
-- TRAVA: se ainda houver payload gravado, a migration só segue com uma
-- exportação conferida NESTE banco (execução MANUAL com
-- detalhes.command = 'notices-payload-export' e detalhes.verified = true).
-- Sem isso, ela para com erro, e nada é removido.
--
-- ORDEM: depois da 0087, do deploy do código da parte 2 e da exportação
-- conferida, banco por banco. Aplicar fora das 06:00 de Brasília.
--
-- REVERSÃO: não há. O JSON removido fica só no R2 (pncp/editais-legado/). A
-- coluna pode voltar vazia com:
--   ALTER TABLE licitacoes.edital ADD COLUMN payload JSONB;
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM licitacoes.edital WHERE payload IS NOT NULL)
     AND NOT EXISTS (
       SELECT 1
         FROM licitacoes.coleta_execucao
        WHERE tipo = 'MANUAL'
          AND detalhes @> '{"command": "notices-payload-export", "verified": true}'::jsonb
     )
  THEN
    RAISE EXCEPTION '0088: o JSON dos editais ainda não foi exportado e conferido neste banco (rode notices-payload-export)';
  END IF;
END
$$;

ALTER TABLE licitacoes.edital DROP COLUMN payload;
