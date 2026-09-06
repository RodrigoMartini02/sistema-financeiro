--
-- PostgreSQL database dump
--

\restrict NbGGofHdDjCcnI49qutcHSyF6WVUQlHDMCmSGsqpx90EZ4PoP6ZtdR0rnuDqkoo

-- Dumped from database version 18.3 (Debian 18.3-1.pgdg12+1)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: catalogo; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA catalogo;


--
-- Name: futebol; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA futebol;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: criar_categorias_padrao(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_categorias_padrao(p_usuario_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
            BEGIN
                INSERT INTO categorias (usuario_id, nome, cor) VALUES
                    (p_usuario_id, 'Alimentação', '#FF6B6B'),
                    (p_usuario_id, 'Transporte', '#4ECDC4'),
                    (p_usuario_id, 'Moradia', '#45B7D1'),
                    (p_usuario_id, 'Saúde', '#96CEB4'),
                    (p_usuario_id, 'Educação', '#FFEAA7'),
                    (p_usuario_id, 'Lazer', '#DFE6E9'),
                    (p_usuario_id, 'Outros', '#B2BEC3')
                ON CONFLICT (usuario_id, nome) DO NOTHING;
            END;
            $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: contas; Type: TABLE; Schema: catalogo; Owner: -
--

CREATE TABLE catalogo.contas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: produto_imagens; Type: TABLE; Schema: catalogo; Owner: -
--

CREATE TABLE catalogo.produto_imagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produto_id uuid NOT NULL,
    nome_arquivo character varying(255) NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: produtos; Type: TABLE; Schema: catalogo; Owner: -
--

CREATE TABLE catalogo.produtos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id integer NOT NULL,
    nome character varying(255) NOT NULL,
    descricao text,
    valor numeric(12,2) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: championship_guesses; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.championship_guesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    user_id uuid NOT NULL,
    home_score integer NOT NULL,
    away_score integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: championship_matches; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.championship_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competition character varying(10) NOT NULL,
    external_match_id character varying(50) NOT NULL,
    home_team character varying(255) NOT NULL,
    away_team character varying(255) NOT NULL,
    match_date timestamp without time zone NOT NULL,
    open boolean DEFAULT true NOT NULL,
    home_score integer,
    away_score integer,
    finished boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    home_crest character varying(500),
    away_crest character varying(500),
    matchday integer,
    stage character varying(50)
);


--
-- Name: confirmations; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.confirmations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    player_id uuid NOT NULL,
    game_date character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: guests; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    game_date character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: matches; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    date character varying(20) NOT NULL,
    teams jsonb NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: players; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    "position" character varying(100) NOT NULL,
    foot character varying(20) DEFAULT 'direito'::character varying NOT NULL,
    color character varying(20) DEFAULT '#22c55e'::character varying NOT NULL,
    photo text,
    age integer,
    height integer,
    weight integer,
    skills jsonb NOT NULL,
    positions jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    cpf character varying(11)
);


--
-- Name: pool_guesses; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.pool_guesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pool_id uuid NOT NULL,
    player_id uuid NOT NULL,
    guess_teams jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pools; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.pools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    match_id uuid NOT NULL,
    prize text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    prize_value numeric(10,2),
    guess_deadline timestamp without time zone
);


--
-- Name: schedules; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    active boolean DEFAULT true NOT NULL,
    day_of_week integer NOT NULL,
    hour integer NOT NULL,
    minute integer NOT NULL,
    draw_type character varying(30) DEFAULT 'balanced'::character varying NOT NULL,
    team_size integer DEFAULT 7 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: futebol; Owner: -
--

CREATE TABLE futebol.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    reset_code character varying(6),
    reset_code_expires_at timestamp without time zone,
    reset_attempts integer DEFAULT 0 NOT NULL,
    name character varying(255),
    cpf character varying(11)
);


--
-- Name: anos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anos (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    ano integer NOT NULL,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT anos_ano_check CHECK (((ano >= 2000) AND (ano <= 2100)))
);


--
-- Name: anos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.anos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: anos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.anos_id_seq OWNED BY public.anos.id;


--
-- Name: aprendizado_categoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aprendizado_categoria (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    texto character varying(100) NOT NULL,
    categoria character varying(100) NOT NULL,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: aprendizado_categoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aprendizado_categoria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aprendizado_categoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aprendizado_categoria_id_seq OWNED BY public.aprendizado_categoria.id;


--
-- Name: avaliacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avaliacoes (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    autor character varying(100) NOT NULL,
    estrelas integer NOT NULL,
    comentario text NOT NULL,
    aprovada boolean DEFAULT true,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT avaliacoes_estrelas_check CHECK (((estrelas >= 1) AND (estrelas <= 5)))
);


--
-- Name: avaliacoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avaliacoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: avaliacoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avaliacoes_id_seq OWNED BY public.avaliacoes.id;


--
-- Name: cartoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cartoes (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    nome character varying(255) NOT NULL,
    limite numeric(10,2) NOT NULL,
    dia_fechamento integer NOT NULL,
    dia_vencimento integer NOT NULL,
    cor character varying(7) DEFAULT '#3498db'::character varying,
    ativo boolean DEFAULT true,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    numero integer,
    numero_cartao integer,
    bandeira character varying(20) DEFAULT NULL::character varying,
    ultimos_digitos character varying(4) DEFAULT NULL::character varying,
    validade character varying(7) DEFAULT NULL::character varying,
    conta_id integer,
    tipo character varying(10),
    CONSTRAINT cartoes_dia_fechamento_check CHECK (((dia_fechamento >= 1) AND (dia_fechamento <= 31))),
    CONSTRAINT cartoes_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 31)))
);


--
-- Name: cartoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cartoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cartoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cartoes_id_seq OWNED BY public.cartoes.id;


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    nome character varying(255) NOT NULL,
    cor character varying(7) DEFAULT '#3498db'::character varying,
    icone character varying(10),
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    numero integer,
    forma_favorita character varying(20) DEFAULT NULL::character varying,
    cartao_favorito_id integer,
    ativo boolean DEFAULT true,
    parent_id integer,
    tipo character varying(10),
    conta_id integer
);


--
-- Name: categorias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categorias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categorias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categorias_id_seq OWNED BY public.categorias.id;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id integer NOT NULL,
    usuario_id integer,
    nome character varying(200) NOT NULL,
    codigo character varying(50),
    tipo_empresa character varying(50),
    cnpj character varying(20),
    criado_em timestamp without time zone DEFAULT now(),
    conta_id integer
);


--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_id_seq OWNED BY public.clientes.id;


--
-- Name: comissoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comissoes (
    id integer NOT NULL,
    representante_id integer NOT NULL,
    tipo_receita character varying(30) NOT NULL,
    percentual numeric(5,2) NOT NULL,
    tipo character varying(10) DEFAULT 'mensal'::character varying NOT NULL,
    ativo boolean DEFAULT true
);


--
-- Name: comissoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comissoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comissoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comissoes_id_seq OWNED BY public.comissoes.id;


