-- 0001: baseline do banco de Licitações (projeto "tenders" do runner de migrations).
--
-- O banco de Licitações nasce vazio, só com a estrutura. Este arquivo reúne:
--   1. as extensões que a busca de editais usa (pg_trgm e unaccent);
--   2. a schema_migrations deste banco, que o runner preenche logo depois de aplicar este arquivo;
--   3. a identidade própria de Licitações: usuarios, contas, conta_membros e codigo_recuperacao
--      (as tabelas de Finanças reduzidas ao que Licitações usa, mais a de recuperação de senha, que em
--      Finanças mora numa coluna JSON legada); só conta de empresa (CNPJ);
--   4. o schema licitacoes: tabelas, funções, índices e chaves estrangeiras, como estavam no banco de Finanças
--      depois das migrations 0072 a 0088 de backend/drizzle (dump de estrutura do pg_dump 18.3, sem dados).
--
-- As migrations 0072 a 0088 de Finanças ficam como histórico; esta é a primeira da sequência de Licitações.
--
-- Aplicar com o runner (cria a schema_migrations e já registra esta migration):
--   npm --prefix backend run migrations:aplicar -- 0001 --banco local --projeto tenders
--   npm --prefix backend run migrations:aplicar -- 0001 --banco producao --projeto tenders --confirmo
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente pode estar apontando para producao.
-- Nao editar depois de aplicada: o runner guarda a assinatura do arquivo.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Identidade -----------------------------------------------------------------------------------------------

CREATE TABLE public.usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  sobrenome VARCHAR(255),
  email VARCHAR(255) NOT NULL UNIQUE,
  documento VARCHAR(20),
  senha VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'titular' CHECK (tipo IN ('membro', 'titular', 'admin')),
  status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
  google_id VARCHAR(255),
  telefone VARCHAR(20),
  data_nascimento DATE,
  data_cadastro TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_usuarios_documento ON public.usuarios (documento);

-- O CPF/CNPJ é único entre os acessos próprios (titular e admin) e pode repetir em acesso de colaborador, que é
-- um login separado (a regra "não repetir na mesma conta" fica no código).
CREATE UNIQUE INDEX usuarios_documento_acesso_proprio_unique
  ON public.usuarios (documento)
  WHERE documento IS NOT NULL AND tipo <> 'membro';

CREATE TABLE public.contas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL DEFAULT 'empresa' CHECK (tipo = 'empresa'),
  nome VARCHAR(100) NOT NULL,
  documento VARCHAR(20),
  ativo BOOLEAN DEFAULT true,
  eh_padrao BOOLEAN NOT NULL DEFAULT false,
  razao_social VARCHAR(150),
  nome_fantasia VARCHAR(150),
  enquadramento VARCHAR(10) CHECK (enquadramento IN ('MEI', 'ME', 'EPP', 'SLU', 'EIRELI', 'LTDA', 'SA')),
  data_abertura DATE,
  data_criacao TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_contas_usuario ON public.contas (usuario_id);

