# ESCOPO TÉCNICO — Módulo de Licitações no FINGERENCE

> Documento de referência para execução no Claude Code.
> Versão 1.3 — 05/10/2026. Decisões do plano da Fase 2 (`.plans/licitacoes-fase2-plano.md`):
>
> - **Ajustes da Fase 1:**
>   - consultas ao PNCP a cada 4 s;
>   - singular e plural na busca;
>   - edital sem prazo de proposta fora da coleta.
> - **Conta do titular:** informada por `accountId`.
> - **Busca salva:** ganha "incluir sem valor".
> - **Cards do Início:** base definida.
> - **Exportação CSV/XLSX:** saiu do módulo.
> - **Filtro de órgão:** só por CNPJ.
>
> Versão 1.2 — 05/10/2026. Endereços do app sob `/licitacoes/app`, link das notificações a partir do início do sistema, presença pública e projeção de volume (decisões 21 a 25).
> Versão 1.1 — 04/10/2026. Adapta a v1.0 (escrita para o repositório `notificacoes-comercial`) à decisão de construir o módulo dentro do FINGERENCE.
> Reconhecimento: `.plans/licitacoes-reconhecimento.md`.

---

## 0. Como usar este documento

Este é o **documento único** do módulo: regras, escopo técnico e plano de execução por fases (seção 14). Cada fase segue o fluxo obrigatório do `CLAUDE.md` do FINGERENCE:

1. `/planejar` a partir da fase (e das seções que ela referencia), gerando um plano em `.plans/`.
2. Aprovação explícita do usuário.
3. `/implementar`.
4. `/finalizar`.
5. **Parar e aguardar aprovação** antes de iniciar a próxima fase.

Quando houver dúvida de regra de negócio, perguntar com **perguntas numeradas e opções em letras** (ex.: `1 - A`), sem inventar regra.

Todo o trabalho do módulo acontece num branch próprio (`feat/R/licitacoes`), separado de qualquer outro trabalho em andamento.

### 0.1 Regras invioláveis (resumo)

- **O app de finanças não muda de comportamento.** Fora do módulo, só mudam: o login (destino e contexto do módulo), o registro das rotas em `backend/src/server.ts`, o registro do schema em `backend/src/db/schema/index.ts` e a entrada nova em `vite.config.ts`.
- **Todo dado novo fica no schema `licitacoes`.** Não criar, alterar ou apagar tabelas fora dele.
- **Isolamento por conta**: toda consulta a dado de conta filtra por `conta_id`, derivado no servidor (seção 11). `edital`, `cache_detalhe` e `coleta_execucao` são globais.
- Migrações versionadas em `backend/drizzle/`, aplicadas pelo runner do projeto. **Nunca** aplicar em produção sem confirmação explícita.
- Nada de segredos no código; documentar toda variável de ambiente nova.
- Código em inglês (identificadores, arquivos, pastas, rotas e campos de API); tabelas e colunas em português; interface 100% em português do Brasil (datas dd/MM/yyyy, moeda BRL, fuso America/Sao_Paulo).
- Consultas pelo Drizzle; SQL bruto só no matcher e na busca textual, sempre parametrizado e com o motivo no código.
- Dados do PNCP são externos: validar e nunca renderizar HTML vindo deles.
- A regra "edital bate com busca" existe **uma única vez**, na função SQL `licitacoes.fn_edital_bate`.
- Dependências novas: compatíveis com Node 22.17.0 e justificadas.

### 0.2 Informações do projeto

- Backend: Express 4 + TypeScript (`tsx`), `backend/src/server.ts`, porta 3010. Padrão de módulo em `backend/src/modules/catalogo/`.
- Banco / migrações: PostgreSQL + Drizzle ORM. SQL numerado em `backend/drizzle/`, aplicado por `backend/scripts/migrations.ts` (`migrations:status` e `migrations:aplicar -- <ID> --banco local|producao`). Local: PostgreSQL 18 (`localhost:5433/sistema_financas_dev`). Produção: Render.
- Front: React 19 + Vite 8 + Tailwind 3 + TanStack Query + react-hook-form/zod; entradas `index.html`, `app.html`, `assistant.html` e `demo.html`.
- Como rodar: `npm --prefix backend run dev` (banco local) e `npm run dev` (front, porta 5173, proxy `/api`).
- Como rodar os testes: `npm test` (front) e `npm --prefix backend test`. Tipos do backend: `npm --prefix backend run build`.

---

## 1. Contexto e objetivo

O FINGERENCE ganha um segundo módulo, **Licitações**, com app próprio e o mesmo login, contas e banco. O módulo:

- Coleta automaticamente as licitações com recebimento de propostas em aberto no **PNCP** (Portal Nacional de Contratações Públicas).
- Permite busca com filtros, buscas salvas e acompanhamento de editais.
- Gera **notificações dentro do módulo** quando surge edital aderente a uma busca salva e quando um prazo acompanhado está próximo.

Primeiro uso: interno, pela equipe da empresa que participa de licitações (software de gestão pública: gestão tributária/administrativa, GED/digitalização, saúde). Os dados são separados por conta desde o início, para que o módulo possa depois ser oferecido a outras contas PJ (a venda fica fora desta versão: seção 15).

O Disparo de Notificações continua no app atual (repositório `notificacoes-comercial`) e não faz parte deste escopo (seção 10).

---

## 2. Regras gerais para o agente

1. **Não quebrar o que existe.** O app de finanças, o assistente, o site público e o login continuam funcionando igual.
2. **Seguir o `CLAUDE.md` e o `AGENT.md`.** Em conflito com este escopo, eles prevalecem; registrar o conflito no plano da fase.
3. **Isolamento.** Dado novo no schema `licitacoes`, sempre filtrado por conta quando for dado de conta.
4. **Migrações versionadas**, uma por arquivo, no próximo número livre de `backend/drizzle/`, com o cabeçalho no padrão do repositório (ordem de aplicação e aviso de confirmação) e a reversão descrita quando possível.
5. **Sem segredos no código.**
6. **Interface em português do Brasil.** Datas `dd/MM/yyyy HH:mm`, moeda BRL, fuso `America/Sao_Paulo`. O cliente de banco devolve datas como texto: formatar a partir disso.
7. **Testes obrigatórios** nas partes de lógica (coletor, matcher, API), com `node --test` via `tsx`, no padrão do repositório.
8. **Commits pequenos**, Conventional Commits em português (ex.: `feat(licitacoes): adiciona coletor PNCP`).
9. **Sem dependências novas** fora das previstas aqui sem justificar.
10. Respostas do PNCP são **dados externos não confiáveis**: validar, sanitizar e nunca renderizar HTML vindo delas.

---

## 3. Fase 0 — Reconhecimento (concluída)

Resultado em `.plans/licitacoes-reconhecimento.md`. Decisões na seção 16.

---

## 4. Arquitetura

```
API do PNCP (pública)
   │ consulta
   ▼
Coletor: CLI Node/TS em backend/src/modules/tenders/collector
         executado por Render Cron Job; retry, dedup, log, notificações
   │ grava (usuário de banco restrito ao schema licitacoes)
   ▼
Postgres do FINGERENCE
   ├─ public: usuarios, contas, conta_membros, membro_permissoes, finanças
   └─ licitacoes: editais, contas habilitadas, acessos, buscas, acompanhamento,
                  notificações, coleta
   ▲
   │ lê e grava
Backend do FINGERENCE: login e contas existentes; rotas /api/tenders/*
   ▲
   │ HTTP (JSON), mesmo token
   ├─ App de finanças (app.html): sem mudanças
   └─ App de Licitações (entrada HTML nova): Início · Licitações · Configurações
```

