# Plano de Implementação: Módulo de Licitações no FINGERENCE

> **Status:** aprovado em 04/10/2026 e atualizado em 05/10/2026 (endereços sob `/licitacoes/app`, link das notificações, presença pública e projeção de volume). A implementação só começa com `/implementar`, numa mensagem separada, e só pela Fase 1.

## Origem

- Arquivo de especificação: `C:\Users\rodri\Music\sistema financas\.plans\licitacoes-escopo.md` (escopo v1.2)
- Reconhecimento: `C:\Users\rodri\Music\sistema financas\.plans\licitacoes-reconhecimento.md`
- Origem da v1.0: `ESCOPO_LICITACOES.md` e `docs/RECONHECIMENTO.md` (este repositório)
- Data do planejamento: `2026-10-04`
- Atualização: `2026-10-05` (decisões 21 a 25 do escopo)
- Classificação: `frontend + backend + database`, com parte de `infra/deploy` (agendamentos no Render). O módulo cria um schema novo, um coletor e uma API no backend e um app novo no front.
- Repositório de execução: FINGERENCE (`C:\Users\rodri\Music\sistema financas`), no branch `feat/R/licitacoes`, num worktree separado (Passo 0).

Este plano detalha a **Fase 1** até o nível de implementação. As Fases 2 a 4 estão em nível de tarefa: o escopo exige parar e aprovar ao fim de cada fase, e cada uma ganha um plano detalhado próprio antes de ser implementada.

---

## Resumo

O FINGERENCE ganha o módulo **Licitações**: um coletor que traz do PNCP as licitações com propostas em aberto, uma API com busca, buscas salvas, acompanhamento, notificações e exportação, e um app próprio no endereço `/licitacoes/app`, que usa o mesmo login e as mesmas contas do FINGERENCE.

- **Acesso:** o módulo só aparece para contas habilitadas pelo admin da plataforma. Dentro da conta, o titular escolhe quais colaboradores entram.
- **Dados:** separados por conta desde o início, para o módulo poder virar produto depois.
- **App de finanças:** praticamente não muda. Fora do módulo, só mudam o login, o registro das rotas, o registro do schema e a entrada nova no Vite.
- **Presença pública:** a home do FINGERENCE não muda. `/licitacoes` fica reservado para uma página pública futura do módulo e, até lá, abre o sistema.

Riscos principais: o banco de produção é o mesmo dos clientes pagantes; há outra sessão trabalhando no mesmo repositório, com migrações numeradas em paralelo; e a API do PNCP pode ser lenta ou instável.

---

## Escopo

### Dentro do escopo

- **Fase 1 — Banco e coletor:** schema `licitacoes`, tabelas, funções de busca, coletor (varredura, incremental, lembretes, limpeza, status, lock), testes e documentação de agendamento.
- **Fase 2 — API:** rotas `/api/tenders/*`, travas de acesso, exportação CSV/XLSX e coleção de requisições.
- **Fase 3 — App do módulo (base):** entrada nova no Vite, login com o módulo como contexto, shell, sino e troca de módulo.
- **Fase 4 — Telas:** Início, Buscar, Detalhe, Buscas salvas, Acompanhamento, Notificações e Configurações.

### Fora do escopo

- Disparo de Notificações (continua no app atual; decisão 12).
- Notificações por e-mail, WhatsApp ou push.
- Classificação por IA, fontes além do PNCP, resultados de licitações e análise de concorrência.
- Venda do módulo: plano próprio, cobrança e cadastro aberto, com os ajustes de marca da seção 15 do escopo (termos e privacidade, e-mail de recuperação, app instalável e home conforme o domínio).
- Página pública de Licitações e o link "Conheça também: Licitações" no rodapé do FINGERENCE (quando a página existir).
- Página com dois cards (Licitações e Controle financeiro): só na venda, de preferência num domínio da empresa.
- Mudanças na home do FINGERENCE.
- Configuração da coleta pela interface (só por variável de ambiente).
- Aplicar qualquer coisa no banco de produção sem confirmação explícita: migrações, usuário restrito e Cron Jobs.

---

## Leitura de contexto

Arquivos lidos para esta análise (FINGERENCE):

