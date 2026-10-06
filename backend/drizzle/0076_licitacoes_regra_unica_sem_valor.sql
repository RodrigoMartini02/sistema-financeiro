-- 0076: módulo de Licitações: regra única dividida em duas partes e opção
-- "incluir edital sem valor informado" na busca salva.
--
-- A regra "edital bate com a busca" passa a ter duas partes:
--   licitacoes.fn_edital_atende_criterios: termos e exclusões (já como
--     tsquery), UF, município, órgão, modalidade, faixa de valor (com a
--     opção de incluir edital sem valor) e SRP;
--   licitacoes.fn_edital_aberto: prazo não vencido e situação 1 (divulgada).
-- licitacoes.fn_edital_bate (mesma assinatura) junta as duas para a busca
-- salva, e o coletor continua chamando só ela. A busca da tela (API) usa as
-- mesmas duas partes, com os critérios como parâmetros e "só abertos"
-- opcional. Não existe outra cópia da regra.
--
-- busca_salva.incluir_sem_valor: com faixa de valor, o edital sem valor
-- estimado só entra com a opção ligada; sem faixa de valor, entra sempre.
--
-- ORDEM: aplicar depois da 0075.
--
-- REVERSÃO:
--   recriar licitacoes.fn_edital_bate com o corpo da 0074;
--   DROP FUNCTION licitacoes.fn_edital_atende_criterios(licitacoes.edital, tsquery, tsquery, bpchar[], TEXT[], TEXT[], SMALLINT[], NUMERIC, NUMERIC, BOOLEAN, BOOLEAN);
--   DROP FUNCTION licitacoes.fn_edital_aberto(licitacoes.edital);
--   ALTER TABLE licitacoes.busca_salva DROP COLUMN incluir_sem_valor;
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE licitacoes.busca_salva
  ADD COLUMN incluir_sem_valor BOOLEAN NOT NULL DEFAULT false;

-- Critérios da busca. Consulta e exclusão chegam prontas (fn_tsquery_termos),
-- para serem calculadas uma vez por busca. Parâmetro NULL ou lista vazia =
-- sem esse filtro. UFs como bpchar[], para o índice de edital.uf servir.
CREATE OR REPLACE FUNCTION licitacoes.fn_edital_atende_criterios(
  e licitacoes.edital,
  p_consulta tsquery,
  p_exclusao tsquery,
  p_ufs bpchar[],
  p_municipios TEXT[],
  p_orgaos TEXT[],
  p_modalidades SMALLINT[],
  p_valor_min NUMERIC,
  p_valor_max NUMERIC,
  p_incluir_sem_valor BOOLEAN,
  p_apenas_srp BOOLEAN)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT
        (p_consulta IS NULL OR e.busca_tsv @@ p_consulta)
    AND (p_exclusao IS NULL OR NOT (e.busca_tsv @@ p_exclusao))
    AND (coalesce(cardinality(p_ufs), 0) = 0 OR e.uf = ANY (p_ufs))
    AND (coalesce(cardinality(p_municipios), 0) = 0 OR e.municipio_ibge = ANY (p_municipios))
    AND (coalesce(cardinality(p_orgaos), 0) = 0 OR e.orgao_cnpj = ANY (p_orgaos))
    AND (coalesce(cardinality(p_modalidades), 0) = 0 OR e.modalidade_id = ANY (p_modalidades))
    AND (
          (p_valor_min IS NULL AND p_valor_max IS NULL)
       OR (e.valor_total_estimado IS NULL AND coalesce(p_incluir_sem_valor, false))
       OR (e.valor_total_estimado IS NOT NULL
           AND (p_valor_min IS NULL OR e.valor_total_estimado >= p_valor_min)
           AND (p_valor_max IS NULL OR e.valor_total_estimado <= p_valor_max))
        )
    AND (p_apenas_srp IS NULL OR e.srp = p_apenas_srp)
$$;

-- Edital ainda recebendo proposta: prazo não vencido (sem prazo conta como
-- aberto) e situação 1 (divulgada; sem situação vale como 1).
CREATE OR REPLACE FUNCTION licitacoes.fn_edital_aberto(e licitacoes.edital)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT (e.data_encerramento_proposta IS NULL OR e.data_encerramento_proposta > now())
     AND coalesce(e.situacao_id, 1) = 1
$$;

CREATE OR REPLACE FUNCTION licitacoes.fn_edital_bate(e licitacoes.edital, b licitacoes.busca_salva)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT licitacoes.fn_edital_atende_criterios(
           e,
           licitacoes.fn_tsquery_termos(b.termos, b.modo_termos),
           licitacoes.fn_tsquery_termos(b.termos_exclusao, 'OU'),
           b.ufs,
           b.municipios_ibge::TEXT[],
           b.orgaos_cnpj::TEXT[],
           b.modalidades,
           b.valor_min,
           b.valor_max,
           b.incluir_sem_valor,
           b.apenas_srp)
     AND licitacoes.fn_edital_aberto(e)
$$;