Princípios:

- O **coletor** roda fora do serviço web (Render Cron Job executando o CLI). Se ele falhar ou o PNCP ficar fora do ar, o FINGERENCE continua funcionando.
- O coletor usa um **usuário de banco próprio**, com permissão só no schema `licitacoes`. Por isso ele lê e grava apenas tabelas desse schema.
- A regra "edital bate com busca salva" vive em **uma função SQL** (seção 7.3), usada pelo coletor e pelo backend. Assim não há duas implementações divergentes.
- Linguagem do coletor: Node/TypeScript, no pacote do backend (stack única).
- O app de Licitações é uma entrada própria do front, com rotas por URL. O app de finanças não muda.

---

## 5. Fonte de dados — API de Consultas do PNCP

### 5.1 Endereços

| Item | Valor |
|---|---|
| URL base | `https://pncp.gov.br/api/consulta` |
| Swagger | `https://pncp.gov.br/api/consulta/swagger-ui/index.html` |
| OpenAPI (JSON) | `https://pncp.gov.br/api/consulta/v3/api-docs` |
| Autenticação | Não exige (API pública) |

**Tarefa da Fase 1:** baixar o OpenAPI atual e salvar em `backend/src/modules/tenders/collector/docs/pncp-openapi.json`. Validar contra ele todos os parâmetros abaixo; se divergirem, o OpenAPI prevalece.

### 5.2 Endpoints usados

| Endpoint | Uso | Obrigatórios | Opcionais relevantes |
|---|---|---|---|
| `GET /v1/contratacoes/proposta` | Varredura completa: contratações com recebimento de propostas em aberto | `dataFinal` (AAAAMMDD), `pagina` | `codigoModalidadeContratacao`, `uf`, `codigoMunicipioIbge`, `cnpj`, `tamanhoPagina` |
| `GET /v1/contratacoes/publicacao` | Coleta incremental: publicadas em um período | `dataInicial`, `dataFinal`, `codigoModalidadeContratacao`, `pagina` | `uf`, `codigoMunicipioIbge`, `cnpj`, `tamanhoPagina` |
| `GET /v1/contratacoes/atualizacao` | Atualizações de contratações já coletadas (retificação, suspensão, alteração de prazo) | `dataInicial`, `dataFinal`, `codigoModalidadeContratacao`, `pagina` | iguais à publicação |

Observações importantes:

- **Sempre enviar `codigoModalidadeContratacao`**, inclusive no endpoint `proposta` (há fontes que o tratam como obrigatório e outras como opcional; enviar sempre evita erro). Iterar por modalidade.
- `tamanhoPagina`: usar **50** (máximo). Valores abaixo de 10 retornam erro 400.
- A API **não tem busca textual nem filtro de valor no servidor**. Palavra-chave e faixa de valor são filtradas **localmente**, no nosso banco.
- Resposta paginada: envelope com `data`, `totalRegistros`, `totalPaginas`, `numeroPagina`, `paginasRestantes`, `empty`. Tratar também **HTTP 204** (sem conteúdo) como página vazia.
- A API pode ficar lenta ou instável: timeout, retry com backoff e jitter (seção 6.4).

### 5.3 Endpoints de detalhe (sob demanda, pela tela de detalhe)

Usados pelo backend, com cache, quando o usuário abre um edital (validar caminhos no Swagger da API PNCP principal, `https://pncp.gov.br/api/pncp`):

- Itens da compra: `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens`
- Arquivos do edital: `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos`

O `{cnpj}`, `{ano}` e `{sequencial}` vêm do registro coletado (`orgaoEntidade.cnpj`, `anoCompra`, `sequencialCompra`). Link público do edital: `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial}`.

### 5.4 Tabelas de domínio (validar no manual/OpenAPI)

**Modalidade de contratação** (`codigoModalidadeContratacao`):

| Código | Modalidade |
|---|---|
| 1 | Leilão – Eletrônico |
| 2 | Diálogo Competitivo |
| 3 | Concurso |
| 4 | Concorrência – Eletrônica |
| 5 | Concorrência – Presencial |
| 6 | Pregão – Eletrônico |
| 7 | Pregão – Presencial |
| 8 | Dispensa de Licitação |
| 9 | Inexigibilidade |
| 10 | Manifestação de Interesse |
| 11 | Pré-qualificação |
| 12 | Credenciamento |
| 13 | Leilão – Presencial |

**Padrão de modalidades coletadas:** `6, 8, 4, 7` (configurável).

**Situação da contratação** (`situacaoCompraId`): 1 Divulgada no PNCP · 2 Revogada · 3 Anulada · 4 Suspensa.

Guardar os domínios numa tabela (`licitacoes.dominio`) ou constante versionada, para exibir nomes na interface sem chamar a API.

### 5.5 Campos esperados no registro de contratação

Mapear (validar com respostas reais salvas como fixtures):

| Campo PNCP | Coluna local |
|---|---|
| `numeroControlePNCP` | `numero_controle_pncp` (chave única) |
| `orgaoEntidade.cnpj` / `.razaoSocial` / `.esferaId` | `orgao_cnpj`, `orgao_razao_social`, `esfera` |
| `unidadeOrgao.ufSigla` / `.municipioNome` / `.codigoIbge` / `.nomeUnidade` / `.codigoUnidade` | `uf`, `municipio_nome`, `municipio_ibge`, `unidade_nome`, `unidade_codigo` |
| `modalidadeId` / `modalidadeNome` | `modalidade_id`, `modalidade_nome` |
| `modoDisputaId` / `modoDisputaNome` | `modo_disputa_id`, `modo_disputa_nome` |
| `situacaoCompraId` / `situacaoCompraNome` | `situacao_id`, `situacao_nome` |
| `anoCompra`, `sequencialCompra`, `numeroCompra`, `processo` | idem em snake_case |
| `objetoCompra` | `objeto` |
| `informacaoComplementar` | `informacao_complementar` |
| `srp` | `srp` |
| `valorTotalEstimado` | `valor_total_estimado` |
| `dataPublicacaoPncp`, `dataAberturaProposta`, `dataEncerramentoProposta`, `dataAtualizacao` | `data_publicacao_pncp`, `data_abertura_proposta`, `data_encerramento_proposta`, `data_atualizacao_pncp` |
| `linkSistemaOrigem` | `link_sistema_origem` |
| resposta inteira | `payload` (JSONB) |

Datas do PNCP vêm sem fuso: interpretar como `America/Sao_Paulo` e gravar como `timestamptz`.

---

## 6. Coletor

### 6.1 Estrutura

```
backend/src/modules/tenders/
├── db/schema.ts             # tabelas em pgSchema('licitacoes') (Drizzle)
├── collector/
│   ├── docs/pncp-openapi.json
│   ├── fixtures/            # respostas reais do PNCP salvas em JSON
│   ├── config.ts            # lê e valida as variáveis de ambiente
│   ├── pncpClient.ts        # fetch nativo, retry com backoff, paginação
│   ├── mapping.ts           # payload PNCP → linha do banco, com validação
│   ├── repository.ts        # upsert e registro de execução
│   ├── notifications.ts     # chamadas SQL de geração de notificações
│   ├── runs.ts              # orquestra varredura e incremental
│   ├── cli.ts               # comandos (util.parseArgs)
│   └── *.test.ts
├── routes/                  # /api/tenders/*
└── services/
```

