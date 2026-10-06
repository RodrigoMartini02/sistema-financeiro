# Plano de Implementação: Licitações — Fase 3 (app do módulo, base)

> **Status:** aprovado em 05/10/2026. A implementação só começa com `/implementar`.

## Origem

- Arquivo de especificação: `.plans/licitacoes-escopo.md` (v1.3), seções 9.1 a 9.3, 11 e 14 (Fase 3)
- Plano geral: `.plans/licitacoes-plano.md` (tarefas da Fase 3)
- Data do planejamento: `2026-10-05`
- Classificação: `frontend-only` (mais documentação). A API da Fase 2 já atende tudo; o backend não muda.
- Execução: worktree `C:\Users\rodri\Music\fingerence-licitacoes`, branch `feat/R/licitacoes`

Este plano segue o escopo nos detalhes e registra só o que muda ou completa o escopo.

## Resumo

A Fase 3 cria o app do módulo, ainda sem as telas de verdade. São quatro partes:
- a entrada própria (`tenders.html`), com rotas sob `/licitacoes/app`;
- a entrada no módulo: login embutido, sem acesso, colaborador sem acesso e erro;
- a moldura: menu lateral, barra superior, sino, tema e menu do usuário;
- páginas provisórias para todas as rotas.

O login compartilhado ganha o modo "Licitações". O app de finanças, o assistente e o site público não mudam.

## Escopo

### Dentro do escopo

- **Entrada `tenders.html` + `src/tenders/`:**
  - rotas sob `/licitacoes/app`;
  - troca de endereço de `/licitacoes` para `/licitacoes/app` feita pelo próprio app, nunca por 301;
  - reescrita de `/licitacoes` e `/licitacoes/*` no servidor local (`npm run dev` e `vite preview`).
- **Entrada no módulo**, conforme o estado da sessão e de `GET /api/tenders/access`.
- **Moldura do app**, conforme a seção 9.3 do escopo.
- **Páginas provisórias:**
  - Início, Buscar, Edital, Buscas salvas, Acompanhamento, Notificações e Configurações;
  - "página não encontrada" dentro da moldura.
- **Login compartilhado:** modo "Licitações" no `LoginPage` e origem nova em `auth_origin`.
- **Testes de lógica, build e conferência no navegador.**
- **Documentação:** README do módulo (incluindo as regras de hospedagem para a ida à produção) e registro no plano geral.

### Fora do escopo

- Telas de verdade, com dados (Fase 4).
- Painel do sino com a lista de notificações e a montagem do link `/licitacoes/app` + `/editais/<id>` (Fase 4).
- Troca de conta dentro do módulo. Com uma conta habilitada por titular, a API já usa a conta padrão (decisão 2 da Fase 2).
- Link do app de finanças para o módulo: o FINGERENCE não muda.
- App instalável (PWA) do módulo, página pública de Licitações e link no rodapé do site.
- **Produção:** merge em `main`, regra de reescrita na hospedagem, migrations e Cron Jobs. Ficam para a ida à produção, por decisão do usuário (o merge espera o módulo ir para produção). O "sem 404 em produção" do aceite da Fase 3 do escopo fica para essa ida.

## Leitura de contexto

