# Plano de Implementação: Permissões de membro e colaborador

## Origem

- Arquivo de especificação: nenhum `.md` — revisão das permissões feita na conversa de 2026-10-01 (pontos de atenção 1 a 4) e as 4 decisões abaixo.
- Data do planejamento: `2026-10-01`
- Classificação: `frontend + backend + database`

## Resumo

Corrige quatro problemas nas permissões de quem é membro (conta pessoal) ou colaborador (conta empresa):

1. **Plano:** o servidor confere o plano pelo cadastro do próprio membro, que nasce em teste de 15 dias. Depois disso a rotina diária marca o teste como vencido e manda o e-mail de acesso suspenso, e o app mostra "escolha um plano", que o membro não consegue pagar. Passa a valer o plano do titular da conta.
2. **Uma permissão depende de outra:** cada permissão de cadastro bloqueia a rota inteira, e os modais de lançamento e algumas telas de configuração usam listas desses cadastros. Despesas sem Categorias, por exemplo, não consegue lançar. Quem precisa da lista passa a lê-la; criar, editar e excluir continuam exigindo a permissão do cadastro.
3. **Menu:** só o Painel e o sininho respeitam as permissões; as demais telas aparecem e dão erro. Tudo passa a sumir quando a pessoa não pode usar.
4. **Permissões sem efeito:** "Membros/Colaboradores" nunca é consultada (gestão de membros é só do titular) e "Assinatura/Planos" não tem efeito real (a tela nunca aparece para membro, e com o plano do titular pagar pelo membro não serve). Saem da tela, do servidor e do banco.

## Decisões registradas

- **Decisão 1:** o membro usa o plano do titular; a rotina não expira nem avisa membro ativo; a tela de plano vencido do membro diz "Peça ao titular para renovar".
- **Decisão 2:** quem lança lê só a listagem dos cadastros de que precisa; escrita só com a permissão do cadastro; "+ cadastrar" some sem ela.
- **Decisão 3:** esconder o que não pode ser usado; checklist de primeiros passos só para o titular; aviso quando nenhuma tela está liberada.
- **Decisão 4:** remover as duas permissões da tela e do servidor e apagar as colunas com migration aplicada à mão, depois do deploy e com confirmação.

## Escopo

### Dentro do escopo

**Parte 1 — Plano do membro**

- Servidor resolve de quem é o plano: membro ativo (linha `ativo` em `conta_membros`) → titular da conta (`contas.usuario_id`); senão, o próprio usuário.
- O bloqueio por plano (`requireActivePlan`) e `GET /api/plans/status` usam esse plano. O status ganha `isAccountMember`.
- A rotina diária (`processPlanLifecycle`) não expira membro ativo, e o envio de e-mails pendentes descarta (`skipped`) os de membro ativo.
- Pagar e cancelar plano recusam membro ativo: rotas de `plans.ts` que hoje exigem `accessSubscription` e, por coerência, `POST /api/paypal/create-order` e `POST /api/paypal/capture-order` (hoje sem nenhuma checagem). Ex-membro (vínculo inativo) volta a seguir o próprio plano e pode assinar.
- Front: a tela de plano vencido, hoje duplicada em `App.tsx` e `AuthenticatedAppGate.tsx` (com o tipo do status também duplicado), vira um componente só. Para membro: título "Plano da conta vencido", texto "O plano da conta venceu. Peça ao titular para renovar.", botão "Verificar de novo", sem a lista de planos.

**Parte 2 — Listas para quem precisa**

Só a listagem (GET da raiz da rota e, nos cartões, `/limites`). Detalhe (`/:id`) e escrita seguem só com a permissão do cadastro.

| Lista (rota) | Permissão do cadastro | Também leem a listagem |
|---|---|---|
| Contas (`/contas`) | Contas | qualquer membro (ele só recebe a conta a que está vinculado) |
| Categorias de despesa (`/categorias`, `/categories`) | Categorias | Despesas |
| Categorias de receita (`/income-classifications`, `/classificacoes-receita`) | Categorias | Receitas, Representantes, Contratos |
| Cartões e limites (`/cartoes`, `/cards`; `/` e `/limites`) | Cartões | Despesas |
| Clientes (`/clientes`) | Clientes | Receitas |
| Contratos (`/contratos`) | Contratos | Receitas |
| Representantes (`/representantes`, `/representatives`) | Representantes | Receitas, Contratos |
| Catálogo de serviços (`/servicos`) | Catálogo de Serviços | Contratos |
| Produtos (`/catalogo/produtos`, só `GET /`) | Catálogo de Produtos | Receitas |

