# Plano de Implementação: Licitações — rotina diária, atalho no menu, link na home e tela de admin

## Origem

- Arquivo de especificação: nenhum. Os pedidos foram feitos na conversa de 06/10/2026. Contexto em `.plans/licitacoes-escopo.md` (decisões 15 e 25) e `backend/src/modules/tenders/README.md`.
- Data do planejamento: `2026-10-06`
- Classificação: `fullstack` (frontend + backend + infra/deploy, sem banco de dados)

## Resumo

Licitações entrou em produção em 06/10/2026 (main `a23981cc`, migrations 0072–0077). Ficaram três lacunas:
- **Cron:** o Render recusou o comando longo do Cron Job. Hoje ele roda só a varredura (`npm run tenders -- sweep`, `0 9 * * *`), sem a rotina de vencimento de planos, os lembretes de prazo e a limpeza.
- **Acesso:** não há nenhum caminho para o módulo, nem na home nem no app de finanças. É preciso digitar `/licitacoes/app`.
- **Habilitação:** habilitar uma conta só é possível direto no banco.

Este plano cria:
1. o comando `npm run daily-jobs`, para o Cron Job;
2. o atalho "Licitações" no menu do app de finanças;
3. o link "Conheça também: Licitações" no rodapé público;
4. a tela de admin "Contas habilitadas" dentro do módulo.

## Decisões aplicadas

- **Conta PF:** sem trava no código. O admin escolhe conta a conta, e a tela mostra se a conta é PF ou PJ.
- **Tela de admin:** dentro do módulo de Licitações, e não nas Configurações do app de finanças.
- **Link público:** no rodapé de todas as páginas públicas (`SiteFooter`), como previa a decisão 25 do escopo. Ele entra antes da página pública existir porque ainda não há clientes.
- **Nome do comando:** `daily-jobs`, em inglês, pela regra do AGENT.md (no lugar do `cron:diario` citado na conversa).

## Escopo

### Dentro do escopo

1. **Rotina diária (backend):** o comando `npm run daily-jobs`, executado pelo Cron Job, faz em sequência:
   - a rotina de planos (`POST /api/internal-jobs/plan-lifecycle`);
   - a varredura;
   - os lembretes de prazo;
   - a limpeza, só aos domingos (pelo dia de Brasília).

   Uma etapa que falha não impede as seguintes, e a execução termina com código 1 se alguma falhou.
2. **Atalho "Licitações" no menu do app de finanças:** aparece só para quem tem acesso ao módulo, conferido por `GET /api/tenders/access`.
3. **Link no rodapé público:** "Conheça também: Licitações", levando a `/licitacoes/app`.
4. **Tela "Contas habilitadas" dentro do módulo, só para o admin da plataforma:**
   - lista as contas ativas, PF e PJ;
   - liga e desliga o módulo em cada uma.
5. **README do módulo:** agendamento (Cron Job único), hospedagem (os rewrites já foram feitos) e API de admin (a rota GET nova).

### Fora do escopo

- Rotina de alertas de conta (`/internal-jobs/expense-alerts`), que nunca rodou em produção: não foi pedida.
- Atualização das dependências do backend (multer, express/path-to-regexp, sharp): plano separado, já combinado com o usuário.
- Fase 4B do módulo: Configurações (Equipe e Coleta), Acompanhamento e Notificações. O trabalho dela está sem commit no worktree `C:/Users/rodri/Music/fingerence-licitacoes` e não deve ser tocado.
- Página pública de Licitações, cadastro aberto no módulo e o usuário de banco restrito `licitacoes_coletor`.

## Leitura de contexto