--
-- Name: compromissos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compromissos (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    conta_id integer,
    titulo character varying(255) NOT NULL,
    descricao text,
    data date NOT NULL,
    hora time without time zone,
    duracao_minutos integer,
    local character varying(255),
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: compromissos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compromissos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compromissos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compromissos_id_seq OWNED BY public.compromissos.id;


--
-- Name: consumo_horas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumo_horas (
    id integer NOT NULL,
    contrato_id integer,
    usuario_id integer,
    tipo character varying(50) NOT NULL,
    data date NOT NULL,
    qtde numeric(10,2) NOT NULL,
    descricao text,
    criado_em timestamp without time zone DEFAULT now()
);


--
-- Name: consumo_horas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consumo_horas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consumo_horas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consumo_horas_id_seq OWNED BY public.consumo_horas.id;


--
-- Name: conta_membros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conta_membros (
    id integer NOT NULL,
    conta_id integer NOT NULL,
    usuario_id integer NOT NULL,
    status character varying(20) DEFAULT 'ativo'::character varying NOT NULL,
    data_criacao timestamp without time zone DEFAULT now()
);


--
-- Name: conta_membros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conta_membros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conta_membros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conta_membros_id_seq OWNED BY public.conta_membros.id;


--
-- Name: contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas (
    id integer NOT NULL,
    usuario_id integer,
    tipo character varying(10) DEFAULT 'pessoal'::character varying NOT NULL,
    nome character varying(100) NOT NULL,
    documento character varying(20) DEFAULT NULL::character varying,
    ativo boolean DEFAULT true,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    razao_social character varying(150) DEFAULT NULL::character varying,
    nome_fantasia character varying(150) DEFAULT NULL::character varying,
    atividade character varying(200) DEFAULT NULL::character varying,
    aporte_inicial numeric(12,2) DEFAULT NULL::numeric,
    latitude numeric(10,7) DEFAULT NULL::numeric,
    longitude numeric(10,7) DEFAULT NULL::numeric,
    enquadramento character varying(10),
    telefone character varying(20),
    email character varying(150),
    data_nascimento date,
    foto text,
    eh_padrao boolean DEFAULT false NOT NULL
);


--
-- Name: contrato_anexos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contrato_anexos (
    id integer NOT NULL,
    contrato_id integer NOT NULL,
    usuario_id integer NOT NULL,
    nome_original character varying(255) NOT NULL,
    nome_arquivo character varying(255) NOT NULL,
    mime_type character varying(100),
    tamanho integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: contrato_anexos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contrato_anexos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contrato_anexos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contrato_anexos_id_seq OWNED BY public.contrato_anexos.id;


--
-- Name: contratos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos (
    id integer NOT NULL,
    usuario_id integer,
    cliente_id integer,
    numero character varying(50),
    vencimento date NOT NULL,
    num_aditivo integer DEFAULT 0,
    data_aditivo date,
    ajuste character varying(50) DEFAULT 'NADA CONSTA'::character varying,
    status character varying(20) DEFAULT 'ativo'::character varying,
    data_inicio_faturamento date,
    observacoes text,
    criado_em timestamp without time zone DEFAULT now(),
    representante_id integer,
    conta_id integer,
    implantacao_parcelas integer DEFAULT 1,
    implantacao_valor_parcela numeric(10,2) DEFAULT 0,
    horas_presenciais_valor numeric(10,2) DEFAULT 0,
    horas_presenciais_saldo_ini numeric(10,2) DEFAULT 0,
    horas_presenciais_saldo_atual numeric(10,2) DEFAULT 0,
    horas_remotas_valor numeric(10,2) DEFAULT 0,
    horas_remotas_saldo_ini numeric(10,2) DEFAULT 0,
    horas_remotas_saldo_atual numeric(10,2) DEFAULT 0,
    valor_mensal numeric(10,2) DEFAULT 0,
    descricao character varying(255)
);


--
-- Name: contratos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contratos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contratos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contratos_id_seq OWNED BY public.contratos.id;


--
-- Name: contratos_servicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos_servicos (
    id integer NOT NULL,
    contrato_id integer NOT NULL,
    servico_id integer NOT NULL,
    usuario_id integer NOT NULL,
    valor_mensal numeric(10,2) DEFAULT 0 NOT NULL,
    implantado boolean DEFAULT false,
    faturando boolean DEFAULT false,
    data_inicio_faturamento date
);


--
-- Name: contratos_servicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contratos_servicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contratos_servicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contratos_servicos_id_seq OWNED BY public.contratos_servicos.id;


--
-- Name: copilot_conversas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copilot_conversas (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    conta_id integer NOT NULL,
    titulo character varying(120) DEFAULT 'Nova conversa'::character varying NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: copilot_conversas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.copilot_conversas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: copilot_conversas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.copilot_conversas_id_seq OWNED BY public.copilot_conversas.id;


--
-- Name: copilot_mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copilot_mensagens (
    id integer NOT NULL,
    conversa_id integer NOT NULL,
    papel character varying(12) NOT NULL,
    conteudo text NOT NULL,
    payload jsonb,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT copilot_mensagens_papel_check CHECK (((papel)::text = ANY ((ARRAY['user'::character varying, 'assistant'::character varying])::text[])))
);


--
-- Name: copilot_mensagens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.copilot_mensagens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: copilot_mensagens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.copilot_mensagens_id_seq OWNED BY public.copilot_mensagens.id;


--
-- Name: despesas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.despesas (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    descricao character varying(255) NOT NULL,
    valor numeric(10,2) NOT NULL,
    data_vencimento date NOT NULL,
    data_compra date,
    data_pagamento date,
    mes integer NOT NULL,
    ano integer NOT NULL,
    categoria_id integer,
    cartao_id integer,
    forma_pagamento character varying(50) DEFAULT 'dinheiro'::character varying,
    parcelado boolean DEFAULT false,
    numero_parcelas integer,
    parcela_atual integer,
    grupo_parcelamento_id integer,
    observacoes text,
    pago boolean DEFAULT false,
    valor_pago numeric(10,2),
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    valor_original numeric(10,2),
    valor_total_com_juros numeric(10,2),
    numero integer,
    anexos jsonb,
    recorrente boolean DEFAULT false,
    conta_id integer,
    valor_final numeric(10,2),
    status character varying(20) DEFAULT 'ativa'::character varying NOT NULL,
    numero_nf character varying(50),
    data_emissao_nf date,
    tipo_despesa character varying(10) DEFAULT 'opex'::character varying,
    CONSTRAINT despesas_mes_check CHECK (((mes >= 0) AND (mes <= 11)))
);


--
-- Name: despesas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.despesas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: despesas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.despesas_id_seq OWNED BY public.despesas.id;


--
-- Name: ia_eventos_uso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ia_eventos_uso (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    conta_id integer NOT NULL,
    provedor character varying(20) NOT NULL,
    modelo character varying(120),
    tokens_entrada integer DEFAULT 0 NOT NULL,
    tokens_saida integer DEFAULT 0 NOT NULL,
    status character varying(20) NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ia_eventos_uso_status_check CHECK (((status)::text = ANY ((ARRAY['success'::character varying, 'error'::character varying, 'limited'::character varying])::text[])))
);


--
-- Name: ia_eventos_uso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ia_eventos_uso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ia_eventos_uso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ia_eventos_uso_id_seq OWNED BY public.ia_eventos_uso.id;


--
-- Name: ia_integracoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ia_integracoes (
    id integer NOT NULL,
    provedor character varying(20) NOT NULL,
    chave_api_cifrada text NOT NULL,
    modelo character varying(120) NOT NULL,
    ativo boolean DEFAULT false NOT NULL,
    principal boolean DEFAULT false NOT NULL,
    atualizado_por_usuario_id integer,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ia_integracoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ia_integracoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ia_integracoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ia_integracoes_id_seq OWNED BY public.ia_integracoes.id;


--
-- Name: ia_sessoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ia_sessoes (
    usuario_id integer NOT NULL,
    historico jsonb DEFAULT '[]'::jsonb,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id integer NOT NULL,
    state character varying(100) NOT NULL,
    municipality character varying(255) NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;


--
-- Name: membro_permissoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membro_permissoes (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    acesso_despesas boolean DEFAULT false NOT NULL,
    acesso_receitas boolean DEFAULT false NOT NULL,
    acesso_fechamento_mes boolean DEFAULT false NOT NULL,
    acesso_reservas boolean DEFAULT false NOT NULL,
    acesso_planejamento boolean DEFAULT false NOT NULL,
    acesso_calendario boolean DEFAULT false NOT NULL,
    acesso_painel boolean DEFAULT false NOT NULL,
    acesso_relatorios boolean DEFAULT false NOT NULL,
    acesso_notificacoes boolean DEFAULT false NOT NULL,
    acesso_assistente boolean DEFAULT false NOT NULL,
    acesso_contas boolean DEFAULT false NOT NULL,
    acesso_categorias boolean DEFAULT false NOT NULL,
    acesso_cartoes boolean DEFAULT false NOT NULL,
    acesso_servicos boolean DEFAULT false NOT NULL,
    acesso_representantes boolean DEFAULT false NOT NULL,
    acesso_socios boolean DEFAULT false NOT NULL,
    acesso_membros boolean DEFAULT false NOT NULL,
    acesso_assinatura boolean DEFAULT false NOT NULL,
    acesso_clientes boolean DEFAULT false NOT NULL,
    acesso_contratos boolean DEFAULT false NOT NULL,
    acesso_catalogo_produtos boolean DEFAULT false NOT NULL,
    data_atualizacao timestamp without time zone DEFAULT now()
);


--
-- Name: membro_permissoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.membro_permissoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: membro_permissoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.membro_permissoes_id_seq OWNED BY public.membro_permissoes.id;


--
-- Name: meses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meses (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    ano integer NOT NULL,
    mes integer NOT NULL,
    fechado boolean DEFAULT false,
    saldo_anterior numeric(10,2) DEFAULT 0,
    saldo_final numeric(10,2) DEFAULT 0,
    data_fechamento timestamp without time zone,
    conta_id integer,
    CONSTRAINT meses_mes_check CHECK (((mes >= 0) AND (mes <= 11)))
);


--
-- Name: meses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meses_id_seq OWNED BY public.meses.id;


--
-- Name: modulos_contrato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulos_contrato (
    id integer NOT NULL,
    contrato_id integer,
    usuario_id integer,
    nome character varying(200) NOT NULL,
    valor_mensal numeric(12,2) DEFAULT 0 NOT NULL,
    implantado boolean DEFAULT false,
    faturando boolean DEFAULT false,
    data_inicio_faturamento date
);


--
-- Name: modulos_contrato_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modulos_contrato_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modulos_contrato_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modulos_contrato_id_seq OWNED BY public.modulos_contrato.id;


--
-- Name: movimentacoes_reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimentacoes_reservas (
    id integer NOT NULL,
    reserva_id integer NOT NULL,
    tipo character varying(10) NOT NULL,
    valor numeric(10,2) NOT NULL,
    data_hora timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    observacoes text,
    conta_id integer,
    CONSTRAINT movimentacoes_reservas_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['entrada'::character varying, 'saida'::character varying])::text[])))
);


--
-- Name: movimentacoes_reservas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimentacoes_reservas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimentacoes_reservas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimentacoes_reservas_id_seq OWNED BY public.movimentacoes_reservas.id;


--
-- Name: orcamento_metas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orcamento_metas (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    conta_id integer NOT NULL,
    categoria_id integer NOT NULL,
    modo character varying(20) NOT NULL,
    valor_meta numeric(12,2) NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT orcamento_metas_modo_check CHECK (((modo)::text = ANY ((ARRAY['amount'::character varying, 'income_percent'::character varying])::text[])))
);


--
-- Name: orcamento_metas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orcamento_metas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orcamento_metas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orcamento_metas_id_seq OWNED BY public.orcamento_metas.id;


--
-- Name: perfis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.perfis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: perfis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.perfis_id_seq OWNED BY public.contas.id;


--
-- Name: quest_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quest_users (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    documento character varying(20) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'user'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT quest_users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'user'::character varying, 'viewer'::character varying])::text[])))
);