As linhas com Representantes e Contratos como leitores vêm das telas de configuração que dependem de outras listas: comissão por categoria em Representantes, e formulário de contrato (representante, serviços, categorias) dentro de Clientes.

- Front:
  - modais escondem "+ cadastrar" de categoria (Categorias) e de cliente (Clientes) sem a permissão do cadastro;
  - Movimentações, calendário, faixa de receitas previstas e assistente buscam receitas e despesas só com a permissão de cada uma (hoje, com só uma delas, a busca inteira falha);
  - filtros, modais, Clientes e assistente só buscam as listas que a pessoa pode ler.

**Parte 3 — Esconder o que não pode ser usado**

| Onde | Item | Aparece com |
|---|---|---|
| Menu | Painel | Painel |
| Menu | Movimentações | Despesas ou Receitas |
| Menu | Relatórios | Relatórios |
| Menu | Clientes (só conta empresa, como hoje) | Clientes |
| Movimentações | "Nova despesa" | Despesas |
| Movimentações | "Nova receita" | Receitas |
| Movimentações | visão calendário | Calendário |
| Movimentações | aba Planejamento | Planejamento |
| Configurações | Contas | Contas |
| Configurações | Categorias Despesas / Categorias Receitas | Categorias |
| Configurações | Cartões | Cartões |
| Configurações | Catálogo de serviços (PJ) | Catálogo de Serviços |
| Configurações | Produtos e estoque (PJ) | Catálogo de Produtos |
| Configurações | Representantes (PJ) | Representantes |
| Configurações | Sócios (PJ) | Sócios |
| Configurações | Assinatura, Permissões | só titular/admin (como hoje) |
| Configurações | Acessos, Integrações de IA | regra atual (documento/admin) |
| Clientes | contratos do cliente (lista, cadastro, faturar, aditivo...) | Contratos |
| Assistente | botão do assistente | Assistente |
| Assistente | opções "lançar despesa" / "lançar receita" da abertura (`register_expense` / `register_income`) | Despesas / Receitas |

- Sem nenhum item em Configurações, o botão de Configurações some.
- O checklist de primeiros passos fica só para o titular/admin.
- A seção inicial passa a ser a primeira liberada (hoje é sempre Movimentações). Sem nenhuma seção, aparece "Nenhuma tela liberada. Fale com o titular da conta."
- Titular e admin continuam vendo tudo (o servidor já devolve tudo liberado para eles).
- Enquanto as permissões carregam, os itens dependentes não aparecem. Se a consulta falhar, aparecem (o servidor continua barrando).

**Parte 4 — Remover as permissões sem efeito**

- `accessMembers` (`acesso_membros`) e `accessSubscription` (`acesso_assinatura`) saem do schema Drizzle, de `PERMISSION_FLAGS`, da tela de Permissões e dos tipos do front.
- Migration nova apaga as duas colunas, aplicada à mão depois do deploy e só com confirmação.

### Fora do escopo

- Na conta empresa, cada colaborador só vê os clientes, contratos, representantes e produtos que ele mesmo cadastrou (filtro por `usuario_id` nas rotas). É o desenho atual; mudar fica para outra tarefa.
- Separar ver de editar em todas as permissões.
- O que o Painel e os Relatórios mostram por dentro.
- Executar a migration (nem no banco local) sem confirmação.

## Leitura de contexto