- `/AGENT.md` e `/CLAUDE.md` (não há `frontend/AGENT.md` nem `backend/AGENT.md`)
- `.plans/licitacoes-escopo.md` e `.plans/licitacoes-reconhecimento.md`
- Backend: `src/server.ts`, `src/middleware/auth.ts`, `src/middleware/permissions.ts`, `src/middleware/validation.ts`, `src/db/client.ts`, `src/db/schema/index.ts`, `src/db/schema/{users,accounts,accountMembers,memberPermissions}.ts`, `src/modules/catalogo/db/schema.ts`, `src/routes/{accountMembers,internal-jobs,notifications,push}.ts`, `scripts/migrations.ts`, `src/utils/migrationStatus.ts`, `drizzle/0057`, `drizzle/0065`, `drizzle/0071`, `src/services/*.test.ts`, `package.json` e `tsconfig.json`
- Front: `vite.config.ts`, `tailwind.config.cjs`, `src/screens/public/LoginPage.tsx`, `src/components/auth/AuthenticatedAppGate.tsx`, `src/services/session.ts`, `src/services/apiClient.ts`, `src/layout/AppShell.tsx`, `src/utils/screenAccess.ts` e `src/services/permissoesService.ts`
- Git: branches não mesclados e migrações de cada um
- Atualização de 05/10: `src/App.tsx` (a rota `*` do site cai na home), `src/sw.ts` (cada página é buscada primeiro na rede, sem atrapalhar os endereços novos), `src/screens/public/components/PublicSeo.tsx`, `index.html`, `backend/drizzle/` (última: 0071) e os branches abertos (sem migrations)

---

## Impacto por área

### Frontend

- **Fase 1:** sem impacto esperado.
- **Fase 3:**
  - entrada nova (`tenders.html` + `src/tenders/main.tsx`) com rotas `react-router-dom` sob `/licitacoes/app/*` (`basename`), e `/licitacoes` abrindo o sistema pelo próprio app;
  - gate de sessão e acesso do módulo, com login embutido;
  - `LoginPage` com contexto de módulo (título próprio, sem cadastro aberto) e destino `/licitacoes/app`;
  - shell (menu lateral, barra superior, sino, tema, menu do usuário com troca de módulo) e tela "sem acesso".
- **Fase 4:** telas da seção 9.4 do escopo (sob `/licitacoes/app`), filtros sincronizados com a URL, formulário de busca salva (react-hook-form + zod) com prévia ao vivo, quadro de acompanhamento e estados de carregando, vazio e erro com `src/ui`. O sino abre a notificação juntando a base `/licitacoes/app` ao link gravado.

### Backend

- **Fase 1:**
  - módulo `backend/src/modules/tenders/` com schema Drizzle e coletor (cliente do PNCP, mapeamento, repositório, notificações, execuções e CLI);
  - testes e scripts npm novos;
  - dependência `zod` no backend.
- **Fase 2:**
  - middleware `requireTenderAccess` e conta derivada no servidor;
  - rotas `/api/tenders/*` montadas em `server.ts` sem `requireActivePlan`;
  - validação com `express-validator` e envelope `{ success, data }`;
  - exportação e limite de taxa;
  - testes.

### Banco de dados

- **Fase 1:** schema `licitacoes`, extensões `unaccent` e `pg_trgm`, configuração de busca `licitacoes.pt_unaccent`, as 9 tabelas da seção 7.2 do escopo com índices, as funções `fn_tsquery_termos` e `fn_edital_bate`, e o usuário restrito `licitacoes_coletor` (este não é migração, por causa da senha). A coluna `notificacao.link` guarda o caminho a partir do início do sistema (`/editais/<id>`).
- **Numeração:** o `main` termina na 0071 (clientes e contratos, já mesclado), e os branches abertos não têm migrations (conferido em 05/10/2026). As migrações do módulo começam na **0072**, e os números são reconferidos antes de qualquer merge.
- **Fases 2 a 4:** sem mudança de schema prevista.

> **Atenção:** este plano não autoriza executar migrations automaticamente. Migrations não devem ser executadas sem confirmação explícita — o ambiente pode estar apontando para produção.

### Infra/Deploy

- **Variáveis novas:** `TENDERS_COLLECTOR_DATABASE_URL`, `PNCP_BASE_URL`, `PNCP_MODALITIES`, `PNCP_STATES`, `PNCP_HORIZON_DAYS`, `PNCP_PAGE_SIZE`, `PNCP_REQUEST_INTERVAL_MS`, `PNCP_TIMEOUT_S`, `PNCP_MAX_ATTEMPTS` e `TENDERS_COLLECTOR_LOG_LEVEL`. Incluir no `.env.dev` só com confirmação (regra do `AGENT.md`).
- **Render Cron Jobs** (pagos por uso, horários em UTC): `0 6 * * *` sweep · `0 0,10-22/2 * * *` incremental · `15 * * * *` deadline-reminders · `0 7 * * 0` cleanup. A configuração fica documentada na Fase 1; a criação no Render acontece só quando você decidir ir para produção.
- **Fase 3:** a hospedagem do front precisa reescrever `/licitacoes` e `/licitacoes/app/*` para a entrada nova. Para `/licitacoes`, nada de redirecionamento permanente (301): o próprio app troca o endereço, porque esse caminho vai virar a página pública.

---

## Arquivos provavelmente afetados

**Fase 1 (no worktree do FINGERENCE):**