--
-- Name: quest_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quest_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quest_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quest_users_id_seq OWNED BY public.quest_users.id;


--
-- Name: questionnaires; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questionnaires (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    location_id integer
);


--
-- Name: questionnaires_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.questionnaires_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: questionnaires_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.questionnaires_id_seq OWNED BY public.questionnaires.id;


--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id integer NOT NULL,
    questionnaire_id integer NOT NULL,
    text text NOT NULL,
    type character varying(50) NOT NULL,
    options jsonb DEFAULT '{}'::jsonb,
    display_order integer DEFAULT 0 NOT NULL,
    is_required boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT questions_type_check CHECK (((type)::text = ANY ((ARRAY['scale'::character varying, 'boolean'::character varying, 'text'::character varying, 'multiple'::character varying])::text[])))
);


--
-- Name: questions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.questions_id_seq OWNED BY public.questions.id;


--
-- Name: receitas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receitas (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    descricao character varying(255) NOT NULL,
    valor numeric(10,2) NOT NULL,
    data_recebimento date NOT NULL,
    mes integer NOT NULL,
    ano integer NOT NULL,
    observacoes text,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    numero integer,
    id_sequencial integer,
    id_registro integer,
    anexos jsonb,
    conta_id integer,
    status character varying(20) DEFAULT 'ativa'::character varying NOT NULL,
    contrato_id integer,
    cliente character varying(100),
    tipo_receita character varying(30),
    representante_id integer,
    valor_comissao numeric(10,2),
    CONSTRAINT receitas_mes_check CHECK (((mes >= 0) AND (mes <= 11)))
);


--
-- Name: receitas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.receitas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: receitas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.receitas_id_seq OWNED BY public.receitas.id;


--
-- Name: recorrencias_ia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recorrencias_ia (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    descricao character varying(255) NOT NULL,
    valor numeric(10,2),
    dia_vencimento integer,
    frequencia character varying(20) DEFAULT 'mensal'::character varying,
    categoria_id integer,
    forma_pagamento character varying(50) DEFAULT 'dinheiro'::character varying,
    ativa boolean DEFAULT true,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT recorrencias_ia_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 31)))
);


--
-- Name: recorrencias_ia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recorrencias_ia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recorrencias_ia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recorrencias_ia_id_seq OWNED BY public.recorrencias_ia.id;


--
-- Name: representantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.representantes (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    conta_id integer,
    nome character varying(100) NOT NULL,
    email character varying(150),
    telefone character varying(20),
    ativo boolean DEFAULT true,
    data_criacao timestamp without time zone DEFAULT now()
);


--
-- Name: representantes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.representantes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: representantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.representantes_id_seq OWNED BY public.representantes.id;


--
-- Name: reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    valor numeric(10,2) NOT NULL,
    mes integer NOT NULL,
    ano integer NOT NULL,
    data date NOT NULL,
    observacoes text,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    tipo_reserva character varying(50) DEFAULT 'normal'::character varying,
    objetivo_valor numeric(12,2),
    objetivo_atingido boolean DEFAULT false,
    data_objetivo date,
    conta_id integer,
    cor character varying(7) DEFAULT '#6366f1'::character varying,
    icone character varying(10) DEFAULT 'ðŸ’°'::character varying,
    CONSTRAINT reservas_mes_check CHECK (((mes >= 0) AND (mes <= 11)))
);


--
-- Name: reservas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reservas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reservas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reservas_id_seq OWNED BY public.reservas.id;