-- Um usuário só pode ser colaborador de uma conta por vez (usuario_id único).
CREATE TABLE public.conta_membros (
  id SERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES public.contas (id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES public.usuarios (id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  data_criacao TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_conta_membros_conta ON public.conta_membros (conta_id);

-- Código de recuperação de senha: um por usuário, válido por 15 minutos e com no máximo 3 erros. Cada pedido de
-- conferência reserva uma tentativa antes de comparar (UPDATE condicional), e o acerto devolve a tentativa.
CREATE TABLE public.codigo_recuperacao (
  usuario_id INTEGER PRIMARY KEY REFERENCES public.usuarios (id) ON DELETE CASCADE,
  codigo VARCHAR(6) NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0
);

-- Schema licitacoes ----------------------------------------------------------------------------------------

--
-- PostgreSQL database dump
--

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: licitacoes; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA licitacoes;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: conta_habilitada; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.conta_habilitada (
    conta_id integer NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    habilitada_por integer,
    habilitada_em timestamp with time zone DEFAULT now() NOT NULL,
    tipo_acesso character varying(12) DEFAULT 'cortesia'::character varying NOT NULL,
    teste_ate timestamp with time zone,
    pago_ate timestamp with time zone,
    recorrente_id character varying(100),
    usuarios_cobrados integer,
    ultimo_pagamento_id character varying(40),
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conta_habilitada_tipo_acesso_check CHECK (((tipo_acesso)::text = ANY ((ARRAY['cortesia'::character varying, 'assinatura'::character varying])::text[])))
);

--
-- Name: fn_conta_com_acesso(licitacoes.conta_habilitada); Type: FUNCTION; Schema: licitacoes; Owner: -
--

CREATE FUNCTION licitacoes.fn_conta_com_acesso(h licitacoes.conta_habilitada) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT h.ativa AND (
    h.tipo_acesso = 'cortesia'
    OR h.recorrente_id IS NOT NULL
    OR coalesce(greatest(h.teste_ate, h.pago_ate) > now(), false)
  )
$$;

--
-- Name: pt_unaccent; Type: TEXT SEARCH CONFIGURATION; Schema: licitacoes; Owner: -
--

CREATE TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent (
    PARSER = pg_catalog."default" );

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR asciiword WITH portuguese_stem;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR word WITH public.unaccent, portuguese_stem;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR numword WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR email WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR url WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR host WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR sfloat WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR version WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR hword_numpart WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR hword_part WITH public.unaccent, portuguese_stem;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR hword_asciipart WITH portuguese_stem;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR numhword WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR asciihword WITH portuguese_stem;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR hword WITH public.unaccent, portuguese_stem;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR url_path WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR file WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR "float" WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR "int" WITH simple;

ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
    ADD MAPPING FOR uint WITH simple;

--
-- Name: edital; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.edital (
    id bigint NOT NULL,
    numero_controle_pncp character varying(60) NOT NULL,
    orgao_cnpj character varying(14),
    orgao_razao_social text,
    esfera character varying(2),
    unidade_codigo character varying(30),
    unidade_nome text,
    uf character(2),
    municipio_nome text,
    municipio_ibge character varying(7),
    modalidade_id smallint,
    modalidade_nome text,
    modo_disputa_id smallint,
    modo_disputa_nome text,
    situacao_id smallint,
    situacao_nome text,
    ano_compra integer,
    sequencial_compra integer,
    numero_compra text,
    processo text,
    objeto text NOT NULL,
    informacao_complementar text,
    srp boolean,
    valor_total_estimado numeric(18,2),
    data_publicacao_pncp timestamp with time zone,
    data_abertura_proposta timestamp with time zone,
    data_encerramento_proposta timestamp with time zone,
    data_atualizacao_pncp timestamp with time zone,
    link_sistema_origem text,
    link_pncp text,
    hash_payload character(64) NOT NULL,
    busca_tsv tsvector GENERATED ALWAYS AS (to_tsvector('licitacoes.pt_unaccent'::regconfig, ((COALESCE(objeto, ''::text) || ' '::text) || COALESCE(informacao_complementar, ''::text)))) STORED,
    primeira_coleta_em timestamp with time zone DEFAULT now() NOT NULL,
    ultima_coleta_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: fn_edital_aberto(licitacoes.edital); Type: FUNCTION; Schema: licitacoes; Owner: -
--

CREATE FUNCTION licitacoes.fn_edital_aberto(e licitacoes.edital) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT (e.data_encerramento_proposta IS NULL OR e.data_encerramento_proposta > now())
     AND coalesce(e.situacao_id, 1) = 1
$$;

--
-- Name: fn_edital_atende_criterios(licitacoes.edital, tsquery, tsquery, character[], text[], text[], smallint[], numeric, numeric, boolean, boolean); Type: FUNCTION; Schema: licitacoes; Owner: -
--

CREATE FUNCTION licitacoes.fn_edital_atende_criterios(e licitacoes.edital, p_consulta tsquery, p_exclusao tsquery, p_ufs character[], p_municipios text[], p_orgaos text[], p_modalidades smallint[], p_valor_min numeric, p_valor_max numeric, p_incluir_sem_valor boolean, p_apenas_srp boolean) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
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

--
-- Name: busca_salva; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.busca_salva (
    id bigint NOT NULL,
    conta_id integer NOT NULL,
    usuario_id integer NOT NULL,
    nome character varying(120) NOT NULL,
    termos text[] DEFAULT '{}'::text[] NOT NULL,
    modo_termos character varying(3) DEFAULT 'OU'::character varying NOT NULL,
    termos_exclusao text[] DEFAULT '{}'::text[] NOT NULL,
    ufs character(2)[] DEFAULT '{}'::bpchar[] NOT NULL,
    municipios_ibge character varying(7)[] DEFAULT '{}'::character varying[] NOT NULL,
    orgaos_cnpj character varying(14)[] DEFAULT '{}'::character varying[] NOT NULL,
    modalidades smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    valor_min numeric(18,2),
    valor_max numeric(18,2),
    apenas_srp boolean,
    notificar boolean DEFAULT true NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    incluir_sem_valor boolean DEFAULT false NOT NULL,
    CONSTRAINT busca_salva_modo_termos_check CHECK (((modo_termos)::text = ANY ((ARRAY['OU'::character varying, 'E'::character varying])::text[])))
);

--
-- Name: fn_edital_bate(licitacoes.edital, licitacoes.busca_salva); Type: FUNCTION; Schema: licitacoes; Owner: -
--

CREATE FUNCTION licitacoes.fn_edital_bate(e licitacoes.edital, b licitacoes.busca_salva) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
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

--
-- Name: fn_frases_termo(text); Type: FUNCTION; Schema: licitacoes; Owner: -
--

CREATE FUNCTION licitacoes.fn_frases_termo(p_termo text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
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
END $_$;

--
-- Name: fn_grupos_digitos(text); Type: FUNCTION; Schema: licitacoes; Owner: -
--

CREATE FUNCTION licitacoes.fn_grupos_digitos(p_texto text) RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
  SELECT coalesce(array_agg(coalesce(nullif(ltrim(g, '0'), ''), '0')), '{}')
    FROM regexp_split_to_table(coalesce(p_texto, ''), '\D+') AS g
   WHERE g <> ''
$$;

--
-- Name: fn_tsquery_frase(text); Type: FUNCTION; Schema: licitacoes; Owner: -
--

CREATE FUNCTION licitacoes.fn_tsquery_frase(p_termo text) RETURNS tsquery
    LANGUAGE plpgsql IMMUTABLE
    AS $$
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

--
-- Name: fn_tsquery_termos(text[], text); Type: FUNCTION; Schema: licitacoes; Owner: -
--

CREATE FUNCTION licitacoes.fn_tsquery_termos(p_termos text[], p_modo text DEFAULT 'OU'::text) RETURNS tsquery
    LANGUAGE plpgsql IMMUTABLE
    AS $$
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

--
-- Name: fn_variantes_palavra(text); Type: FUNCTION; Schema: licitacoes; Owner: -
--

CREATE FUNCTION licitacoes.fn_variantes_palavra(p_palavra text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
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
END $_$;

--
-- Name: acesso_membro; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.acesso_membro (
    conta_id integer NOT NULL,
    usuario_id integer NOT NULL,
    concedido_por integer,
    concedido_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: acompanhamento; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.acompanhamento (
    conta_id integer NOT NULL,
    edital_id bigint NOT NULL,
    status character varying(20) NOT NULL,
    observacao text,
    atualizado_por integer,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT acompanhamento_status_check CHECK (((status)::text = ANY ((ARRAY['ANALISAR'::character varying, 'PARTICIPAR'::character varying, 'DESCARTADO'::character varying])::text[])))
);

--
-- Name: acompanhamento_historico; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.acompanhamento_historico (
    id bigint NOT NULL,
    conta_id integer NOT NULL,
    edital_id bigint NOT NULL,
    status_anterior character varying(20),
    status_novo character varying(20) NOT NULL,
    observacao text,
    usuario_id integer,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: acompanhamento_historico_id_seq; Type: SEQUENCE; Schema: licitacoes; Owner: -
--

CREATE SEQUENCE licitacoes.acompanhamento_historico_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: acompanhamento_historico_id_seq; Type: SEQUENCE OWNED BY; Schema: licitacoes; Owner: -
--

ALTER SEQUENCE licitacoes.acompanhamento_historico_id_seq OWNED BY licitacoes.acompanhamento_historico.id;

--
-- Name: busca_salva_contrato; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.busca_salva_contrato (
    id bigint NOT NULL,
    conta_id integer NOT NULL,
    usuario_id integer NOT NULL,
    nome character varying(120) NOT NULL,
    termos text[] DEFAULT '{}'::text[] NOT NULL,
    modo_termos character varying(3) DEFAULT 'OU'::character varying NOT NULL,
    termos_exclusao text[] DEFAULT '{}'::text[] NOT NULL,
    ufs character(2)[] DEFAULT '{}'::bpchar[] NOT NULL,
    municipios_ibge character varying(7)[] DEFAULT '{}'::character varying[] NOT NULL,
    orgaos_cnpj character varying(14)[] DEFAULT '{}'::character varying[] NOT NULL,
    categorias smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    fornecedores_cnpj character varying(14)[] DEFAULT '{}'::character varying[] NOT NULL,
    valor_min numeric(18,2),
    valor_max numeric(18,2),
    incluir_sem_valor boolean DEFAULT false NOT NULL,
    notificar boolean DEFAULT true NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    total_vigentes integer,
    total_em timestamp with time zone,
    CONSTRAINT busca_salva_contrato_modo_termos_check CHECK (((modo_termos)::text = ANY ((ARRAY['OU'::character varying, 'E'::character varying])::text[])))
);

--
-- Name: busca_salva_contrato_id_seq; Type: SEQUENCE; Schema: licitacoes; Owner: -
--

CREATE SEQUENCE licitacoes.busca_salva_contrato_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: busca_salva_contrato_id_seq; Type: SEQUENCE OWNED BY; Schema: licitacoes; Owner: -
--

ALTER SEQUENCE licitacoes.busca_salva_contrato_id_seq OWNED BY licitacoes.busca_salva_contrato.id;

--
-- Name: busca_salva_id_seq; Type: SEQUENCE; Schema: licitacoes; Owner: -
--

CREATE SEQUENCE licitacoes.busca_salva_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: busca_salva_id_seq; Type: SEQUENCE OWNED BY; Schema: licitacoes; Owner: -
--

ALTER SEQUENCE licitacoes.busca_salva_id_seq OWNED BY licitacoes.busca_salva.id;

--
-- Name: cache_detalhe; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.cache_detalhe (
    edital_id bigint NOT NULL,
    tipo character varying(10) NOT NULL,
    conteudo jsonb NOT NULL,
    obtido_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cache_detalhe_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['ITENS'::character varying, 'ARQUIVOS'::character varying])::text[])))
);

--
-- Name: coleta_execucao; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.coleta_execucao (
    id bigint NOT NULL,
    tipo character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    iniciado_em timestamp with time zone DEFAULT now() NOT NULL,
    finalizado_em timestamp with time zone,
    requisicoes integer DEFAULT 0 NOT NULL,
    registros_lidos integer DEFAULT 0 NOT NULL,
    novos integer DEFAULT 0 NOT NULL,
    atualizados integer DEFAULT 0 NOT NULL,
    notificacoes integer DEFAULT 0 NOT NULL,
    erros integer DEFAULT 0 NOT NULL,
    detalhes jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT coleta_execucao_status_check CHECK (((status)::text = ANY ((ARRAY['EXECUTANDO'::character varying, 'SUCESSO'::character varying, 'PARCIAL'::character varying, 'FALHA'::character varying])::text[]))),
    CONSTRAINT coleta_execucao_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['VARREDURA'::character varying, 'INCREMENTAL'::character varying, 'LEMBRETES'::character varying, 'LIMPEZA'::character varying, 'MANUAL'::character varying, 'CONTRATOS_DIARIA'::character varying, 'CONTRATOS_CARGA'::character varying, 'CONTRATOS_LIMPEZA'::character varying, 'CONTRATOS_AVISOS'::character varying, 'VENCEDORES_DIARIA'::character varying, 'VENCEDORES_CARGA'::character varying, 'FEDERAIS_CARGA'::character varying, 'FEDERAIS_CICLO'::character varying])::text[])))
);