- `.plans/licitacoes-escopo.md`, `.plans/licitacoes-reconhecimento.md`, `.plans/licitacoes-plano.md` (cópia deste plano)
- `backend/drizzle/0072_licitacoes_schema_busca.sql` (novo)
- `backend/drizzle/0073_licitacoes_tabelas.sql` (novo)
- `backend/drizzle/0074_licitacoes_funcoes_busca.sql` (novo)
- `backend/src/modules/tenders/db/schema.ts` (novo)
- `backend/src/modules/tenders/domains.ts` (novo: modalidades e situações)
- `backend/src/modules/tenders/collector/{config,database,pncpClient,mapping,repository,notifications,runs,cli}.ts` (novos)
- `backend/src/modules/tenders/collector/*.test.ts` e `*.db.test.ts` (novos)
- `backend/src/modules/tenders/collector/fixtures/*.json` e `collector/docs/pncp-openapi.json` (novos)
- `backend/src/modules/tenders/README.md` (novo)
- `backend/src/db/schema/index.ts` (uma linha de export)
- `backend/package.json` e `backend/package-lock.json` (scripts e `zod`)

**Fases 2 a 4 (indicativo):**

- `backend/src/modules/tenders/{routes,services,middleware}/...` e `backend/src/server.ts` (montagem de `/api/tenders`)
- `backend/src/modules/tenders/tenders.http` (coleção de requisições)
- `tenders.html`, `src/tenders/**`, `vite.config.ts`
- `src/screens/public/LoginPage.tsx` e `src/services/session.ts` (contexto e destino do módulo)

---

## O que será removido

Nenhuma remoção prevista nesta implementação.

O módulo é novo e não substitui nada no FINGERENCE. O Disparo de Notificações continua no app atual; a Fase 5 da v1.0, que o migraria, saiu do escopo.

> **Atenção para a skill `implementar`:** cada item acima deve ser **deletado do arquivo** — não comentado, não envolto em `if (false)`, não ocultado com `display: none` ou flag desativada. Se a remoção gerar erro de compilação, corrigir o erro — não suprimir com `@ts-ignore` ou `eslint-disable`.

---

## Estratégia de implementação

### Fase 1 — Banco e coletor (detalhada)

**Passo 0 — Ambiente de trabalho isolado.** Há outra sessão trabalhando na pasta principal do FINGERENCE; trocar de branch lá atrapalharia esse trabalho.

1. Criar o worktree: `git -C "C:/Users/rodri/Music/sistema financas" worktree add "C:/Users/rodri/Music/fingerence-licitacoes" -b feat/R/licitacoes main`.
2. Instalar dependências no worktree: `npm ci` na raiz e em `backend/`.
3. Copiar o `.env.dev` da pasta principal para o worktree, com confirmação do usuário.
4. Copiar o escopo, o reconhecimento e este plano (como `.plans/licitacoes-plano.md`) e fazer o primeiro commit: `docs(licitacoes): adiciona escopo, reconhecimento e plano`.
5. Apagar as cópias não versionadas da pasta principal, com confirmação, para não conflitarem quando o branch for aberto lá.
6. Abrir o Claude Code no worktree para as fases seguintes.

**Passo 1 — OpenAPI e fixtures do PNCP.**

1. Baixar `https://pncp.gov.br/api/consulta/v3/api-docs` para `collector/docs/pncp-openapi.json`.
2. Validar os parâmetros da seção 5.2 do escopo: obrigatórios, `tamanhoPagina` entre 10 e 50 e formato das datas. Divergências vão para o README do módulo; o OpenAPI prevalece.
3. Salvar de 3 a 5 respostas reais em `collector/fixtures/`: página normal do `proposta`, registro sem valor estimado, registro com situação diferente de 1, registro vindo do `atualizacao` e o caso de página vazia.

**Passo 2 — Migrações.** São arquivos SQL; a aplicação depende de confirmação.

1. `0072_licitacoes_schema_busca.sql`: schema, extensões e configuração `pt_unaccent` (seção 7.1).
2. `0073_licitacoes_tabelas.sql`: as 9 tabelas e os índices (seção 7.2).
3. `0074_licitacoes_funcoes_busca.sql`: `fn_tsquery_termos` e `fn_edital_bate` (seção 7.3).
4. Cabeçalho no padrão do repositório (descrição, `ORDEM`, `ATENCAO`) e reversão descrita em comentário (`DROP SCHEMA licitacoes CASCADE`, destrutiva).
5. `unaccent` e `pg_trgm` são extensões confiáveis desde o PostgreSQL 13, e o dono do banco pode criá-las.
6. Aplicar no banco local uma a uma, **só depois da confirmação**: `npm --prefix backend run migrations:aplicar -- 0072 --banco local` (depois 0073 e 0074), e conferir com `migrations:status -- --banco local`.
7. O usuário restrito (seção 7.5) fica documentado no README, com o SQL. A criação no banco local é opcional e depende de confirmação; em produção, só quando você decidir ir para lá.

**Passo 3 — Schema Drizzle do módulo.**

