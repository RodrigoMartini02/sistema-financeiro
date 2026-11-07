-- Etapa C do plano .plans/unificar-anexos-no-r2.md: os anexos de despesas e receitas passaram a viver na tabela
-- `anexos` (arquivo no R2). Esta migration apaga as colunas antigas, em que o arquivo ficava dentro da própria linha
-- (jsonb, em base64):
--   despesas.anexos
--   receitas.anexos
--
-- ORDEM: depois do deploy do código da Etapa C, que não lê mais estas colunas (o código antigo quebra sem elas), e
-- depois da cópia dos anexos antigos, a partir de backend/ (com o ambiente da produção):
--   npx tsx scripts/attachments.ts migrate-entries --aplicar --confirmo   (copia; antes guarda o JSON original no R2)
--   npx tsx scripts/attachments.ts verify-entries                         (tem que terminar sem problemas)
-- Rode a cópia de novo logo depois do deploy: ela só copia o que falta (anexos incluídos no intervalo entre a primeira
-- cópia e o deploy).
--
-- TRAVA: se algum item copiável das listas antigas ainda não tem a linha correspondente na tabela `anexos`, a
-- migration para com erro e nada é removido. O id da linha copiada é o que o script calcula:
-- md5('legacy:<expense|income>:<id do lançamento>:<posição do item na lista, de 1 em diante>') em formato de UUID.
-- A trava só vê o banco: que o arquivo está no R2 e é igual ao original quem confere é o verify-entries.
-- Item sem nome ou sem conteúdo em base64 não é copiável (fica só no backup do JSON no R2) e não trava.
--
-- ESPAÇO: apagar a coluna não devolve de imediato o espaço do base64 já gravado nas linhas; ele é reaproveitado aos
-- poucos conforme as linhas forem atualizadas. Para devolver já, um VACUUM FULL em despesas e receitas (trava as
-- tabelas durante a execução; opcional).
--
-- REVERSÃO: o JSON original está no backup do R2 (backups/anexos-jsonb/), mas não há comando para recolocá-lo na coluna.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente pode estar apontando para producao.

DO $$
DECLARE
  faltando integer;
BEGIN
  SELECT count(*) INTO faltando
  FROM (
    SELECT 'expense' AS tipo, d.id AS lancamento_id, item.posicao, item.valor
    FROM despesas d
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.anexos) = 'array' THEN d.anexos ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS item(valor, posicao)
    UNION ALL
    SELECT 'income', r.id, item.posicao, item.valor
    FROM receitas r
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(r.anexos) = 'array' THEN r.anexos ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS item(valor, posicao)
  ) AS itens
  WHERE jsonb_typeof(itens.valor) = 'object'
    AND btrim(coalesce(itens.valor ->> 'nome', '')) <> ''
    AND coalesce(itens.valor ->> 'dados', '') ~ '^[A-Za-z0-9+/[:space:]]+={0,2}[[:space:]]*$'
    AND NOT EXISTS (
      SELECT 1 FROM anexos a
      WHERE a.id = md5('legacy:' || itens.tipo || ':' || itens.lancamento_id || ':' || itens.posicao)::uuid
    );
  IF faltando > 0 THEN
    RAISE EXCEPTION '0095: % anexo(s) das listas antigas ainda não foram copiados para a tabela anexos; rode migrate-entries --aplicar e verify-entries antes de apagar a coluna', faltando;
  END IF;
END
$$;

ALTER TABLE despesas DROP COLUMN anexos;
ALTER TABLE receitas DROP COLUMN anexos;