--
-- Name: response_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.response_answers (
    id integer NOT NULL,
    response_id integer NOT NULL,
    question_id integer NOT NULL,
    value text,
    numeric_value numeric(5,2),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: response_answers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.response_answers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: response_answers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.response_answers_id_seq OWNED BY public.response_answers.id;


--
-- Name: responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.responses (
    id integer NOT NULL,
    questionnaire_id integer NOT NULL,
    location_id integer,
    respondent_name character varying(255),
    respondent_position character varying(255),
    is_anonymous boolean DEFAULT false,
    submitted_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: responses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.responses_id_seq OWNED BY public.responses.id;


--
-- Name: servicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicos (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    nome character varying(255) NOT NULL,
    valor_mensal_padrao numeric(10,2) DEFAULT 0,
    ativo boolean DEFAULT true
);


--
-- Name: servicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicos_id_seq OWNED BY public.servicos.id;


--
-- Name: servicos_tecnicos_contrato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicos_tecnicos_contrato (
    id integer NOT NULL,
    contrato_id integer,
    usuario_id integer,
    tipo character varying(50) NOT NULL,
    valor_hora numeric(10,2) DEFAULT 0,
    qtde_contratada numeric(10,2) DEFAULT 0,
    qtde_consumida numeric(10,2) DEFAULT 0
);


--
-- Name: servicos_tecnicos_contrato_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicos_tecnicos_contrato_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicos_tecnicos_contrato_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicos_tecnicos_contrato_id_seq OWNED BY public.servicos_tecnicos_contrato.id;


--
-- Name: socios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.socios (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    conta_id integer,
    nome character varying(100) NOT NULL,
    percentual numeric(5,2) NOT NULL,
    ativo boolean DEFAULT true,
    data_criacao timestamp without time zone DEFAULT now()
);


--
-- Name: socios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.socios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: socios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.socios_id_seq OWNED BY public.socios.id;


--
-- Name: tipos_receita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_receita (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    nome character varying(100) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp without time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tipos_receita_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_receita_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_receita_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_receita_id_seq OWNED BY public.tipos_receita.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    documento character varying(20) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'user'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'user'::character varying, 'viewer'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nome character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    documento character varying(20),
    senha character varying(255) NOT NULL,
    tipo character varying(20) DEFAULT 'padrao'::character varying,
    status character varying(20) DEFAULT 'ativo'::character varying,
    data_cadastro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    dados_financeiros jsonb,
    categorias jsonb,
    cartoes jsonb,
    numero integer,
    foto text,
    google_id character varying(255) DEFAULT NULL::character varying,
    plano_status character varying(20) DEFAULT 'trial'::character varying,
    plano_tipo character varying(10) DEFAULT NULL::character varying,
    plano_expiracao timestamp without time zone,
    preapproval_id character varying(100) DEFAULT NULL::character varying,
    plano_inicio timestamp without time zone,
    payment_id_anual character varying(100) DEFAULT NULL::character varying,
    avaliacao_feita boolean DEFAULT false,
    pais character varying(100) DEFAULT NULL::character varying,
    estado character varying(100) DEFAULT NULL::character varying,
    cidade character varying(100) DEFAULT NULL::character varying,
    latitude numeric(10,7) DEFAULT NULL::numeric,
    longitude numeric(10,7) DEFAULT NULL::numeric,
    telefone character varying(20),
    data_nascimento date,
    CONSTRAINT usuarios_plano_status_check CHECK (((plano_status)::text = ANY ((ARRAY['trial'::character varying, 'ativo'::character varying, 'expirado'::character varying])::text[]))),
    CONSTRAINT usuarios_status_check CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying, 'inativo'::character varying, 'bloqueado'::character varying])::text[]))),
    CONSTRAINT usuarios_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['padrao'::character varying, 'admin'::character varying, 'master'::character varying])::text[])))
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: usuários; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public."usuários" AS
 SELECT id,
    nome,
    email,
    documento,
    senha,
    tipo,
    status,
    data_cadastro,
    data_atualizacao,
    dados_financeiros,
    categorias,
    cartoes,
    numero,
    foto,
    google_id,
    plano_status,
    plano_tipo,
    plano_expiracao,
    preapproval_id,
    plano_inicio,
    payment_id_anual,
    avaliacao_feita,
    pais,
    estado,
    cidade,
    latitude,
    longitude
   FROM public.usuarios;


--
-- Name: anos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anos ALTER COLUMN id SET DEFAULT nextval('public.anos_id_seq'::regclass);


--
-- Name: aprendizado_categoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprendizado_categoria ALTER COLUMN id SET DEFAULT nextval('public.aprendizado_categoria_id_seq'::regclass);


--
-- Name: avaliacoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes ALTER COLUMN id SET DEFAULT nextval('public.avaliacoes_id_seq'::regclass);


--
-- Name: cartoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes ALTER COLUMN id SET DEFAULT nextval('public.cartoes_id_seq'::regclass);


--
-- Name: categorias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias ALTER COLUMN id SET DEFAULT nextval('public.categorias_id_seq'::regclass);


--
-- Name: clientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id SET DEFAULT nextval('public.clientes_id_seq'::regclass);


--
-- Name: comissoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes ALTER COLUMN id SET DEFAULT nextval('public.comissoes_id_seq'::regclass);


--
-- Name: compromissos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compromissos ALTER COLUMN id SET DEFAULT nextval('public.compromissos_id_seq'::regclass);


--
-- Name: consumo_horas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_horas ALTER COLUMN id SET DEFAULT nextval('public.consumo_horas_id_seq'::regclass);


--
-- Name: conta_membros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conta_membros ALTER COLUMN id SET DEFAULT nextval('public.conta_membros_id_seq'::regclass);


--
-- Name: contas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas ALTER COLUMN id SET DEFAULT nextval('public.perfis_id_seq'::regclass);


--
-- Name: contrato_anexos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_anexos ALTER COLUMN id SET DEFAULT nextval('public.contrato_anexos_id_seq'::regclass);


--
-- Name: contratos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos ALTER COLUMN id SET DEFAULT nextval('public.contratos_id_seq'::regclass);


--
-- Name: contratos_servicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_servicos ALTER COLUMN id SET DEFAULT nextval('public.contratos_servicos_id_seq'::regclass);


--
-- Name: copilot_conversas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_conversas ALTER COLUMN id SET DEFAULT nextval('public.copilot_conversas_id_seq'::regclass);


--
-- Name: copilot_mensagens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_mensagens ALTER COLUMN id SET DEFAULT nextval('public.copilot_mensagens_id_seq'::regclass);


--
-- Name: despesas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas ALTER COLUMN id SET DEFAULT nextval('public.despesas_id_seq'::regclass);


--
-- Name: ia_eventos_uso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_eventos_uso ALTER COLUMN id SET DEFAULT nextval('public.ia_eventos_uso_id_seq'::regclass);


