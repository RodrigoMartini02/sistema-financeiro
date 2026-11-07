-- 0074: módulo de Licitações, parte 3 de 3: funções de busca.
--
-- licitacoes.fn_tsquery_termos monta a consulta de texto a partir de uma
-- lista de termos (cada termo vira uma frase), no modo OU ou E.
--
-- licitacoes.fn_edital_bate é a ÚNICA definição da regra "edital bate com a
-- busca salva": termos e exclusões (sem acento e com radical), UF, município,
-- órgão, modalidade, faixa de valor, SRP, edital ainda aberto e situação 1
-- (divulgada). Edital sem valor estimado fica de fora quando há filtro de
-- valor. O coletor e a API usam esta função; não existe outra cópia da regra.
--
-- ORDEM: aplicar depois da 0073 (usa os tipos das tabelas edital e busca_salva).
--
-- REVERSÃO:
--   DROP FUNCTION licitacoes.fn_edital_bate(licitacoes.edital, licitacoes.busca_salva);
--   DROP FUNCTION licitacoes.fn_tsquery_termos(TEXT[], TEXT);
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

CREATE OR REPLACE FUNCTION licitacoes.fn_tsquery_termos(p_termos TEXT[], p_modo TEXT DEFAULT 'OU')
RETURNS tsquery LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE q tsquery; t TEXT;
BEGIN
  IF p_termos IS NULL OR cardinality(p_termos) = 0 THEN RETURN NULL; END IF;
  FOREACH t IN ARRAY p_termos LOOP
    CONTINUE WHEN btrim(t) = '';
    IF q IS NULL THEN
      q := phraseto_tsquery('licitacoes.pt_unaccent', t);
    ELSIF p_modo = 'E' THEN
      q := q && phraseto_tsquery('licitacoes.pt_unaccent', t);
    ELSE
      q := q || phraseto_tsquery('licitacoes.pt_unaccent', t);
    END IF;
  END LOOP;
  RETURN q;
END $$;

CREATE OR REPLACE FUNCTION licitacoes.fn_edital_bate(e licitacoes.edital, b licitacoes.busca_salva)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT
        (cardinality(b.termos) = 0
           OR e.busca_tsv @@ licitacoes.fn_tsquery_termos(b.termos, b.modo_termos))
    AND (cardinality(b.termos_exclusao) = 0
           OR NOT (e.busca_tsv @@ licitacoes.fn_tsquery_termos(b.termos_exclusao, 'OU')))
    AND (cardinality(b.ufs) = 0             OR e.uf = ANY (b.ufs))
    AND (cardinality(b.municipios_ibge) = 0 OR e.municipio_ibge = ANY (b.municipios_ibge))
    AND (cardinality(b.orgaos_cnpj) = 0     OR e.orgao_cnpj = ANY (b.orgaos_cnpj))
    AND (cardinality(b.modalidades) = 0     OR e.modalidade_id = ANY (b.modalidades))
    AND (b.valor_min IS NULL OR e.valor_total_estimado >= b.valor_min)
    AND (b.valor_max IS NULL OR e.valor_total_estimado <= b.valor_max)
    AND (b.apenas_srp IS NULL OR e.srp = b.apenas_srp)
    AND (e.data_encerramento_proposta IS NULL OR e.data_encerramento_proposta > now())
    AND coalesce(e.situacao_id, 1) = 1
$$;