1. `modules/tenders/db/schema.ts` com `tendersSchema = pgSchema('licitacoes')`, no padrão do `catalogo`: propriedades em inglês, colunas em português e referências a `users`/`accounts`.
2. Tabelas: `tenderNotices`, `tenderEnabledAccounts`, `tenderMemberAccess`, `tenderSavedSearches`, `tenderTrackings`, `tenderTrackingHistory`, `tenderNotifications`, `tenderCollectionRuns` e `tenderDetailCache`.
3. `busca_tsv` é declarada como somente leitura (`customType`).
4. Export em `src/db/schema/index.ts`.
5. Modalidades e situações viram constantes versionadas em `modules/tenders/domains.ts`, em vez de uma tabela de domínio.

**Passo 4 — Configuração e conexão do coletor.**

1. `config.ts` lê as variáveis com `zod`. `TENDERS_COLLECTOR_DATABASE_URL` é obrigatória e as `PNCP_*` têm padrão. Na partida, registra o host do banco, sem credenciais.
2. O CLI só carrega arquivo de ambiente quando `DOTENV_CONFIG_PATH` estiver definido. Ele **nunca** cai no `.env` de produção por padrão, ao contrário do `server.ts`.
3. `database.ts` cria um pool próprio do `pg` (pequeno, máximo 3), com `SET timezone = 'America/Sao_Paulo'` ao conectar. Assim as datas sem fuso do PNCP são gravadas como horário de Brasília. Ele não importa `src/db/client.ts`, que exige `DATABASE_URL` e abre o pool do app.
4. Scripts em `backend/package.json`:
   - `"tenders": "tsx src/modules/tenders/collector/cli.ts"` (Render);
   - `"tenders:dev": "set DOTENV_CONFIG_PATH=../.env.dev&& tsx src/modules/tenders/collector/cli.ts"` (no padrão do script `dev`).

**Passo 5 — Cliente do PNCP (`pncpClient.ts`).**

1. Recebe `fetch` e `sleep` por parâmetro, para os testes não usarem rede nem espera real.
2. Sempre envia `codigoModalidadeContratacao`, com `tamanhoPagina` vindo da configuração.
3. Timeout com `AbortSignal.timeout`.
4. Repete em timeout, erro de rede, 429 e 5xx, até `PNCP_MAX_ATTEMPTS`, com backoff exponencial e jitter (1s, 2s, 4s, 8s…). Respeita `Retry-After` (segundos ou data). Outros 4xx não repetem: geram erro tipado, registrado na execução.
5. Paginação por gerador assíncrono até `paginasRestantes = 0`; HTTP 204 conta como página vazia. Pausa de `PNCP_REQUEST_INTERVAL_MS` entre requisições, e contagem de requisições para o registro da execução.

**Passo 6 — Mapeamento (`mapping.ts`).**

1. Schema `zod` do registro do PNCP, validado contra as fixtures, e conversão para a linha da tabela (seção 5.5).
2. Tamanhos respeitam as colunas (`uf` 2, `municipio_ibge` 7, `orgao_cnpj` 14, `numero_controle_pncp` 60, `esfera` 2). Nulos continuam nulos.
3. `valor_total_estimado` em texto numérico ou nulo; datas em texto sem fuso; `link_pncp` montado com cnpj, ano e sequencial.
4. `payload` guarda o registro original; `hash_payload` é o SHA-256 do JSON com chaves ordenadas.
5. Registro inválido não aborta a coleta: conta como erro, com o `numeroControlePNCP` nos detalhes da execução.

**Passo 7 — Repositório e lock (`repository.ts`).**

1. Registro em `coleta_execucao`: `EXECUTANDO` no início; no fim, contadores, `finalizado_em`, `detalhes` e o status `SUCESSO`, `PARCIAL` ou `FALHA`.
2. Lock com `pg_try_advisory_lock(<constante do módulo>)`, numa conexão dedicada durante toda a execução. Se não conseguir, registra "coleta já em execução" e sai sem coletar. A liberação fica no `finally`.
3. Upsert por página, numa transação por página:
   - `INSERT ... ON CONFLICT (numero_controle_pncp) DO UPDATE ... WHERE` hash ou `data_atualizacao_pncp` diferentes, com `RETURNING id, (xmax = 0)` para separar novos de atualizados;
   - os inalterados só têm `ultima_coleta_em` atualizado;
   - é SQL bruto justificado (atualização condicional com `xmax`), sempre parametrizado.
4. No incremental, registros com encerramento já passado são ignorados.

**Passo 8 — Notificações (`notifications.ts`).**

1. `NOVO_EDITAL` para os IDs novos, com o SQL da seção 7.4 do escopo: só buscas ativas e com notificação ligada, de contas habilitadas, com `ON CONFLICT DO NOTHING`.
2. `EDITAL_ALTERADO` para os IDs atualizados que tenham acompanhamento numa conta habilitada. Destinatários, por conta: quem tem busca salva que bate com o edital e quem consta no histórico do acompanhamento. `referencia` = `data_atualizacao_pncp`.
3. `PRAZO_3D` e `PRAZO_1D` para acompanhamentos `PARTICIPAR` com encerramento em 72h e em 24h, com os mesmos destinatários. `referencia` = data de encerramento (pergunta 20).
4. Em todos os tipos, `link` = `/editais/<id>`, a partir do início do sistema (decisão 24 do escopo); a tela completa com `/licitacoes/app`.
5. O total de notificações entra no registro da execução. É SQL bruto justificado (funções do schema e arrays).