- `/AGENT.md`: lido.
- `/frontend/AGENT.md`, `/backend/AGENT.md` e `/AGENTS.md`: não existem no projeto.
- `CLAUDE.md`: lido.
- Arquivos do projeto lidos:
  - **Backend:**
    - `backend/src/modules/tenders/collector/cli.ts`, `runs.ts`, `dates.ts`, `logger.ts`, `config.ts`, `database.ts`;
    - `backend/src/routes/internal-jobs.ts`;
    - `backend/src/modules/tenders/routes/index.ts` e `routes/overview.ts`;
    - `backend/src/modules/tenders/services/access.ts` e `services/team.ts`;
    - `backend/src/modules/tenders/middleware/tenderAccess.ts`;
    - `backend/src/server.ts` e `backend/package.json`;
    - padrão de `BACKEND_URL` em `routes/plans.ts` e `services/orders.ts`.
  - **App de finanças:**
    - `src/layout/AppShell.tsx` e `src/layout/ConfigPanel.tsx`;
    - `src/services/apiClient.ts`;
    - `src/utils/authOrigin.ts`;
    - `src/screens/public/components/SiteFooter.tsx`.
  - **Módulo:**
    - `src/tenders/TendersApp.tsx`;
    - `src/tenders/utils/navigation.ts` e `utils/modulePaths.ts`;
    - `src/tenders/services/tendersApi.ts`.
  - **Worktree da Fase 4B (só leitura):** `src/tenders/screens/SettingsScreen.tsx` e `services/settingsService.ts`.

## Impacto por área

### Frontend

**App de finanças**
- `src/services/tendersService.ts` (novo): `fetchTendersAccess()` → `GET /tenders/access`, pelo `apiRequest`. Nova chave `tendersAccess` em `src/services/queryKeys.ts`.
- `src/layout/AppShell.tsx`:
  - `useQuery` de `fetchTendersAccess` com `retry: false`, `staleTime` de 5 min e `enabled: !isDemoMode`;
  - com sucesso, aparece o grupo "Módulos" na barra lateral, entre "Consultoria" e "Sistema", com o item "Licitações" (ícone `Gavel`);
  - o item é um `<a href={destinationForAuthOrigin('tenders')}>`, que abre na mesma aba e com a mesma sessão (token em localStorage);
  - a barra lateral é a mesma no desktop e no menu do celular, então os dois ganham o atalho;
  - com erro (404 ou 403), o atalho não aparece e nenhuma mensagem é mostrada.
- `src/screens/public/components/SiteFooter.tsx`:
  - link `<a href="/licitacoes/app">` "Conheça também: Licitações" no grupo de Privacidade e Termos, no mesmo estilo;
  - vale para a home, funcionalidades, planos, contato, termos e privacidade.

**Módulo de Licitações** (`src/tenders`)
- `utils/navigation.ts`:
  - nova rota `contas` (`/admin/contas`, título "Contas habilitadas", no menu);
  - campo novo `platformAdminOnly` em cada rota;
  - `TendersPermissions` ganha `manageEnabledAccounts`;
  - `menuRoutes` esconde a rota de quem não tem essa permissão.
- `layout/TendersSidebar.tsx`: ícone da rota nova.
- `services/adminAccountsService.ts` (novo):
  - `fetchAdminAccounts()` → `GET /tenders/admin/accounts`;
  - `setAccountEnabled(accountId, active)` → `PUT /tenders/admin/accounts/:accountId`, que já existe.
- `services/queryKeys.ts`: chave `adminAccounts`.
- `types.ts`: tipo `AdminTenderAccount`.
- `screens/AdminAccountsScreen.tsx` (novo):
  - busca por nome da conta ou do dono, sem diferenciar maiúsculas nem acentos;
  - lista com nome da conta, tipo (PF/PJ), dono, e-mail e interruptor Habilitada;
  - estados de carregando, erro (com "tentar de novo") e vazio;
  - `useMutation` que invalida `adminAccounts` e o acesso do módulo;
  - desligar a conta em uso (`access.account.id`) pede confirmação: "Se não houver outra conta habilitada, você perde o acesso ao módulo".
- `TendersApp.tsx`: rota `admin/contas`. Quem não tem `manageEnabledAccounts` vê "Página não encontrada".

### Backend