Dependências: `pg` e `drizzle-orm` (já existentes); `zod` no backend para validar o payload do PNCP (nova no backend, já usada no front); logs estruturados em JSON via `console`, sem dependência nova. Testes com `node --test` via `tsx`; o cliente recebe o `fetch` por parâmetro, para simular HTTP sem biblioteca extra.

### 6.2 Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `TENDERS_COLLECTOR_DATABASE_URL` | — | Conexão com usuário restrito ao schema `licitacoes` |
| `PNCP_BASE_URL` | `https://pncp.gov.br/api/consulta` | |
| `PNCP_MODALITIES` | `6,8,4,7` | Modalidades coletadas |
| `PNCP_STATES` | vazio (todas) | Limitar UFs na coleta, se o volume for alto |
| `PNCP_HORIZON_DAYS` | `60` | `dataFinal` da varredura = hoje + N dias |
| `PNCP_PAGE_SIZE` | `50` | |
| `PNCP_REQUEST_INTERVAL_MS` | `4000` | Pausa entre requisições (v1.3: a 400 ms o PNCP responde 429; a 4 s, não) |
| `PNCP_TIMEOUT_S` | `30` | |
| `PNCP_MAX_ATTEMPTS` | `5` | |
| `TENDERS_COLLECTOR_LOG_LEVEL` | `info` | |

### 6.3 Estratégia de coleta

**Varredura completa** (1x por dia, madrugada, ex.: 03:00):

1. Para cada modalidade configurada (e cada UF, se `PNCP_STATES` estiver preenchida):
   - Chamar `/v1/contratacoes/proposta` com `dataFinal = hoje + PNCP_HORIZON_DAYS`, `tamanhoPagina = 50`, paginando até `paginasRestantes = 0`.
2. Fazer **upsert** de cada registro por `numero_controle_pncp`:
   - Novo → `INSERT`, marcar como novo nesta execução.
   - Existente com `data_atualizacao_pncp` diferente ou hash do payload diferente → `UPDATE`, marcar como atualizado.
   - Igual → apenas atualizar `ultima_coleta_em`.

**Incremental** (a cada 2 horas, das 07:00 às 21:00):

1. Para cada modalidade: `/v1/contratacoes/publicacao` com `dataInicial = ontem`, `dataFinal = hoje`.
2. Para cada modalidade: `/v1/contratacoes/atualizacao` com o mesmo período.
3. Upsert igual à varredura. Ignorar registros cujo `data_encerramento_proposta` já passou.

**Edital sem prazo de proposta** (v1.3): registro sem `dataEncerramentoProposta` não recebe proposta (ex.: dispensa sem disputa, cerca de 1.150 por dia) e fica fora da varredura e da incremental. A limpeza (6.7) apaga os que já estavam gravados.

**Após cada execução** (varredura ou incremental):

1. Gerar notificações de **novo edital** para os IDs novos (seção 7.4).
2. Gerar notificações de **edital alterado** para editais atualizados que estejam em acompanhamento.
3. Gerar **lembretes de prazo** (comando separado, 1x por hora): editais com status "Vou participar" cujo encerramento está em até 3 dias e em até 1 dia.

### 6.4 Robustez

- **Retry** em timeout, erro de conexão, HTTP 429 e 5xx: até `PNCP_MAX_ATTEMPTS`, backoff exponencial com jitter (1s, 2s, 4s, 8s…); no 429 sem `Retry-After`, 30 s, 60 s e até 2 min (v1.3). HTTP 4xx (exceto 429) não repete: registrar e seguir.
- **Respeitar `Retry-After`** quando presente.
- **Lock de execução** com `pg_try_advisory_lock` para impedir duas coletas simultâneas.
- **Falha parcial não aborta tudo:** erro numa modalidade/página é registrado e a coleta segue. Status final `PARCIAL`.
- **Transação por página** (não por execução inteira).
- **Log estruturado** (JSON) e registro em `licitacoes.coleta_execucao`.

### 6.5 Comandos (CLI)

```
npm --prefix backend run tenders -- sweep                     # varredura completa
npm --prefix backend run tenders -- incremental               # publicação + atualização (ontem e hoje)
npm --prefix backend run tenders -- deadline-reminders        # lembretes de prazo
npm --prefix backend run tenders -- reprocess-notifications --since 2026-10-01
npm --prefix backend run tenders -- status                    # última execução e totais
npm --prefix backend run tenders -- collect --modality 6 --state MA --max-pages 2   # depuração
npm --prefix backend run tenders -- cleanup                   # retenção (seção 6.7)
```

### 6.6 Agendamento

Render Cron Jobs executando o CLI (serviço pago por uso). Os horários do Render são em UTC; o Brasil não tem horário de verão desde 2019:

```
0 6 * * *            sweep                 # 03:00 em Brasília
0 0,10-22/2 * * *    incremental           # 07:00 a 21:00, a cada 2 h
15 * * * *           deadline-reminders
0 7 * * 0            cleanup               # domingo, 04:00
```

A varredura não deve rodar dentro do serviço web (padrão `internal-jobs`), porque pode levar dezenas de minutos e disputaria recursos com os clientes do FINGERENCE.

### 6.7 Retenção

Comando `cleanup` (semanal): apagar editais com encerramento há mais de 12 meses, e os sem prazo de proposta (v1.3), **que não tenham acompanhamento em nenhuma conta nem notificações não lidas**. Editais acompanhados são mantidos.

---

## 7. Banco de dados

O schema Drizzle do módulo fica em `backend/src/modules/tenders/db/schema.ts`, com `pgSchema('licitacoes')`, como no módulo `catalogo`. Funções SQL, configuração de busca e a coluna gerada `busca_tsv` existem só nas migrações; no Drizzle, `busca_tsv` é declarada como somente leitura.

### 7.1 Preparação

```sql
CREATE SCHEMA IF NOT EXISTS licitacoes;

-- Local: extensões instaladas no PostgreSQL 18. Render: suportadas (PostgreSQL 13+).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Configuração de busca em português sem acentos
CREATE TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent (COPY = pg_catalog.portuguese);
ALTER TEXT SEARCH CONFIGURATION licitacoes.pt_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
```

### 7.2 Tabelas