--
-- Name: coleta_execucao_id_seq; Type: SEQUENCE; Schema: licitacoes; Owner: -
--

CREATE SEQUENCE licitacoes.coleta_execucao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: coleta_execucao_id_seq; Type: SEQUENCE OWNED BY; Schema: licitacoes; Owner: -
--

ALTER SEQUENCE licitacoes.coleta_execucao_id_seq OWNED BY licitacoes.coleta_execucao.id;

--
-- Name: contrato_carga_dia; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.contrato_carga_dia (
    dia date NOT NULL,
    concluido_em timestamp with time zone DEFAULT now() NOT NULL,
    registros_lidos integer DEFAULT 0 NOT NULL,
    gravados integer DEFAULT 0 NOT NULL,
    aditivos_consultados integer DEFAULT 0 NOT NULL
);

--
-- Name: edital_id_seq; Type: SEQUENCE; Schema: licitacoes; Owner: -
--

CREATE SEQUENCE licitacoes.edital_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: edital_id_seq; Type: SEQUENCE OWNED BY; Schema: licitacoes; Owner: -
--

ALTER SEQUENCE licitacoes.edital_id_seq OWNED BY licitacoes.edital.id;

--
-- Name: favorito; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.favorito (
    conta_id integer NOT NULL,
    usuario_id integer NOT NULL,
    edital_id bigint NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: favorito_contrato; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.favorito_contrato (
    conta_id integer NOT NULL,
    usuario_id integer NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    contrato_chave character varying(60) NOT NULL
);

--
-- Name: federal_orgao; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.federal_orgao (
    codigo_orgao character varying(20) NOT NULL,
    nome text NOT NULL,
    cnpj_cadastro character(14),
    cnpj_pncp character(14),
    com_dados boolean,
    carga_ano_mais_antigo smallint,
    ciclo_lido_em timestamp with time zone,
    maior_fim_visto date,
    medido_em timestamp with time zone,
    ultima_inclusao timestamp without time zone,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT federal_orgao_cnpj_cadastro_check CHECK ((cnpj_cadastro ~ '^[0-9]{14}$'::text)),
    CONSTRAINT federal_orgao_cnpj_pncp_check CHECK ((cnpj_pncp ~ '^[0-9]{14}$'::text))
);

--
-- Name: notificacao; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.notificacao (
    id bigint NOT NULL,
    conta_id integer NOT NULL,
    usuario_id integer NOT NULL,
    tipo character varying(30) NOT NULL,
    titulo text NOT NULL,
    mensagem text,
    link text NOT NULL,
    edital_id bigint,
    busca_salva_id bigint,
    referencia text,
    lida_em timestamp with time zone,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    contrato_chave character varying(60),
    CONSTRAINT ck_notificacao_edital_ou_contrato CHECK (((edital_id IS NULL) OR (contrato_chave IS NULL))),
    CONSTRAINT notificacao_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['NOVO_EDITAL'::character varying, 'EDITAL_ALTERADO'::character varying, 'PRAZO_3D'::character varying, 'PRAZO_1D'::character varying, 'CONTRATO_VENCE_90D'::character varying, 'CONTRATO_VENCE_30D'::character varying, 'CONTRATO_ALTERADO'::character varying])::text[])))
);

