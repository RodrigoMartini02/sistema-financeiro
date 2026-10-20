# Módulo de Licitações — coletor e API

O coletor traz do **PNCP** (Portal Nacional de Contratações Públicas) as licitações com recebimento de propostas em aberto e grava tudo no schema `licitacoes` do banco do FINGERENCE. Ele também gera as notificações do módulo (novo edital, edital alterado e prazos).

Ele roda fora do serviço web, como CLI agendado (Render Cron Job). Se ele falhar ou o PNCP ficar fora do ar, o FINGERENCE continua funcionando.

A API (`/api/tenders`, seção [API](#api-apitenders)) roda no serviço web e serve o app do módulo.

Referências:
- escopo: `.plans/licitacoes-escopo.md`;
- planos: `.plans/licitacoes-plano.md` (geral), `.plans/licitacoes-fase2-plano.md` (API), `.plans/licitacoes-produto.md` (assinatura própria), `.plans/licitacoes-contratos-a-vencer.md` (contratos), `.plans/licitacoes-base-nacional.md` (arquivo no R2 e base enxuta) e `.plans/licitacoes-contratos-no-r2.md` (contratos em Parquet no R2);
- migrations `backend/drizzle/0072` a `0080`, `0085` e `0086` (contratos), `0087` (contratos de todos os tipos), `0087a` (frases de cada termo da busca), `0087b` (os contratos saem do Postgres, para o R2) e `0088` (edital sem o JSON bruto).

## Estrutura

```
backend/src/modules/tenders/
├── db/schema.ts            tabelas do schema licitacoes (Drizzle)
├── db/matcher.db.test.ts   testes da regra de busca (banco local)
├── domains.ts              modalidades, situações, UFs e listas fechadas
├── objectStorage.ts        cliente do Cloudflare R2, na pasta do ambiente (arquivo bruto e armazém)
├── tenders.http            coleção de requisições da API (REST Client)
├── contractStore/          armazém de contratos em Parquet no R2 (DuckDB)
│   ├── layout.ts                    conjuntos, colunas, ordens, faixas e nomes dos arquivos
│   ├── manifest.ts                  manifesto: os arquivos em uso e os totais
│   ├── localCopy.ts                 cópia local dos arquivos do manifesto
│   ├── duckdb.ts                    DuckDB sem extensões baixadas, com limite de memória
│   ├── textSearch.ts                radicais e grupos de dígitos calculados pelo Postgres
│   ├── criteria.ts                  a regra única dos critérios de contratos, em SQL do DuckDB
│   ├── queries.ts                   consultas da API e dos avisos: lista, detalhe, contagem e janelas de vencimento
│   ├── writer.ts                    gravação (Cron Job): mudanças, partes regravadas e publicação
│   ├── reader.ts                    leitura (Web Service): cópia local, troca de versão, fila e limite de tempo
│   └── service.ts                   o armazém do Web Service: começa com o servidor, sem atrasar o /health
├── collector/
│   ├── docs/pncp-openapi.json       OpenAPI da API de Consultas do PNCP (05/10/2026)
│   ├── docs/pncp-api-openapi.json   OpenAPI da API principal do PNCP (itens e arquivos, 05/10/2026)
│   ├── fixtures/                    respostas reais do PNCP
│   ├── config.ts                    variáveis de ambiente (zod)
│   ├── database.ts                  conexão própria (pool de 3, fuso de Brasília)
│   ├── pncpClient.ts                fetch, retry com backoff, paginação, itens e arquivos
│   ├── mapping.ts                   registro do PNCP → linha de licitacoes.edital
│   ├── repository.ts                upsert por página, lock, execuções, limpeza
│   ├── notifications.ts             NOVO_EDITAL, EDITAL_ALTERADO, PRAZO_3D, PRAZO_1D
│   ├── runs.ts                      varredura, incremental, lembretes, limpeza
│   ├── contractMapping.ts           contrato do PNCP → contrato do armazém; vencimento pelos termos
│   ├── contractProgress.ts          andamento no Postgres: último dia lido da coleta diária e dias da carga
│   ├── contractRuns.ts              contratos: coleta diária, carga inicial e avisos, publicando o armazém
│   ├── contractNotifications.ts     CONTRATO_VENCE_90D, CONTRATO_VENCE_30D e CONTRATO_ALTERADO; total das buscas salvas
│   ├── archive.ts                   arquivo bruto das coletas no Cloudflare R2 (JSON Lines compactado)
│   ├── noticePayloadExport.ts       exportação do JSON dos editais do banco para o R2 (antes da 0088)
│   ├── runtime.ts                   config, log, banco, PNCP e R2 de uma execução (CLI e rotina diária)
│   └── cli.ts                       comandos
├── middleware/             trava do módulo (conta e acesso) e limite por usuário
├── services/               regras da API (busca, buscas salvas, acompanhamento, painel...)
└── routes/                 rotas Express e validações (express-validator)
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
| `PNCP_REQUEST_INTERVAL_MS` | `4000` | Pausa entre requisições. Medido na Fase 1: a 400 ms e a 1 s o PNCP responde 429 depois de poucas páginas; a 4 s, nenhum 429 numa varredura inteira. |
| `PNCP_TIMEOUT_S` | `30` | Tempo máximo de cada requisição. |
| `PNCP_MAX_ATTEMPTS` | `5` | Tentativas em timeout, erro de rede, 429 e 5xx. |
| `PNCP_CONTRACTS_PAGE_SIZE` | `500` | Contratos por página (10 a 500). |
| `PNCP_TERMS_INTERVAL_MS` | `500` | Pausa entre as consultas de termos (API principal), separada da consulta. Medido no piloto: mais de 10 mil consultas a 0,5 s, sem 429. |
| `TENDERS_CONTRACTS_BACKFILL_FROM` | `2021-01-01` | Dia de publicação mais antigo da carga inicial. |
| `TENDERS_CONTRACTS_BACKFILL_MINUTES` | `480` | Tempo de cada bloco da carga (1 a 600). |
| `TENDERS_ARCHIVE_ENDPOINT` | — (sem as 5 do R2, o R2 fica desligado) | Endpoint S3 da conta no Cloudflare R2, `https://<conta>.r2.cloudflarestorage.com`. Só `https`. |
| `TENDERS_ARCHIVE_BUCKET` | — | Bucket privado do R2 (minúsculas, números e hífen). |
| `TENDERS_ARCHIVE_ACCESS_KEY_ID` | — | Chave do token do R2 ("Object Read & Write", restrito ao bucket). Só no ambiente, nunca no repositório. |
| `TENDERS_ARCHIVE_SECRET_ACCESS_KEY` | — | Segredo do mesmo token. |
| `TENDERS_STORAGE_PREFIX` | — | Pasta do ambiente no bucket: `producao` no Render, `local` no `.env.dev`. Minúsculas, números e hífen. Com o banco local, `producao` é recusada. As 5 do R2 vão juntas: parte delas é erro de configuração, e a mensagem só cita os nomes. |
| `TENDERS_COLLECTOR_LOG_LEVEL` | `info` | `debug`, `info`, `warn` ou `error`. |

O CLI **só** lê arquivo de ambiente quando `DOTENV_CONFIG_PATH` está definido, como no script `tenders:dev`. Ele nunca cai no `.env` de produção por padrão.

**Esperas entre tentativas:**
- 429 sem `Retry-After`: 30 s, 60 s e depois 2 min (o PNCP não informa o limite e continua recusando por mais de 18 s);
- 5xx, tempo esgotado e erro de rede: 1, 2, 4 e 8 s, com até 25% de variação;
- `Retry-After` informado: o valor dele, até 2 min.

## Comandos

```bash
npm --prefix backend run tenders -- sweep                     # varredura completa (endpoint proposta)
npm --prefix backend run tenders -- incremental               # publicadas e atualizadas de ontem a hoje
npm --prefix backend run tenders -- deadline-reminders        # lembretes de prazo (PRAZO_3D e PRAZO_1D)
npm --prefix backend run tenders -- cleanup                   # encerrados há 12 meses e editais sem prazo
npm --prefix backend run tenders -- status                    # última execução de cada tipo e totais
npm --prefix backend run tenders -- reprocess-notifications --since 2026-10-01
npm --prefix backend run tenders -- collect --modality 6 --state MA --max-pages 2   # depuração
npm --prefix backend run tenders -- contracts-daily           # contratos publicados e atualizados de ontem a hoje
npm --prefix backend run tenders -- contract-reminders        # avisos de 90 e 30 dias antes do vencimento
npm --prefix backend run tenders -- contracts-backfill [--from 2026-09-01] [--to 2026-09-30] [--max-minutes 90]
npm --prefix backend run tenders -- notices-payload-export    # JSON dos editais do banco para o R2, antes da 0088
```

No banco local, o mesmo comando vai com `tenders:dev`, que lê o `../.env.dev`:

```bash
npm --prefix backend run tenders:dev -- sweep
```

- **Saída:** cada execução fica em `licitacoes.coleta_execucao` com tipo, status (`SUCESSO`, `PARCIAL` ou `FALHA`), requisições, registros lidos, novos, atualizados, notificações, erros e detalhes. O código de saída é 1 em `FALHA`.
- **Trava:** com uma coleta em andamento, uma segunda sai sem coletar ("coleta já em execução"), por causa do `pg_try_advisory_lock`. Lembretes, limpeza e reprocessamento usam outra trava, os contratos uma terceira (a carga manual e a rotina não rodam juntas) e a exportação do JSON dos editais uma quarta.

## Agendamento (Render Cron Job, horário em UTC)

Em produção roda **um Cron Job só**, uma vez por dia. O Render não aceita um Command longo, por isso as etapas ficam num comando do backend: `npm run daily-jobs` (`backend/scripts/dailyJobs.ts`, lógica em `src/services/dailyJobs.ts`).

| Cron (UTC) | Command | Horário de Brasília |
|---|---|---|
| `0 9 * * *` | `npm run daily-jobs` | todo dia, 06:00 |

**Configuração do Cron Job** (`rotinas-diarias-planos-licitações`): Root Directory `backend`, Build `npm install`, região Oregon (a mesma do banco).

**Etapas, em sequência:**
1. rotina de vencimento de planos (`POST /api/internal-jobs/plan-lifecycle`);
2. varredura (`sweep`);
3. lembretes de prazo (`deadline-reminders`);
4. coleta diária de contratos (`contracts-daily`);
5. avisos de vencimento dos contratos (`contract-reminders`);
6. limpeza dos editais (`cleanup`), só aos domingos pelo calendário de Brasília;
7. carga inicial de contratos (`contracts-backfill`), por último: só roda com o R2 configurado e com dia pendente (ver [Contratos a vencer](#contratos-a-vencer-dados)).

Os contratos não têm mais limpeza (parte 2 do plano `.plans/licitacoes-base-nacional.md`): os encerrados ficam na base. O tipo `CONTRATOS_LIMPEZA` fica só no histórico.

Uma etapa que falha não impede as seguintes, e a execução sai com código 1 se alguma falhou (o Render avisa a falha). Coleta pulada por trava ocupada só gera aviso no log. Cada etapa registra no log uma linha JSON de início e de fim, com a duração.

- **Variáveis:** `BILLING_CRON_SECRET` (rotina de planos), `TENDERS_COLLECTOR_DATABASE_URL` e, se fugirem do padrão, `BACKEND_URL` (padrão: o backend de produção) e as `PNCP_*`.
- **Sem coleta incremental:** os editais novos entram na varredura do dia seguinte. Os lembretes pegam tudo o que encerra nas próximas 72 h e 24 h, sem repetir aviso, então uma execução por dia basta.
- **Custo:** Cron Job no Render é pago por uso (mínimo de US$ 1 por mês). A varredura leva uns 45 minutos, e os contratos de 25 a 30 minutos por dia. Durante a carga inicial, a rotina dura ~9,5 h (o limite do Render é 12 h), por uns 10 dias, e a conta continua no mínimo.
- **Teste local:** `npm --prefix backend run daily-jobs` com `DOTENV_CONFIG_PATH=../.env.dev`, `TENDERS_COLLECTOR_DATABASE_URL` do banco local, `BACKEND_URL=http://localhost:3010` e o `BILLING_CRON_SECRET` do backend local. A varredura completa leva o mesmo tempo da produção.

## Usuário de banco restrito

O coletor só lê e grava o schema `licitacoes`. Em produção ele usa um usuário próprio. No Render, crie-o via `psql` com o usuário dono do banco. Usuários criados por SQL não aparecem no painel.

```sql
CREATE ROLE licitacoes_coletor LOGIN PASSWORD '<senha forte, guardada só no Render>';
GRANT USAGE ON SCHEMA licitacoes TO licitacoes_coletor;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA licitacoes TO licitacoes_coletor;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA licitacoes TO licitacoes_coletor;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA licitacoes TO licitacoes_coletor;
```

- Rodar depois das migrations 0072 a 0077. Os `GRANT ... ON ALL` valem para o que já existe; tabelas criadas depois exigem novo `GRANT`. As migrations 0080 e 0085 (contratos) já dão o acesso às tabelas que criam, quando o usuário existe.
- O usuário do backend é o dono das tabelas e já tem todas as permissões.
- No banco local, o coletor pode usar o mesmo usuário do `.env.dev`.

## Testes

```bash
npm --prefix backend test               # testes sem banco (inclui os do módulo); os *.db.test.ts ficam pulados
npm --prefix backend run test:tenders-db
```

Sem banco, os testes do armazém de contratos (`contractStore/*.test.ts` e `objectStorage.test.ts`) usam o R2 simulado e um S3 local: formato, chave do contrato e ida e volta da linha, critérios, consultas da API e dos avisos (`queries.test.ts`: paginação e total, ordens, filtros, número, chaves, detalhe, contagem e janelas de vencimento), gravação (estado anterior, partes regravadas só onde mudou, divisão, mudança de UF, limpeza das versões, falha no envio, várias publicações na mesma execução e os termos pendentes e a reconsulta) e leitura (sem cópia, armazém vazio, troca de versão, arquivos da versão anterior, limite de tempo, fila e R2 fora do ar), e o armazém do Web Service sem o R2 (`service.test.ts`).

`test:tenders-db` roda os testes de banco do módulo:
- **Onde:** só no banco local, e se recusa a rodar se a URL não for `localhost:5433/sistema_financas_dev`.
- **Isolamento:** cada teste roda numa transação desfeita no fim, então nada fica gravado.
- **O que cobre:**
  - upsert, trava e limpeza (encerrados há 12 meses e editais sem prazo; o favoritado fica);
  - `fn_edital_bate`: acento, singular e plural (pares medidos), E/OU, exclusão, valores, "incluir sem valor", encerrado, situação, UF, modalidade, órgão, município e SRP;
  - notificações: sem duplicidade, sem retroativa, só conta com acesso (a vencida não recebe), destinatários de "alterado", janelas de prazo, reprocessamento e isolamento entre contas;
  - contratos (`collector/contractRuns.db.test.ts`, com o R2 simulado): todos os tipos e os vencidos entram com o tipo, sem data de fim entra sem vencimento (e ganha o do aditivo), termos não reconsultados com a mesma data global, a publicação (versão nova com os totais, e sem mudança nada se publica), janela da coleta diária (a execução que não publica deixa as consultas como não concluídas), reconsulta dos termos, carga do mais recente ao mais antigo com retomada, publicação a cada N dias e dias marcados só depois de publicar, parada por tempo, carga sem o R2 não roda, CONTRATO_ALTERADO só depois de publicar, trava própria e o arquivo bruto (o que vai, falha no envio e execução que falha);
  - exportação do JSON dos editais (`collector/noticePayloadExport.db.test.ts`): sem R2 não roda; lotes em partes, com o JSON e as datas de coleta; falha no envio para sem avançar, e a seguinte continua e confere (`verified`);
  - campos de busca do armazém de contratos (`contractStore/textSearch.db.test.ts`): radicais e grupos de dígitos pelo Postgres, e a frase batendo onde a busca de hoje bate;
  - contratos a vencer (`services/contractSearch.db.test.ts`, `contractSavedSearches.db.test.ts`, `contractDetail.db.test.ts` e `collector/contractNotifications.db.test.ts`), sobre um armazém de exemplo e o Postgres do banco local: cada filtro, singular e plural, só vigentes e "Só favoritos" com os vencidos, tipo de contrato e "Incluir encerrados" (com os sem vencimento), ordenações e relevância, paginação, paridade com a busca salva, total gravado com a data (e sem total com o armazém atualizando), limite de 50 à parte, prévia, isolamento, edital de origem, favoritos pela chave, as janelas dos avisos, CONTRATO_ALTERADO e o total das buscas salvas;
  - assinatura (`services/subscription.db.test.ts`): regra de acesso, teste uma vez por conta, pagamento avulso sem aplicar duas vezes, recorrente e ativação;
  - API:
    - travas: conta sem o módulo, inativa ou alheia dá 404, colaborador sem acesso dá 403 e assinatura vencida dá 402;
    - isolamento entre contas e entre pessoas da mesma conta;
    - busca: filtros, ordenações, paginação e paridade com a busca salva;
    - buscas salvas: validações, limite de 50 e prévia;
    - acompanhamento e histórico, notificações, painel e equipe;
    - favoritos: de cada pessoa, sem duplicar, na busca, no detalhe e no filtro `favoritesOnly`;
    - contratos por HTTP: a chave com a barra codificada na URL, chave fora do formato (404), armazém atualizando (503 com o código `CONTRACT_STORE_UPDATING`) e os totais da Coleta vindos do manifesto;
    - itens e arquivos do PNCP com cache;
    - rotas por HTTP (`routes/routes.db.test.ts`).

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
- **Valor estimado:** `0` vira nulo, porque é orçamento sigiloso ou não informado. Valor negativo também vira nulo: é erro de cadastro na origem, e o PNCP já mandou um caso real. Assim o edital não se perde. Com filtro de valor, esses editais ficam de fora da busca.
- **Textos:** os vazios (`""`) viram nulos e são aparados. Códigos vêm como número ou texto e são aceitos dos dois jeitos.
- **Registro inválido:** CNPJ sem 14 dígitos, UF fora do padrão, data fora do formato etc. conta como erro na execução, com o número de controle, e não derruba a página.
- **Edital sem prazo de proposta** (sem `dataEncerramentoProposta`, como a dispensa sem disputa): não recebe proposta e fica fora da coleta, na varredura e na incremental. A execução conta os ignorados em `detalhes.skippedWithoutDeadline`. A limpeza apaga os que já estavam gravados, salvo os acompanhados, os favoritados ou com notificação não lida. Por isso, modalidades sem prazo (ex.: credenciamento) não entram no módulo.
- **`hash_payload`:** SHA-256 do JSON com as chaves ordenadas. A mesma resposta em outra ordem dá o mesmo hash.
- **`link_pncp`:** `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial}`.
- **`link` das notificações:** `/editais/<id>` ou `/contratos/<chave codificada>`, a partir do início do app do módulo. A tela completa com `/licitacoes/app` (decisão 24).

## Arquivo bruto no R2

Parte 1 do plano `.plans/licitacoes-base-nacional.md` (`collector/archive.ts`): o que as coletas leem do PNCP fica guardado no Cloudflare R2, barato e completo, e o Postgres guarda só o que a busca usa.

- **O que vai:**
  - contratos (coleta diária e carga): todos os registros lidos, inclusive os que não entram na base;
  - termos dos contratos: a resposta de cada consulta, com o número de controle (`null` quando o PNCP não conhece o contrato);
  - editais (varredura, incremental e `collect`): só os novos ou alterados, pelo hash ou pela data de atualização.
  - Itens e arquivos abertos na tela não vão.
- **Chave:** `<pasta do ambiente>/<fonte>/<conjunto>/<AAAA>/<MM>/<DD>/<execução>-<parte>.jsonl.gz`, com o dia da coleta em Brasília. Exemplo: `producao/pncp/contratos/2026/10/18/412-0001.jsonl.gz`. Conjuntos: `contratos`, `contratos-termos` e `editais`. A pasta do ambiente (`TENDERS_STORAGE_PREFIX`) é posta pelo cliente (`objectStorage.ts`); o resto do código usa as chaves sem ela.
- **Formato:** JSON Lines compactado com gzip. Cada linha é `{ "collectedAt": "<ISO>", "record": <o registro como veio> }`; nos termos, também `controlNumber`.
- **Partes:** a execução junta as linhas na memória e envia a parte ao passar de 16 MB brutos (`ARCHIVE_PART_BYTES`). O que sobra vai no fim, inclusive quando a execução falha.
- **Detalhes da execução:** `detalhes.archive = { enabled, files, records, bytes, failures }`, com o tamanho compactado. Configurações › Coleta mostra a linha "Arquivo bruto" na varredura e na coleta diária de contratos.
- **Falha no envio:** o SDK repete o envio. Se ainda falhar, a parte é descartada e conta um erro (`kind: 'archive'`, com a chave). A coleta segue, e a execução fica "Parcial".
- **Desligado:** sem as 5 variáveis do R2, a coleta segue sem arquivo, avisa no log e grava `enabled: false`.
- **Cliente:** `objectStorage.ts`, com o `@aws-sdk/client-s3` (instalado só com versões de pelo menos 2 semanas), região `auto`, caminho `/<bucket>/<chave>` e checksums só quando a operação exige. Envia, baixa, lista e apaga (um por vez: o DeleteObjects exige checksum do corpo).
- **Ligar:** criar o bucket privado e um token "Object Read & Write" restrito a ele, e definir as 5 variáveis no Cron Job, que roda as coletas, no Web Service, que lê o armazém de contratos, e no `.env.dev` (com `TENDERS_STORAGE_PREFIX=local`), para testar no local. As chaves nunca vão para o repositório, o log ou os detalhes da execução.

**Editais sem o JSON no banco** (parte 2 do mesmo plano): o coletor não grava mais `licitacoes.edital.payload`, só o hash dele. O que já estava gravado sai em três passos, banco por banco:
1. **migration 0087:** a coluna passa a aceitar NULL;
2. **`notices-payload-export`:** lê o JSON gravado em ordem de id, em lotes de 2.000 (um arquivo por lote), e envia para `pncp/editais-legado/<AAAA>/<MM>/<DD>/<execução>-<parte>.jsonl.gz`, com `controlNumber`, `firstCollectedAt` e `lastCollectedAt` em cada linha. É uma execução `MANUAL`, retomável (continua do maior `lastId` das anteriores). No fim, confere que não sobrou JSON depois do último id e grava `detalhes.verified`. Sem o R2, não roda;
3. **migration 0088:** remove a coluna. Ela recusa rodar se ainda houver JSON sem uma exportação com `verified: true` no mesmo banco.

A ordem na produção: deploy do código da parte 2, exportação, conferência e só então a 0088. A remoção não tem volta: o JSON fica só no R2.

## Armazém de contratos no R2

Partes R1 e R2 do plano `.plans/licitacoes-contratos-no-r2.md` (`contractStore/`): os contratos saem do Postgres e ficam em arquivos Parquet no R2, consultados pelo DuckDB (`@duckdb/node-api`). O coletor grava no armazém, e a API e as telas leem dele; `licitacoes.contrato` não existe mais (migration 0087b). No Postgres ficam só os dados de cada conta (favoritos, buscas salvas e avisos, que guardam o número de controle do contrato) e os dias da carga.

- **Conjuntos** (`layout.ts`), em `contratos/arquivos/<conjunto>/<pasta>/v<versão>-<nº>.parquet`:
  - `vigentes`: vencimento de hoje em diante, por faixa de vencimento (semana no 1º ano, mês no 2º, ano até 10 anos e `depois`; a pasta é o dia em que a faixa começa), em partes de até 30 mil linhas, por vencimento e UF. É refeito a cada publicação. A faixa da semana de 31/12 (fim do ano fiscal) pode ter centenas de milhares de contratos, por isso também é dividida;
  - `contratos`: todos, por ano do contrato, em partes de até 30 mil linhas por faixa de UF e número de controle. No piloto, a ordem por UF deixou a busca de palavra com UF de 3 a 9 vezes mais rápida, sem piorar órgão nem detalhe;
  - `fornecedor`: todos, só as colunas da lista, por ano, em partes de até 60 mil linhas por faixa do CNPJ do fornecedor.
  - **Por que partes desse tamanho:** cada parte é ordenada sozinha na gravação. Na importação dos 351 mil contratos locais, uma parte de 50 mil linhas não coube em 128 MB do DuckDB; com até 30 mil, a gravação cabe em 160 MB (e também em 128 MB, mais devagar).
- **Colunas:** as da antiga `licitacoes.contrato` (as datas e horas do PNCP como vieram, os termos em JSON), as datas da coleta, `radicais` e os grupos de dígitos de número, processo, controle e compra.
- **Busca de texto** (`textSearch.ts`): os radicais vêm do Postgres (`licitacoes.pt_unaccent`, o mesmo dicionário dos editais), e os grupos de dígitos de `licitacoes.fn_grupos_digitos`. Cada termo da busca vira a sequência dos seus radicais e bate quando ela aparece no texto do contrato. Palavras curtas no meio da frase (como "de") não exigem a posição exata.
- **Critérios** (`criteria.ts`): a regra única de termos (E/OU), exclusões, UF, município, órgão, categoria, fornecedor e faixa de valor, e de "vigente", usada pela tela, pela prévia e pelo total das buscas salvas e pelos avisos. O que vem da pessoa entra sempre como parâmetro. A relevância é simplificada: mais termos batendo primeiro e, no empate, o termo mais perto do começo do texto.
- **Chave do contrato** (`layout.ts`, `isContractKey`): o número de controle do PNCP (`03353358000196-2-000216/2026`) ou, nos federais, `comprasgov-<id>`. Só chave nesse formato vira consulta, favorito ou aviso; a das rotas é conferida antes e, fora do formato, dá 404. As chaves entram nas consultas como literais depois dessa conferência: com literais o DuckDB usa os mínimos e máximos dos arquivos para pular os que não têm o contrato.
- **Consultas** (`queries.ts`): a lista da tela (`vigentes` ou, com "Incluir encerrados" e "Só favoritos", `contratos`), com o total tirado da própria página quando ela é a última e, senão, uma segunda consulta na mesma vaga da fila; o detalhe e a existência pela chave; a contagem dos vigentes de uma busca; e os vigentes que vencem numa janela de dias (por critérios ou por chaves), para os avisos.
- **Manifesto** (`contratos/manifesto.json`, `manifest.ts`): a versão, o dia dos vigentes, os totais e os arquivos de cada conjunto, com linhas, tamanho e início da faixa.
- **Gravação** (`writer.ts`, Cron Job, com a trava dos contratos):
  1. baixa o manifesto e os arquivos para a cópia de trabalho;
  2. guarda as mudanças da execução numa tabela do DuckDB, no banco de trabalho em disco (160 MB, 1 linha de execução). Contrato igual (mesmo hash, vencimento e conferência dos termos) não muda;
  3. publica: regrava só as partes com contrato novo ou mudado (onde ele está e onde estava), divide a parte que passa do limite, refaz os vigentes (numa tabela do banco de trabalho, não na memória), envia os arquivos e, por último, o manifesto;
  4. apaga do bucket o que nenhum dos dois últimos manifestos usa.

  Falha no envio para antes do manifesto: a versão em uso não muda.
- **Leitura** (`reader.ts`, Web Service):
  - copia os arquivos do manifesto para uma pasta local e abre as visões `vigentes`, `contratos` e `fornecedor`;
  - confere o manifesto a cada 10 minutos, baixa só os arquivos novos e troca as visões numa transação; os arquivos da versão anterior ficam até a troca seguinte;
  - até 2 buscas ao mesmo tempo, 20 s por busca, DuckDB com 128 MB;
  - sem cópia pronta: `ContractStoreUnavailableError`, que a API responde como **503** com `code: "CONTRACT_STORE_UPDATING"` e a mensagem "Os contratos estão sendo atualizados. Tente de novo em instantes."; consulta que passa do limite de tempo responde **504** (`CONTRACT_SEARCH_TIMEOUT`);
  - armazém sem nenhuma publicação: visões vazias.
- **No Web Service** (`service.ts`): o leitor começa junto com o servidor (`server.ts`), em segundo plano, na pasta temporária da máquina (`licitacoes-contratos`); o `/health` e o resto do sistema não esperam. Até a cópia ficar pronta (cerca de 1 minuto depois de um deploy ou reinício), as rotas de contratos respondem 503. Sem as variáveis do R2, ou com elas incompletas, o servidor sobe do mesmo jeito: o log registra o motivo (sem mostrar as chaves) e os contratos ficam indisponíveis.
- **No Cron Job:** a coleta e os avisos da mesma rotina usam a mesma pasta de trabalho (`licitacoes-contratos-coletor`, no disco temporário): o que a coleta publicou já está lá quando os avisos começam, sem baixar de novo.
- **Sem extensões baixadas:** o DuckDB lê só arquivos locais, com o que vem embutido (parquet, json, icu). Os arquivos chegam pelo cliente do R2.

## Contratos a vencer (dados)

Parte A do plano `.plans/licitacoes-contratos-a-vencer.md`: os contratos do PNCP, com o vencimento atual pelos aditivos, para a área "Contratos a vencer" (Parte B). A API do PNCP só filtra contratos por data de publicação, data de atualização e órgão. Por isso eles ficam numa base própria, com uma carga inicial e uma coleta diária. Desde a Parte R2 do plano `.plans/licitacoes-contratos-no-r2.md`, essa base é o [armazém no R2](#armazém-de-contratos-no-r2), e não mais a tabela `licitacoes.contrato` (migrations 0085 a 0087, removida pela 0087b).

**O que entra** (`collector/contractMapping.ts`; desde a parte 2 do plano `.plans/licitacoes-base-nacional.md`, migration 0087):
- todos os tipos (contrato, empenho, carta contrato, termo de adesão, "Outros"...), de qualquer duração, vigentes e encerrados, com o tipo gravado (`tipo_contrato_id` e `tipo_contrato_nome`). Antes, só o "Contrato (termo inicial)" com 180 dias ou mais e ainda vigente;
- **sem vencimento**, contados nos detalhes da execução, sem erro: sem data de fim (`withoutEndDate`) e vigência de mais de 35 anos (`implausibleTerm`: digitação como 2227, ou água e energia com 2100 e 3024). Entram com `vigencia_fim_original` e `vencimento` nulos; um aditivo de prazo ou uma rescisão dá o vencimento depois;
- registro fora do formato (CNPJ, datas, fim antes do início) conta erro, como nos editais;
- fornecedor pessoa física: o CPF fica só mascarado (`***.456.789-**`).
- **Medido em 15/10/2026** (PNCP, um dia): 8.959 publicados (3.524 termos iniciais, 3.059 empenhos, 2.337 "Outros") e 11.658 atualizados. Com sinal de alteração, 2.752 (2.382 do termo inicial): cerca de 16% mais consultas de termos que antes. Pela conta (o piloto levou de 25 a 30 min com ~1.900 consultas), a coleta diária deve ficar abaixo da meta de 1 h, e por isso os termos continuam consultados para todos os tipos.

**Vencimento pelos termos:**
- **Sinal de alteração:** a atualização global mais de 24 h depois da publicação. Só com o sinal os termos são consultados (`GET /v1/orgaos/{cnpj}/contratos/{ano}/{sequencial}/termos`, na API principal). Eles só voltam a ser consultados quando a data de atualização global muda (`aditivos_referencia`).
- **Regra:** vale o termo mais recente (pela assinatura e depois pelo sequencial) que muda a vigência:
  - aditivo com `qualificacaoVigencia`: vale a `dataVigenciaFim`;
  - rescisão ("Termo de Rescisão"): vale a `dataVigenciaFim` ou, sem ela, a assinatura;
  - apostilamento não conta.
- **Aditivo de prazo sem a data nova:** mantém o vencimento anterior e é contado em `termsWithoutEndDate`. Data de fim fora do formato conta erro.
- **`aditivos`:** NULL = termos não conferidos; `[]` = conferidos, sem termo.
- **Link do contrato no PNCP:** `https://pncp.gov.br/app/contratos/{cnpj}/{ano}/{sequencial}`.

**Carga inicial** (`contracts-backfill`):
- **Ordem:** um dia de publicação por vez, do mais recente (ontem, na primeira execução) até `TENDERS_CONTRACTS_BACKFILL_FROM`.
- **Publicação:** os contratos lidos ficam nas mudanças da execução, e o armazém é publicado a cada 10 dias concluídos (`BACKFILL_PUBLISH_EVERY_DAYS`) e no fim do bloco. O dia só é marcado em `contrato_carga_dia` **depois** da publicação: um processo derrubado perde no máximo esses dias, que ficam pendentes. O dia com falha do PNCP também fica para a próxima execução. `detalhes.publications` lista as publicações da execução.
- **Paradas:** antes de cada dia, a carga confere o tempo do bloco. Para no primeiro limite, com o motivo em `detalhes.backfill.stoppedBy`:
  - `time`: tempo do bloco;
  - `pncp`: 3 dias seguidos com falha do PNCP.
- **Ligar na produção:** a carga roda com o R2 configurado (as 5 variáveis, com a pasta `producao`) e com dia pendente. Sem o R2, a etapa sai com "carga não iniciada: R2 não configurado". Sem dia pendente, sai com "carga concluída". Não há mais limite de tamanho do banco: os contratos não estão nele.
- **Andamento:** em Configurações › Coleta (bloco Contratos) ou no comando `status`.

**Coleta diária:**
- **Coleta** (plano `.plans/licitacoes-contratos-coleta-sem-perda.md`): os contratos publicados e os atualizados, cada consulta na sua janela:
  - **início:** o último dia que aquela consulta leu sem falha do PNCP, que é o fim gravado em `detalhes.queries` da última `CONTRATOS_DIARIA` em que ela terminou. Sem nenhuma, ou se for depois de ontem, ontem. Num dia normal, de ontem a hoje;
  - **fim:** hoje, ou no máximo 7 dias depois do início (`DAILY_MAX_WINDOW_DAYS`). Uma parada longa é recuperada em etapas, sem dia perdido, e Configurações › Coleta mostra "Recuperando dias sem coleta";
  - erro de registro ou de termos não segura o início. Reler um dia já lido não duplica nada;
  - a coleta publica o armazém no fim da execução, e só então as consultas valem como lidas: se a publicação falhar (R2 fora do ar), as consultas ficam como não concluídas nos detalhes e a próxima execução lê as mesmas janelas. Sem mudança nenhuma, nada é publicado;
  - quem favoritou um contrato que mudou de vencimento recebe `CONTRATO_ALTERADO` também só depois da publicação.
- **Reconsulta dos termos:** depois das consultas, até 200 contratos (`TERMS_RETRY_LIMIT`) com sinal de alteração e termos não conferidos para a atualização global atual, que sobram quando o PNCP falhou antes, na coleta ou na carga. Vão da atualização mais antiga para a mais nova, sem os que falharam na própria execução, e a reconsulta para depois de 3 falhas seguidas. A lista sai de uma consulta do DuckDB sobre a cópia de trabalho (as mudanças da execução valem mais que os arquivos), e a conferência é gravada nas mudanças, para a publicação levar ao armazém. O resumo fica em `detalhes.termsRetry`.
- **Sem limpeza:** os encerrados ficam na base (parte 2 do plano `.plans/licitacoes-base-nacional.md`). Até a parte 2, a limpeza apagava todo dia os vencidos, menos os favoritados.

**Medido no piloto** (13 e 14/10/2026, no Postgres, ainda só com o termo inicial; números completos no plano):
- **Ritmo:** nenhum 429 com termos a 4 s, 1 s e 0,5 s (mais de 10 mil consultas a 0,5 s). A consulta de contratos, a 4 s entre páginas de 500, levou de 1 a 3 s por página.
- **Espaço** (no Postgres, antes do armazém): 1.797 bytes por contrato com os índices (tabela 1.203, TOAST 51 e índices 543). No R2, 5 milhões de contratos ocupam cerca de 1 GB.
- **Setembro/2026:** 175.638 registros e 43.386 contratos (24,7%), ~2,6 min por dia útil.
- **Carga completa** (5 milhões de registros, de 2021 a 10/2026): 68 a 78 h, ~585 mil contratos e ~1 GB. Com blocos de 8 h, ~10 dias. Em um ano, ~1,1 GB.
- **Coleta diária:** ~1.900 consultas de termos e ~43 páginas, de 25 a 30 min.
- **Busca no Postgres local** (59,5 mil contratos): de 0,05 a 4,7 ms.

**Conferir** depois da carga: o manifesto do armazém (`contratos/manifesto.json`) tem os totais da versão em uso (contratos, vigentes e sem vencimento), e Configurações › Coleta mostra os mesmos números (a data é a da publicação que contou os vigentes). O comando `status` mostra a versão em uso do armazém (`contractStore`) e os dias carregados da carga.

## Contratos a vencer: busca, favoritos e avisos

Parte B do plano dos contratos a vencer (migration `0086_licitacoes_contratos_favoritos_buscas.sql`), refeita na Parte R2 do plano dos contratos no R2 (migration `0087b_licitacoes_contratos_no_r2.sql`): os contratos vêm do armazém, e o Postgres guarda só o que é de cada pessoa.

**O identificador é o número de controle do PNCP** (a "chave", `03353358000196-2-000216/2026`), no lugar do id numérico. Nas URLs a barra vai codificada (`%2F`). Os campos `pncpControlNumber` da lista e do detalhe são a chave.

**Busca** (`services/contractSearch.ts`, consultas em `contractStore/queries.ts`):
- mostra só os contratos vigentes (conjunto `vigentes`: vencimento de hoje em diante, em Brasília; sem vencimento, fica de fora). Com "Só favoritos", aparecem também os favoritos vencidos: as chaves da pessoa vão para a consulta do conjunto `contratos`;
- **"Incluir encerrados"** (`includeClosed`, parte 2 do plano `.plans/licitacoes-base-nacional.md`): todos, inclusive os vencidos e os sem vencimento (conjunto `contratos`). A ordem padrão passa a ser a publicação mais recente. É a busca mais lenta (a palavra em todos os contratos, de 3 a 12 s);
- **tipo de contrato** (`contractType`, repetível): os ids da lista `CONTRACT_TYPES` (`domains.ts`, a mesma do PNCP), com nomes curtos para a tela. O tipo e os encerrados são só da tela: a busca salva e os avisos continuam com os vigentes;
- palavras como na busca de editais, no objeto e na informação complementar. As frases de cada termo (com singular e plural) vêm do Postgres (`licitacoes.fn_frases_termo`, migration 0087a), e os radicais já estão nos arquivos;
- **número** (grupos de dígitos, como na 0079): número do contrato + ano, processo + ano, controle PNCP do contrato ou controle da compra; todos os grupos no mesmo campo;
- critérios em comum com a busca salva e os avisos (`contractStore/criteria.ts`): termos, exclusões, UF, município, órgão, categoria, fornecedor (CNPJ) e faixa de valor global, com "incluir sem valor";
- ordem padrão: o vencimento mais próximo (os sem vencimento por último). A relevância só vale com palavras e é simplificada (quantos termos batem e a posição do primeiro);
- **trecho destacado:** o `ts_headline` do Postgres, só para as linhas da página (o armazém não o tem);
- **favorito de cada linha:** uma consulta ao Postgres com as chaves da página.

**Favoritos** (`favorito_contrato`, chave primária conta + pessoa + chave): de cada pessoa na conta e idempotentes. Favoritar confere que o contrato está no armazém (404 se não está); tirar o favorito não consulta o armazém e vale mesmo com os contratos atualizando.

**Buscas salvas** (`busca_salva_contrato`): os mesmos critérios da tela, menos número, ano e "Só favoritos", com até 50 por pessoa e conta, contadas à parte das de editais.
- **Total "vigentes agora":** `activeCount` e a data `countedAt` (colunas `total_vigentes` e `total_em`). É contado no armazém ao salvar ou alterar e pela rotina diária (etapa dos avisos, todas as buscas das contas com acesso, as pausadas também). Listar não consulta o armazém. Com o armazém atualizando ao salvar, a busca é salva sem total (`null`), e a rotina conta depois;
- **prévia** (`POST /contract-searches/preview`): conta e lista os 5 primeiros no armazém.

**Avisos** (`contract-reminders`, etapa diária, e a gravação dos contratos), em `collector/contractNotifications.ts`:
- só para contas com acesso (`fn_conta_com_acesso`), sem repetir: o índice único de `notificacao` (conta, pessoa, tipo, chave, referência) usa como referência o vencimento (AAAA-MM-DD). Um vencimento novo gera os avisos de novo;
- os destinatários e os critérios vêm do Postgres; quem diz quais vigentes vencem na janela é o armazém, e o coletor cruza os dois;
- **buscas salvas** ativas com Notificar: `CONTRATO_VENCE_90D` para vencimento entre hoje + 84 e + 90 dias, e `CONTRATO_VENCE_30D` entre hoje + 24 e + 30. Assim, ao criar a busca, não chegam avisos em massa dos contratos que já estavam na janela;
- **favoritos:** `CONTRATO_VENCE_90D` entre hoje + 31 e + 90, e `CONTRATO_VENCE_30D` de hoje até + 30, um aviso por janela. O favorito avisa primeiro: o mesmo contrato não recebe de novo pela busca salva;
- **`CONTRATO_ALTERADO`:** quando a coleta ou a reconsulta dos termos grava um vencimento diferente do anterior, quem favoritou recebe "Vencimento de contrato favorito mudou para dd/mm/aaaa", depois da publicação do armazém. Contrato que ficou sem vencimento não gera aviso;
- link `/contratos/<chave codificada>` (a barra vira `%2F`). A 0087b trocou o id pela chave nos links dos avisos que já existiam. Como o contrato mora no armazém, o aviso não tem chave estrangeira.

## Singular e plural na busca (migrations 0075 e 0077)

A configuração `licitacoes.pt_unaccent` (escopo 7.1) tira os acentos **antes** de reduzir a palavra ao radical, e o radical do português depende do acento em alguns sufixos. Medido no banco local em 05/10/2026, sem ajuste:

- **Batiam (plural regular):** licença × licenças, sistema × sistemas, serviço × serviços, computador × computadores.
- **Não batiam:**
  - -ção × -ções: licitação (`licitaca`) × licitações (`licitaco`);
  - -ão × -ões/-ães: gestão × gestões, pão × pães;
  - -al × -ais, -el × -éis, -ol × -óis, -il × -is: material × materiais, papel × papéis, farol × faróis, barril × barris;
  - -m × -ns: item × itens, bem × bens;
  - palavra estrangeira: software × softwares.

**Como funciona:**
- `licitacoes.fn_tsquery_termos` monta cada termo também com a outra forma de cada palavra (`licitacoes.fn_variantes_palavra`). As frases alternativas entram com OU, cada uma pelo `phraseto_tsquery`, que mantém a ordem e as palavras de ligação.
- Só vira alternativa a forma de radical diferente do original. No máximo 16 frases por termo.
- Vale para termos e exclusões, na busca da tela, nas buscas salvas e nas notificações.
- Só a consulta muda: a coluna `busca_tsv` e o índice continuam iguais.
- Conferido com 49 pares de singular e plural de licitação.
- **Efeito colateral raro:** uma forma gerada pode coincidir com outra palavra e trazer um resultado a mais.

## API (`/api/tenders`)

Coleção completa em `tenders.http`. Montagem no `server.ts`:

- `POST /api/tenders/billing/webhook`, público: aviso do Mercado Pago (seção [Assinatura](#assinatura)). Fica antes das outras montagens.
- `/api/tenders/admin`, com `authenticate` + `requireAdmin`:
  - `GET /accounts`: contas ativas da plataforma (PF e PJ), com o dono, a cortesia e a situação de cada uma no módulo. Ordem: com o módulo primeiro, depois PJ, depois o nome;
  - `PUT /accounts/:accountId { courtesy }`: liga ou tira a cortesia. Ligada, a conta usa sem cobrança e sem limite de usuários; tirada, segue pela assinatura (sem teste nem período pago, fica vencida).
  - O `GET /api/tenders/access` devolve `permissions.manageEnabledAccounts` (admin da plataforma) para o app mostrar a tela.
- `/api/tenders`, com `authenticate`. Ativação (`/activation`) e cobrança (`/billing`) vêm antes da trava do módulo, porque a conta pode ainda não ter o módulo ou estar vencida; o resto passa pela trava (`middleware/tenderAccess.ts`).
- Nenhuma das montagens usa `requireActivePlan`: o módulo não depende do plano do app de finanças.

**Conta da requisição:**
- `accountId` na query string, opcional.
- **Colaborador** (membro ativo de uma conta): sempre a conta do vínculo; outro `accountId` dá 404.
- **Titular:** a conta pedida, se for dele. Sem `accountId`, vale a conta com acesso marcada como padrão (`eh_padrao`); se nenhuma for padrão, a de menor id. A conta vencida só entra na escolha se nenhuma outra tiver acesso.
- **Recusas:**
  - conta sem o módulo, desligada, inativa ou de outra pessoa: 404, igual à rota inexistente;
  - colaborador sem linha em `acesso_membro`: 403;
  - assinatura vencida: 402 `{ code: 'TENDERS_SUBSCRIPTION_EXPIRED', message, data: { role, account } }`. O app mostra a assinatura ao titular e o aviso ao colaborador.

**Convenções:**
- Envelope `{ success, data }`. Listas paginadas: `{ items, page, perPage, total, totalPages }`, com 20 por página e no máximo 100.
- Validação: 400 `{ success: false, message: 'Validation error', errors: [{ field, message }] }`.
- Datas em ISO 8601 com o fuso de Brasília (`2026-10-20T09:30:00-03:00`).

**Regras que completam o escopo:**
- **Busca da tela:**
  - `q` aceita até 500 caracteres: aspas = frase e `-palavra` = exclusão; o modo padrão é E. Termos com menos de 2 caracteres são ignorados.
  - Os critérios em comum com a busca salva passam pela mesma função do banco (`fn_edital_atende_criterios`), e "só abertos" usa `fn_edital_aberto`.
  - A resposta traz `parsedQuery`, para "Salvar esta busca".
  - **Número** (`number`, até 60 caracteres com ao menos um dígito) e **ano da compra** (`purchaseYear`, de 2000 a 2100), migration 0079:
    - o número vira grupos de dígitos, sem os zeros à esquerda: "PE 352/2026" vira 352 e 2026;
    - o edital entra se todos os grupos estiverem num mesmo campo: número da compra + ano, processo + ano ou controle PNCP;
    - a função `licitacoes.fn_grupos_digitos` e três índices GIN de expressão deixam a busca em 1 a 2 ms. A consulta (`services/noticeSearch.ts`) usa as mesmas expressões dos índices: mudar uma exige mudar a outra;
    - número e ano são filtros da tela: valem por cima de uma busca salva e não são gravados nela.
- **Busca salva:** tem `includeWithoutValue`. Com faixa de valor, o edital sem valor só entra com a opção ligada.
- **Acompanhamento:**
  - o histórico é gravado na mesma transação, só quando o status ou a observação mudam;
  - a remoção fica no histórico como `REMOVIDO`.
- **Favoritos** (tabela `licitacoes.favorito`, migration 0078):
  - `PUT /notices/:id/favorite` favorita e `DELETE /notices/:id/favorite` tira dos favoritos, para a pessoa logada na conta da requisição. As duas são idempotentes; edital inexistente dá 404;
  - a busca e o detalhe trazem `isFavorite`, e `favoritesOnly=true` na busca traz só os favoritos da pessoa;
  - o favorito é só da pessoa: ninguém vê o de outra, nem na mesma conta;
  - a limpeza da coleta não apaga edital favoritado.
- **Painel:**
  - "Novos hoje": coletados hoje que batem com alguma busca salva ativa do usuário;
  - "Encerrando em 7 dias": acompanhados da conta como ANALISAR ou PARTICIPAR.
- **Itens e arquivos:**
  - vêm da API principal do PNCP, com cache de 24 h em `cache_detalhe`;
  - na hora do pedido da tela: 10 s por tentativa, uma repetição curta e sem espera longa;
  - se o PNCP falhar, volta a cópia guardada com `stale: true`; sem cópia, 503;
  - compra que o PNCP ainda não tem (HTTP 404, ex.: publicada há minutos) volta vazia com `foundOnPncp: false` e não vai para o cache;
  - até 2 páginas de 500 itens; acima disso, `hasMore`.
- **Limite de taxa:**
  - prévia da busca salva: 60 por minuto por usuário, em memória;
  - é por usuário porque o servidor não configura `trust proxy`.
- **Contratos a vencer** (seção [Contratos a vencer: busca, favoritos e avisos](#contratos-a-vencer-busca-favoritos-e-avisos)):
  - `GET /contracts` (filtros `q`, `termsMode`, `state`, `municipalityCode`, `agencyCnpj`, `category`, `supplierCnpj`, `minValue`, `maxValue`, `includeWithoutValue`, `publishedFrom/To`, `expiryFrom/To`, `favoritesOnly`, `number`, `contractYear`, `savedSearchId`, `sort` e paginação), com `parsedQuery`;
  - `GET /contracts/:chave`: detalhe, aditivos, `originNoticeId` (edital de origem na base) ou `originPncpLink` (a compra no PNCP) e `pncpLink`. A chave é o número de controle do PNCP com a barra codificada (`%2F`); chave fora do formato ou contrato fora do armazém dá 404;
  - `PUT` e `DELETE /contracts/:chave/favorite`, idempotentes; o `PUT` de contrato fora do armazém dá 404;
  - **armazém sem cópia pronta:** todas as rotas que consultam contratos respondem **503** com `{ success: false, code: "CONTRACT_STORE_UPDATING", message }` (cerca de 1 minuto depois de um deploy ou reinício); consulta que passa de 20 s responde **504** com `CONTRACT_SEARCH_TIMEOUT`. Editais, favoritos (tirar), buscas salvas (listar, salvar, alterar) e o resto do módulo não param;
  - `GET /collection/status`: "Contratos na base" e os vigentes vêm do manifesto do armazém (`contracts`, `activeContracts` e a data da contagem `countedOn`), ou `null` sem cópia pronta;
  - `/contract-searches`: as mesmas rotas de `/saved-searches` (listar, criar, alterar, `PATCH` de `active` e `notify`, excluir, duplicar e `POST /preview`, também com 60 por minuto por usuário).
- **Exportação CSV/XLSX:** fora do módulo (decisão do plano da Fase 2).

## Assinatura

Plano `.plans/licitacoes-produto.md`, migration `0080_licitacoes_assinatura.sql`. Licitações é cobrado à parte do FINGERENCE, por conta.

**Dados** (colunas novas em `licitacoes.conta_habilitada`):
- `tipo_acesso`: `cortesia` (sem cobrança e sem limite de usuários) ou `assinatura`. As contas que já tinham o módulo antes da 0080 ficaram como cortesia;
- `teste_ate`, `pago_ate`, `recorrente_id` (assinatura no cartão), `usuarios_cobrados`, `ultimo_pagamento_id` e `atualizada_em`.

**Regra de acesso:** uma só, na função `licitacoes.fn_conta_com_acesso(conta_habilitada)`, usada pela trava da API e pelas notificações da coleta. A conta tem acesso se estiver ligada e for cortesia, tiver recorrente ativo ou estiver dentro do teste ou do período pago.

**Preço** (`services/billing.ts`, em centavos): R$ 4,99 por mês com 2 usuários (o titular conta) e R$ 2,99 por usuário a mais. A mudança de usuários vale a partir da próxima cobrança, sem proporcional; com recorrente, o valor no Mercado Pago é atualizado na hora (`services/recurringAmount.ts`) e, se falhar, a resposta traz um aviso.

**Como a conta entra:**
- cadastro pelo login do módulo (`POST /api/auth/register` com `modulo: 'licitacoes'`): a conta padrão já nasce com 15 dias de teste. O FINGERENCE dessa pessoa fica `sem_teste` (sem acesso e sem e-mails de plano) até ela clicar em "Começar meu teste" dentro dele (`POST /api/planos/start-trial`, plano `.plans/site-novo.md`);
- titular que já usa o FINGERENCE: `GET /activation` lista as contas dele sem o módulo e `POST /activation { accountId }` começa os 15 dias. Um teste por conta (de novo: 409); membro não ativa (403).

**Cobrança** (`/billing`, só o titular e só em conta dele; em cortesia, os pagamentos dão 409):
- `GET /billing?accountId=`: situação (`cortesia`, `teste`, `paga`, `recorrente`, `vencida` ou `desligada`), usuários, valor do mês e preço;
- `POST /billing/pix`, `/card`, `/checkout` e `/recurring`, com `{ accountId }`, nos mesmos moldes do FINGERENCE (`services/mercadoPagoCharges.ts`). A referência é `lic:<conta>`;
- pagamento avulso aprovado: mais 30 dias, contados do maior entre hoje, o fim do teste e o fim do período pago;
- `POST /billing/cancel`: para o recorrente. O acesso continua até o fim do teste ou do período já pago (no FINGERENCE é diferente). Vale também em cortesia, porque a cortesia não cancela o recorrente no Mercado Pago.

**Webhook** (`POST /api/tenders/billing/webhook`): busca o pagamento ou a assinatura no Mercado Pago pelo id e só trata a referência `lic:<conta>`. O mesmo pagamento não é aplicado duas vezes (`ultimo_pagamento_id`). Cobrança recusada ou recorrente cancelado/pausado limpam o `recorrente_id`.

## App do módulo (front, Fases 3 e 4)

O app fica no front do FINGERENCE, numa entrada própria. Quem usa só o app de finanças não baixa esse código.

- **Entrada:** `tenders.html` e `src/tenders/`, com rotas sob `/licitacoes/app` (`BrowserRouter` com `basename`).
- **Endereço:** o sistema abre só em `/licitacoes/app`. O `/licitacoes/` é a página de Licitações no site (plano `.plans/site-menu-textos-cards.md`, adendo 1).
- **Login:** é o `LoginPage` de sempre, com `context="tenders"`. "Criar nova conta" cadastra com `modulo: 'licitacoes'` (15 dias grátis, sem cartão). Depois do login, a pessoa volta para `/licitacoes/app` (`auth_origin = tenders`, inclusive pelo Google).
- **Entrada no módulo**, conforme `GET /api/tenders/access`:
  - sem sessão: login;
  - 404: o titular com conta sem o módulo vê "Ativar Licitações — 15 dias grátis" (escolhe a conta se tiver mais de uma); os demais, "sua conta não tem acesso";
  - 402: o titular vê a assinatura da conta vencida e paga ali mesmo; o colaborador, "peça ao titular para renovar";
  - 403: "peça ao titular";
  - outro erro: "tentar de novo".
- **Servidor local:** o `vite.config.ts` reescreve `/licitacoes/app` e `/licitacoes/app/*` para `tenders.html`, tanto no `npm run dev` quanto no `vite preview`.

**Hospedagem em produção (regras do site estático no Render):**
- `/licitacoes/app` e `/licitacoes/app/*` são reescritos (rewrite) para `/tenders.html`, como já acontece com `/loja/*`.
- `/licitacoes` redireciona para `/licitacoes/`, a página do site, como as outras páginas.
- O build gera `dist/tenders.html` e a página `dist/licitacoes/index.html`.

**Caminhos até o módulo** (plano `.plans/site-novo.md`, decisão 5: Licitações e FINGERENCE separados no site e nos sistemas):
- **Site:** a página `/licitacoes/` tem "Teste grátis por 15 dias" (abre o cadastro com `context="tenders"`) e "Entrar" (abre o login de Licitações, que leva a `/licitacoes/app`). As páginas da empresa não têm atalho de login.
- **Sem atalhos entre os sistemas:** o FINGERENCE não mostra Licitações (menu lateral, bloqueio de plano), e Licitações não mostra o FINGERENCE (menu, menu do usuário, telas de bloqueio). Por baixo, o cadastro (`usuarios`) e a sessão continuam os mesmos; só a apresentação e o acesso de cada um são separados.

**Desempenho medido no banco local** (05/10/2026, cerca de 25 mil editais abertos):
- busca: 4 a 17 ms, com o índice GIN;
- 50 buscas salvas com `openCount`: 271 ms;
- painel completo: 547 ms.

### Telas (Fase 4)

Plano: `.plans/licitacoes-fase4-plano.md`. A Parte 4A traz Início, Buscar, Detalhe e Buscas salvas; a Parte 4B traz Acompanhamento, Notificações e Configurações.

As telas usam a largura toda da janela. UF, Modalidade e Acompanhamento têm "Todos" e "Limpar", em Buscar e no formulário de Busca salva (plano `.plans/licitacoes-usabilidade-favoritos.md`).

Em Buscar e em Favoritos, a paginação fica no fim da página: com lista curta, desce até o rodapé da tela (`utils/screenLayout.ts`); com lista longa, vem depois do último card (plano `.plans/licitacoes-tela-busca-numero.md`).

**Contas habilitadas (`/admin/contas`)** (planos `.plans/licitacoes-acesso-rotina-diaria.md` e `.plans/licitacoes-produto.md`):
- tela só do admin da plataforma (`permissions.manageEnabledAccounts`), no fim do menu;
- busca por conta, dono ou e-mail;
- interruptor de cortesia por conta, PF ou PJ, com a situação de cada uma no módulo (sem o módulo, teste, pago, recorrente, vencida);
- tirar a cortesia pede confirmação, porque, sem teste nem período pago, a conta fica vencida (na conta em uso, o admin pode perder o acesso ao módulo);
- dar cortesia a uma conta com recorrente avisa que a cobrança no cartão continua até o titular cancelar.

- **Início (`/`):** os quatro indicadores (cada um abre a lista correspondente em Buscar), "Encerrando em breve", editais abertos por UF e "Minhas buscas salvas", com o rodapé da última coleta (âmbar se ela falhou).
- **Buscar (`/buscar`):**
  - **prazo mínimo:** por padrão, só aparecem os editais que encerram a partir de hoje + 3 dias (contados por dia), porque com menos não dá tempo de preparar a proposta;
    - o filtro "Incluir os que encerram em menos de 3 dias" (`prazoCurto=1`) traz os demais;
    - a barra de resultados avisa quantos ficaram de fora, com "Mostrar";
    - a regra não vale sem "Só editais abertos", com filtro de acompanhados (Analisar, Vou participar ou Descartado), com "Só favoritos", com número informado nem com período de encerramento que termina antes do mínimo;
    - num período escolhido, só o início sobe para o mínimo;
  - filtros na URL, para o link ser compartilhável e o voltar do navegador funcionar;
  - chips removíveis e "Limpar tudo";
  - cards ou tabela, com a opção compacta guardada no navegador;
  - ações rápidas, coração de favorito e "Salvar esta busca";
  - filtro "Só favoritos" (`favoritos=1`);
  - "Número e ano", no topo do painel de filtros: o campo "Número, processo ou controle" (número da compra, processo ou número de controle) vale ao sair dele ou com Enter, e "Ano da compra" lista do ano seguinte até 4 anos atrás.
- **Detalhe:** abre no painel lateral (`?edital=<id>` em Buscar) e na rota `/editais/:id`, com o botão Favoritar no cabeçalho. Itens e arquivos do PNCP só são pedidos quando a aba abre.
- **Contratos a vencer (`/contratos`):**
  - os contratos vigentes, no modelo de Buscar: filtros na URL, chips, "Limpar tudo", cards ou tabela, coração de favorito, "Salvar esta busca" e paginação no fim da página;
  - filtros: vencimento de/até, com os atalhos de 30, 90, 180 e 365 dias, "Só favoritos", número e ano do contrato, UF, município, categoria, valor global, publicação, órgão e fornecedor (CNPJ);
  - o card mostra o objeto, o órgão e o local, o fornecedor, o valor global e o vencimento, com "Vence em N dias" (vermelho até 30, âmbar até 90) e os selos "Prorrogado" e "Vencido";
  - detalhe no painel lateral (`?contrato=<chave>`) e na rota `/contratos/:chave` (a barra da chave vai codificada): vigência, aditivos e rescisões, dados do contrato, fornecedor e valores, "Ver documento original" e "Edital de origem";
  - **contratos sendo atualizados:** com o 503 da API, a lista, o detalhe e os Favoritos mostram "Atualizando os contratos" (não é falha) e tentam de novo a cada 15 s, com o botão "Tentar de novo";
  - **busca em todos os contratos:** com "Incluir encerrados", a tela mostra "Buscando em todos os contratos…" enquanto a consulta roda;
  - no rodapé, a última coleta diária de contratos.
- **Telas sem a marca da fonte** (parte 7 do plano `.plans/licitacoes-base-nacional.md`):
  - nenhum texto de tela cita o PNCP: "Número de controle", "Abrir edital original", "Ver documento original", "Buscando os itens…", "Edital" nas ações rápidas e avisos neutros;
  - os links ao documento original continuam, para o site oficial;
  - a API também não cita a fonte no que chega à tela: a situação 1 vira "Divulgada", a falha nos itens e arquivos diz "Não foi possível buscar os dados da compra agora", o aviso de edital alterado é "Edital acompanhado foi alterado", e os erros das consultas na Coleta dizem "A consulta falhou…". O que já estava gravado com o texto antigo (avisos e erros) aparece com o texto novo na leitura;
  - a fonte fica nos Termos de Uso e na Política de Privacidade (`src/screens/public/legalContent.ts`), como pede a política de dados abertos (Decreto 8.777/2016, art. 1º, III: livre uso, "limitando-se a creditar a autoria ou a fonte");
  - `src/tenders/screenTexts.test.ts` confere que nenhum texto das telas do módulo cita o PNCP (nomes de código, comentários e endereços não contam).
- **Favoritos (`/favoritos`):** abas Editais e Contratos (`aba=contratos`). Editais: todos os favoritos da pessoa, inclusive os encerrados e os descartados, pela data de encerramento. Contratos: inclusive os vencidos, pelo vencimento. Paginados, um card por linha. O coração fica no card, na tabela e no detalhe.
- **Buscas salvas (`/buscas`):**
  - abas Editais e Contratos (`aba=contratos`), cada uma com o seu limite de 50;
  - cards com o resumo dos critérios, os abertos agora (editais) ou os vigentes (contratos, com a data da contagem; "—" enquanto ainda não foram contados) e os interruptores Ativa e Notificar;
  - editar, duplicar e excluir, com confirmação;
  - formulário com prévia ao vivo (500 ms sem digitar).
- **Acompanhamento (`/acompanhamento`):**
  - quadro com as colunas Analisar, Vou participar e Descartado (até 100 por coluna, inclusive os encerrados), ordenadas pelo prazo;
  - arrastar e soltar no desktop e "Mover para…" em cada card, para o teclado e o celular; a mudança mantém a observação gravada;
  - tabela com filtro por status, só no desktop; a escolha entre quadro e tabela fica guardada no navegador.
- **Notificações:**
  - o sino abre um painel lateral à direita, no visual do painel de notificações do app de finanças, com as 10 mais recentes, "Marcar todas como lidas" e "Ver todas";
  - página `/notificacoes`, paginada, com filtro por tipo e por não lidas;
  - o clique marca como lida e abre o `link` gravado (relativo à base do app).
- **Configurações (`/configuracoes`):**
  - **Usuários** (só o titular): "Você (titular)", o acesso de cada colaborador ativo da conta e "Adicionar usuário" (login próprio, já com acesso ao módulo), com o preço por usuário;
  - **Assinatura** (só o titular): situação, valor do mês, pagar (Pix, cartão ou recorrente) e cancelar o recorrente;
  - **Coleta** (titular ou admin): última varredura e últimos lembretes de prazo, com a próxima execução prevista pela rotina diária das 06:00, e o histórico paginado, com os erros de cada execução. A agenda fica em `COLLECTION_SCHEDULE` (`services/collectionOverview.ts`); a incremental não está agendada.

**Parâmetros da URL de Buscar** (em português; os padrões ficam fora):

| URL | API | Observação |
| --- | --- | --- |
| `q`, `modo=ou` | `q`, `termsMode` | o modo E é o padrão |
| `uf`, `municipio`, `orgao`, `modalidade` | `state`, `municipalityCode`, `agencyCnpj`, `modality` | repetíveis |
| `valorMin`, `valorMax`, `semValor=1` | `minValue`, `maxValue`, `includeWithoutValue` | decimal com ponto |
| `publicacaoDe`, `publicacaoAte`, `encerramentoDe`, `encerramentoAte` | `publishedFrom` … `closingTo` | AAAA-MM-DD |
| `abertos=0`, `descartados=1` | `openOnly=false`, `hideDiscarded=false` | |
| `prazoCurto=1` | sem `closingFrom` mínimo | sem ele, o front envia `closingFrom` = hoje + 3 dias (salvo as exceções da regra) |
| `acompanhamento` | `trackingStatus` | `analisar`, `participar`, `descartado` ou `sem` |
| `favoritos=1` | `favoritesOnly=true` | só os favoritos da pessoa; sem prazo mínimo |
| `numero`, `ano` | `number`, `purchaseYear` | número com ao menos um dígito (sem prazo mínimo); ano AAAA de 2000 a 2100 |
| `busca` | `savedSearchId` | os critérios vêm da busca salva, e os da tela saem |
| `ordem`, `pagina`, `porPagina` | `sort`, `page`, `perPage` | `prazo`, `recentes`, `maior-valor`, `menor-valor`, `relevancia`; 20, 50 ou 100 |

**Parâmetros da URL de Contratos a vencer** (os mesmos nomes de Buscar, quando o filtro é o mesmo):

| URL | API | Observação |
| --- | --- | --- |
| `q`, `modo=ou` | `q`, `termsMode` | o modo E é o padrão |
| `uf`, `municipio`, `orgao`, `categoria`, `fornecedor` | `state`, `municipalityCode`, `agencyCnpj`, `category`, `supplierCnpj` | repetíveis |
| `valorMin`, `valorMax`, `semValor=1` | `minValue`, `maxValue`, `includeWithoutValue` | valor global, decimal com ponto |
| `publicacaoDe`, `publicacaoAte`, `vencimentoDe`, `vencimentoAte` | `publishedFrom` … `expiryTo` | AAAA-MM-DD |
| `favoritos=1` | `favoritesOnly=true` | só os favoritos da pessoa, inclusive os vencidos |
| `numero`, `ano` | `number`, `contractYear` | número com ao menos um dígito; ano do contrato, de 2000 a 2100 |
| `busca` | `savedSearchId` | busca salva de contratos: os critérios vêm dela |
| `ordem`, `pagina`, `porPagina` | `sort`, `page`, `perPage` | `vencimento`, `recentes`, `maior-valor`, `menor-valor`, `relevancia`; 20, 50 ou 100 |

**Observação do acompanhamento:** o `PUT /notices/:id/tracking` grava o status e a observação juntos, e a observação ausente vira vazia. Por isso a ação rápida da lista lê o edital antes de gravar e reenvia a observação atual.

## OpenAPI do PNCP × escopo

Conferido em 05/10/2026 contra `collector/docs/pncp-openapi.json` (API PNCP CONSULTA 1.0). Não há divergência que mude o coletor:

- **`proposta`:** `dataFinal` e `pagina` são obrigatórios e `codigoModalidadeContratacao` é opcional. O coletor envia a modalidade sempre, como pede o escopo.
- **`publicacao` e `atualizacao`:** `dataInicial`, `dataFinal` (`yyyyMMdd`), `codigoModalidadeContratacao` e `pagina` são obrigatórios.
- **`tamanhoPagina`:** de 10 a 50; **`pagina`:** a partir de 1.
- **Parâmetros opcionais que o escopo não cita:** `codigoUnidadeAdministrativa`, `idUsuario` e, na publicação e na atualização, `codigoModoDisputa`. Não são usados.
- **HTTP 204:** o cliente trata como página vazia.