```sql
-- Global: dado público do PNCP, compartilhado por todas as contas
CREATE TABLE licitacoes.edital (
  id                          BIGSERIAL PRIMARY KEY,
  numero_controle_pncp        VARCHAR(60) NOT NULL UNIQUE,
  orgao_cnpj                  VARCHAR(14),
  orgao_razao_social          TEXT,
  esfera                      VARCHAR(2),
  unidade_codigo              VARCHAR(30),
  unidade_nome                TEXT,
  uf                          CHAR(2),
  municipio_nome              TEXT,
  municipio_ibge              VARCHAR(7),
  modalidade_id               SMALLINT,
  modalidade_nome             TEXT,
  modo_disputa_id             SMALLINT,
  modo_disputa_nome           TEXT,
  situacao_id                 SMALLINT,
  situacao_nome               TEXT,
  ano_compra                  INT,
  sequencial_compra           INT,
  numero_compra               TEXT,
  processo                    TEXT,
  objeto                      TEXT NOT NULL,
  informacao_complementar     TEXT,
  srp                         BOOLEAN,
  valor_total_estimado        NUMERIC(18,2),
  data_publicacao_pncp        TIMESTAMPTZ,
  data_abertura_proposta      TIMESTAMPTZ,
  data_encerramento_proposta  TIMESTAMPTZ,
  data_atualizacao_pncp       TIMESTAMPTZ,
  link_sistema_origem         TEXT,
  link_pncp                   TEXT,
  payload                     JSONB NOT NULL,
  hash_payload                CHAR(64) NOT NULL,
  busca_tsv                   TSVECTOR GENERATED ALWAYS AS (
                                to_tsvector('licitacoes.pt_unaccent',
                                  coalesce(objeto, '') || ' ' || coalesce(informacao_complementar, ''))
                              ) STORED,
  primeira_coleta_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_coleta_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_edital_tsv          ON licitacoes.edital USING GIN (busca_tsv);
CREATE INDEX ix_edital_objeto_trgm  ON licitacoes.edital USING GIN (objeto gin_trgm_ops);
CREATE INDEX ix_edital_uf           ON licitacoes.edital (uf);
CREATE INDEX ix_edital_municipio    ON licitacoes.edital (municipio_ibge);
CREATE INDEX ix_edital_modalidade   ON licitacoes.edital (modalidade_id);
CREATE INDEX ix_edital_encerramento ON licitacoes.edital (data_encerramento_proposta);
CREATE INDEX ix_edital_publicacao   ON licitacoes.edital (data_publicacao_pncp DESC);
CREATE INDEX ix_edital_valor        ON licitacoes.edital (valor_total_estimado);
CREATE INDEX ix_edital_orgao        ON licitacoes.edital (orgao_cnpj);

-- Contas com o módulo habilitado (trava da plataforma, gerida pelo admin)
CREATE TABLE licitacoes.conta_habilitada (
  conta_id         INTEGER PRIMARY KEY REFERENCES public.contas(id) ON DELETE CASCADE,
  ativa            BOOLEAN NOT NULL DEFAULT true,
  habilitada_por   INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  habilitada_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colaboradores com acesso ao módulo (trava da conta, gerida pelo titular).
-- O titular da conta habilitada tem acesso sem precisar de linha aqui.
CREATE TABLE licitacoes.acesso_membro (
  conta_id         INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id       INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  concedido_por    INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  concedido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, usuario_id)
);

CREATE TABLE licitacoes.busca_salva (
  id                BIGSERIAL PRIMARY KEY,
  conta_id          INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id        INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nome              VARCHAR(120) NOT NULL,
  termos            TEXT[]   NOT NULL DEFAULT '{}',
  modo_termos       VARCHAR(3) NOT NULL DEFAULT 'OU' CHECK (modo_termos IN ('OU','E')),
  termos_exclusao   TEXT[]   NOT NULL DEFAULT '{}',
  ufs               CHAR(2)[] NOT NULL DEFAULT '{}',
  municipios_ibge   VARCHAR(7)[] NOT NULL DEFAULT '{}',
  orgaos_cnpj       VARCHAR(14)[] NOT NULL DEFAULT '{}',
  modalidades       SMALLINT[] NOT NULL DEFAULT '{}',
  valor_min         NUMERIC(18,2),
  valor_max         NUMERIC(18,2),
  incluir_sem_valor BOOLEAN NOT NULL DEFAULT false,  -- v1.3 (migration 0076)
  apenas_srp        BOOLEAN,                   -- NULL = indiferente
  notificar         BOOLEAN NOT NULL DEFAULT true,
  ativa             BOOLEAN NOT NULL DEFAULT true,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_busca_conta_usuario ON licitacoes.busca_salva (conta_id, usuario_id) WHERE ativa;

-- Acompanhamento compartilhado pela equipe da conta (uma linha por conta e edital)
CREATE TABLE licitacoes.acompanhamento (
  conta_id         INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  edital_id        BIGINT  NOT NULL REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  status           VARCHAR(20) NOT NULL CHECK (status IN ('ANALISAR','PARTICIPAR','DESCARTADO')),
  observacao       TEXT,
  atualizado_por   INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, edital_id)
);

CREATE TABLE licitacoes.acompanhamento_historico (
  id               BIGSERIAL PRIMARY KEY,
  conta_id         INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  edital_id        BIGINT NOT NULL REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  status_anterior  VARCHAR(20),
  status_novo      VARCHAR(20) NOT NULL,
  observacao       TEXT,
  usuario_id       INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_historico_conta_edital ON licitacoes.acompanhamento_historico (conta_id, edital_id);

CREATE TABLE licitacoes.notificacao (
  id               BIGSERIAL PRIMARY KEY,
  conta_id         INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id       INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo             VARCHAR(30) NOT NULL CHECK (tipo IN ('NOVO_EDITAL','EDITAL_ALTERADO','PRAZO_3D','PRAZO_1D')),
  titulo           TEXT NOT NULL,
  mensagem         TEXT,
  link             TEXT NOT NULL,              -- caminho a partir do início do sistema, ex.: /editais/123 (a tela completa com /licitacoes/app)
  edital_id        BIGINT REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  busca_salva_id   BIGINT REFERENCES licitacoes.busca_salva(id) ON DELETE SET NULL,
  referencia       TEXT,                       -- desambigua EDITAL_ALTERADO (ex.: data_atualizacao_pncp)
  lida_em          TIMESTAMPTZ,
  criada_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_notificacao_unica
  ON licitacoes.notificacao (conta_id, usuario_id, tipo, edital_id, coalesce(referencia, ''));
CREATE INDEX ix_notificacao_nao_lidas
  ON licitacoes.notificacao (conta_id, usuario_id, criada_em DESC) WHERE lida_em IS NULL;

-- Global
CREATE TABLE licitacoes.coleta_execucao (
  id                BIGSERIAL PRIMARY KEY,
  tipo              VARCHAR(20) NOT NULL CHECK (tipo IN ('VARREDURA','INCREMENTAL','LEMBRETES','LIMPEZA','MANUAL')),
  status            VARCHAR(20) NOT NULL CHECK (status IN ('EXECUTANDO','SUCESSO','PARCIAL','FALHA')),
  iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em     TIMESTAMPTZ,
  requisicoes       INT NOT NULL DEFAULT 0,
  registros_lidos   INT NOT NULL DEFAULT 0,
  novos             INT NOT NULL DEFAULT 0,
  atualizados       INT NOT NULL DEFAULT 0,
  notificacoes      INT NOT NULL DEFAULT 0,
  erros             INT NOT NULL DEFAULT 0,
  detalhes          JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Global
CREATE TABLE licitacoes.cache_detalhe (
  edital_id        BIGINT NOT NULL REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  tipo             VARCHAR(10) NOT NULL CHECK (tipo IN ('ITENS','ARQUIVOS')),
  conteudo         JSONB NOT NULL,
  obtido_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (edital_id, tipo)
);
```

### 7.3 Matcher (regra única de busca)

```sql
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
```

**Busca avulsa (confirmada no plano da Fase 2):** a busca da tela usa os mesmos componentes da busca salva. O texto `q` é convertido em termos (aspas = frase), exclusões (`-termo`) e modo (`E` por padrão, com opção `OU` na tela), e a condição é montada pela mesma `fn_tsquery_termos`. Assim, "Salvar esta busca" representa qualquer busca avulsa. Criar teste que garanta que uma busca avulsa e a mesma busca salva retornam o mesmo resultado.

Regra para edital **sem valor estimado** (sigiloso ou não informado): com filtro de valor ativo, ele **não** entra no resultado, salvo com a opção "Incluir editais sem valor informado". A opção existe na tela de busca e, desde a v1.3, também na busca salva (`incluir_sem_valor`).