**Rotina diária**
- `backend/src/modules/tenders/collector/runtime.ts` (novo): `createCollectorRuntime(env)` devolve `{ context, close }`.
  - O conteúdo sai do `main()` de `cli.ts`: `loadCollectorConfig`, `createCollectorLogger`, `createCollectorDatabase` e `PncpClient`.
  - O `cli.ts` passa a usar esse arquivo, sem mudar o comportamento.
- `backend/src/services/dailyJobSteps.ts` (novo, puro): `dailyJobSteps(now: Date)`.
  - Devolve `['plan-lifecycle', 'tenders-sweep', 'tenders-deadline-reminders']`, mais `'tenders-cleanup'` quando o dia em Brasília é domingo.
  - Usa `brasiliaDate` de `collector/dates.ts`.
- `backend/scripts/dailyJobs.ts` (novo) e o script npm `"daily-jobs": "tsx scripts/dailyJobs.ts"` no `backend/package.json`.
  - Lê arquivo de ambiente só quando `DOTENV_CONFIG_PATH` está definido, como o CLI do coletor.
  - **Planos:** `fetch` POST em `${BACKEND_URL ?? 'https://sistema-financeiro-backend-o199.onrender.com'}/api/internal-jobs/plan-lifecycle`.
    - Usa o header `x-billing-cron-secret: BILLING_CRON_SECRET` e `AbortSignal.timeout` de 2 min.
    - Loga só os contadores da resposta.
    - Sem `BILLING_CRON_SECRET`, ou com resposta diferente de 2xx, a etapa falha com uma mensagem clara.
  - **Licitações:** `runSweep`, `runDeadlineReminders` e `runCleanup` (`collector/runs.ts`), com um único runtime fechado no fim.
    - Status `FALHA` conta como erro.
    - `skipped` (outra coleta segurando a trava) só gera aviso.
  - Uma linha de log JSON por etapa (início, fim, duração, resultado), via `createCollectorLogger`.
  - Código de saída 1 se alguma etapa falhou.

**Tela de admin**
- `backend/src/modules/tenders/services/team.ts`: nova `listAccountsForTenders(db)` (Drizzle).
  - `accounts` com left join em `tenderEnabledAccounts` e inner join no dono (`users`: nome e e-mail).
  - Só contas ativas.
  - Ordem: habilitadas primeiro, depois PJ, depois nome.
  - Devolve `accountId`, `accountName`, `accountType`, `ownerName`, `ownerEmail`, `enabled` e `changedAt` (ISO de Brasília, como `setAccountEnabled`).
- `backend/src/modules/tenders/routes/index.ts`: `GET /accounts` no `adminRoutes`, que já está montado em `/api/tenders/admin` com `authenticate` + `requireAdmin`. O `PUT` atual não muda.
- `backend/src/modules/tenders/routes/overview.ts`: o `GET /api/tenders/access` passa a devolver `permissions.manageEnabledAccounts = access.isPlatformAdmin`.

### Banco de dados

Sem impacto esperado. Nenhuma tabela, coluna ou migration nova.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Depois do deploy:** o usuário troca, no Render, o **Command** do Cron Job `rotinas-diarias-planos-licitações` para `npm run daily-jobs`.
- **Sem mudança:** Schedule `0 9 * * *` (06:00 de Brasília), Root Directory `backend` e Build `npm install`.
- **Variáveis:** `BILLING_CRON_SECRET` e `TENDERS_COLLECTOR_DATABASE_URL`, que já estão no cron. `BACKEND_URL` é opcional, porque o padrão é a URL de produção.
- **Ordem:** se o deploy acontecer antes da troca do Command, nada quebra. O comando atual continua funcionando.

## Arquivos provavelmente afetados

**Backend**
- `backend/package.json`
- `backend/scripts/dailyJobs.ts`
- `backend/src/services/dailyJobSteps.ts` e `dailyJobSteps.test.ts`
- `backend/src/modules/tenders/collector/runtime.ts` e `cli.ts`
- `backend/src/modules/tenders/services/team.ts` e `team.db.test.ts`
- `backend/src/modules/tenders/routes/index.ts`, `overview.ts` e `routes.db.test.ts`
- `backend/src/modules/tenders/README.md`