**Passo 9 — Execuções e CLI (`runs.ts`, `cli.ts`).**

1. `sweep` (VARREDURA): por modalidade, e por UF se `PNCP_STATES` estiver preenchida, chama `proposta` com `dataFinal` = hoje + horizonte (data de Brasília). Depois, upsert e notificações.
2. `incremental` (INCREMENTAL): `publicacao` e `atualizacao` de ontem a hoje, por modalidade. Depois, upsert e notificações.
3. `deadline-reminders` (LEMBRETES).
4. `cleanup` (LIMPEZA): remove editais encerrados há mais de 12 meses, sem acompanhamento e sem notificação não lida.
5. `reprocess-notifications --since` (MANUAL): reavalia `NOVO_EDITAL` dos editais coletados desde a data; o índice único impede duplicar.
6. `status`: última execução de cada tipo e totais.
7. `collect --modality --state --max-pages` (MANUAL, depuração).
8. Argumentos com `util.parseArgs`; logs em JSON via `console`, no nível da variável de ambiente; código de saída diferente de zero em `FALHA`.

**Passo 10 — Testes.**

1. Testes puros, incluídos em `npm --prefix backend test` (com o glob do script ampliado para `src/modules/tenders/**/*.test.ts`), em `node:test` + `node:assert/strict`:
   - mapeamento com fixtures (nulos, datas, tamanhos, hash estável);
   - cliente: paginação, 204, retry em 5xx/429/timeout, `Retry-After`, nenhum retry em 400, intervalo entre requisições;
   - argumentos do CLI;
   - cálculo de "hoje + horizonte" no fuso de Brasília.
2. Testes de banco (`*.db.test.ts`), num script novo, `test:tenders-db`:
   - o script recusa rodar se a URL não for `localhost:5433/sistema_financas_dev`; cada teste roda em transação com `ROLLBACK`, e o teste de lock usa duas conexões;
   - casos: upsert (novo, atualizado, inalterado) e lock;
   - `fn_edital_bate`: com e sem acento, plural e singular, E/OU, exclusão, faixas de valor, edital sem valor, encerrado, situação diferente de 1;
   - notificações: sem duplicidade, sem retroativa ao criar busca, nada para conta não habilitada, destinatários de `EDITAL_ALTERADO`, janelas de prazo e `link` no formato `/editais/<id>`.

**Passo 11 — README do módulo.** O que é, variáveis, comandos, linhas dos Cron Jobs em UTC, SQL do usuário restrito (no Render, via psql), como medir o volume e as divergências do OpenAPI.

**Passo 12 — Validação e medição.**

1. `npm --prefix backend run build`, `npm --prefix backend test` e `npm --prefix backend run test:tenders-db`.
2. Varredura real no banco local com as modalidades padrão (`npm --prefix backend run tenders:dev -- sweep`). Medir duração, requisições, registros e tamanho com `pg_total_relation_size('licitacoes.edital')` e índices.
3. Segunda execução, que deve dar zero novos, e `status`.
4. Projeção de 12 meses (decisão 21 do escopo): para cada modalidade, uma requisição à consulta `publicacao` dos últimos 30 dias, lendo `totalRegistros`. Somar, multiplicar por 12 e pelo tamanho médio de cada edital (tabela e índices ÷ registros). Comparar com o espaço livre do Postgres no Render, quando informado (pergunta 6).
5. Relatar os números e a projeção, parar para o aceite da Fase 1 e depois rodar `/finalizar`. O commit e o push vão para `feat/R/licitacoes`, e a skill pergunta sobre o merge.

### Fase 2 — API (tarefas; plano detalhado antes de implementar)

1. `requireTenderAccess` e resolução da conta: colaborador ativo usa a conta do vínculo; titular usa a conta informada, validada como dele e habilitada. Conta não habilitada responde 404; colaborador sem acesso, 403.
2. Montar `/api/tenders` em `server.ts` com `authenticate` + `requireTenderAccess`, sem `requireActivePlan`.
3. Busca de editais:
   - filtros da seção 8.1 do escopo com Drizzle e fragmentos `sql`;
   - conversão de `q` em termos, frases, exclusões e modo, passando por `fn_tsquery_termos`;
   - `highlightedExcerpt` via `ts_headline`, ordenações e paginação `{ items, page, perPage, total, totalPages }`.