**v1.3: o que a implementação da Fase 2 mudou nas funções (migrations 0075 a 0077):**
- **Regra dividida em duas partes:**
  - `fn_edital_atende_criterios(e, consulta, exclusao, ufs, municipios, orgaos, modalidades, valor_min, valor_max, incluir_sem_valor, apenas_srp)` decide os critérios;
  - `fn_edital_aberto(e)` decide "prazo não vencido e situação 1".
  - `fn_edital_bate(e, b)`, com a mesma assinatura, junta as duas. A busca da tela usa as mesmas partes, então a paridade vem da construção.
- **Singular e plural:** `fn_tsquery_termos` monta cada termo também com a outra forma de cada palavra (licitação/licitações, material/materiais, item/itens, software/softwares…). Só a consulta muda; o índice continua o mesmo.

### 7.4 Geração de notificações (SQL chamado pelo coletor)

O coletor lê e grava só tabelas do schema `licitacoes`. Quem perdeu o acesso ao módulo não vê as notificações, porque a API aplica as travas de acesso na leitura (seção 11).

```sql
-- Novos editais × buscas salvas ativas, com notificação ligada, de contas habilitadas
INSERT INTO licitacoes.notificacao
  (conta_id, usuario_id, tipo, titulo, mensagem, link, edital_id, busca_salva_id)
SELECT b.conta_id,
       b.usuario_id,
       'NOVO_EDITAL',
       'Novo edital: ' || b.nome,
       left(e.objeto, 200),
       '/editais/' || e.id,
       e.id,
       b.id
FROM licitacoes.edital e
JOIN licitacoes.busca_salva b ON b.ativa AND b.notificar
JOIN licitacoes.conta_habilitada h ON h.conta_id = b.conta_id AND h.ativa
WHERE e.id = ANY ($1::bigint[])
  AND licitacoes.fn_edital_bate(e, b)
ON CONFLICT DO NOTHING;
```

- Um edital que bate com duas buscas do mesmo usuário na mesma conta gera **uma** notificação (índice único).
- Ao **criar** uma busca salva, **não** gerar notificações retroativas; a tela mostra quantos editais abertos já batem com ela.
- `EDITAL_ALTERADO`: para editais atualizados que tenham acompanhamento numa conta habilitada, notificar, naquela conta, os usuários com busca salva que bate com o edital e os que alteraram o acompanhamento (histórico), com `referencia = data_atualizacao_pncp`.
- `PRAZO_3D` / `PRAZO_1D`: acompanhamentos com status `PARTICIPAR` e encerramento nas próximas 72h/24h; destinatários iguais ao item anterior, por conta.

### 7.5 Permissões de banco

```sql
-- No Render, criar via psql (usuários criados por SQL não aparecem no painel)
CREATE ROLE licitacoes_coletor LOGIN PASSWORD '***';
GRANT USAGE ON SCHEMA licitacoes TO licitacoes_coletor;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA licitacoes TO licitacoes_coletor;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA licitacoes TO licitacoes_coletor;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA licitacoes TO licitacoes_coletor;
-- O usuário do backend é o dono das tabelas e já tem todas as permissões.
```

---

## 8. API do backend

Todas as rotas ficam sob `/api/tenders`, com `authenticate` e o middleware novo `requireTenderAccess` (seção 11). Elas **não** usam `requireActivePlan`: o módulo tem regra de acesso própria.

Convenções do FINGERENCE:

- Envelope: `{ success: true, data }`. Listas paginadas: `data: { items, page, perPage, total, totalPages }`.
- Validação com `express-validator` + `validate`. Erro: HTTP 400 com `{ success: false, message: 'Validation error', errors: [{ field, message }] }`.
- Campos de request e response em inglês (camelCase). Valores de domínio iguais aos do banco (ex.: `ANALISAR`).

**Conta da requisição:** sempre derivada no servidor.
- **Colaborador ativo:** a conta do vínculo (`conta_membros`).
- **Titular:** a conta informada pelo app, validada como sendo dele e habilitada.
- **Mecanismo (v1.3):**
  - `accountId` na query string de qualquer pedido;
  - sem ele, vale a conta habilitada do titular marcada como padrão; se nenhuma for padrão, a mais antiga;
  - colaborador que informar outra conta recebe 404.

### 8.1 Editais

| Método e rota | Descrição |
|---|---|
| `GET /api/tenders/notices` | Busca com filtros (abaixo) |
| `GET /api/tenders/notices/:id` | Detalhe, com o acompanhamento da conta e as buscas salvas do usuário que batem |
| `GET /api/tenders/notices/:id/items` | Itens da compra (PNCP, cache 24h) |
| `GET /api/tenders/notices/:id/files` | Arquivos do edital (PNCP, cache 24h) |
| `PUT /api/tenders/notices/:id/tracking` | `{ status, note }`: cria ou altera o acompanhamento da conta, grava histórico |
| `DELETE /api/tenders/notices/:id/tracking` | Remove o acompanhamento da conta (grava histórico) |
| `GET /api/tenders/notices/:id/history` | Histórico do acompanhamento da conta |

A exportação (`GET /api/tenders/notices/export`, CSV/XLSX) saiu do módulo na v1.3 (decisão do plano da Fase 2).

**Parâmetros da busca** (`GET /notices`):

| Parâmetro | Tipo | Observação |
|---|---|---|
| `q` | texto | Palavras-chave; aceita `"frase exata"` e `-exclusao` (seção 7.3) |
| `termsMode` | enum | `E` (padrão) ou `OU` |
| `state` | lista | `state=MA&state=PI` |
| `municipalityCode` | lista | Código IBGE |
| `agencyCnpj` | lista | |
| `modality` | lista | |
| `minValue`, `maxValue` | número | |
| `includeWithoutValue` | bool | Padrão `false` quando há filtro de valor |
| `publishedFrom`, `publishedTo` | data | |
| `closingFrom`, `closingTo` | data | |
| `openOnly` | bool | Padrão `true` |
| `trackingStatus` | lista | `ANALISAR`, `PARTICIPAR`, `DESCARTADO`, `SEM` |
| `hideDiscarded` | bool | Padrão `true` |
| `savedSearchId` | número | Aplica os filtros de uma busca salva do usuário |
| `sort` | enum | `closingAsc` (padrão), `publishedDesc`, `valueDesc`, `valueAsc`, `relevance` (só com `q`) |
| `page`, `perPage` | número | `perPage` máx. 100 |

Cada item retorna também `highlightedExcerpt`: trecho do objeto com os termos marcados (`ts_headline`, marcadores `<<` e `>>`). O front converte em destaque **sem** usar `dangerouslySetInnerHTML`.

v1.3: a resposta traz `parsedQuery` (`terms`, `excludedTerms` e `termsMode` entendidos de `q`, ou da busca salva), para "Salvar esta busca" gravar o mesmo conteúdo.

### 8.2 Buscas salvas

| Método e rota | Descrição |
|---|---|
| `GET /api/tenders/saved-searches` | Lista do usuário na conta, com `openCount` (abertos que batem hoje) |
| `POST /api/tenders/saved-searches` | Cria |
| `PUT /api/tenders/saved-searches/:id` | Altera |
| `PATCH /api/tenders/saved-searches/:id` | `{ active }` ou `{ notify }` |
| `DELETE /api/tenders/saved-searches/:id` | Exclui |
| `POST /api/tenders/saved-searches/:id/duplicate` | Duplica |
| `POST /api/tenders/saved-searches/preview` | Recebe filtros, devolve contagem e 5 primeiros resultados (para o formulário) |