--
-- Name: notificacao_id_seq; Type: SEQUENCE; Schema: licitacoes; Owner: -
--

CREATE SEQUENCE licitacoes.notificacao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: notificacao_id_seq; Type: SEQUENCE OWNED BY; Schema: licitacoes; Owner: -
--

ALTER SEQUENCE licitacoes.notificacao_id_seq OWNED BY licitacoes.notificacao.id;

--
-- Name: resultado_carga_dia; Type: TABLE; Schema: licitacoes; Owner: -
--

CREATE TABLE licitacoes.resultado_carga_dia (
    dia date NOT NULL,
    concluido_em timestamp with time zone DEFAULT now() NOT NULL,
    registros_lidos integer DEFAULT 0 NOT NULL
);

--
-- Name: acompanhamento_historico id; Type: DEFAULT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acompanhamento_historico ALTER COLUMN id SET DEFAULT nextval('licitacoes.acompanhamento_historico_id_seq'::regclass);

--
-- Name: busca_salva id; Type: DEFAULT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.busca_salva ALTER COLUMN id SET DEFAULT nextval('licitacoes.busca_salva_id_seq'::regclass);

--
-- Name: busca_salva_contrato id; Type: DEFAULT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.busca_salva_contrato ALTER COLUMN id SET DEFAULT nextval('licitacoes.busca_salva_contrato_id_seq'::regclass);