**App de finanças**
- `src/services/tendersService.ts`
- `src/services/queryKeys.ts`
- `src/layout/AppShell.tsx`
- `src/screens/public/components/SiteFooter.tsx`

**Módulo**
- `src/tenders/utils/navigation.ts` e `tendersUtils.test.ts`
- `src/tenders/layout/TendersSidebar.tsx`
- `src/tenders/services/adminAccountsService.ts` e `services/queryKeys.ts`
- `src/tenders/types.ts`
- `src/tenders/screens/AdminAccountsScreen.tsx`
- `src/tenders/TendersApp.tsx`

## Estratégia de implementação

1. Criar a branch `feat/R/licitacoes-acesso-rotina-diaria` a partir de `main`.
2. **Backend, rotina diária:**
   - `collector/runtime.ts` e `cli.ts` usando-o;
   - `dailyJobSteps.ts` com teste;
   - `scripts/dailyJobs.ts` e o script `daily-jobs`.
3. **Backend, admin:**
   - `listAccountsForTenders` com teste de banco;
   - `GET /api/tenders/admin/accounts` com teste de rota;
   - `manageEnabledAccounts` no `/access`.
4. **App de finanças:** `tendersService.ts` e a query key, o atalho no `AppShell` e o link no `SiteFooter`.
5. **Módulo:**
   - `navigation.ts` (com teste);
   - o ícone no sidebar;
   - o service, o tipo e a query key;
   - `AdminAccountsScreen` e a rota no `TendersApp`.
6. Atualizar o README do módulo.
7. Rodar as validações.

## Regras de negócio identificadas

- **Atalho:** aparece só para quem o módulo aceita:
  - titular com alguma conta habilitada;
  - colaborador ativo com acesso liberado pelo titular.
  - Com 404 ou 403 do `/access`, o atalho fica escondido.
- **Tela "Contas habilitadas":** só o admin da plataforma (`tipo === 'admin'`) vê e usa.
- **Contas PF:** podem ser habilitadas. Não há trava no código; a decisão é do admin.
- **Rotina diária:** planos, depois varredura, lembretes de prazo e, aos domingos (Brasília), limpeza. Uma falha não interrompe as etapas seguintes.

## Regras multi-tenant e segurança

- O projeto não é multi-prefeitura. O isolamento é por conta (`contas`), e a trava do módulo (`resolveTenderAccess`) não muda.
- A lista de contas cruza todas as contas de propósito: é uma tela de administração da plataforma.
  - Fica atrás de `requireAdmin` no servidor e de `manageEnabledAccounts` no app.
  - Ela expõe o nome e o e-mail dos donos só para o admin.
- O `accountId` do `PUT` já é validado (`idParam`). Conta inexistente dá 404, como hoje.
- O `/access` só ganha um booleano derivado do usuário autenticado.
- A rotina diária:
  - não imprime o segredo nem a URL do banco (o log do coletor mostra só o host, por `databaseHost`);
  - registra a resposta da rotina de planos só com os contadores.

## Validações necessárias

- `GET /api/tenders/admin/accounts`: sem parâmetros. Exige usuário autenticado do tipo admin (403 para os demais).
- `PUT /api/tenders/admin/accounts/:accountId`: validações atuais (`idParam`, `active` booleano estrito).
- `daily-jobs`:
  - `TENDERS_COLLECTOR_DATABASE_URL` é validada por `loadCollectorConfig`; se faltar, as etapas de Licitações falham;
  - sem `BILLING_CRON_SECRET`, a etapa de planos falha;
  - `BACKEND_URL` inválida faz a etapa de planos falhar com mensagem clara.
- Tela de admin: a busca é só filtro local (aparar espaços, ignorar maiúsculas e acentos).

## Testes necessários

### Frontend