4. Detalhe, itens e arquivos do PNCP, com cache de 24h em `cache_detalhe`, reaproveitando o cliente da Fase 1.
5. Acompanhamento (PUT e DELETE), com histórico na mesma transação.
6. Buscas salvas: CRUD, duplicar, prévia, validações da seção 8.2, limite de 50 por usuário e conta, e `openCount`.
7. Notificações: lista, contagem, marcar como lida e marcar todas. O `link` volta como está gravado (`/editais/<id>`).
8. Painel, domínios, status e histórico da coleta.
9. `GET /access`, equipe (`GET` e `PUT /team/:userId`) e habilitação de conta (`requireAdmin`).
10. Exportação CSV/XLSX, com limite de 5.000 linhas e biblioteca XLSX compatível com Node 22.17. Limite de taxa na exportação e na prévia, no padrão de `middleware/validation.ts`.
11. Testes: serviços, banco local, travas, isolamento entre contas e usuários e paridade busca avulsa × salva. Coleção `.http` com todas as rotas.

### Fase 3 — App do módulo (tarefas; plano detalhado antes de implementar)

1. Entrada `tenders.html` + `src/tenders/main.tsx` no `vite.config.ts`, com rotas sob `/licitacoes/app/*` (`basename`). `/licitacoes` abre o sistema: o app troca o endereço para `/licitacoes/app` sem recarregar. No servidor de desenvolvimento, `/licitacoes` e `/licitacoes/app/*` caem na entrada nova.
2. Gate do módulo: sessão, `GET /api/tenders/access`, login embutido com o módulo como contexto e tela "sem acesso" com link para o FINGERENCE.
3. `LoginPage` com contexto opcional de módulo (título, sem cadastro) e origem nova em `session.ts`, que leva para `/licitacoes/app` após o login.
4. Shell:
   - menu lateral recolhível, que vira gaveta no celular;
   - barra superior com breadcrumb, busca rápida (`/`) e tema;
   - sino com contador a cada 60s e ao voltar o foco, via TanStack Query;
   - menu do usuário com troca de módulo e sair.
5. Páginas placeholder para todas as rotas e reescritas de `/licitacoes` e `/licitacoes/app/*` na hospedagem do front, sem redirecionamento permanente (301) para `/licitacoes`.
6. Testes de lógica. Conferir que o app de finanças, o assistente e o login continuam funcionando (build e navegação).

### Fase 4 — Telas (tarefas; plano detalhado antes de implementar)

1. Início, Buscar (filtros ↔ URL, chips, cards/tabela, salvar busca, exportar), Detalhe (painel e rota própria `/licitacoes/app/editais/:id`, abas sob demanda) e Buscas salvas (formulário com prévia, debounce de 500ms).
2. Acompanhamento (quadro com arrastar e soltar nativo e alternativa por menu, mais tabela), Notificações (painel e página; abrem o edital juntando a base `/licitacoes/app` ao link gravado) e Configurações (Equipe e Coleta).
3. Contagem regressiva (âmbar abaixo de 7 dias, vermelho abaixo de 2) e destaque `<<`/`>>` sem `dangerouslySetInnerHTML`.
4. Testes de lógica e smoke no navegador com a skill `run`.

---

## Regras de negócio identificadas

- **Busca salva:** um edital bate com ela pela função única `licitacoes.fn_edital_bate`:
  - termos (OU/E) e exclusões, sem acento e com radical em português;
  - UF, município, órgão, modalidade e faixa de valor;
  - SRP indiferente, sim ou não;
  - edital ainda aberto e com situação 1.
- **Edital sem valor estimado:** com filtro de valor, fica de fora, salvo com "incluir sem valor informado".
- **Busca avulsa:** usa os mesmos componentes da salva, com paridade garantida por teste (proposta da Fase 0, a confirmar no plano da Fase 2).
- **Notificações:**
  - uma por usuário, conta, tipo, edital e referência;
  - nenhuma retroativa ao criar busca;
  - nenhuma para conta não habilitada;
  - destinatários de "alterado" e de prazo como no Passo 8;
  - `link` gravado a partir do início do sistema (`/editais/<id>`).
- **Acompanhamento:** compartilhado pela equipe da conta, com histórico de cada mudança (usuário e data).
- **Retenção:** apaga editais encerrados há mais de 12 meses, sem acompanhamento e sem notificação não lida.
- **Buscas salvas:** nome obrigatório (máx. 120), ao menos um critério, `minValue ≤ maxValue`, até 30 termos de 2 a 80 caracteres e até 50 buscas por usuário em cada conta.
- **Exportação:** até 5.000 linhas, CSV ou XLSX.
- **Coleta:** modalidades padrão 6, 8, 4 e 7; todas as UFs (restringir se o volume medido na Fase 1 for alto); horizonte de 60 dias; incremental a cada 2h, das 07:00 às 21:00.

---

## Regras multi-tenant e segurança