--
-- Name: coleta_execucao id; Type: DEFAULT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.coleta_execucao ALTER COLUMN id SET DEFAULT nextval('licitacoes.coleta_execucao_id_seq'::regclass);

--
-- Name: edital id; Type: DEFAULT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.edital ALTER COLUMN id SET DEFAULT nextval('licitacoes.edital_id_seq'::regclass);

--
-- Name: notificacao id; Type: DEFAULT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.notificacao ALTER COLUMN id SET DEFAULT nextval('licitacoes.notificacao_id_seq'::regclass);

--
-- Name: acesso_membro acesso_membro_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acesso_membro
    ADD CONSTRAINT acesso_membro_pkey PRIMARY KEY (conta_id, usuario_id);

--
-- Name: acompanhamento_historico acompanhamento_historico_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acompanhamento_historico
    ADD CONSTRAINT acompanhamento_historico_pkey PRIMARY KEY (id);

--
-- Name: acompanhamento acompanhamento_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acompanhamento
    ADD CONSTRAINT acompanhamento_pkey PRIMARY KEY (conta_id, edital_id);

--
-- Name: busca_salva_contrato busca_salva_contrato_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.busca_salva_contrato
    ADD CONSTRAINT busca_salva_contrato_pkey PRIMARY KEY (id);