- `src/tenders/utils/tendersUtils.test.ts`:
  - `menuRoutes` inclui "Contas habilitadas" só com `manageEnabledAccounts`;
  - `routeForPath('/admin/contas')` devolve a rota nova.

### Backend

- `dailyJobSteps.test.ts`:
  - domingo (Brasília) inclui a limpeza;
  - dia útil não inclui;
  - sábado 23:00 de Brasília (já domingo em UTC) não inclui;
  - a ordem das etapas é fixa.
- `team.db.test.ts`, no banco local via `test:tenders-db`: `listAccountsForTenders`:
  - traz contas habilitadas e não habilitadas, com tipo e dono;
  - não traz conta inativa;
  - segue a ordem combinada.
- `routes.db.test.ts`:
  - `GET /api/tenders/admin/accounts` dá 403 para quem não é admin e 200 para o admin;
  - o `/access` traz `manageEnabledAccounts` correto.

### E2E

Não há E2E automatizado no projeto. Conferência manual:
- **Atalho:**
  - o admin, com conta habilitada, vê "Licitações" no menu (desktop e celular);
  - o clique abre o módulo sem novo login;
  - um usuário sem módulo não vê o atalho.
- **Rodapé:** o link "Conheça também: Licitações" aparece e abre o módulo.
- **Tela de admin:**
  - "Contas habilitadas" aparece só para o admin;
  - ligar uma conta faz o atalho aparecer para o dono dela;
  - desligar a conta em uso pede confirmação.
- **Rotina diária, local:** `npm --prefix backend run daily-jobs` com `DOTENV_CONFIG_PATH=../.env.dev`, `BACKEND_URL=http://localhost:3010`, um `BILLING_CRON_SECRET` de teste e o backend local rodando. Todas as etapas devem aparecer no log, e o código de saída deve estar certo.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p .
npm test
npx vite build

npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
```

## Riscos e pontos de atenção

- **Conflito com a Fase 4B:**
  - a 4B, sem commit no worktree, também altera `src/tenders/TendersApp.tsx`, `services/queryKeys.ts` e `types.ts`; quando ela for juntada, haverá conflitos pequenos nesses três arquivos;
  - depois da 4B, a tela de admin pode virar uma aba de Configurações.
- **Admin fora do módulo:** o admin só entra no módulo com alguma conta habilitada. Se desligar a última, perde a tela, e a volta é pelo banco. A confirmação ao desligar a conta em uso avisa disso.
- **Ruído de rede:** para quem não tem o módulo, o `GET /tenders/access` dá 404 uma vez a cada 5 min, só no console de rede.
- **Link público:** leva ao login do módulo, que não tem cadastro aberto. O usuário aceitou isso ("ainda não tem cliente").
- **Versão do Node:** o Cron Job roda em Node 24 (padrão do Render), e o AGENT.md fixa Node 22.17. O código novo não usa nada exclusivo de nenhuma das duas.
- **Duração do cron:** a rotina diária leva uns 40 min (a varredura). As outras etapas somam segundos.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- `npm run daily-jobs` executar as etapas do dia na ordem, seguir mesmo com uma falha e sair com código 1 se alguma falhou;
- o atalho "Licitações" aparecer só para quem tem acesso ao módulo e abrir o módulo sem novo login;
- o rodapé público mostrar "Conheça também: Licitações" levando a `/licitacoes/app`;
- o admin conseguir habilitar e desabilitar contas pela tela "Contas habilitadas" do módulo;
- os checks de frontend e backend passarem;
- nenhuma migration tiver sido criada ou executada.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations (não há nenhuma neste plano).
- Não alterar `.env`.
- Não mexer no worktree da Fase 4B (`C:/Users/rodri/Music/fingerence-licitacoes`).
- Seguir o `/AGENT.md`: código e nomes de arquivo em inglês, textos de tela em português e Drizzle nas queries novas.
- Manter as alterações pequenas e focadas.
- Depois do deploy, orientar o usuário a:
  - trocar o Command do Cron Job para `npm run daily-jobs`;
  - habilitar a conta PJ pela tela "Contas habilitadas".
