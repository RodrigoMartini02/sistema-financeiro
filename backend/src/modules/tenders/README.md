# Módulo de Licitações — coletor

O coletor traz do **PNCP** (Portal Nacional de Contratações Públicas) as licitações com recebimento de propostas em aberto e grava tudo no schema `licitacoes` do banco do FINGERENCE. Ele também gera as notificações do módulo (novo edital, edital alterado e prazos).

Ele roda fora do serviço web, como CLI agendado (Render Cron Job). Se ele falhar ou o PNCP ficar fora do ar, o FINGERENCE continua funcionando.

Referências:
- escopo: `.plans/licitacoes-escopo.md`;
- plano: `.plans/licitacoes-plano.md`;
- migrations `backend/drizzle/0072` a `0074`.

## Estrutura

```
backend/src/modules/tenders/
├── db/schema.ts            tabelas do schema licitacoes (Drizzle)
├── db/matcher.db.test.ts   testes da função de busca (banco local)
├── domains.ts              modalidades, situações, UFs e listas fechadas
└── collector/
    ├── docs/pncp-openapi.json   OpenAPI do PNCP (baixado em 05/10/2026)
    ├── fixtures/                respostas reais do PNCP
    ├── config.ts                variáveis de ambiente (zod)
    ├── database.ts              conexão própria (pool de 3, fuso de Brasília)
    ├── pncpClient.ts            fetch, retry com backoff, paginação
    ├── mapping.ts               registro do PNCP → linha de licitacoes.edital
    ├── repository.ts            upsert por página, lock, execuções, limpeza
    ├── notifications.ts         NOVO_EDITAL, EDITAL_ALTERADO, PRAZO_3D, PRAZO_1D
    ├── runs.ts                  varredura, incremental, lembretes, limpeza
    └── cli.ts                   comandos
```

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `TENDERS_COLLECTOR_DATABASE_URL` | — (obrigatória) | Conexão do coletor. Em produção, o usuário restrito `licitacoes_coletor` (abaixo). |
| `PNCP_BASE_URL` | `https://pncp.gov.br/api/consulta` | |
| `PNCP_MODALITIES` | `6,8,4,7` | Modalidades coletadas (1 a 13). |
| `PNCP_STATES` | vazio (todas) | Restringe as UFs (ex.: `MA,PI`), se o volume for alto. |
| `PNCP_HORIZON_DAYS` | `60` | Varredura: `dataFinal` = hoje (Brasília) + N dias. |
| `PNCP_PAGE_SIZE` | `50` | 10 a 50 (limites da API). |
| `PNCP_REQUEST_INTERVAL_MS` | `400` | Pausa entre requisições. |
| `PNCP_TIMEOUT_S` | `30` | Tempo máximo de cada requisição. |
| `PNCP_MAX_ATTEMPTS` | `5` | Tentativas em timeout, erro de rede, 429 e 5xx. |
| `TENDERS_COLLECTOR_LOG_LEVEL` | `info` | `debug`, `info`, `warn` ou `error`. |

O CLI **só** lê arquivo de ambiente quando `DOTENV_CONFIG_PATH` está definido, como no script `tenders:dev`. Ele nunca cai no `.env` de produção por padrão.

## Comandos

```bash
npm --prefix backend run tenders -- sweep                     # varredura completa (endpoint proposta)
npm --prefix backend run tenders -- incremental               # publicadas e atualizadas de ontem a hoje
npm --prefix backend run tenders -- deadline-reminders        # lembretes de prazo (PRAZO_3D e PRAZO_1D)
npm --prefix backend run tenders -- cleanup                   # retenção de 12 meses
npm --prefix backend run tenders -- status                    # última execução de cada tipo e totais
npm --prefix backend run tenders -- reprocess-notifications --since 2026-10-01
npm --prefix backend run tenders -- collect --modality 6 --state MA --max-pages 2   # depuração
```

No banco local, o mesmo comando vai com `tenders:dev`, que lê o `../.env.dev`:

```bash
npm --prefix backend run tenders:dev -- sweep
```

- **Saída:** cada execução fica em `licitacoes.coleta_execucao` com tipo, status (`SUCESSO`, `PARCIAL` ou `FALHA`), requisições, registros lidos, novos, atualizados, notificações, erros e detalhes. O código de saída é 1 em `FALHA`.
- **Trava:** com uma coleta em andamento, uma segunda sai sem coletar ("coleta já em execução"), por causa do `pg_try_advisory_lock`. Lembretes, limpeza e reprocessamento usam outra trava.

## Agendamento (Render Cron Jobs, horários em UTC)

O Brasil não tem horário de verão desde 2019: UTC−3 o ano todo.

| Cron (UTC) | Comando | Horário de Brasília |
|---|---|---|
| `0 6 * * *` | `npm --prefix backend run tenders -- sweep` | 03:00 |
| `0 0,10-22/2 * * *` | `npm --prefix backend run tenders -- incremental` | 07:00 a 21:00, a cada 2 h |
| `15 * * * *` | `npm --prefix backend run tenders -- deadline-reminders` | toda hora, aos 15 min |
| `0 7 * * 0` | `npm --prefix backend run tenders -- cleanup` | domingo, 04:00 |