--
-- Name: busca_salva busca_salva_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.busca_salva
    ADD CONSTRAINT busca_salva_pkey PRIMARY KEY (id);

--
-- Name: cache_detalhe cache_detalhe_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.cache_detalhe
    ADD CONSTRAINT cache_detalhe_pkey PRIMARY KEY (edital_id, tipo);

--
-- Name: coleta_execucao coleta_execucao_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.coleta_execucao
    ADD CONSTRAINT coleta_execucao_pkey PRIMARY KEY (id);

--
-- Name: conta_habilitada conta_habilitada_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.conta_habilitada
    ADD CONSTRAINT conta_habilitada_pkey PRIMARY KEY (conta_id);

--
-- Name: contrato_carga_dia contrato_carga_dia_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.contrato_carga_dia
    ADD CONSTRAINT contrato_carga_dia_pkey PRIMARY KEY (dia);

--
-- Name: edital edital_numero_controle_pncp_key; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.edital
    ADD CONSTRAINT edital_numero_controle_pncp_key UNIQUE (numero_controle_pncp);

--
-- Name: edital edital_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.edital
    ADD CONSTRAINT edital_pkey PRIMARY KEY (id);

--
-- Name: favorito_contrato favorito_contrato_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.favorito_contrato
    ADD CONSTRAINT favorito_contrato_pkey PRIMARY KEY (conta_id, usuario_id, contrato_chave);

--
-- Name: favorito favorito_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.favorito
    ADD CONSTRAINT favorito_pkey PRIMARY KEY (conta_id, usuario_id, edital_id);

--
-- Name: federal_orgao federal_orgao_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.federal_orgao
    ADD CONSTRAINT federal_orgao_pkey PRIMARY KEY (codigo_orgao);

--
-- Name: notificacao notificacao_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.notificacao
    ADD CONSTRAINT notificacao_pkey PRIMARY KEY (id);