- **Tenant = conta (`contas`)**, sempre derivada no servidor. Colaborador ativo: conta do vínculo em `conta_membros`. Titular: conta informada pelo app, validada como dele e habilitada. O app nunca escolhe uma conta livremente.
- **Travas:** conta habilitada em `licitacoes.conta_habilitada` (só o admin da plataforma muda) e acesso por pessoa em `licitacoes.acesso_membro` (o titular concede; ele próprio sempre tem acesso).
- **Filtros por conta:** buscas salvas, acompanhamento, histórico e notificações sempre por `conta_id`, e também por `usuario_id` quando forem pessoais. Os joins também filtram pela conta.
- **Tabelas globais:** `edital`, `cache_detalhe` e `coleta_execucao`, que guardam dado público do PNCP ou estado técnico.
- **Coletor:** usuário de banco restrito ao schema `licitacoes`. Lê e grava só tabelas desse schema; a API aplica as travas na leitura.
- **Dados do PNCP:** sempre texto puro, sem HTML. Links externos com `rel="noopener noreferrer"` e `target="_blank"`. Arquivos abertos no link original do PNCP.
- **Erros:** não revelam dados de outra conta (404 genérico para recurso fora da conta).
- **Limite de taxa** na exportação e na prévia.

---

## Validações necessárias

- **Coletor:**
  - variáveis de ambiente validadas na partida;
  - payload do PNCP validado (`zod`), com tamanhos de coluna;
  - datas convertidas a partir de texto sem fuso, e números convertidos;
  - registro inválido conta como erro sem abortar;
  - `--since`, `--modality`, `--state` e `--max-pages` validados no CLI.
- **API (Fase 2):** com `express-validator` + `validate`:
  - listas de UF, IBGE, CNPJ e modalidade;
  - números, datas e enums (`trackingStatus`, `sort`, `termsMode`, `format`), com `perPage ≤ 100`;
  - corpo de acompanhamento (`status` válido, `note` com tamanho limitado);
  - buscas salvas conforme a seção 8.2;
  - `:id` numérico e pertencente à conta.
- **Front (Fase 4):** formulário de busca salva com react-hook-form + zod (as mesmas regras da API), máscara BRL nos valores, períodos de data coerentes.

---

## Testes necessários

### Frontend

- Fase 3: gate do módulo (sem sessão, sem acesso, com acesso) e destino do login por origem.
- Fase 4: filtros ↔ URL (ida e volta, chips removíveis), contagem regressiva (limiares de 7 e 2 dias), validação do formulário de busca salva, conversão do destaque `<<`/`>>` em elementos de texto.

### Backend

- Fase 1: os testes puros e de banco do Passo 10.
- Fase 2: filtros e ordenações; paginação; validações; exportação (formato e limite); travas (404 para conta não habilitada, 403 para colaborador sem acesso, 404 para titular de outra conta); isolamento entre contas e entre usuários da mesma conta; paridade busca avulsa × salva.

### E2E

- Fase 4, smoke no navegador (skill `run`): login pelo link do módulo → buscar → abrir detalhe → marcar "Vou participar" → salvar busca → ver no sino a notificação gerada pelo coletor e abrir o edital.

---

## Comandos de validação sugeridos

O FINGERENCE não tem lint configurado; a verificação é por tipos, testes e build.

```bash
# Fase 1 (no worktree)
npm --prefix backend run build                               # tsc --noEmit
npm --prefix backend test
npm --prefix backend run test:tenders-db                     # novo; só banco local
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run tenders:dev -- status

# Fases 3 e 4
npm test
npm run build
```

---

## Riscos e pontos de atenção

- **Banco de produção compartilhado com clientes pagantes:** a coleta grava dezenas de milhares de editais, com JSON e índices de busca. O volume é medido no banco local (Fase 1) antes de qualquer aplicação em produção, que exige confirmação.
- **Numeração de migrações em paralelo:** o `main` termina na 0071 e os branches abertos não têm migrations (05/10/2026). O módulo começa na 0072 e reconfere antes do merge; se houver colisão, renumera antes de aplicar em qualquer banco compartilhado.
- **Outra sessão no mesmo repositório:** trabalhar só no worktree e nunca trocar de branch na pasta principal.
- **PNCP lento, instável ou com limite de taxa:** retry com backoff, intervalo entre requisições e falha parcial sem abortar. A varredura pode levar dezenas de minutos e por isso roda em Cron Job, não no serviço web.
- **Extensões no Render:** `unaccent` e `pg_trgm` são confiáveis e criáveis pelo dono do banco; confirmar na hora de aplicar em produção.
- **Coluna gerada com configuração de busca própria:** a configuração precisa existir antes da tabela (ordem 0072 → 0073).
- **Datas:** o cliente do app devolve datas como texto, e o PNCP manda datas sem fuso. O pool do coletor fixa `America/Sao_Paulo`, e a formatação na interface parte de texto.
- **Versão do Node:** a máquina tem Node 24, mas o padrão do projeto é o 22.17.0. Só usar APIs e dependências compatíveis com 22.17 (`fetch`, `AbortSignal.timeout` e `util.parseArgs` são).
- **Custo:** Cron Jobs no Render são pagos por uso.
- **Hospedagem sem as reescritas:** sem a regra de `/licitacoes/app/*`, o link do módulo dá 404 em produção, como aconteceu com `/loja`. Por isso a regra é critério de aceite da Fase 3.
- **Redirecionamento permanente:** uma regra 301 em `/licitacoes` ficaria guardada nos navegadores e levaria ao sistema mesmo depois de a página pública existir. Quem troca o endereço é o próprio app.
- **Projeção de volume:** é estimativa, porque o fluxo do PNCP varia de mês a mês. Serve para decidir com folga, não como número exato.
- **OpenAPI do PNCP divergente do escopo:** o OpenAPI prevalece; o cliente e o README se ajustam.
- **Testes de banco são prática nova no repositório:** ficam isolados em script próprio e restritos ao banco local.
- **Produção:** nada vai para produção sem decisão explícita. O merge em `main` é perguntado pela `/finalizar`, e migrações, usuário restrito e Cron Jobs em produção são passos separados e confirmados.