--
-- Name: ia_integracoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_integracoes ALTER COLUMN id SET DEFAULT nextval('public.ia_integracoes_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);


--
-- Name: membro_permissoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membro_permissoes ALTER COLUMN id SET DEFAULT nextval('public.membro_permissoes_id_seq'::regclass);


--
-- Name: meses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meses ALTER COLUMN id SET DEFAULT nextval('public.meses_id_seq'::regclass);


--
-- Name: modulos_contrato id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_contrato ALTER COLUMN id SET DEFAULT nextval('public.modulos_contrato_id_seq'::regclass);


--
-- Name: movimentacoes_reservas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_reservas ALTER COLUMN id SET DEFAULT nextval('public.movimentacoes_reservas_id_seq'::regclass);


--
-- Name: orcamento_metas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamento_metas ALTER COLUMN id SET DEFAULT nextval('public.orcamento_metas_id_seq'::regclass);


--
-- Name: quest_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_users ALTER COLUMN id SET DEFAULT nextval('public.quest_users_id_seq'::regclass);


--
-- Name: questionnaires id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaires ALTER COLUMN id SET DEFAULT nextval('public.questionnaires_id_seq'::regclass);


--
-- Name: questions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions ALTER COLUMN id SET DEFAULT nextval('public.questions_id_seq'::regclass);


--
-- Name: receitas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receitas ALTER COLUMN id SET DEFAULT nextval('public.receitas_id_seq'::regclass);


--
-- Name: recorrencias_ia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorrencias_ia ALTER COLUMN id SET DEFAULT nextval('public.recorrencias_ia_id_seq'::regclass);


--
-- Name: representantes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representantes ALTER COLUMN id SET DEFAULT nextval('public.representantes_id_seq'::regclass);


--
-- Name: reservas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas ALTER COLUMN id SET DEFAULT nextval('public.reservas_id_seq'::regclass);


--
-- Name: response_answers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_answers ALTER COLUMN id SET DEFAULT nextval('public.response_answers_id_seq'::regclass);


--
-- Name: responses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.responses ALTER COLUMN id SET DEFAULT nextval('public.responses_id_seq'::regclass);


--
-- Name: servicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos ALTER COLUMN id SET DEFAULT nextval('public.servicos_id_seq'::regclass);


--
-- Name: servicos_tecnicos_contrato id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos_tecnicos_contrato ALTER COLUMN id SET DEFAULT nextval('public.servicos_tecnicos_contrato_id_seq'::regclass);


--
-- Name: socios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios ALTER COLUMN id SET DEFAULT nextval('public.socios_id_seq'::regclass);


--
-- Name: tipos_receita id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_receita ALTER COLUMN id SET DEFAULT nextval('public.tipos_receita_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: contas contas_pkey; Type: CONSTRAINT; Schema: catalogo; Owner: -
--

ALTER TABLE ONLY catalogo.contas
    ADD CONSTRAINT contas_pkey PRIMARY KEY (id);


--
-- Name: produto_imagens produto_imagens_pkey; Type: CONSTRAINT; Schema: catalogo; Owner: -
--

ALTER TABLE ONLY catalogo.produto_imagens
    ADD CONSTRAINT produto_imagens_pkey PRIMARY KEY (id);


--
-- Name: produtos produtos_pkey; Type: CONSTRAINT; Schema: catalogo; Owner: -
--

ALTER TABLE ONLY catalogo.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);


--
-- Name: championship_guesses championship_guesses_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.championship_guesses
    ADD CONSTRAINT championship_guesses_pkey PRIMARY KEY (id);


--
-- Name: championship_matches championship_matches_external_match_id_key; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.championship_matches
    ADD CONSTRAINT championship_matches_external_match_id_key UNIQUE (external_match_id);


--
-- Name: championship_matches championship_matches_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.championship_matches
    ADD CONSTRAINT championship_matches_pkey PRIMARY KEY (id);


--
-- Name: confirmations confirmations_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.confirmations
    ADD CONSTRAINT confirmations_pkey PRIMARY KEY (id);


--
-- Name: guests guests_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.guests
    ADD CONSTRAINT guests_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: pool_guesses pool_guesses_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.pool_guesses
    ADD CONSTRAINT pool_guesses_pkey PRIMARY KEY (id);


--
-- Name: pools pools_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.pools
    ADD CONSTRAINT pools_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: anos anos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anos
    ADD CONSTRAINT anos_pkey PRIMARY KEY (id);


--
-- Name: anos anos_usuario_id_ano_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anos
    ADD CONSTRAINT anos_usuario_id_ano_key UNIQUE (usuario_id, ano);


--
-- Name: aprendizado_categoria aprendizado_categoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprendizado_categoria
    ADD CONSTRAINT aprendizado_categoria_pkey PRIMARY KEY (id);


--
-- Name: avaliacoes avaliacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes
    ADD CONSTRAINT avaliacoes_pkey PRIMARY KEY (id);


--
-- Name: avaliacoes avaliacoes_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes
    ADD CONSTRAINT avaliacoes_usuario_id_key UNIQUE (usuario_id);


--
-- Name: cartoes cartoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes
    ADD CONSTRAINT cartoes_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: comissoes comissoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT comissoes_pkey PRIMARY KEY (id);


--
-- Name: compromissos compromissos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compromissos
    ADD CONSTRAINT compromissos_pkey PRIMARY KEY (id);


--
-- Name: consumo_horas consumo_horas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_horas
    ADD CONSTRAINT consumo_horas_pkey PRIMARY KEY (id);


--
-- Name: conta_membros conta_membros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conta_membros
    ADD CONSTRAINT conta_membros_pkey PRIMARY KEY (id);


--
-- Name: conta_membros conta_membros_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conta_membros
    ADD CONSTRAINT conta_membros_usuario_id_key UNIQUE (usuario_id);


--
-- Name: contas contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_pkey PRIMARY KEY (id);


--
-- Name: contrato_anexos contrato_anexos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_anexos
    ADD CONSTRAINT contrato_anexos_pkey PRIMARY KEY (id);


--
-- Name: contratos contratos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_pkey PRIMARY KEY (id);


--
-- Name: contratos_servicos contratos_servicos_contrato_id_servico_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_servicos
    ADD CONSTRAINT contratos_servicos_contrato_id_servico_id_key UNIQUE (contrato_id, servico_id);


--
-- Name: contratos_servicos contratos_servicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_servicos
    ADD CONSTRAINT contratos_servicos_pkey PRIMARY KEY (id);


--
-- Name: copilot_conversas copilot_conversas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_conversas
    ADD CONSTRAINT copilot_conversas_pkey PRIMARY KEY (id);


--
-- Name: copilot_mensagens copilot_mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_mensagens
    ADD CONSTRAINT copilot_mensagens_pkey PRIMARY KEY (id);


--
-- Name: despesas despesas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_pkey PRIMARY KEY (id);


--
-- Name: ia_eventos_uso ia_eventos_uso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_eventos_uso
    ADD CONSTRAINT ia_eventos_uso_pkey PRIMARY KEY (id);


--
-- Name: ia_integracoes ia_integracoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_integracoes
    ADD CONSTRAINT ia_integracoes_pkey PRIMARY KEY (id);


--
-- Name: ia_integracoes ia_integracoes_provedor_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_integracoes
    ADD CONSTRAINT ia_integracoes_provedor_key UNIQUE (provedor);


--
-- Name: ia_sessoes ia_sessoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_sessoes
    ADD CONSTRAINT ia_sessoes_pkey PRIMARY KEY (usuario_id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: locations locations_state_municipality_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_state_municipality_key UNIQUE (state, municipality);


--
-- Name: membro_permissoes membro_permissoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membro_permissoes
    ADD CONSTRAINT membro_permissoes_pkey PRIMARY KEY (id);


--
-- Name: membro_permissoes membro_permissoes_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membro_permissoes
    ADD CONSTRAINT membro_permissoes_usuario_id_key UNIQUE (usuario_id);


--
-- Name: meses meses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meses
    ADD CONSTRAINT meses_pkey PRIMARY KEY (id);


--
-- Name: modulos_contrato modulos_contrato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_contrato
    ADD CONSTRAINT modulos_contrato_pkey PRIMARY KEY (id);


--
-- Name: movimentacoes_reservas movimentacoes_reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_reservas
    ADD CONSTRAINT movimentacoes_reservas_pkey PRIMARY KEY (id);


--
-- Name: orcamento_metas orcamento_metas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamento_metas
    ADD CONSTRAINT orcamento_metas_pkey PRIMARY KEY (id);


--
-- Name: orcamento_metas orcamento_metas_usuario_id_conta_id_categoria_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamento_metas
    ADD CONSTRAINT orcamento_metas_usuario_id_conta_id_categoria_id_key UNIQUE (usuario_id, conta_id, categoria_id);


--
-- Name: quest_users quest_users_documento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_users
    ADD CONSTRAINT quest_users_documento_key UNIQUE (documento);


--
-- Name: quest_users quest_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_users
    ADD CONSTRAINT quest_users_email_key UNIQUE (email);


--
-- Name: quest_users quest_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_users
    ADD CONSTRAINT quest_users_pkey PRIMARY KEY (id);


--
-- Name: questionnaires questionnaires_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaires
    ADD CONSTRAINT questionnaires_pkey PRIMARY KEY (id);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: receitas receitas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receitas
    ADD CONSTRAINT receitas_pkey PRIMARY KEY (id);


--
-- Name: recorrencias_ia recorrencias_ia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorrencias_ia
    ADD CONSTRAINT recorrencias_ia_pkey PRIMARY KEY (id);


--
-- Name: recorrencias_ia recorrencias_ia_usuario_id_descricao_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorrencias_ia
    ADD CONSTRAINT recorrencias_ia_usuario_id_descricao_key UNIQUE (usuario_id, descricao);


--
-- Name: representantes representantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representantes
    ADD CONSTRAINT representantes_pkey PRIMARY KEY (id);


--
-- Name: reservas reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_pkey PRIMARY KEY (id);


--
-- Name: response_answers response_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_answers
    ADD CONSTRAINT response_answers_pkey PRIMARY KEY (id);


--
-- Name: responses responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_pkey PRIMARY KEY (id);


--
-- Name: servicos servicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos
    ADD CONSTRAINT servicos_pkey PRIMARY KEY (id);


--
-- Name: servicos_tecnicos_contrato servicos_tecnicos_contrato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos_tecnicos_contrato
    ADD CONSTRAINT servicos_tecnicos_contrato_pkey PRIMARY KEY (id);


--
-- Name: socios socios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_pkey PRIMARY KEY (id);


--
-- Name: tipos_receita tipos_receita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_receita
    ADD CONSTRAINT tipos_receita_pkey PRIMARY KEY (id);


--
-- Name: users users_documento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_documento_key UNIQUE (documento);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_catalogo_contas_usuario_unique; Type: INDEX; Schema: catalogo; Owner: -
--

CREATE UNIQUE INDEX idx_catalogo_contas_usuario_unique ON catalogo.contas USING btree (usuario_id);


--
-- Name: idx_catalogo_produto_imagens_produto; Type: INDEX; Schema: catalogo; Owner: -
--

CREATE INDEX idx_catalogo_produto_imagens_produto ON catalogo.produto_imagens USING btree (produto_id);


--
-- Name: idx_catalogo_produtos_usuario; Type: INDEX; Schema: catalogo; Owner: -
--

CREATE INDEX idx_catalogo_produtos_usuario ON catalogo.produtos USING btree (usuario_id);


--
-- Name: idx_catalogo_produtos_usuario_ativo; Type: INDEX; Schema: catalogo; Owner: -
--

CREATE INDEX idx_catalogo_produtos_usuario_ativo ON catalogo.produtos USING btree (usuario_id, ativo);


--
-- Name: idx_futebol_champ_guesses_match_user; Type: INDEX; Schema: futebol; Owner: -
--

CREATE UNIQUE INDEX idx_futebol_champ_guesses_match_user ON futebol.championship_guesses USING btree (match_id, user_id);


--
-- Name: idx_futebol_champ_matches_open; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_champ_matches_open ON futebol.championship_matches USING btree (open);


--
-- Name: idx_futebol_confirmations_player_date_unique; Type: INDEX; Schema: futebol; Owner: -
--

CREATE UNIQUE INDEX idx_futebol_confirmations_player_date_unique ON futebol.confirmations USING btree (player_id, game_date);


--
-- Name: idx_futebol_confirmations_user; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_confirmations_user ON futebol.confirmations USING btree (user_id);


--
-- Name: idx_futebol_guests_user; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_guests_user ON futebol.guests USING btree (user_id);


--
-- Name: idx_futebol_guests_user_date; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_guests_user_date ON futebol.guests USING btree (user_id, game_date);


--
-- Name: idx_futebol_matches_user; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_matches_user ON futebol.matches USING btree (user_id);


--
-- Name: idx_futebol_matches_user_date; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_matches_user_date ON futebol.matches USING btree (user_id, date);


--
-- Name: idx_futebol_players_cpf_unique; Type: INDEX; Schema: futebol; Owner: -
--

CREATE UNIQUE INDEX idx_futebol_players_cpf_unique ON futebol.players USING btree (cpf);


--
-- Name: idx_futebol_players_user; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_players_user ON futebol.players USING btree (user_id);


--
-- Name: idx_futebol_pool_guesses_pool; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_pool_guesses_pool ON futebol.pool_guesses USING btree (pool_id);


--
-- Name: idx_futebol_pool_guesses_pool_player; Type: INDEX; Schema: futebol; Owner: -
--

CREATE UNIQUE INDEX idx_futebol_pool_guesses_pool_player ON futebol.pool_guesses USING btree (pool_id, player_id);


--
-- Name: idx_futebol_pools_user; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_pools_user ON futebol.pools USING btree (user_id);


--
-- Name: idx_futebol_schedules_user; Type: INDEX; Schema: futebol; Owner: -
--

CREATE INDEX idx_futebol_schedules_user ON futebol.schedules USING btree (user_id);


--
-- Name: idx_futebol_users_cpf_unique; Type: INDEX; Schema: futebol; Owner: -
--

CREATE UNIQUE INDEX idx_futebol_users_cpf_unique ON futebol.users USING btree (cpf);


--
-- Name: idx_anos_usuario_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anos_usuario_ano ON public.anos USING btree (usuario_id, ano);


--
-- Name: idx_aprendizado_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aprendizado_usuario ON public.aprendizado_categoria USING btree (usuario_id);


--
-- Name: idx_avaliacoes_aprovada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avaliacoes_aprovada ON public.avaliacoes USING btree (aprovada);


--
-- Name: idx_cartoes_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cartoes_conta ON public.cartoes USING btree (conta_id);


--
-- Name: idx_cartoes_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cartoes_usuario ON public.cartoes USING btree (usuario_id);


--
-- Name: idx_cartoes_usuario_nome_conta_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cartoes_usuario_nome_conta_unique ON public.cartoes USING btree (usuario_id, lower((nome)::text), COALESCE(conta_id, 0));


--
-- Name: idx_categorias_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categorias_conta ON public.categorias USING btree (conta_id);


--
-- Name: idx_categorias_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categorias_tipo ON public.categorias USING btree (tipo);


--
-- Name: idx_categorias_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categorias_usuario ON public.categorias USING btree (usuario_id);


--
-- Name: idx_categorias_usuario_nome_conta_custom; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_categorias_usuario_nome_conta_custom ON public.categorias USING btree (usuario_id, lower((nome)::text), conta_id) WHERE (conta_id IS NOT NULL);


--
-- Name: idx_categorias_usuario_nome_tipo_padrao; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_categorias_usuario_nome_tipo_padrao ON public.categorias USING btree (usuario_id, lower((nome)::text), tipo) WHERE (conta_id IS NULL);


--
-- Name: idx_clientes_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_conta ON public.clientes USING btree (conta_id);


--
-- Name: idx_comissoes_representante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comissoes_representante ON public.comissoes USING btree (representante_id);


--
-- Name: idx_compromissos_usuario_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compromissos_usuario_data ON public.compromissos USING btree (usuario_id, data);


--
-- Name: idx_conta_membros_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conta_membros_conta ON public.conta_membros USING btree (conta_id);


--
-- Name: idx_contas_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contas_usuario ON public.contas USING btree (usuario_id);


--
-- Name: idx_contrato_anexos_contrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contrato_anexos_contrato ON public.contrato_anexos USING btree (contrato_id);


--
-- Name: idx_contratos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contratos_cliente ON public.contratos USING btree (cliente_id);


--
-- Name: idx_contratos_servicos_contrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contratos_servicos_contrato ON public.contratos_servicos USING btree (contrato_id);


--
-- Name: idx_contratos_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contratos_usuario ON public.contratos USING btree (usuario_id);


--
-- Name: idx_copilot_conversas_usuario_conta_atualizado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copilot_conversas_usuario_conta_atualizado ON public.copilot_conversas USING btree (usuario_id, conta_id, atualizado_em DESC);


--
-- Name: idx_copilot_mensagens_conversa_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copilot_mensagens_conversa_criado ON public.copilot_mensagens USING btree (conversa_id, criado_em);


--
-- Name: idx_despesas_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_despesas_conta ON public.despesas USING btree (conta_id);


--
-- Name: idx_despesas_grupo_parcelamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_despesas_grupo_parcelamento ON public.despesas USING btree (grupo_parcelamento_id);


--
-- Name: idx_despesas_usuario_mes_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_despesas_usuario_mes_ano ON public.despesas USING btree (usuario_id, mes, ano);


--
-- Name: idx_ia_eventos_uso_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ia_eventos_uso_criado ON public.ia_eventos_uso USING btree (criado_em);


--
-- Name: idx_ia_eventos_uso_usuario_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ia_eventos_uso_usuario_criado ON public.ia_eventos_uso USING btree (usuario_id, criado_em);


--
-- Name: idx_ia_integracoes_principal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ia_integracoes_principal ON public.ia_integracoes USING btree (principal, ativo);


--
-- Name: idx_locations_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_state ON public.locations USING btree (state);


--
-- Name: idx_meses_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meses_conta ON public.meses USING btree (conta_id);


--
-- Name: idx_meses_usuario_ano_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meses_usuario_ano_mes ON public.meses USING btree (usuario_id, ano, mes);


--
-- Name: idx_modulos_contrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_modulos_contrato ON public.modulos_contrato USING btree (contrato_id);


--
-- Name: idx_movimentacoes_reserva; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimentacoes_reserva ON public.movimentacoes_reservas USING btree (reserva_id);


--
-- Name: idx_orcamento_metas_usuario_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orcamento_metas_usuario_conta ON public.orcamento_metas USING btree (usuario_id, conta_id);


--
-- Name: idx_questions_questionnaire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questions_questionnaire ON public.questions USING btree (questionnaire_id);


--
-- Name: idx_receitas_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receitas_conta ON public.receitas USING btree (conta_id);


--
-- Name: idx_receitas_contrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receitas_contrato ON public.receitas USING btree (contrato_id) WHERE (contrato_id IS NOT NULL);


--
-- Name: idx_receitas_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receitas_status ON public.receitas USING btree (usuario_id, status);


--
-- Name: idx_receitas_usuario_mes_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receitas_usuario_mes_ano ON public.receitas USING btree (usuario_id, mes, ano);


--
-- Name: idx_recorrencias_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recorrencias_usuario ON public.recorrencias_ia USING btree (usuario_id);


--
-- Name: idx_representantes_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_representantes_conta ON public.representantes USING btree (conta_id);


--
-- Name: idx_representantes_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_representantes_usuario ON public.representantes USING btree (usuario_id);


--
-- Name: idx_reservas_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_conta ON public.reservas USING btree (conta_id);


--
-- Name: idx_reservas_usuario_mes_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_usuario_mes_ano ON public.reservas USING btree (usuario_id, mes, ano);


--
-- Name: idx_response_answers_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_response_answers_question ON public.response_answers USING btree (question_id);


--
-- Name: idx_response_answers_response; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_response_answers_response ON public.response_answers USING btree (response_id);


--
-- Name: idx_responses_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_responses_location ON public.responses USING btree (location_id);


--
-- Name: idx_responses_questionnaire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_responses_questionnaire ON public.responses USING btree (questionnaire_id);


--
-- Name: idx_responses_submitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_responses_submitted_at ON public.responses USING btree (submitted_at);


--
-- Name: idx_servicos_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicos_usuario ON public.servicos USING btree (usuario_id);


--
-- Name: idx_socios_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_socios_usuario ON public.socios USING btree (usuario_id);


--
-- Name: idx_tipos_receita_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tipos_receita_usuario ON public.tipos_receita USING btree (usuario_id);


--
-- Name: idx_usuarios_cartoes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_cartoes ON public.usuarios USING gin (cartoes);


--
-- Name: idx_usuarios_categorias; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_categorias ON public.usuarios USING gin (categorias);


--
-- Name: idx_usuarios_dados_financeiros; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_dados_financeiros ON public.usuarios USING gin (dados_financeiros);


--
-- Name: idx_usuarios_documento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_documento ON public.usuarios USING btree (documento);


--
-- Name: idx_usuarios_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_email ON public.usuarios USING btree (email);


--
-- Name: idx_usuarios_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_status ON public.usuarios USING btree (status);


--
-- Name: idx_usuarios_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_tipo ON public.usuarios USING btree (tipo);


--
-- Name: meses_usuario_ano_mes_conta_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX meses_usuario_ano_mes_conta_unique ON public.meses USING btree (usuario_id, ano, mes, COALESCE(conta_id, 0));


--
-- Name: usuarios_documento_unique_partial; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_documento_unique_partial ON public.usuarios USING btree (documento) WHERE (documento IS NOT NULL);


--
-- Name: contas contas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: catalogo; Owner: -
--

ALTER TABLE ONLY catalogo.contas
    ADD CONSTRAINT contas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: produto_imagens produto_imagens_produto_id_fkey; Type: FK CONSTRAINT; Schema: catalogo; Owner: -
--

ALTER TABLE ONLY catalogo.produto_imagens
    ADD CONSTRAINT produto_imagens_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES catalogo.produtos(id) ON DELETE CASCADE;


--
-- Name: produtos produtos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: catalogo; Owner: -
--

ALTER TABLE ONLY catalogo.produtos
    ADD CONSTRAINT produtos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: championship_guesses championship_guesses_match_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.championship_guesses
    ADD CONSTRAINT championship_guesses_match_id_fkey FOREIGN KEY (match_id) REFERENCES futebol.championship_matches(id) ON DELETE CASCADE;


--
-- Name: championship_guesses championship_guesses_user_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.championship_guesses
    ADD CONSTRAINT championship_guesses_user_id_fkey FOREIGN KEY (user_id) REFERENCES futebol.users(id) ON DELETE CASCADE;


--
-- Name: confirmations confirmations_user_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.confirmations
    ADD CONSTRAINT confirmations_user_id_fkey FOREIGN KEY (user_id) REFERENCES futebol.users(id) ON DELETE CASCADE;


--
-- Name: guests guests_user_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.guests
    ADD CONSTRAINT guests_user_id_fkey FOREIGN KEY (user_id) REFERENCES futebol.users(id) ON DELETE CASCADE;


--
-- Name: matches matches_user_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.matches
    ADD CONSTRAINT matches_user_id_fkey FOREIGN KEY (user_id) REFERENCES futebol.users(id) ON DELETE CASCADE;


--
-- Name: players players_user_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.players
    ADD CONSTRAINT players_user_id_fkey FOREIGN KEY (user_id) REFERENCES futebol.users(id) ON DELETE CASCADE;


--
-- Name: pool_guesses pool_guesses_player_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.pool_guesses
    ADD CONSTRAINT pool_guesses_player_id_fkey FOREIGN KEY (player_id) REFERENCES futebol.players(id) ON DELETE CASCADE;


--
-- Name: pool_guesses pool_guesses_pool_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.pool_guesses
    ADD CONSTRAINT pool_guesses_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES futebol.pools(id) ON DELETE CASCADE;


--
-- Name: pools pools_match_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.pools
    ADD CONSTRAINT pools_match_id_fkey FOREIGN KEY (match_id) REFERENCES futebol.matches(id) ON DELETE CASCADE;


--
-- Name: pools pools_user_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.pools
    ADD CONSTRAINT pools_user_id_fkey FOREIGN KEY (user_id) REFERENCES futebol.users(id) ON DELETE CASCADE;


--
-- Name: schedules schedules_user_id_fkey; Type: FK CONSTRAINT; Schema: futebol; Owner: -
--

ALTER TABLE ONLY futebol.schedules
    ADD CONSTRAINT schedules_user_id_fkey FOREIGN KEY (user_id) REFERENCES futebol.users(id) ON DELETE CASCADE;


--
-- Name: anos anos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anos
    ADD CONSTRAINT anos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: aprendizado_categoria aprendizado_categoria_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprendizado_categoria
    ADD CONSTRAINT aprendizado_categoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: avaliacoes avaliacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes
    ADD CONSTRAINT avaliacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: cartoes cartoes_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes
    ADD CONSTRAINT cartoes_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id);


--
-- Name: cartoes cartoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes
    ADD CONSTRAINT cartoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: categorias categorias_cartao_favorito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_cartao_favorito_id_fkey FOREIGN KEY (cartao_favorito_id) REFERENCES public.cartoes(id) ON DELETE SET NULL;


--
-- Name: categorias categorias_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id);