Validações: `name` obrigatório (máx. 120); ao menos um critério além do nome; `minValue <= maxValue`; máximo 30 termos; cada termo com 2 a 80 caracteres; máximo 50 buscas por usuário em cada conta.

v1.3: a busca salva aceita `includeWithoutValue` (padrão `false`), com a mesma regra da busca da tela.

### 8.3 Notificações

| Método e rota | Descrição |
|---|---|
| `GET /api/tenders/notifications` | Lista (`unreadOnly`, `type`, paginação) |
| `GET /api/tenders/notifications/count` | `{ unread: n }`, consultado pelo sino a cada 60s |
| `PATCH /api/tenders/notifications/:id/read` | Marca como lida |
| `POST /api/tenders/notifications/mark-all-read` | |

O usuário só acessa as próprias notificações, na conta da requisição (validar `usuario_id` e `conta_id` sempre no servidor).

### 8.4 Painel, domínios, coleta e acesso

| Método e rota | Descrição |
|---|---|
| `GET /api/tenders/dashboard` | Indicadores da tela Início (seção 9.4) |
| `GET /api/tenders/domains` | Modalidades, situações, UFs, municípios com editais |
| `GET /api/tenders/collection/status` | Última execução de cada tipo, próxima prevista |
| `GET /api/tenders/collection/runs` | Histórico de execuções (titular da conta ou admin) |
| `GET /api/tenders/access` | O que a pessoa logada pode fazer no módulo (usado pelo app para montar o menu) |
| `GET /api/tenders/team` | Colaboradores da conta e quem tem acesso ao módulo (titular) |
| `PUT /api/tenders/team/:userId` | `{ hasAccess }`: concede ou retira o acesso de um colaborador da conta (titular) |
| `PUT /api/tenders/admin/accounts/:accountId` | `{ active }`: habilita ou desabilita o módulo numa conta (admin da plataforma) |

---

## 9. App de Licitações (interface)

### 9.1 Stack

A mesma do front do FINGERENCE: React 19, TypeScript, Vite 8, Tailwind 3, TanStack Query, react-hook-form + zod, lucide-react, kit de UI de `src/ui` e gráficos próprios de `src/screens/finance/painel/graficos`. Rotas do módulo com `react-router-dom` (já é dependência). Biblioteca nova (por exemplo, de tabela) só com justificativa no plano da fase.

### 9.2 Design

- Design system do FINGERENCE: tokens do Tailwind, cor da marca e tema claro/escuro pela classe `dark`.
- **Densidade**: tabelas com opção "compacta".
- **Acessibilidade**: contraste AA, foco visível, navegação por teclado, `aria-label` em botões só com ícone.

### 9.3 Estrutura

- **Entrada própria** no Vite (ex.: `tenders.html`), servida em `/licitacoes/app/*`. Esse é o link do módulo; a página pública do FINGERENCE não muda.
- **`/licitacoes` fica reservado** para a página pública futura do módulo (seção 15). Até ela existir, abre o sistema: a hospedagem entrega a entrada nova e o próprio app troca o endereço para `/licitacoes/app`. Nunca por redirecionamento permanente (301), que os navegadores guardam e atrapalharia quando a página pública chegar.
- **Links das notificações** são gravados a partir do início do sistema (`/editais/123`); a tela completa com a base `/licitacoes/app`. Se o sistema mudar de endereço, as notificações antigas continuam abrindo.
- **Login**: o mesmo `LoginPage`, com o módulo como contexto. Sem cadastro aberto; depois do login, o destino é o app de Licitações (origem própria em `auth_origin`). Sem sessão, o app mostra o login embutido, como o assistente.
- **Sem acesso** (conta não habilitada ou colaborador sem acesso): tela "Sua conta não tem acesso a Licitações", com link para o FINGERENCE.
- **Menu lateral** (recolhível; vira gaveta no celular): Início · Licitações → Buscar · Buscas salvas · Acompanhamento · Configurações (titular e admin).
- **Barra superior**: título da página e breadcrumb, busca rápida de editais (atalho `/`), botão de tema, **sino de notificações** com contador e menu do usuário com **troca de módulo** (só para quem tem acesso a mais de um) e sair.
- **Estados padrão** em todas as telas: carregando, vazio (com ação sugerida) e erro (mensagem + "tentar novamente"), com os componentes de `src/ui/states`.
- **Responsivo**: ≥1280 desktop completo; 768–1279 menu recolhido; <768 menu em gaveta, filtros em painel e tabelas viram cards.

Rotas do app (base `/licitacoes/app`): `/licitacoes/app` (Início), `/licitacoes/app/buscar`, `/licitacoes/app/editais/:id`, `/licitacoes/app/buscas`, `/licitacoes/app/acompanhamento`, `/licitacoes/app/notificacoes` e `/licitacoes/app/configuracoes`.

### 9.4 Telas

**Início (`/licitacoes/app`)**

- Cards de indicadores: Novos hoje · Encerrando em 7 dias · Em análise · Vou participar.
  - **Novos hoje** (v1.3): editais abertos coletados hoje que batem com alguma busca salva ativa do usuário.
  - **Encerrando em 7 dias** (v1.3): editais acompanhados pela conta (Analisar ou Vou participar) com prazo nos próximos 7 dias.
  - **Em análise** e **Vou participar**: acompanhamentos da conta com edital ainda aberto.
- Lista "Encerrando em breve" (editais acompanhados pela conta, ordenados por prazo, com contagem regressiva).
- Gráfico de barras horizontais: editais abertos por UF (top 10), com base nas buscas salvas do usuário.
- Lista "Minhas buscas salvas" com o total de abertos em cada uma e atalho para abrir.
- Rodapé discreto: "Última atualização dos dados: dd/MM/yyyy HH:mm" (status da coleta). Se a última coleta falhou, aviso em âmbar.

**Buscar (`/licitacoes/app/buscar`)**

- Campo de busca grande no topo (palavras-chave, com dica de sintaxe: aspas e `-exclusão`) e seletor "todas as palavras / qualquer palavra".
- Painel de filtros à esquerda (painel deslizante no celular): UF (multi), Município (combobox com busca), Modalidade (multi), Valor estimado (mín./máx. com máscara BRL + "incluir sem valor"), Publicação (período), Encerramento (período + atalhos "próximos 7/15/30 dias"), Status de acompanhamento, Órgão (CNPJ; a busca por nome ficou fora na v1.3).
- **Filtros ativos como chips removíveis** acima dos resultados + "Limpar tudo".
- **Estado dos filtros na URL** (link compartilhável, botão voltar funciona).
- Barra de resultados: total encontrado, ordenação, alternância **cards/tabela** e botão **Salvar esta busca**. O botão Exportar saiu na v1.3.
- Card de resultado:
  - Objeto (2 linhas, termos destacados): clique abre o detalhe.
  - Órgão · Município/UF.
  - Badges: modalidade, SRP, situação (se não for "Divulgada").
  - Valor estimado (ou "Não informado").
  - Prazo: data de encerramento + badge de contagem regressiva (âmbar < 7 dias, vermelho < 2 dias).
  - Status de acompanhamento (chip) e ações rápidas: Analisar · Vou participar · Descartar · Abrir no PNCP.
- Paginação no servidor (20 por página; opção 50/100).

**Detalhe do edital** (painel lateral sobre a lista; rota própria `/licitacoes/app/editais/:id`, abrível direto pelo link da notificação)