--
-- Name: resultado_carga_dia resultado_carga_dia_pkey; Type: CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.resultado_carga_dia
    ADD CONSTRAINT resultado_carga_dia_pkey PRIMARY KEY (dia);

--
-- Name: ix_busca_conta_usuario; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_busca_conta_usuario ON licitacoes.busca_salva USING btree (conta_id, usuario_id) WHERE ativa;

--
-- Name: ix_busca_contrato_conta_usuario; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_busca_contrato_conta_usuario ON licitacoes.busca_salva_contrato USING btree (conta_id, usuario_id) WHERE ativa;

--
-- Name: ix_edital_controle_grupos; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_controle_grupos ON licitacoes.edital USING gin (licitacoes.fn_grupos_digitos((numero_controle_pncp)::text));

--
-- Name: ix_edital_encerramento; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_encerramento ON licitacoes.edital USING btree (data_encerramento_proposta);

--
-- Name: ix_edital_modalidade; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_modalidade ON licitacoes.edital USING btree (modalidade_id);

--
-- Name: ix_edital_municipio; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_municipio ON licitacoes.edital USING btree (municipio_ibge);

--
-- Name: ix_edital_numero_grupos; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_numero_grupos ON licitacoes.edital USING gin (licitacoes.fn_grupos_digitos(((COALESCE(numero_compra, ''::text) || ' '::text) || COALESCE((ano_compra)::text, ''::text))));

--
-- Name: ix_edital_objeto_trgm; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_objeto_trgm ON licitacoes.edital USING gin (objeto public.gin_trgm_ops);

--
-- Name: ix_edital_orgao; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_orgao ON licitacoes.edital USING btree (orgao_cnpj);

--
-- Name: ix_edital_processo_grupos; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_processo_grupos ON licitacoes.edital USING gin (licitacoes.fn_grupos_digitos(((COALESCE(processo, ''::text) || ' '::text) || COALESCE((ano_compra)::text, ''::text))));

--
-- Name: ix_edital_publicacao; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_publicacao ON licitacoes.edital USING btree (data_publicacao_pncp DESC);

--
-- Name: ix_edital_tsv; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_tsv ON licitacoes.edital USING gin (busca_tsv);

--
-- Name: ix_edital_uf; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_uf ON licitacoes.edital USING btree (uf);

--
-- Name: ix_edital_valor; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_edital_valor ON licitacoes.edital USING btree (valor_total_estimado);

--
-- Name: ix_favorito_contrato_chave; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_favorito_contrato_chave ON licitacoes.favorito_contrato USING btree (contrato_chave);

--
-- Name: ix_favorito_edital; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_favorito_edital ON licitacoes.favorito USING btree (edital_id);

--
-- Name: ix_historico_conta_edital; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_historico_conta_edital ON licitacoes.acompanhamento_historico USING btree (conta_id, edital_id);

--
-- Name: ix_notificacao_nao_lidas; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE INDEX ix_notificacao_nao_lidas ON licitacoes.notificacao USING btree (conta_id, usuario_id, criada_em DESC) WHERE (lida_em IS NULL);

--
-- Name: ux_notificacao_contrato_unica; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE UNIQUE INDEX ux_notificacao_contrato_unica ON licitacoes.notificacao USING btree (conta_id, usuario_id, tipo, contrato_chave, COALESCE(referencia, ''::text)) WHERE (contrato_chave IS NOT NULL);

--
-- Name: ux_notificacao_unica; Type: INDEX; Schema: licitacoes; Owner: -
--

CREATE UNIQUE INDEX ux_notificacao_unica ON licitacoes.notificacao USING btree (conta_id, usuario_id, tipo, edital_id, COALESCE(referencia, ''::text));