--
-- Name: categorias categorias_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: clientes clientes_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE SET NULL;


--
-- Name: clientes clientes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: comissoes comissoes_representante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT comissoes_representante_id_fkey FOREIGN KEY (representante_id) REFERENCES public.representantes(id) ON DELETE CASCADE;


--
-- Name: compromissos compromissos_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compromissos
    ADD CONSTRAINT compromissos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id);


--
-- Name: compromissos compromissos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compromissos
    ADD CONSTRAINT compromissos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: consumo_horas consumo_horas_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_horas
    ADD CONSTRAINT consumo_horas_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;


--
-- Name: consumo_horas consumo_horas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_horas
    ADD CONSTRAINT consumo_horas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: conta_membros conta_membros_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conta_membros
    ADD CONSTRAINT conta_membros_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: conta_membros conta_membros_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conta_membros
    ADD CONSTRAINT conta_membros_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: contas contas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: contrato_anexos contrato_anexos_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_anexos
    ADD CONSTRAINT contrato_anexos_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;


--
-- Name: contrato_anexos contrato_anexos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_anexos
    ADD CONSTRAINT contrato_anexos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: contratos contratos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: contratos_servicos contratos_servicos_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_servicos
    ADD CONSTRAINT contratos_servicos_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;


--
-- Name: contratos_servicos contratos_servicos_servico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_servicos
    ADD CONSTRAINT contratos_servicos_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES public.servicos(id);