- Cabeçalho: objeto completo, órgão, município/UF, número da compra, processo, link "Abrir no PNCP" e "Sistema de origem".
- Linha do tempo de datas: publicação → abertura → encerramento (destaque para o que falta).
- Abas:
  - **Resumo**: modalidade, modo de disputa, valor estimado, SRP, situação, informação complementar.
  - **Itens**: tabela (descrição, quantidade, unidade, valor unitário e total estimados), carregada sob demanda.
  - **Arquivos**: lista com nome, tipo e link de download, carregada sob demanda.
  - **Acompanhamento**: seletor de status, observação (texto livre), histórico de alterações com usuário e data.
- Indicação de quais buscas salvas do usuário batem com o edital.

**Buscas salvas (`/licitacoes/app/buscas`)**

- Lista em cards: nome, resumo dos critérios, total de abertos hoje, interruptores "Ativa" e "Notificar", ações (abrir resultados, editar, duplicar, excluir com confirmação).
- Formulário (página ou modal grande): nome, termos (input de tags), modo E/OU, termos de exclusão (tags), UFs, municípios, órgãos, modalidades, faixa de valor com "incluir sem valor" (v1.3), SRP (indiferente/sim/não). **Prévia ao vivo** (debounce 500ms): "X editais abertos batem com esta busca" + 5 primeiros.

**Acompanhamento (`/licitacoes/app/acompanhamento`)**

- Quadro em colunas (Analisar · Vou participar · Descartado) com arrastar e soltar para mudar o status (com alternativa por menu, para acessibilidade).
- Alternativa em tabela com filtros e ordenação por prazo.
- Cards destacam prazos próximos.

**Notificações**

- Sino na barra superior: painel com as 10 mais recentes (não lidas em destaque), "Marcar todas como lidas" e "Ver todas".
- Página `/licitacoes/app/notificacoes`: lista paginada com filtro por tipo e por lidas/não lidas. Clique marca como lida e abre o edital.
- Contador atualizado a cada 60s e ao voltar o foco para a aba.

**Configurações (`/licitacoes/app/configuracoes`, titular e admin)**

- **Equipe**: colaboradores da conta (cadastrados em Configurações → Pessoas do FINGERENCE), com interruptor de acesso ao módulo.
- **Coleta**: status da última varredura e do incremental, histórico de execuções (tabela com totais e erros), modalidades e UFs coletadas (somente leitura nesta versão; os valores vêm do ambiente).

---

## 10. Disparo de Notificações

Fora deste escopo. O Disparo continua no app atual (repositório `notificacoes-comercial`), sem mudanças, acessado pelo link de sempre (decisão 12). A migração dele para um módulo do FINGERENCE pode ser um escopo futuro.

---

## 11. Segurança e acesso

- **Duas travas, ambas no servidor** (`requireTenderAccess`):
  1. **Conta habilitada**: a conta da requisição precisa estar em `licitacoes.conta_habilitada` com `ativa = true`. Só o admin da plataforma habilita contas.
  2. **Acesso por pessoa**: o titular da conta habilitada sempre tem acesso; um colaborador ativo precisa de linha em `licitacoes.acesso_membro`, concedida pelo titular em Configurações → Equipe.
- Por que o acesso por pessoa não fica em `membro_permissoes`: no FINGERENCE, quem não é colaborador recebe todas as flags liberadas, e a tela de Permissões é a mesma para todos os clientes. Uma flag ali mostraria "Licitações" a contas sem o módulo e mudaria o app de finanças. A tabela própria mantém tudo no schema `licitacoes`.
- Conta não habilitada responde como rota inexistente (404); colaborador sem acesso recebe 403.
- Login e sessão do FINGERENCE reaproveitados (JWT). O módulo não depende do plano do app de finanças.
- Buscas salvas, acompanhamento e notificações sempre filtrados por `conta_id` (e por `usuario_id`, quando forem pessoais), no servidor.
- Consultas SQL sempre parametrizadas.
- Conteúdo vindo do PNCP exibido como texto puro; links externos com `rel="noopener noreferrer"` e `target="_blank"`.
- Download de arquivos: o front abre o link original do PNCP (sem proxy de arquivo nesta versão).
- Limite de taxa na prévia da busca salva, seguindo o padrão do limitador de `backend/src/middleware/validation.ts`. É por usuário, porque o servidor não configura `trust proxy`. A exportação saiu na v1.3.
- O código das telas fica numa entrada própria do front: quem só usa o app de finanças não baixa esse código.

---

## 12. Testes e qualidade

Todos com `node --test` via `tsx`, no padrão do repositório. Testes que dependem do banco rodam contra o PostgreSQL local, num banco de teste definido no plano da Fase 1, nunca contra produção.

**Coletor**

- Mapeamento: fixtures reais (salvar 3–5 respostas do PNCP em `collector/fixtures`) → linha esperada, incluindo campos nulos e datas.
- Cliente: paginação, HTTP 204, retry em 5xx/429/timeout, sem retry em 400 (com `fetch` simulado).
- Upsert: novo, atualizado, inalterado.
- Lock: segunda execução simultânea sai sem coletar.

**Banco**

- `fn_edital_bate`: termos com e sem acento ("tributária"/"tributaria"), plural/singular, modo E/OU, exclusão, faixas de valor, edital sem valor, encerrado, situação ≠ 1.
- Notificações: sem duplicidade, sem notificação retroativa ao criar busca, nada para conta não habilitada.

**API**

- Filtros e ordenações; paginação; validações.
- Travas: conta não habilitada (404), colaborador sem acesso (403), titular de outra conta (404).
- Isolamento entre contas e entre usuários da mesma conta.
- Paridade busca avulsa × busca salva.

**Front**

- Lógica testável sem navegador: chips de filtros ↔ URL, contagem regressiva, validação do formulário de busca salva, conversão do destaque `<<`/`>>`.
- Smoke no navegador (skill `run`): login pelo link do módulo → buscar → abrir detalhe → marcar "Vou participar" → salvar busca → ver notificação.

**Qualidade**: `npm --prefix backend run build` (tipos), `npm test` e `npm --prefix backend test` passando.

---

## 13. Dados iniciais (sugestão de buscas salvas)

Criar via script opcional `seed_buscas.sql`, aplicado só com confirmação, para a conta e o usuário indicados (decisão 15):

| Nome | Termos (OU) | Exclusão |
|---|---|---|
| Gestão tributária | gestão tributária, ISS, ISSQN, IPTU, ITBI, nota fiscal de serviço eletrônica, NFS-e, dívida ativa, arrecadação municipal, cadastro imobiliário | combustível, veículo, gênero alimentício |
| Sistemas de gestão pública | sistema integrado de gestão, software de gestão pública, locação de software, licença de uso de software, cessão de direito de uso, solução tecnológica | impressora, toner |
| GED e digitalização | digitalização, gestão eletrônica de documentos, GED, protocolo eletrônico, processo eletrônico, guarda de documentos | |
| Saúde | sistema de gestão em saúde, prontuário eletrônico, regulação, e-SUS, software saúde | medicamento, material hospitalar |

Modalidades: 6 e 8. UFs: a definir.

---

## 14. Fases, tarefas e critérios de aceite

### Fase 0 — Reconhecimento (concluída)
- [x] Reconhecimento do FINGERENCE (`.plans/licitacoes-reconhecimento.md`).
- [x] Decisões 11, 16 e 17 respondidas.
- [ ] Decisões 12, 14 e 15 confirmadas (seção 16).