- `/AGENT.md` (lido) e `/CLAUDE.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: **não existem** neste projeto; vale o `AGENT.md` da raiz.
- Backend lido:
  - middlewares e regras: `server.ts`, `middleware/auth.ts`, `middleware/permissions.ts`, `utils/familyVisibility.ts`, `utils/carteiraAcesso.ts`;
  - plano: `services/plan-lifecycle.ts`, `services/plan-access.ts`, `routes/plans.ts`, `routes/paypal.ts`;
  - membros e permissões: `routes/accountMembers.ts`, `db/schema/memberPermissions.ts`;
  - cadastros e rotas: `routes/accounts.ts`, `routes/budget.ts`, `routes/financial.ts`, `routes/categories.ts`, `routes/cards.ts`, `routes/clients.ts`, `routes/contracts.ts`, `routes/representatives.ts`, `routes/income-classifications.ts`, `routes/services.ts`, `modules/catalogo/routes/produtos.ts`;
  - migrations: `drizzle/0054_*.sql`.
- Frontend lido:
  - estrutura: `layout/AppShell.tsx`, `layout/ConfigPanel.tsx`, `App.tsx`, `components/auth/AuthenticatedAppGate.tsx`;
  - permissões: `services/permissoesService.ts`, `screens/config/PermissoesTab.tsx`;
  - telas: `screens/finance/FinanceDashboard.tsx`, `screens/finance/MovimentacoesScreen.tsx`, `screens/config/ClienteDetail.tsx`, `hooks/useOnboardingChecklist.ts`, `hooks/useActiveAccount.ts`;
  - lançamentos: `components/financial-assistant/FinancialAssistant.tsx`, `services/assistantFlowService.ts`, os modais de despesa e receita, `ui/CategoryFloatingSelect.tsx`, `services/financeService.ts`.

## Impacto por área

### Frontend

**Base**

- `services/queryKeys.ts`:
  - `ownPermissions: ['own-permissions']`;
  - a chave do dashboard passa a incluir o que foi buscado (receitas/despesas). As invalidações por prefixo `['dashboard']` continuam valendo.
- `hooks/useOwnPermissions.ts` (novo): consulta `GET /account-members/me/permissions`, com 5 min de `staleTime`, como hoje. Expõe as permissões e o estado de carregamento. Substitui as consultas soltas de `AppShell.tsx` e `FinanceDashboard.tsx`.
- `utils/screenAccess.ts` (novo, puro, com teste):
  - `visibleSections`, `movementControls`, `visibleConfigItems`;
  - `canReadCatalogList` / `canManageCatalog`, espelho da tabela do servidor, com comentário apontando para `backend/src/utils/catalogAccess.ts`;
  - `allowedAssistantIntents`.
- `services/permissoesService.ts`: sem `accessMembers` e `accessSubscription` (tipo e grupos).
- `services/demo/fakeApiResolver.ts`: responde `/account-members/me/permissions` com tudo liberado (o modo demo passa a usar o mesmo hook).

**Telas**

- `layout/AppShell.tsx`:
  - menu por `visibleSections`;
  - sininho e Painel pelo hook;
  - botão de Configurações some sem itens visíveis;
  - assistente (mobile) some sem Assistente.
- `layout/ConfigPanel.tsx`: itens por `visibleConfigItems`, com a mesma função usada pelo `AppShell`.
- `App.tsx`:
  - seção inicial = primeira liberada; ajusta quando as permissões chegam;
  - estado "Nenhuma tela liberada";
  - checklist só para titular/admin;
  - usa o componente único de plano vencido.
- `components/auth/PlanExpiredGate.tsx` (novo): tela de plano vencido com variante para membro. `App.tsx` e `AuthenticatedAppGate.tsx` passam a usá-lo, e o tipo do status do plano fica num lugar só, com `isAccountMember`.
- `screens/finance/MovimentacoesScreen.tsx`:
  - botões, aba Planejamento e visão calendário por `movementControls`;
  - limites de cartão só se a lista de cartões for legível.
- `screens/finance/FinanceDashboard.tsx`: usa o hook.
- Busca de lançamentos:
  - `services/financeService.ts`: `fetchFinanceDashboard` aceita o que buscar (receitas, despesas); o que não for buscado volta `[]`;
  - `hooks/useFinanceDashboard.ts`: deriva isso das permissões e só busca depois que elas carregam;
  - `PredictedIncomesStrip.tsx` usa o mesmo critério.
- `screens/finance/useEntryFilters.ts`: categorias só se legíveis.
- Modais de lançamento:
  - `expense-dialog/ExpenseDialog.tsx`: `onCreate` de categoria só com Categorias;
  - `income-dialog/IncomeDialog.tsx`, `IncomeRow.tsx`, `ClientSelect.tsx`: criar categoria só com Categorias e criar cliente só com Clientes (`onCreate` do `ClientSelect` vira opcional); listas PJ só se legíveis.
- `screens/config/ClienteDetail.tsx`: parte de contratos (e as consultas de contratos, representantes, serviços e categorias de receita que ela usa) só com Contratos.
- `components/financial-assistant/FinancialAssistant.tsx`:
  - consultas de listas só se legíveis;
  - dashboard com o mesmo critério de receitas/despesas;
  - opções da abertura filtradas por `allowedAssistantIntents`.

### Backend

**Plano**

- `services/plan-lifecycle.ts`:
  - `resolvePlanHolder(userId)` (Drizzle: `accountMembers` + `accounts`, vínculo `ativo`) → `{ holderId, isAccountMember }`;
  - `getRequesterPlanStatus(userId)` = status do titular + `isAccountMember`;
  - `processPlanLifecycle` exclui membros ativos dos candidatos (`notExists`);
  - `dispatchPendingPlanNotifications` marca `skipped` os eventos de membro ativo.
- `middleware/auth.ts`: `requireActivePlan` usa `getRequesterPlanStatus`.
- `middleware/permissions.ts`: novo `requireNotAccountMember`. Recusa com 403 e a mensagem "O plano é gerenciado pelo titular da conta.".
- `routes/plans.ts`:
  - `GET /status` usa o status do titular e devolve `isAccountMember`;
  - `subscribe`, `pix`, `pay-card`, `subscribe-recurring`, `cancel/preview` e `cancel` trocam `requireScreenAccess('accessSubscription')` por `requireNotAccountMember`.
- `routes/paypal.ts`: `create-order` e `capture-order` ganham `requireNotAccountMember` (o webhook não muda).

**Listas**

- `utils/catalogAccess.ts` (novo, puro, com teste):
  - `CatalogName`, `CATALOG_RULES` (permissão do cadastro, leitores da listagem e caminhos da listagem, conforme a tabela);
  - `isCatalogListRequest(catalog, method, path)` e `canAccessCatalog(catalog, permissions, isListRequest)`.
- `middleware/permissions.ts`: novo `requireCatalogAccess(catalog)`. Quem não é membro passa; o membro carrega a linha de permissões uma vez e aplica `canAccessCatalog`, com a mesma mensagem do `requireScreenAccess`.
- `server.ts`: troca `requireScreenAccess` por `requireCatalogAccess` em `/api/contas`, `/api/categories`, `/api/categorias`, `/api/cards`, `/api/cartoes`, `/api/representatives`, `/api/representantes`, `/api/income-classifications`, `/api/classificacoes-receita`, `/api/clientes`, `/api/contratos` e `/api/servicos`. Ficam como estão: `/api/contratos-servicos`, `/api/contrato-anexos`, `/api/socios`, `/api/partners`.
- `modules/catalogo/routes/produtos.ts`: `GET /` usa `requireCatalogAccess('products')`; as demais rotas não mudam.

**Remoção**

- `db/schema/memberPermissions.ts`: sem `accessMembers` e `accessSubscription`.
- `routes/accountMembers.ts`: `PERMISSION_FLAGS` sem as duas; o comentário que cita `accessMembers` é atualizado.

### Banco de dados

- `backend/drizzle/0055_remover_permissoes_membros_assinatura.sql`: `ALTER TABLE membro_permissoes DROP COLUMN IF EXISTS acesso_membros, DROP COLUMN IF EXISTS acesso_assinatura;`, com cabeçalho no estilo dos arquivos anteriores.
- O projeto não usa journal do drizzle-kit: as migrations são SQL numeradas, aplicadas à mão por script Node com `pg` (o `psql` não está no PATH).
- **Ordem obrigatória:** deploy do código primeiro, migration depois. O código antigo seleciona todas as colunas do schema e quebraria se elas sumissem antes.
- Sem tabela nova, sem índice novo. As consultas de vínculo usam `conta_membros.usuario_id`, que já é consultado a cada pedido em `hasScreenAccess`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Sem variáveis de ambiente novas.
- Migration aplicada à mão, depois do deploy, com confirmação, em cada ambiente.
- O front antigo em cache (PWA) continua funcionando com o servidor novo. As rotas mudam só de regra de acesso, e a tela antiga de permissões enviaria as duas chaves removidas, que o servidor ignora (o PUT só lê `PERMISSION_FLAGS`).

## Arquivos provavelmente afetados

**Backend:**

- middlewares e rotas: `backend/src/middleware/auth.ts`, `backend/src/middleware/permissions.ts`, `backend/src/server.ts`;
- plano: `backend/src/services/plan-lifecycle.ts`, `backend/src/routes/plans.ts`, `backend/src/routes/paypal.ts`;
- permissões: `backend/src/routes/accountMembers.ts`, `backend/src/db/schema/memberPermissions.ts`;
- catálogo: `backend/src/modules/catalogo/routes/produtos.ts`;
- novos: `backend/src/utils/catalogAccess.ts`, `backend/src/utils/catalogAccess.test.ts`, `backend/drizzle/0055_remover_permissoes_membros_assinatura.sql`.

**Frontend:**

- permissões e base:
  - `src/services/permissoesService.ts`, `src/services/queryKeys.ts`, `src/services/demo/fakeApiResolver.ts`;
  - novos: `src/hooks/useOwnPermissions.ts`, `src/utils/screenAccess.ts`, `src/utils/screenAccess.test.ts`;
- estrutura:
  - `src/layout/AppShell.tsx`, `src/layout/ConfigPanel.tsx`, `src/App.tsx`, `src/components/auth/AuthenticatedAppGate.tsx`;
  - novo: `src/components/auth/PlanExpiredGate.tsx`;
- telas:
  - `src/screens/finance/MovimentacoesScreen.tsx`, `src/screens/finance/FinanceDashboard.tsx`, `src/screens/finance/useEntryFilters.ts`;
  - `src/screens/config/ClienteDetail.tsx`;
- lançamentos:
  - `src/services/financeService.ts`, `src/hooks/useFinanceDashboard.ts`;
  - `src/screens/finance/expense-dialog/ExpenseDialog.tsx`;
  - `src/screens/finance/income-dialog/IncomeDialog.tsx`, `IncomeRow.tsx`, `ClientSelect.tsx`, `PredictedIncomesStrip.tsx`;
  - `src/components/financial-assistant/FinancialAssistant.tsx`.

## Estratégia de implementação

**Fase 0 — Branch**

1. Sair de `feat/R/redesign-modal-receita` (já na main), atualizar a `main` e criar `fix/R/permissoes-membros`. Não tocar no `GLOSSARIO.md` (não rastreado, alheio).

**Fase 1 — Remover**

2. Remover `accessMembers` e `accessSubscription`: schema, `PERMISSION_FLAGS`, `permissoesService.ts` (tipo e grupos).
3. Remover `requireScreenAccess('accessSubscription')` das rotas de `plans.ts`.
4. Remover as consultas soltas de permissões em `AppShell.tsx` e `FinanceDashboard.tsx`.
5. Remover as duas cópias da tela de plano vencido e do tipo do status (`App.tsx`, `AuthenticatedAppGate.tsx`).

**Fase 2 — Aplicar**

6. **Servidor — plano:** `resolvePlanHolder`, `getRequesterPlanStatus`, `requireActivePlan`, `GET /plans/status` com `isAccountMember`, `requireNotAccountMember` nas rotas de plano e do PayPal, rotina e envio de e-mails.
7. **Servidor — listas:** `catalogAccess.ts` com teste; `requireCatalogAccess`; montagens em `server.ts`; listagem de produtos.
8. **Banco:** escrever a migration `0055` (sem executar).
9. **Front — base:** `queryKeys.ownPermissions`, `useOwnPermissions`, `screenAccess.ts` com teste, resposta do modo demo.
10. **Front — plano:** `PlanExpiredGate.tsx` com a variante do membro, usado nos dois lugares.
11. **Front — navegação:** menu, seção inicial, "Nenhuma tela liberada", botão de Configurações, `ConfigPanel`, assistente, checklist só do titular.
12. **Front — lançamentos:** `fetchFinanceDashboard` com o que buscar, `useFinanceDashboard`, faixa de previstas, filtros, Movimentações (botões, calendário, Planejamento, limites).
13. **Front — cadastros:** "+ cadastrar" condicional nos modais; listas condicionais nos modais, em `ClienteDetail` (parte de contratos) e no assistente (listas e opções da abertura).

**Fase 3 — Validar**

14. `npx tsc --noEmit`, `npm test`, `npm run build`, `npm --prefix backend run build`, `npm --prefix backend test`.
15. Roteiro contra o backend local (`.env.dev`, localhost:5433), com fixtures criadas e apagadas pelo próprio roteiro: titular de teste e membro de teste com `data_cadastro` de 30 dias atrás (teste próprio vencido). Cenários em "Testes necessários / E2E".
16. Fumaça jsdom de menu e Configurações com o membro de teste em combinações de permissões, ou conferência manual no navegador.
17. Parar o backend (`taskkill /T`), apagar tokens e fixtures.

## Regras de negócio identificadas

**Quem tem tudo liberado**

- Titular e admin: tudo liberado, sem depender de permissão.
- Admin nunca é bloqueado por plano.

**Plano**

- Membro ativo usa o plano do titular da conta a que está vinculado, e não gerencia plano (assinar, pagar, cancelar).
- Ex-membro (vínculo inativo) volta a seguir o próprio plano.
- A rotina diária não expira o teste de membro ativo nem lhe manda e-mail.

**Listas e cadastros**

- Cada permissão de cadastro continua dando acesso completo àquele cadastro.
- A listagem de um cadastro também fica disponível para quem tem a permissão que a usa (tabela da Parte 2).
- Detalhe e escrita continuam exigindo a permissão do cadastro.

**Visibilidade**

- Esconder no front é só para o usuário não esbarrar; quem barra de verdade é o servidor.

## Regras multi-tenant e segurança

**Origem e escopo dos dados**

- Aqui o "tenant" é a conta (`contas`). O dono do plano vem do vínculo gravado no banco (`conta_membros` ativo → `contas.usuario_id`), nunca do cliente.
- A liberação de leitura vale só para `GET` nos caminhos de listagem de cada rota (`isCatalogListRequest`). `GET /:id` e qualquer escrita continuam exigindo a permissão do cadastro.
- O escopo dos dados das listagens não muda: cada rota continua filtrando por usuário, conta e família como hoje. Cartões de outras pessoas continuam dependendo de "Ver e usar os cartões dos outros".

**Mensagens e espelhamento**

- As mensagens de recusa não revelam dados de outra conta.
- O front espelha a tabela de leitura só para esconder botões e evitar pedidos que seriam recusados. A regra que vale é a do servidor, que tem teste próprio.

## Validações necessárias

- `requireCatalogAccess`:
  - método e caminho avaliados no caminho relativo à montagem (`req.path`);
  - pedido sem usuário → 401, como no `requireScreenAccess`.
- `requireNotAccountMember`: membro com vínculo `ativo` → 403. Sem vínculo ou vínculo inativo → segue.
- `GET /plans/status`: `isAccountMember` booleano sempre presente.
- `PUT /account-members/:id/permissions`: continua validando só as chaves de `PERMISSION_FLAGS`; as duas removidas passam a ser ignoradas.

## Testes necessários

### Frontend

- `src/utils/screenAccess.test.ts`:
  - seções do menu por permissão (PF e PJ; titular com tudo; membro sem nada);
  - controles de Movimentações;
  - itens de Configurações (titular, membro, PF, PJ, analytics e admin);
  - listas legíveis e gerenciáveis pela tabela;
  - intenções do assistente.

### Backend

- `backend/src/utils/catalogAccess.test.ts`, para cada cadastro:
  - a permissão do cadastro libera listagem, detalhe e escrita;
  - a permissão leitora libera só a listagem (incluindo `/limites` nos cartões) e não libera `GET /:id`, `POST`, `PUT`, `PATCH` nem `DELETE`;
  - nenhuma permissão nega tudo;
  - a lista de contas fica aberta a qualquer membro.

### E2E

Roteiro local, `.env.dev`:

**Plano**

1. Titular em dia e membro com teste próprio vencido:
   - rotas financeiras respondem 200 para o membro;
   - `/plans/status` traz o status do titular e `isAccountMember: true`.
2. Titular vencido: o membro recebe `PLAN_EXPIRED`; o titular, também.
3. Rotina (`processPlanLifecycle` via script ou rota interna):
   - não muda `plano_status` do membro;
   - não cria evento de e-mail para ele;
   - evento pendente antigo do membro vira `skipped`.
4. Rotas de pagamento (`plans` e `paypal`):
   - 403 para membro ativo;
   - titular continua passando a checagem (sem concluir pagamento real).

**Listas e cadastros**

5. Listas, conforme a tabela:
   - membro só com Despesas lê categorias de despesa e cartões, mas recebe 403 ao criar categoria e em `GET /categorias/:id`;
   - membro só com Receitas (PJ) lê categorias de receita, clientes, contratos, representantes e produtos;
   - membro sem nada recebe 403 nas listas, exceto contas.
6. Movimentações com só Despesas: `fetchFinanceDashboard` não chama `/incomes`, e a lista carrega.

**Permissões removidas**

7. `GET /account-members/me/permissions` não traz mais `accessMembers` nem `accessSubscription`.

**Front**

8. Fumaça do menu e das Configurações:
   - membro com combinações de permissões vê só o que pode;
   - sem nenhuma permissão aparece "Nenhuma tela liberada";
   - titular vê tudo.
9. Tela de plano vencido do membro com o texto "peça ao titular" e sem planos.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build

npm --prefix backend run build
npm --prefix backend test
```

