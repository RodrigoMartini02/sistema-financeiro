-- 0075: módulo de Licitações: singular e plural na busca.
--
-- A configuração licitacoes.pt_unaccent tira o acento antes de reduzir a
-- palavra ao radical, e o radical do português depende do acento em alguns
-- sufixos: licitação ('licitaca') e licitações ('licitaco') não batiam
-- (medido em 05/10/2026; ver README do módulo). Esta migration reescreve
-- licitacoes.fn_tsquery_termos, com a mesma assinatura, para que cada termo
-- aceite também a outra forma de cada palavra (singular ou plural). Só a
-- consulta muda: a coluna busca_tsv e o índice ficam como estão.
--
-- Casos cobertos: -ção/-ções, -ão/-ões/-ães/-ãos, -al/-ais, -el/-éis,
-- -ol/-óis, -il/-is, -m/-ns, -r/-res, -z/-zes e, nas demais palavras de 4
-- letras ou mais, plural com -s (ex.: software/softwares). Uma forma só vira
-- alternativa quando o radical dela é diferente do da palavra original; o
-- plural regular (serviço/serviços) já batia e continua igual.
--
-- ORDEM: aplicar depois da 0074.
--
-- REVERSÃO:
--   recriar licitacoes.fn_tsquery_termos com o corpo da 0074;
--   DROP FUNCTION licitacoes.fn_tsquery_frase(TEXT);
--   DROP FUNCTION licitacoes.fn_variantes_palavra(TEXT);
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- Formas alternativas (singular ou plural) de uma palavra, sem acento e em
-- minúsculas, sem a própria palavra. Pode trazer forma que não existe na
-- língua (ex.: "iptus"): ela só amplia a consulta e não tira resultado.
-- Acentos e maiúsculas saem por translate, sem depender do locale do banco.
CREATE OR REPLACE FUNCTION licitacoes.fn_variantes_palavra(p_palavra TEXT)
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  w TEXT := lower(translate(
    p_palavra,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'));
BEGIN
  IF length(w) < 3 THEN
    RETURN '{}';
  END IF;
  RETURN CASE
    WHEN w LIKE '%coes' THEN ARRAY[left(w, -4) || 'cao']
    WHEN w LIKE '%cao' THEN ARRAY[left(w, -3) || 'coes']
    WHEN w LIKE '%oes' OR w LIKE '%aes' OR w LIKE '%aos' THEN ARRAY[left(w, -3) || 'ao']
    WHEN w LIKE '%ao' THEN ARRAY[left(w, -2) || 'oes', left(w, -2) || 'aes', left(w, -2) || 'aos']
    WHEN w LIKE '%ais' THEN ARRAY[left(w, -3) || 'al']
    WHEN w LIKE '%al' THEN ARRAY[left(w, -2) || 'ais']
    WHEN w LIKE '%eis' THEN ARRAY[left(w, -3) || 'el', left(w, -3) || 'il']
    WHEN w LIKE '%el' THEN ARRAY[left(w, -2) || 'eis']
    WHEN w LIKE '%ois' THEN ARRAY[left(w, -3) || 'ol']
    WHEN w LIKE '%ol' THEN ARRAY[left(w, -2) || 'ois']
    WHEN w LIKE '%il' THEN ARRAY[left(w, -2) || 'is', left(w, -2) || 'eis']
    WHEN w ~ '[^aeiou]is$' THEN ARRAY[left(w, -2) || 'il']
    WHEN w LIKE '%ns' THEN ARRAY[left(w, -2) || 'm']
    WHEN w LIKE '%m' THEN ARRAY[left(w, -1) || 'ns']
    WHEN w ~ '[rz]es$' THEN ARRAY[left(w, -2)]
    WHEN w ~ '[rz]$' THEN ARRAY[w || 'es']
    WHEN length(w) < 4 THEN '{}'::TEXT[]
    WHEN w LIKE '%s' THEN ARRAY[left(w, -1)]
    ELSE ARRAY[w || 's']
  END;
END $$;

-- Consulta de um termo com as alternativas de cada palavra: monta as frases
-- trocando cada palavra pelas formas de radical diferente e junta tudo com OU.
-- Cada frase passa pelo phraseto_tsquery, que mantém as regras de frase
-- (ordem, palavras de ligação e palavras compostas). No máximo 16 frases por
-- termo; acima disso, as palavras seguintes ficam só na forma original.
-- NULL quando nenhuma palavra do termo vira lexema (só palavras de ligação).
CREATE OR REPLACE FUNCTION licitacoes.fn_tsquery_frase(p_termo TEXT)
RETURNS tsquery LANGUAGE plpgsql IMMUTABLE AS $$
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
  frase_q tsquery;
  q tsquery;
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

  FOREACH frase IN ARRAY frases LOOP
    frase_q := phraseto_tsquery('licitacoes.pt_unaccent', frase);
    CONTINUE WHEN numnode(frase_q) = 0;
    q := CASE WHEN q IS NULL THEN frase_q ELSE q || frase_q END;
  END LOOP;
  RETURN q;
END $$;

-- Mesma assinatura e mesmo comportamento da 0074 (cada termo é uma frase; modo
-- OU ou E), agora com as alternativas de singular e plural de cada palavra.
CREATE OR REPLACE FUNCTION licitacoes.fn_tsquery_termos(p_termos TEXT[], p_modo TEXT DEFAULT 'OU')
RETURNS tsquery LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE q tsquery; termo_q tsquery; t TEXT;
BEGIN
  IF p_termos IS NULL OR cardinality(p_termos) = 0 THEN RETURN NULL; END IF;
  FOREACH t IN ARRAY p_termos LOOP
    CONTINUE WHEN btrim(t) = '';
    -- Termo só com palavras de ligação vira consulta vazia, como antes.
    termo_q := coalesce(licitacoes.fn_tsquery_frase(t), phraseto_tsquery('licitacoes.pt_unaccent', t));
    IF q IS NULL THEN
      q := termo_q;
    ELSIF p_modo = 'E' THEN
      q := q && termo_q;
    ELSE
      q := q || termo_q;
    END IF;
  END LOOP;
  RETURN q;
END $$;
