# Módulo de Licitações — coletor e API

O coletor traz do **PNCP** (Portal Nacional de Contratações Públicas) as licitações com recebimento de propostas em aberto e grava tudo no schema `licitacoes` do banco do FINGERENCE. Ele também gera as notificações do módulo (novo edital, edital alterado e prazos).

Ele roda fora do serviço web, como CLI agendado (Render Cron Job). Se ele falhar ou o PNCP ficar fora do ar, o FINGERENCE continua funcionando.

A API (`/api/tenders`, seção [API](#api-apitenders)) roda no serviço web e serve o app do módulo.

Referências:
- escopo: `.plans/licitacoes-escopo.md`;
- planos: `.plans/licitacoes-plano.md` (geral), `.plans/licitacoes-fase2-plano.md` (API) e `.plans/licitacoes-produto.md` (assinatura própria);
- migrations `backend/drizzle/0072` a `0080`.

## Estrutura

```
backend/src/modules/tenders/
├── db/schema.ts            tabelas do schema licitacoes (Drizzle)
├── db/matcher.db.test.ts   testes da regra de busca (banco local)
├── domains.ts              modalidades, situações, UFs e listas fechadas
├── tenders.http            coleção de requisições da API (REST Client)
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
│   ├── runtime.ts                   config, log, banco e PNCP de uma execução (CLI e rotina diária)
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
```

No banco local, o mesmo comando vai com `tenders:dev`, que lê o `../.env.dev`:

```bash
npm --prefix backend run tenders:dev -- sweep
```

- **Saída:** cada execução fica em `licitacoes.coleta_execucao` com tipo, status (`SUCESSO`, `PARCIAL` ou `FALHA`), requisições, registros lidos, novos, atualizados, notificações, erros e detalhes. O código de saída é 1 em `FALHA`.
- **Trava:** com uma coleta em andamento, uma segunda sai sem coletar ("coleta já em execução"), por causa do `pg_try_advisory_lock`. Lembretes, limpeza e reprocessamento usam outra trava.

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
4. limpeza (`cleanup`), só aos domingos pelo calendário de Brasília.

Uma etapa que falha não impede as seguintes, e a execução sai com código 1 se alguma falhou (o Render avisa a falha). Coleta pulada por trava ocupada só gera aviso no log. Cada etapa registra no log uma linha JSON de início e de fim, com a duração.

- **Variáveis:** `BILLING_CRON_SECRET` (rotina de planos), `TENDERS_COLLECTOR_DATABASE_URL` e, se fugirem do padrão, `BACKEND_URL` (padrão: o backend de produção) e as `PNCP_*`.
- **Sem coleta incremental:** os editais novos entram na varredura do dia seguinte. Os lembretes pegam tudo o que encerra nas próximas 72 h e 24 h, sem repetir aviso, então uma execução por dia basta.
- **Custo:** Cron Job no Render é pago por uso (mínimo de US$ 1 por mês). A varredura leva uns 45 minutos.
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

- Rodar depois das migrations 0072 a 0077. Os `GRANT ... ON ALL` valem para o que já existe; tabelas criadas depois exigem novo `GRANT`.
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
  - upsert, trava e limpeza (encerrados há 12 meses e editais sem prazo; o favoritado fica);
  - `fn_edital_bate`: acento, singular e plural (pares medidos), E/OU, exclusão, valores, "incluir sem valor", encerrado, situação, UF, modalidade, órgão, município e SRP;
  - notificações: sem duplicidade, sem retroativa, só conta com acesso (a vencida não recebe), destinatários de "alterado", janelas de prazo, reprocessamento e isolamento entre contas;
  - assinatura (`services/subscription.db.test.ts`): regra de acesso, teste uma vez por conta, pagamento avulso sem aplicar duas vezes, recorrente e ativação;
  - API:
    - travas: conta sem o módulo, inativa ou alheia dá 404, colaborador sem acesso dá 403 e assinatura vencida dá 402;
    - isolamento entre contas e entre pessoas da mesma conta;
    - busca: filtros, ordenações, paginação e paridade com a busca salva;
    - buscas salvas: validações, limite de 50 e prévia;
    - acompanhamento e histórico, notificações, painel e equipe;
    - favoritos: de cada pessoa, sem duplicar, na busca, no detalhe e no filtro `favoritesOnly`;
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
- **`link` das notificações:** `/editais/<id>`, a partir do início do app do módulo. A tela completa com `/licitacoes/app` (decisão 24).

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
- **Endereço:** `/licitacoes` também abre o sistema: o próprio app troca o endereço para `/licitacoes/app`, nunca com 301. A página de Licitações no site é `/produtos/licitacoes/` (plano `.plans/site-novo.md`).
- **Login:** é o `LoginPage` de sempre, com `context="tenders"`. "Criar nova conta" cadastra com `modulo: 'licitacoes'` (15 dias grátis, sem cartão). Depois do login, a pessoa volta para `/licitacoes/app` (`auth_origin = tenders`, inclusive pelo Google).
- **Entrada no módulo**, conforme `GET /api/tenders/access`:
  - sem sessão: login;
  - 404: o titular com conta sem o módulo vê "Ativar Licitações — 15 dias grátis" (escolhe a conta se tiver mais de uma); os demais, "sua conta não tem acesso";
  - 402: o titular vê a assinatura da conta vencida e paga ali mesmo; o colaborador, "peça ao titular para renovar";
  - 403: "peça ao titular";
  - outro erro: "tentar de novo".
- **Servidor local:** o `vite.config.ts` reescreve `/licitacoes` e `/licitacoes/*` para `tenders.html`, tanto no `npm run dev` quanto no `vite preview`.

**Hospedagem em produção (feita em 06/10/2026):**
- O site estático reescreve (rewrite, nunca redirect/301) `/licitacoes` e `/licitacoes/*` para `/tenders.html`, como já fazia com `/loja/*`.
- O build gera `dist/tenders.html`.

**Caminhos até o módulo** (plano `.plans/site-novo.md`, decisão 5: Licitações e FINGERENCE separados no site e nos sistemas):
- **Site:** a página `/produtos/licitacoes/` tem "Teste grátis por 15 dias" (abre o cadastro com `context="tenders"`) e "Entrar" (vai para `/licitacoes/app`). Nas páginas da empresa, o menu "Acessar" também leva a `/licitacoes/app`.
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
  - "Número e ano", no topo do painel de filtros: o campo "Número, processo ou controle PNCP" vale ao sair dele ou com Enter, e "Ano da compra" lista do ano seguinte até 4 anos atrás.
- **Detalhe:** abre no painel lateral (`?edital=<id>` em Buscar) e na rota `/editais/:id`, com o botão Favoritar no cabeçalho. Itens e arquivos do PNCP só são pedidos quando a aba abre.
- **Favoritos (`/favoritos`):** todos os favoritos da pessoa, inclusive os encerrados e os descartados, pela data de encerramento, paginados, um card por linha. O coração fica no card, na tabela e no detalhe.
- **Buscas salvas (`/buscas`):**
  - cards com o resumo dos critérios, os abertos agora e os interruptores Ativa e Notificar;
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

**Observação do acompanhamento:** o `PUT /notices/:id/tracking` grava o status e a observação juntos, e a observação ausente vira vazia. Por isso a ação rápida da lista lê o edital antes de gravar e reenvia a observação atual.

## OpenAPI do PNCP × escopo

Conferido em 05/10/2026 contra `collector/docs/pncp-openapi.json` (API PNCP CONSULTA 1.0). Não há divergência que mude o coletor:

- **`proposta`:** `dataFinal` e `pagina` são obrigatórios e `codigoModalidadeContratacao` é opcional. O coletor envia a modalidade sempre, como pede o escopo.
- **`publicacao` e `atualizacao`:** `dataInicial`, `dataFinal` (`yyyyMMdd`), `codigoModalidadeContratacao` e `pagina` são obrigatórios.
- **`tamanhoPagina`:** de 10 a 50; **`pagina`:** a partir de 1.
- **Parâmetros opcionais que o escopo não cita:** `codigoUnidadeAdministrativa`, `idUsuario` e, na publicação e na atualização, `codigoModoDisputa`. Não são usados.
- **HTTP 204:** o cliente trata como página vazia.
