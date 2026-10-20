-- 0087a: módulo de Licitações: as frases de cada termo da busca numa função
-- própria (plano .plans/licitacoes-contratos-no-r2.md, Parte R1).
--
-- O armazém de contratos no R2 busca no texto pela sequência de radicais de
-- cada frase (contractStore/textSearch.ts), e precisa das mesmas frases que
-- licitacoes.fn_tsquery_frase monta: o termo com as formas de singular e
-- plural de cada palavra (0075 e 0077), no máximo 16. Esta migration separa a
-- montagem das frases em licitacoes.fn_frases_termo, com o mesmo código, e
-- fn_tsquery_frase passa a usá-la. A busca dos editais não muda (a mesma
-- consulta para o mesmo termo), e a regra das formas continua num lugar só.
--
-- Só funções: nenhuma tabela muda, e o código que está na main continua
-- funcionando antes e depois.
--
-- ORDEM: aplicar depois da 0087 e antes do deploy do código que busca no
-- armazém (Parte R2). Fica antes da 0088 porque a ferramenta aplica em ordem, e
-- a 0088 espera a exportação do JSON dos editais.
--
-- REVERSÃO:
--   recriar licitacoes.fn_tsquery_frase com o corpo da 0075;
--   DROP FUNCTION licitacoes.fn_frases_termo(TEXT);
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- Frases de um termo: cada palavra trocada pelas formas de radical diferente
-- (fn_variantes_palavra), em todas as combinações. No máximo 16 frases; acima
-- disso, as palavras seguintes ficam só na forma original. Palavra de ligação
-- não ganha alternativa. O código é o da fn_tsquery_frase da 0075.
CREATE OR REPLACE FUNCTION licitacoes.fn_frases_termo(p_termo TEXT)
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  max_frases CONSTANT INTEGER := 16;
  frases TEXT[] := ARRAY[''];
  novas TEXT[];
  formas TEXT[];
  radicais TEXT[];
  partes TEXT[];
  palavra TEXT;
  variante TEXT;
  radical TEXT;
  frase TEXT;
  forma TEXT;
BEGIN
  FOREACH palavra IN ARRAY regexp_split_to_array(btrim(p_termo), '\s+') LOOP
    formas := ARRAY[palavra];
    -- Letras no meio, pontuação só nas pontas; palavra composta (e-SUS) fica como está.
    partes := regexp_match(palavra, '^([^a-zA-ZÀ-ÖØ-öø-ÿ]*)([a-zA-ZÀ-ÖØ-öø-ÿ]+)([^a-zA-ZÀ-ÖØ-öø-ÿ]*)$');
    IF partes IS NOT NULL THEN
      radical := array_to_string(tsvector_to_array(to_tsvector('licitacoes.pt_unaccent', partes[2])), ' ');
      -- Palavra de ligação não tem radical e não ganha alternativa.
      IF radical <> '' THEN
        radicais := ARRAY[radical];
        FOREACH variante IN ARRAY licitacoes.fn_variantes_palavra(partes[2]) LOOP
          radical := array_to_string(tsvector_to_array(to_tsvector('licitacoes.pt_unaccent', variante)), ' ');
          IF radical <> '' AND NOT (radical = ANY (radicais)) THEN
            radicais := radicais || radical;
            formas := formas || (partes[1] || variante || partes[3]);
          END IF;
        END LOOP;
      END IF;
    END IF;

    IF cardinality(frases) * cardinality(formas) > max_frases THEN
      formas := ARRAY[palavra];
    END IF;
    novas := '{}';
    FOREACH frase IN ARRAY frases LOOP
      FOREACH forma IN ARRAY formas LOOP
        novas := novas || btrim(frase || ' ' || forma);
      END LOOP;
    END LOOP;
    frases := novas;
  END LOOP;
  RETURN frases;
END $$;

-- Consulta de um termo: as frases de fn_frases_termo juntas com OU, cada uma
-- pelo phraseto_tsquery (que mantém as regras de frase: ordem, palavras de
-- ligação e palavras compostas). NULL quando nenhuma frase vira lexema (só
-- palavras de ligação). Mesmo resultado da 0075.
CREATE OR REPLACE FUNCTION licitacoes.fn_tsquery_frase(p_termo TEXT)
RETURNS tsquery LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  frase TEXT;
  frase_q tsquery;
  q tsquery;
BEGIN
  FOREACH frase IN ARRAY licitacoes.fn_frases_termo(p_termo) LOOP
    frase_q := phraseto_tsquery('licitacoes.pt_unaccent', frase);
    CONTINUE WHEN numnode(frase_q) = 0;
    q := CASE WHEN q IS NULL THEN frase_q ELSE q || frase_q END;
  END LOOP;
  RETURN q;
END $$;

-- O coletor roda com o usuário restrito licitacoes_coletor, se ele existir: os
-- avisos de contratos montam as frases das buscas salvas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licitacoes_coletor') THEN
    GRANT EXECUTE ON FUNCTION licitacoes.fn_frases_termo(TEXT) TO licitacoes_coletor;
  END IF;
END
$$;