Backend local para os roteiros: `cd backend && DOTENV_CONFIG_PATH=../.env.dev NODE_ENV=development npx tsx src/server.ts` (nunca `dev:prod-db`).

## Riscos e pontos de atenção

**Plano**

- Membros bloqueados hoje em produção voltam a entrar sozinhos se o titular estiver em dia (desejado). O membro cujo titular está vencido passa a ver "peça ao titular".
- O bloqueio por plano faz uma consulta a mais por pedido, do porte da checagem de permissão que já existe. Dá para juntar com a consulta de vínculo se pesar.
- O PayPal passa a recusar membro ativo. Isso não estava na revisão original, mas segue a decisão 4 (plano só do titular).

**Listas**

- Quem tem Despesas ou Receitas passa a ver os nomes das listas da tabela, restrito à listagem e ao escopo atual de cada rota.
- A tabela de leitura existe no servidor e espelhada no front. Se uma mudar sem a outra, o front pode esconder demais ou pedir algo que será recusado. Os testes dos dois lados e os comentários cruzados reduzem o risco.

**Migration e cache**

- Apagar as colunas é irreversível: perdem-se os valores de duas permissões que hoje não fazem nada.
- Se a migration rodar antes do deploy, o sistema quebra ao ler as permissões.
- A mudança da chave do dashboard pode deixar consultas antigas em cache até a próxima invalidação. As invalidações usam o prefixo `['dashboard']`, então seguem funcionando.