- **Variáveis:** cada Cron Job precisa de `TENDERS_COLLECTOR_DATABASE_URL` e, se fugirem do padrão, das `PNCP_*`.
- **Custo:** Cron Jobs no Render são pagos por uso.
- **Quando criar:** só quando o módulo for para produção, com decisão explícita.

## Usuário de banco restrito

O coletor só lê e grava o schema `licitacoes`. Em produção ele usa um usuário próprio. No Render, crie-o via `psql` com o usuário dono do banco. Usuários criados por SQL não aparecem no painel.

```sql
CREATE ROLE licitacoes_coletor LOGIN PASSWORD '<senha forte, guardada só no Render>';
GRANT USAGE ON SCHEMA licitacoes TO licitacoes_coletor;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA licitacoes TO licitacoes_coletor;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA licitacoes TO licitacoes_coletor;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA licitacoes TO licitacoes_coletor;
```

- Rodar depois das migrations 0072 a 0074. Os `GRANT ... ON ALL` valem para o que já existe; tabelas criadas depois exigem novo `GRANT`.
- O usuário do backend é o dono das tabelas e já tem todas as permissões.
- No banco local, o coletor pode usar o mesmo usuário do `.env.dev`.

## Testes

```bash
npm --prefix backend test               # testes sem banco (inclui os do módulo); os *.db.test.ts ficam pulados
npm --prefix backend run test:tenders-db
```

`test:tenders-db` roda os testes de banco do módulo:
- **Onde:** só no banco local, e se recusa a rodar se a URL não for `localhost:5433/sistema_financas_dev`.
- **Isolamento:** cada teste roda numa transação desfeita no fim, então nada fica gravado.
- **O que cobre:**
  - upsert e trava;
  - `fn_edital_bate`: acento, plural, E/OU, exclusão, valores, edital sem valor, encerrado, situação, UF, modalidade, órgão, município e SRP;
  - notificações: sem duplicidade, sem retroativa, só conta habilitada, destinatários de "alterado", janelas de prazo, reprocessamento e isolamento entre contas.

## Como medir o volume

Depois de uma varredura:

```sql
SELECT count(*) AS editais,
       pg_size_pretty(pg_table_size('licitacoes.edital'))          AS tabela,
       pg_size_pretty(pg_indexes_size('licitacoes.edital'))        AS indices,
       pg_size_pretty(pg_total_relation_size('licitacoes.edital')) AS total,
       pg_total_relation_size('licitacoes.edital') / greatest(count(*), 1) AS bytes_por_edital
  FROM licitacoes.edital;
```

**Projeção de 12 meses (decisão 21 do escopo):**
1. Para cada modalidade coletada, uma requisição à consulta `publicacao` dos últimos 30 dias, lendo `totalRegistros`.
2. Somar e multiplicar por 12.
3. Multiplicar pelos bytes por edital (tabela e índices ÷ registros).
4. Comparar com o espaço livre do Postgres no Render antes de aplicar em produção.

É uma estimativa: o fluxo do PNCP varia de mês a mês.

## Decisões de mapeamento e datas

- **Datas do PNCP:** chegam sem fuso, no horário de Brasília. A conexão do coletor fixa `timezone = America/Sao_Paulo`, e o banco grava em `timestamptz`. O cliente devolve as datas como texto.
- **Valor estimado:** `0` vira nulo, porque é orçamento sigiloso ou não informado. Com filtro de valor, esse edital fica de fora da busca.
- **Textos:** os vazios (`""`) viram nulos e são aparados. Códigos vêm como número ou texto e são aceitos dos dois jeitos.
- **Registro inválido:** CNPJ sem 14 dígitos, UF fora do padrão, data fora do formato etc. conta como erro na execução, com o número de controle, e não derruba a página.
- **`hash_payload`:** SHA-256 do JSON com as chaves ordenadas. A mesma resposta em outra ordem dá o mesmo hash.
- **`link_pncp`:** `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial}`.
- **`link` das notificações:** `/editais/<id>`, a partir do início do app do módulo. A tela completa com `/licitacoes/app` (decisão 24).

## OpenAPI do PNCP × escopo

Conferido em 05/10/2026 contra `collector/docs/pncp-openapi.json` (API PNCP CONSULTA 1.0). Não há divergência que mude o coletor:

- **`proposta`:** `dataFinal` e `pagina` são obrigatórios e `codigoModalidadeContratacao` é opcional. O coletor envia a modalidade sempre, como pede o escopo.
- **`publicacao` e `atualizacao`:** `dataInicial`, `dataFinal` (`yyyyMMdd`), `codigoModalidadeContratacao` e `pagina` são obrigatórios.
- **`tamanhoPagina`:** de 10 a 50; **`pagina`:** a partir de 1.
- **Parâmetros opcionais que o escopo não cita:** `codigoUnidadeAdministrativa`, `idUsuario` e, na publicação e na atualização, `codigoModoDisputa`. Não são usados.
- **HTTP 204:** o cliente trata como página vazia.