--
-- Name: acesso_membro acesso_membro_concedido_por_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acesso_membro
    ADD CONSTRAINT acesso_membro_concedido_por_fkey FOREIGN KEY (concedido_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

--
-- Name: acesso_membro acesso_membro_conta_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acesso_membro
    ADD CONSTRAINT acesso_membro_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;

--
-- Name: acesso_membro acesso_membro_usuario_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acesso_membro
    ADD CONSTRAINT acesso_membro_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

--
-- Name: acompanhamento acompanhamento_atualizado_por_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acompanhamento
    ADD CONSTRAINT acompanhamento_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

--
-- Name: acompanhamento acompanhamento_conta_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acompanhamento
    ADD CONSTRAINT acompanhamento_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;

--
-- Name: acompanhamento acompanhamento_edital_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acompanhamento
    ADD CONSTRAINT acompanhamento_edital_id_fkey FOREIGN KEY (edital_id) REFERENCES licitacoes.edital(id) ON DELETE CASCADE;

--
-- Name: acompanhamento_historico acompanhamento_historico_conta_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acompanhamento_historico
    ADD CONSTRAINT acompanhamento_historico_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;

--
-- Name: acompanhamento_historico acompanhamento_historico_edital_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acompanhamento_historico
    ADD CONSTRAINT acompanhamento_historico_edital_id_fkey FOREIGN KEY (edital_id) REFERENCES licitacoes.edital(id) ON DELETE CASCADE;

--
-- Name: acompanhamento_historico acompanhamento_historico_usuario_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.acompanhamento_historico
    ADD CONSTRAINT acompanhamento_historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

--
-- Name: busca_salva busca_salva_conta_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.busca_salva
    ADD CONSTRAINT busca_salva_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;

--
-- Name: busca_salva_contrato busca_salva_contrato_conta_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.busca_salva_contrato
    ADD CONSTRAINT busca_salva_contrato_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;

--
-- Name: busca_salva_contrato busca_salva_contrato_usuario_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.busca_salva_contrato
    ADD CONSTRAINT busca_salva_contrato_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

--
-- Name: busca_salva busca_salva_usuario_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.busca_salva
    ADD CONSTRAINT busca_salva_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

--
-- Name: cache_detalhe cache_detalhe_edital_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.cache_detalhe
    ADD CONSTRAINT cache_detalhe_edital_id_fkey FOREIGN KEY (edital_id) REFERENCES licitacoes.edital(id) ON DELETE CASCADE;

--
-- Name: conta_habilitada conta_habilitada_conta_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.conta_habilitada
    ADD CONSTRAINT conta_habilitada_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;

--
-- Name: conta_habilitada conta_habilitada_habilitada_por_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.conta_habilitada
    ADD CONSTRAINT conta_habilitada_habilitada_por_fkey FOREIGN KEY (habilitada_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

--
-- Name: favorito favorito_conta_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.favorito
    ADD CONSTRAINT favorito_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;

--
-- Name: favorito_contrato favorito_contrato_conta_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.favorito_contrato
    ADD CONSTRAINT favorito_contrato_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;

--
-- Name: favorito_contrato favorito_contrato_usuario_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.favorito_contrato
    ADD CONSTRAINT favorito_contrato_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

--
-- Name: favorito favorito_edital_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.favorito
    ADD CONSTRAINT favorito_edital_id_fkey FOREIGN KEY (edital_id) REFERENCES licitacoes.edital(id) ON DELETE CASCADE;

--
-- Name: favorito favorito_usuario_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.favorito
    ADD CONSTRAINT favorito_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

--
-- Name: notificacao notificacao_busca_salva_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.notificacao
    ADD CONSTRAINT notificacao_busca_salva_id_fkey FOREIGN KEY (busca_salva_id) REFERENCES licitacoes.busca_salva(id) ON DELETE SET NULL;

--
-- Name: notificacao notificacao_conta_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.notificacao
    ADD CONSTRAINT notificacao_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;

--
-- Name: notificacao notificacao_edital_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.notificacao
    ADD CONSTRAINT notificacao_edital_id_fkey FOREIGN KEY (edital_id) REFERENCES licitacoes.edital(id) ON DELETE CASCADE;

--
-- Name: notificacao notificacao_usuario_id_fkey; Type: FK CONSTRAINT; Schema: licitacoes; Owner: -
--

ALTER TABLE ONLY licitacoes.notificacao
    ADD CONSTRAINT notificacao_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--