--
-- Name: contratos_servicos contratos_servicos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_servicos
    ADD CONSTRAINT contratos_servicos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: contratos contratos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: copilot_conversas copilot_conversas_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_conversas
    ADD CONSTRAINT copilot_conversas_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: copilot_conversas copilot_conversas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_conversas
    ADD CONSTRAINT copilot_conversas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: copilot_mensagens copilot_mensagens_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_mensagens
    ADD CONSTRAINT copilot_mensagens_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.copilot_conversas(id) ON DELETE CASCADE;


--
-- Name: despesas despesas_cartao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_cartao_id_fkey FOREIGN KEY (cartao_id) REFERENCES public.cartoes(id);


--
-- Name: despesas despesas_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: despesas despesas_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id);


--
-- Name: despesas despesas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: ia_eventos_uso ia_eventos_uso_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_eventos_uso
    ADD CONSTRAINT ia_eventos_uso_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: ia_eventos_uso ia_eventos_uso_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_eventos_uso
    ADD CONSTRAINT ia_eventos_uso_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: ia_integracoes ia_integracoes_atualizado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_integracoes
    ADD CONSTRAINT ia_integracoes_atualizado_por_usuario_id_fkey FOREIGN KEY (atualizado_por_usuario_id) REFERENCES public.usuarios(id);