- **Regras do projeto:** `/AGENT.md` e `/CLAUDE.md`. Não há `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto.
- **Planos:** `.plans/licitacoes-escopo.md` (v1.3) e `.plans/licitacoes-plano.md`.
- **Front:**
  - configuração: `vite.config.ts`, `package.json`, `tsconfig.json`, `index.html`, `app.html`, `assistant.html`, `scripts/generate-public-route-html.mjs`;
  - entradas e roteamento: `src/main.tsx`, `src/assistantMain.tsx`, `src/bootstrap/AppProviders.tsx`, `src/App.tsx`;
  - sessão e API: `src/services/session.ts`, `src/services/apiClient.ts`, `src/services/authService.ts` (redirecionamento do Google para `/index.html`), `src/hooks/useAuthSession.ts`;
  - login e moldura: `src/components/auth/AuthenticatedAppGate.tsx` (login embutido do assistente), `src/screens/public/LoginPage.tsx`, `src/layout/AppShell.tsx`, `src/context/AppContext.tsx` (tema `dark` e chave `theme`);
  - apoio: `src/sw.ts` (navegação busca primeiro na rede), `src/ui/states.tsx`, `src/ui/EmptyState.tsx`, `src/hooks/useTelaDesktop.ts`.
- **Hospedagem em produção** (só leitura, 05/10/2026):
  - o site passa pelo Cloudflare;
  - `/loja/teste` responde 200, porque existe regra para `/loja/*`;
  - `/licitacoes`, `/licitacoes/app/...` e `/qualquer-coisa` respondem 404, porque não há regra geral.

## Impacto por área

### Frontend

- **Entrada:**
  - `tenders.html`: título "Licitações · FINGERENCE", `noindex` e script `/src/tenders/main.tsx`;
  - entrada `tenders` em `build.rollupOptions.input`.
- **Servidor local:** plugin em `vite.config.ts` (`configureServer` e `configurePreviewServer`) que entrega `tenders.html` para `/licitacoes` e `/licitacoes/*`.
- **`src/tenders/main.tsx`:**
  - `QueryClient` com os mesmos padrões do app;
  - `AppProvider`, para o tema compartilhado (classe `dark` e chave `theme`);
  - `BrowserRouter` com `basename="/licitacoes/app"`;
  - antes do roteador, `history.replaceState` troca `/licitacoes` e `/licitacoes/` por `/licitacoes/app`, mantendo a query e o hash.
- **Cliente da API do módulo** (`src/tenders/services/tendersApi.ts`):
  - usa `getApiUrl()` e o token da sessão, com o prefixo `/tenders`;
  - devolve `data`;
  - erro com `status` e mensagem (`TendersApiError`);
  - 401 chama `logout()`, como no app.
- **Query keys** do módulo, centralizadas em `src/tenders/services/queryKeys.ts`.
- **Hooks:**
  - `useTenderAccess`: `GET /access`;
  - `useUnreadNotificationsCount`: `GET /notifications/count`, a cada 60 s e quando a aba volta ao foco, só com acesso liberado.
- **Entrada no módulo:** uma função pura decide o estado e a tela mostra o resultado.

  | Estado | Quando | O que aparece |
  | --- | --- | --- |
  | `login` | Sem token ou 401 | `LoginPage` embutido no modo Licitações; antes, `setAuthOrigin('tenders')`, como o assistente faz |
  | `loading` | Carregando | Tela de carregamento |
  | `noModule` | 404 | "Sua conta não tem acesso a Licitações", com "Ir para o FINGERENCE" (`/app.html`) e "Sair" |
  | `memberWithoutAccess` | 403 | A mesma tela, pedindo que fale com o titular da conta |
  | `error` | Rede ou 5xx | Mensagem e "Tentar de novo" |
  | `ready` | Acesso liberado | A moldura |

- **Moldura** (`src/tenders/layout/`):
  - **Configuração das rotas** (caminho, título, ícone, só titular ou admin), usada pelo menu, pela barra e pelas rotas.
  - **Menu lateral:** Início, Buscar, Buscas salvas, Acompanhamento, Notificações e Configurações. Configurações aparece só com `permissions.manageTeam` ou `permissions.viewCollectionRuns`.
  - **Responsivo:**
    - a partir de 1280 px, menu completo;
    - de 768 a 1279 px, recolhido em ícones;
    - abaixo de 768 px, gaveta aberta pelo botão da barra.
  - **Barra superior:**
    - título da página;
    - busca rápida: o atalho `/` foca o campo (fora de campos de texto), e Enter leva a `/buscar?q=`;
    - botão de tema;
    - sino com a contagem, que leva a `/notificacoes`;
    - menu do usuário.
  - **Menu do usuário:**
    - nome da pessoa e da conta;
    - "Controle financeiro" (`/app.html`), só quando `/planos/status` dá `trial` ou `ativo`. A troca de módulo só aparece para quem tem mais de um, como manda o escopo;
    - "Sair": `logout()` e volta para `/licitacoes/app`, que mostra o login.
- **Páginas provisórias:**
  - título e o texto "Esta tela está em construção";
  - Buscar mostra o termo recebido em `?q=`;
  - Configurações, para quem não pode, mostra "Só o titular da conta acessa as configurações do módulo".
- **Login compartilhado:**
  - `src/utils/authOrigin.ts` (novo): destino por origem, com `assistant` → `/assistant.html`, `tenders` → `/licitacoes/app` e `app` → `/app.html`;
  - `session.ts`: `AuthOrigin` passa a aceitar `tenders`;
  - `LoginPage`: prop opcional `context="tenders"` muda o título do login para "Entrar em Licitações" e esconde "Criar nova conta"; os outros modos (esqueci a senha, código, nova senha) continuam iguais;
  - o retorno do Google, que vem pelo `/index.html`, usa a mesma origem guardada no `sessionStorage`.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

> **Atenção:** migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Esta fase não tem migration.

### Infra/Deploy

- **Servidor local:** a reescrita fica no `vite.config.ts`.
- **Produção (só na ida à produção, não nesta fase):** na hospedagem do site, onde já está a regra de `/loja/*`, criar duas regras de reescrita, nunca de redirecionamento:
  - `/licitacoes` → `/tenders.html`;
  - `/licitacoes/*` → `/tenders.html`.
- O build já gera `dist/tenders.html`.
- Sem variável de ambiente nova.

## Arquivos provavelmente afetados

- **Novos:**
  - `tenders.html`;
  - `src/tenders/main.tsx` e `src/tenders/TendersApp.tsx`;
  - `src/tenders/services/{tendersApi,queryKeys}.ts`;
  - `src/tenders/hooks/{useTenderAccess,useUnreadNotificationsCount}.ts`;
  - `src/tenders/layout/{TendersShell,TendersSidebar,TendersTopBar,TendersUserMenu}.tsx`;
  - `src/tenders/screens/{TendersLoginScreen,NoAccessScreen,PlaceholderScreen,NotFoundScreen}.tsx`;
  - `src/tenders/utils/{modulePaths,gateState,navigation}.ts`, com testes;
  - `src/utils/authOrigin.ts`, com teste.
- **Alterados:**
  - `vite.config.ts`;
  - `src/services/session.ts`;
  - `src/screens/public/LoginPage.tsx`;
  - `package.json` (inclui `src/tenders/**/*.test.ts` no `npm test`).
- **Documentação:** `backend/src/modules/tenders/README.md` (seção do app e regras de hospedagem) e `.plans/licitacoes-plano.md` (registro).

## Estratégia de implementação

1. **Login compartilhado:** `authOrigin.ts` com teste, `session.ts` e o modo Licitações no `LoginPage`. Conferir que o destino do FINGERENCE e o do assistente não mudaram.
2. **Entrada e reescrita local:** `tenders.html`, entrada no `vite.config.ts`, plugin de reescrita, `main.tsx` e troca de endereço de `/licitacoes`.
3. **Cliente da API e hooks:** `tendersApi.ts`, query keys, `useTenderAccess` e `useUnreadNotificationsCount`.
4. **Entrada no módulo:** função de estado com teste, `TendersLoginScreen` e `NoAccessScreen`.
5. **Moldura:** configuração das rotas com teste, menu lateral, barra superior, sino e menu do usuário, com os três tamanhos de tela.
6. **Rotas e páginas provisórias**, incluindo "não encontrada" e a regra de Configurações.
7. **Validação:**
   - testes do front e build;
   - tipos sem erro novo (comparando com o estado antes);
   - conferir no build que o código do módulo fica só na entrada `tenders`.
8. **Conferência no navegador** (backend e front locais, Edge como nas outras entregas), com prints:
   - login embutido;
   - sem acesso: desabilitar e reabilitar a conta 18 local pela rota do admin;
   - moldura no desktop, nos temas claro e escuro;
   - celular com a gaveta;
   - troca de `/licitacoes`;
   - rota desconhecida;
   - regressão: login do site, app de finanças e assistente.
9. **Documentação** (README e registro no plano geral) e parada para o aceite.

## Regras de negócio identificadas

Só o que completa o escopo:
- **Troca de endereço:** `/licitacoes` e `/licitacoes/` passam a `/licitacoes/app` sem recarregar, mantendo a query e o hash.
- **Destino depois do login:** pela origem guardada (`auth_origin`). Licitações vai para `/licitacoes/app`; o FINGERENCE e o assistente não mudam.
- **Telas de sem acesso:**
  - conta sem o módulo (404): "Sua conta não tem acesso a Licitações";
  - colaborador sem acesso (403): mesma tela, com o aviso de pedir ao titular.
- **Configurações:** visível só para quem tem `manageTeam` ou `viewCollectionRuns`, ou seja, titular ou admin.
- **"Controle financeiro" no menu:** só com plano `trial` ou `ativo`.
- **Sino:** contagem de `GET /notifications/count`, a cada 60 s e na volta do foco.

## Regras multi-tenant e segurança

- Conta e permissões vêm sempre da API (`/access`). O app não decide acesso; ele só esconde o que a API não libera.
- Nenhum dado de outra conta passa pelo front. A trava está no backend (Fase 2).
- Na saída, `logout()` limpa a sessão como no app de finanças.
- Conteúdo da API é exibido como texto, sem `dangerouslySetInnerHTML`.

## Validações necessárias

- Busca rápida: texto aparado; vazio não navega.
- Sem formulários de dados nesta fase.

## Testes necessários

### Frontend

- `authOrigin`: destinos de `assistant`, `tenders`, `app` e origem desconhecida.
- `modulePaths`: troca de `/licitacoes` e `/licitacoes/` (com query e hash); `/licitacoes/app/...` fica como está.
- `gateState`: cada combinação de sessão e resposta de `/access` (sem token, carregando, 401, 403, 404, erro e liberado).
- `navigation`: itens visíveis por papel (titular, colaborador, admin) e URL da busca rápida.
- Leitura de erro do cliente da API (status e mensagem).

### Backend

Sem testes novos; `npm --prefix backend test` como regressão.

### E2E

Conferência no navegador da etapa 8 da estratégia, com prints.

## Comandos de validação sugeridos

```bash
npm test
npx tsc --noEmit -p tsconfig.json     # sem erro novo
npm run build                         # vite build + páginas públicas
npm --prefix backend test             # regressão (com DOTENV_CONFIG_PATH=../.env.dev no worktree)
```

## Riscos e pontos de atenção

- **Login compartilhado:** mexer no `LoginPage` e no `session.ts` pode afetar os logins do FINGERENCE e do assistente. Isso é coberto pelo teste dos destinos e pela conferência dos três logins no navegador.
- **Hospedagem:** sem as regras novas, o link do módulo dá 404 em produção, como já aconteceu com `/loja`. As regras ficam escritas no README, para a ida à produção.
- **Pacote separado:** o módulo não pode entrar no pacote do app de finanças. Conferir nos nomes dos arquivos gerados no build.
- **Service worker:** a navegação já busca primeiro na rede, e nada muda no `sw.ts`. Conferir no navegador que `/licitacoes/app` não abre o app de finanças em cache.
- **Plugin de reescrita local:** não pode capturar outros endereços (ex.: `/licitacoesx`). Ele só age em `/licitacoes` exato e em `/licitacoes/...`.

## Perguntas em aberto

Não bloqueiam a Fase 3:
- Seguem abertas a 3 (conta da empresa), a 4 (Cron Jobs pagos) e a 6 (espaço do Postgres no Render).
- Onde ficam as regras de reescrita do site, no painel do Render ou no do Cloudflare? Só importa na ida à produção.

## Critérios de aceite do plano

- **Endereços:**
  - `/licitacoes` vira `/licitacoes/app` sem recarregar;
  - rota desconhecida do módulo mostra "página não encontrada" dentro da moldura.
- **Login:** embutido, com título de Licitações e sem "Criar nova conta"; depois do login, volta para `/licitacoes/app`.
- **Sem acesso:** conta sem o módulo e colaborador sem acesso veem as telas certas, com link para o FINGERENCE.
- **Moldura:**
  - completa no desktop, recolhida no tamanho médio e em gaveta no celular, com tema claro e escuro;
  - sino com a contagem da API;
  - "Controle financeiro" só com plano ativo;
  - Configurações só para titular e admin.
- **Regressão:** login do site, app de finanças e assistente funcionam como antes.
- **Checks:** testes do front e build passando; tipos sem erro novo; código do módulo só na entrada `tenders`.
- **Documentação:** README com as regras de hospedagem da ida à produção e registro no plano geral.
- **Produção:** nada vai para lá e não há merge.

## Observações para a skill implementar

- Trabalhar no worktree `C:\Users\rodri\Music\fingerence-licitacoes`, no branch `feat/R/licitacoes`, sem criar branch novo.
- Seguir o `CLAUDE.md` e o `AGENT.md`:
  - React Query para dados do servidor, com query keys centralizadas;
  - sem `fetch` dentro de componente;
  - estados de carregando, vazio e erro;
  - acessibilidade (`aria-label` em botões só com ícone, foco visível, teclado).
- Reaproveitar `src/ui`, `LoadingState`, `ErrorState`, `EmptyState`, `useTelaDesktop` e o estilo do `AppShell`, sem biblioteca nova.
- Não mexer no app de finanças, no assistente nem no site público, além de `LoginPage` e `session.ts`.
- Sem migration, sem `.env`, sem produção.
- Commits pequenos, em Conventional Commits e em português.
- Ao terminar, parar para o aceite da Fase 3. O `/finalizar` envia o branch sem merge.