**Comportamento que continua igual**

- Quando o titular muda uma permissão, o membro vê o efeito ao recarregar ou em até 5 minutos.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

**Plano**

- Membro com o próprio teste vencido e titular em dia usa o sistema normalmente. A rotina não o expira e não manda e-mail.
- Com o titular vencido, o membro vê "O plano da conta venceu. Peça ao titular para renovar." e não vê a lista de planos.

**Listas e cadastros**

- Membro só com Despesas:
  - lança despesa escolhendo categoria e cartão;
  - não consegue criar categoria (sem "+ cadastrar" no modal; o servidor recusa);
  - abre Movimentações sem erro.
- Membro com Receitas em conta empresa lança receita com os próprios clientes, contratos, representantes e produtos.

**Visibilidade**

- Menu, Configurações, botões de lançamento, calendário, Planejamento, contratos do cliente e assistente só aparecem com a permissão. O titular vê tudo.
- Sem nenhuma permissão, aparece "Nenhuma tela liberada. Fale com o titular da conta."

**Permissões removidas**

- "Membros/Colaboradores" e "Assinatura/Planos" não aparecem mais.
- As rotas de plano e de pagamento do PayPal recusam membro ativo.

**Entrega**

- tsc, testes e builds passando.
- Migration `0055` escrita e **não** executada.

## Observações para a skill implementar

**Fontes**

- Usar este plano como fonte principal. Fase 1 remove, Fase 2 aplica, como etapas separadas.

**Banco e ambiente**

- Não executar a migration `0055` em banco nenhum sem confirmação explícita, e nunca antes do código novo estar em produção.
- Testes manuais só com o backend em `.env.dev` (localhost:5433), com fixtures marcadas e apagadas no final. Nunca `dev:prod-db`.

**Código**

- Queries novas em Drizzle; identificadores em inglês; textos de tela e mensagens ao usuário em português; sem `any`.
- A regra de acesso fica no servidor. O espelho no front (`screenAccess.ts`) só esconde, e os dois arquivos se citam em comentário.
- Não alterar `.env`. Não fazer commit nem push: isso é do `/finalizar`.

**Entrega**

- Ao final, resumo no formato da skill, com os desvios e a lembrança da ordem deploy → migration.
