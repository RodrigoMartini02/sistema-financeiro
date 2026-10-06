-- 0077: módulo de Licitações: ajuste das variantes de singular e plural (0075).
--
-- Na 0075, palavra terminada em -res só gerava a forma sem -es
-- (computadores → computador), e terminada em -r ou -z só gerava a forma com
-- -es (computador → computadores). Palavra estrangeira com plural em -s ficava
-- de fora: "softwares" não achava "software". Agora as duas formas são
-- tentadas (-es e -s); como antes, só vira alternativa a forma de radical
-- diferente. Conferido no banco local com 49 pares de singular e plural.
--
-- ORDEM: aplicar depois da 0076.
--
-- REVERSÃO: recriar licitacoes.fn_variantes_palavra com o corpo da 0075.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

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
    WHEN w ~ '[rz]es$' THEN ARRAY[left(w, -2), left(w, -1)]
    WHEN w ~ '[rz]$' THEN ARRAY[w || 'es', w || 's']
    WHEN length(w) < 4 THEN '{}'::TEXT[]
    WHEN w LIKE '%s' THEN ARRAY[left(w, -1)]
    ELSE ARRAY[w || 's']
  END;
END $$;