### Fase 1 — Banco e coletor
- [ ] Migrações: schema `licitacoes`, extensões, configuração de busca, tabelas (7.2), índices e funções (7.3). Usuário restrito (7.5) em produção só com confirmação.
- [ ] Schema Drizzle do módulo registrado em `backend/src/db/schema/index.ts`.
- [ ] OpenAPI do PNCP salvo e parâmetros validados.
- [ ] Coletor com varredura, incremental, lembretes, limpeza, status e lock.
- [ ] Fixtures reais e testes (seção 12).
- [ ] Comandos npm do coletor e configuração dos Cron Jobs documentada.
- **Aceite:** varredura real completa no banco local para as modalidades padrão; segunda execução não duplica; `status` mostra totais; testes passando. Informar volume coletado, espaço ocupado e tempo de execução, para calibrar os intervalos e avaliar o impacto no banco de produção antes de aplicar lá.
- **Projeção de 12 meses (decisão 21):** publicações dos últimos 30 dias por modalidade (`totalRegistros` da consulta `publicacao`) × 12 × tamanho médio de cada edital (tabela e índices ÷ registros). Comparar com o espaço livre do Postgres no Render antes de aplicar em produção.

### Fase 2 — API
- [ ] Rotas das seções 8.1 a 8.4, com validação, paginação e o envelope do projeto.
- [ ] `requireTenderAccess` e conta derivada no servidor.
- [ ] Habilitação de conta (admin) e acesso da equipe (titular).
- [x] ~~Exportação CSV/XLSX~~: saiu do módulo na v1.3 (decisão do plano da Fase 2).
- [ ] Testes de API, incluindo travas, isolamento entre contas e usuários e paridade busca avulsa × salva.
- **Aceite:** coleção de requisições (arquivo `.http`) cobrindo todas as rotas; testes passando.

### Fase 3 — App do módulo (base)
- [ ] Entrada nova no Vite, rotas do módulo e shell (menu, barra superior, sino com contador, tema, menu do usuário com troca de módulo).
- [ ] Login com o módulo como contexto (destino, sem cadastro aberto) e tela de "sem acesso".
- [ ] Reescritas de `/licitacoes` e `/licitacoes/app/*` para a entrada nova na hospedagem do front (decisão 23).
- [ ] Páginas placeholder para todas as rotas.
- **Aceite:** login pelo link do módulo; `/licitacoes` e `/licitacoes/app/*` abrem o sistema em produção, sem 404; navegação completa no desktop e no celular; tema claro/escuro; app de finanças, assistente e login sem regressão.

### Fase 4 — Telas do módulo
- [ ] Início, Buscar, Detalhe, Buscas salvas, Acompanhamento, Notificações e Configurações (9.4).
- [ ] Filtros sincronizados com a URL; prévia de busca salva.
- [ ] Testes de lógica e smoke no navegador.
- **Aceite:** fluxo do smoke funcionando com dados reais; notificação gerada pelo coletor aparece no sino e abre o edital.

A Fase 5 da v1.0 (migração do Disparo) saiu deste escopo (seção 10).

---

## 15. Fora do escopo desta versão

- Notificações por e-mail, WhatsApp ou push (a infraestrutura de Web Push do FINGERENCE pode ser usada numa versão futura).
- Exportação dos resultados em CSV ou XLSX (saiu na v1.3; pode voltar quando houver necessidade).
- Busca de órgão por nome no filtro da tela Buscar (v1.3: o filtro é por CNPJ).
- Classificação de relevância por IA.
- Fontes além do PNCP (plataformas privadas de pregão, portais municipais próprios).
- Resultados de licitações (vencedores, preços homologados) e análise de concorrência.
- Venda do módulo para outras contas: plano próprio, cobrança e cadastro aberto. O modelo por conta já deixa o caminho preparado. Na venda, ajustar também: termos de uso e privacidade (hoje só falam de gestão financeira), e-mail de recuperação e app instalável com a marca do produto certo e a home escolhida conforme o domínio de entrada.
- Página pública de Licitações e o link "Conheça também: Licitações" no rodapé do site do FINGERENCE. O link só entra quando a página existir (decisão 25).
- Página com dois cards (Licitações e Controle financeiro): só quando o módulo for vendido, de preferência num domínio da empresa, com cada card levando ao site do produto. O FINGERENCE mantém endereço e posição no Google (decisão 25).
- Mudanças na home do FINGERENCE (decisão 22).
- Migração do Disparo de Notificações.
- Configuração de modalidades/UFs da coleta pela interface (nesta versão, por variável de ambiente).

---

## 16. Decisões

| # | Decisão | Situação |
|---|---|---|
| 1 | SGBD | PostgreSQL do FINGERENCE (local 18; produção no Render) |
| 2 | Linguagem do coletor | Node/TypeScript, no backend do FINGERENCE |
| 3 | Modalidades coletadas | 6, 8, 4, 7 (padrão) |
| 4 | UFs coletadas | Todas; restringir se o volume da Fase 1 for alto |
| 5 | Acompanhamento | Compartilhado pela equipe da conta |
| 6 | Intervalo do incremental | A cada 2h, 07:00–21:00 |
| 7 | Onde fica o front | App próprio no FINGERENCE (entrada nova) |
| 8 | Envio do Disparo | Continua no navegador, no app atual |
| 11 | Construir no FINGERENCE | Sim (reconfirmada em 05/10/2026) |
| 12 | Disparo | **A confirmar.** Padrão: continua no app atual, sem mudanças |
| 13 | Plano pago | Resolvida: o módulo tem regra de acesso própria |
| 14 | Acesso por pessoa | **A confirmar.** Padrão: um acesso só, para o módulo inteiro |
| 15 | Conta da empresa | **A informar**: conta PJ existente (e quem é o titular) ou conta nova. Necessária para habilitar o módulo e para os dados iniciais |
| 16 | Escolha do módulo | Pelo link de cada módulo; página pública sem mudança |
| 17 | Futuro do módulo | Pode virar produto; dados por conta desde já |
| 18 | Onde fica o acesso por pessoa | Proposta da Fase 0: `licitacoes.acesso_membro`, gerido em Configurações → Equipe do módulo (seção 11) |
| 21 | Volume na produção | A Fase 1 decide: medição e projeção de 12 meses comparadas com o espaço livre do Postgres no Render. Se não couber com folga: menos UFs ou modalidades, retenção menor, plano maior ou, em último caso, só os editais num banco separado (login e contas continuam no FINGERENCE) |
| 22 | Home do FINGERENCE | Não muda enquanto o módulo for de uso interno |
| 23 | Endereços do app | Sistema em `/licitacoes/app/*`; `/licitacoes` reservado para a página pública futura e, até lá, abre o sistema pelo próprio app (seção 9.3) |
| 24 | Link das notificações | A partir do início do sistema (`/editais/<id>`); a tela completa com a base `/licitacoes/app` |
| 25 | Presença pública futura | Página pública e link "Conheça também: Licitações" no rodapé do FINGERENCE quando a página existir; página com dois cards só na venda, de preferência no domínio da empresa (seção 15) |

---

## 17. Referências

- Manual das APIs de Consultas do PNCP: https://www.gov.br/pncp/pt-br/acesso-a-informacao/manuais/ManualPNCPAPIConsultasVerso1.0.pdf
- Manual de Integração do PNCP: https://pncp.gov.br/manual/pt-br/latest/index.html
- Swagger da API de consultas: https://pncp.gov.br/api/consulta/swagger-ui/index.html
- `CLAUDE.md` e `AGENT.md` do FINGERENCE.
- `.plans/licitacoes-reconhecimento.md`.