---

## Perguntas em aberto

Com a aprovação do plano (04/10/2026), valem os padrões das perguntas 1, 2 e 5. As perguntas 3, 4, 6 e 7 continuam abertas e não bloqueiam a Fase 1.

1. **Decisão 12, Disparo:** continua no app atual, sem mudanças? (padrão adotado: sim)
2. **Decisão 14, acesso por pessoa:** um acesso só, para o módulo inteiro? (padrão adotado: sim)
3. **Decisão 15, conta da empresa:** já existe uma conta PJ da empresa no FINGERENCE, e quem é o titular? Não bloqueia a Fase 1; é necessária para habilitar o módulo e para os dados iniciais.
4. **Decisão 19, Cron Jobs pagos no Render:** podem ser usados quando o módulo for para produção? Não bloqueia a Fase 1.
5. **Decisão 20, referência do lembrete de prazo:** usar a data de encerramento, gerando novo lembrete se o prazo mudar por retificação? (padrão adotado: sim)
6. **Espaço no Render:** qual é o tamanho do plano do Postgres e quanto já está ocupado? Necessário para a comparação da decisão 21 antes de levar o módulo à produção. Não bloqueia a Fase 1.
7. **Worktree do Passo 0:** foi pensado porque havia outra sessão na pasta principal (clientes e contratos, já mesclado). Se não houver mais, o Passo 0 pode virar só um branch na pasta principal. (padrão adotado: mantém o worktree)

---

## Critérios de aceite

**Fase 1** (esta é a que vai para `/implementar` primeiro):

- Migrações 0072 a 0074 aplicadas no banco local, com confirmação; `migrations:status` sem pendências.
- Varredura real completa no banco local para as modalidades padrão, gravando editais.
- Segunda execução sem duplicar (zero novos para os mesmos registros).
- `status` mostra a última execução e os totais.
- Duas coletas simultâneas: a segunda sai sem coletar.
- `npm --prefix backend run build`, `npm --prefix backend test` e `npm --prefix backend run test:tenders-db` passando.
- Volume coletado, espaço ocupado (tabela e índices) e tempo de execução informados.
- Projeção de 12 meses informada (decisão 21) e comparada com o espaço livre do Postgres no Render, quando informado.
- Notificações gravadas com `link` no formato `/editais/<id>`.
- Nenhum arquivo do app de finanças alterado, além da linha de export em `src/db/schema/index.ts` e do `backend/package.json`.

**Fases 2 a 4:** os critérios da seção 14 do escopo, detalhados no plano de cada fase.

---

## Observações para a skill `implementar`

- Executar no worktree do FINGERENCE (`C:\Users\rodri\Music\fingerence-licitacoes`, branch `feat/R/licitacoes`). Este plano vai junto, como `.plans/licitacoes-plano.md`.
- Implementar **só a Fase 1**. As Fases 2 a 4 exigem plano detalhado e aprovação próprios.
- Seguir o `CLAUDE.md` e o `AGENT.md` do FINGERENCE:
  - código em inglês, tabelas e colunas em português;
  - Drizzle primeiro, SQL bruto só nos casos justificados neste plano;
  - dependências compatíveis com Node 22.17.0.
- Usar este plano como fonte principal de contexto, com o escopo v1.2 como referência das regras.
- Não executar migrations sem confirmação explícita, nem no banco local. Nunca usar `--banco producao`, `dev:prod-db` ou o `.env` de produção.
- Não alterar `.env` nem `.env.dev` sem confirmação.
- Manter as alterações dentro de `backend/src/modules/tenders/`, `backend/drizzle/` e dos arquivos centrais listados.
- Commits pequenos, Conventional Commits em português (ex.: `feat(licitacoes): adiciona cliente do PNCP`).
- Deletar tudo que está na seção "O que será removido" — não ocultar. (Nesta implementação, nada.)
- Atualizar testes conforme descrito.
- Ao fim da Fase 1, parar, relatar os números da medição e aguardar aprovação.