--
-- Name: ia_sessoes ia_sessoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_sessoes
    ADD CONSTRAINT ia_sessoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: locations locations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: membro_permissoes membro_permissoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membro_permissoes
    ADD CONSTRAINT membro_permissoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: meses meses_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meses
    ADD CONSTRAINT meses_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id);


--
-- Name: meses meses_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meses
    ADD CONSTRAINT meses_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: modulos_contrato modulos_contrato_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_contrato
    ADD CONSTRAINT modulos_contrato_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;


--
-- Name: modulos_contrato modulos_contrato_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_contrato
    ADD CONSTRAINT modulos_contrato_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: movimentacoes_reservas movimentacoes_reservas_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_reservas
    ADD CONSTRAINT movimentacoes_reservas_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id);


--
-- Name: movimentacoes_reservas movimentacoes_reservas_reserva_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_reservas
    ADD CONSTRAINT movimentacoes_reservas_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES public.reservas(id) ON DELETE CASCADE;


--
-- Name: orcamento_metas orcamento_metas_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamento_metas
    ADD CONSTRAINT orcamento_metas_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE;


--
-- Name: orcamento_metas orcamento_metas_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamento_metas
    ADD CONSTRAINT orcamento_metas_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: orcamento_metas orcamento_metas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamento_metas
    ADD CONSTRAINT orcamento_metas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: questionnaires questionnaires_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaires
    ADD CONSTRAINT questionnaires_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: questionnaires questionnaires_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questionnaires
    ADD CONSTRAINT questionnaires_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: questions questions_questionnaire_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_questionnaire_id_fkey FOREIGN KEY (questionnaire_id) REFERENCES public.questionnaires(id) ON DELETE CASCADE;


--
-- Name: receitas receitas_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receitas
    ADD CONSTRAINT receitas_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id);


--
-- Name: receitas receitas_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receitas
    ADD CONSTRAINT receitas_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: receitas receitas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receitas
    ADD CONSTRAINT receitas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: recorrencias_ia recorrencias_ia_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorrencias_ia
    ADD CONSTRAINT recorrencias_ia_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL;


--
-- Name: recorrencias_ia recorrencias_ia_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorrencias_ia
    ADD CONSTRAINT recorrencias_ia_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: representantes representantes_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representantes
    ADD CONSTRAINT representantes_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE SET NULL;


--
-- Name: representantes representantes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representantes
    ADD CONSTRAINT representantes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: reservas reservas_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id);


--
-- Name: reservas reservas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: response_answers response_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_answers
    ADD CONSTRAINT response_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id);


--
-- Name: response_answers response_answers_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_answers
    ADD CONSTRAINT response_answers_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.responses(id) ON DELETE CASCADE;


--
-- Name: responses responses_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: responses responses_questionnaire_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_questionnaire_id_fkey FOREIGN KEY (questionnaire_id) REFERENCES public.questionnaires(id);


--
-- Name: servicos_tecnicos_contrato servicos_tecnicos_contrato_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos_tecnicos_contrato
    ADD CONSTRAINT servicos_tecnicos_contrato_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;


--
-- Name: servicos_tecnicos_contrato servicos_tecnicos_contrato_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos_tecnicos_contrato
    ADD CONSTRAINT servicos_tecnicos_contrato_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: servicos servicos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos
    ADD CONSTRAINT servicos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: socios socios_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE SET NULL;


--
-- Name: socios socios_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: tipos_receita tipos_receita_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_receita
    ADD CONSTRAINT tipos_receita_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict NbGGofHdDjCcnI49qutcHSyF6WVUQlHDMCmSGsqpx90EZ4PoP6ZtdR0rnuDqkoo

