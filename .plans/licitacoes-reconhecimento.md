# Reconhecimento: módulo de Licitações no FINGERENCE (Fase 0)

> Escopo vigente: `.plans/licitacoes-escopo.md` (v1.1).
> Origem: `ESCOPO_LICITACOES.md` v1.0 e `docs/RECONHECIMENTO.md` do repositório `notificacoes-comercial`.
> Data: 04/10/2026 · Base analisada: commit `d73688dd` (branch `feat/R/clientes-contratos`). Análise só de leitura; nenhum arquivo de código foi alterado.

## Decisões já tomadas

- O módulo de Licitações será construído dentro do FINGERENCE, como um app próprio (entrada HTML separada), com o mesmo login, contas e banco.
- Cada módulo tem o seu link; a página pública do FINGERENCE não muda.
- Uso interno primeiro, mas modelado por conta para poder virar produto para outras empresas.
- O Disparo de Notificações fica fora deste escopo (padrão adotado; decisão 12 do escopo).

## 1. Backend

- Express 4 + TypeScript executado com `tsx` (`backend/src/server.ts`), porta 3010.
- Rotas em `backend/src/routes/*.ts`, montadas em `server.ts` com a cadeia `authenticate` → `requireActivePlan` → `requireScreenAccess(flag)` ou `requireCatalogAccess(...)`.
- Padrão de módulo: `backend/src/modules/catalogo/`, com `db/schema.ts` (tabelas em `pgSchema('catalogo')`) e `routes/`; o schema é exportado em `backend/src/db/schema/index.ts` e as rotas montadas em `/api/catalogo`.
- Envelope de resposta: `{ success, message, data }`. Erro de validação (`express-validator` + middleware `validate`): HTTP 400 com `{ success: false, message: 'Validation error', errors: [{ field, message }] }`.
- Limitador de tentativas próprio, em memória (`backend/src/middleware/validation.ts`, HTTP 429 com mensagem em português).
- Não há padrão de paginação nas rotas atuais.
- `AGENT.md`: identificadores, arquivos, pastas, rotas e campos de API em inglês; tabelas e colunas em português; consultas novas pelo Drizzle (SQL bruto só com motivo); filtro de conta em todo dado de conta; dependências compatíveis com Node 22.17.0.

## 2. Banco de dados

- PostgreSQL com Drizzle ORM (`drizzle-orm/node-postgres`, pool `pg`). Cada conexão define `search_path` (`DB_SCHEMA`, hoje `public`) e `timezone = 'America/Sao_Paulo'`.
- O cliente devolve `date`, `timestamp` e `timestamptz` como **texto** (type parsers em `backend/src/db/client.ts`). A formatação de datas do módulo precisa partir disso.
- Ambientes: `.env` aponta para o Postgres de **produção** no Render; `.env.dev`, para o PostgreSQL 18 local (`localhost:5433/sistema_financas_dev`). `npm --prefix backend run dev` usa `.env.dev`; `dev:prod-db` usa produção.
- Migrações: SQL numerado em `backend/drizzle/` (a última é a `0071`), aplicado um a um por `backend/scripts/migrations.ts`, com registro e checksum em `schema_migrations`:
  - `npm --prefix backend run migrations:status -- --banco local`
  - `npm --prefix backend run migrations:aplicar -- <ID> --banco local`
  - produção exige `--banco producao --confirmo` e o ok explícito do usuário.
- Extensões: `unaccent` e `pg_trgm` instaladas no PostgreSQL 18 local e suportadas no Render (PostgreSQL 13+). Não há RLS em uso.
- Tabelas centrais: `usuarios` (PK `serial`; `tipo` = `membro` | `titular` | `admin`), `contas` (dono em `usuario_id`; `tipo` = `pessoal` | `empresa`), `conta_membros` (um usuário é membro de no máximo uma conta) e `membro_permissoes` (uma coluna booleana por tela, todas nascem `false`).

## 3. Autenticação e permissões

- JWT no cabeçalho `Authorization: Bearer`, guardado em `localStorage`/`sessionStorage`. `authenticate` confere o status do usuário no banco a cada requisição.
- Login por e-mail e senha e por Google (`/api/auth/*`), com recuperação de senha.
- Colaboradores são criados pelo titular (`POST /api/account-members`), com senha própria e tipo `membro`.
- `GET /api/account-members/me/permissions` devolve **todas as flags liberadas** para quem não é membro de uma conta (titular, usuário avulso, admin); `hasScreenAccess` segue a mesma regra. Uma flag nova, sozinha, não restringe titulares.
- `requireActivePlan`: toda rota do app de finanças exige plano ativo do titular; `admin` não expira.

## 4. Front

- React 19, Vite 8, Tailwind 3 (`darkMode: 'class'`), TanStack Query, react-hook-form + zod, lucide-react e PWA.
- Entradas: `index.html` (site público e login), `app.html` (finanças), `assistant.html` (assistente) e `demo.html`. Proxy do Vite: `/api` → `http://localhost:3010`.
- O login (`src/screens/public/LoginPage.tsx`) decide o destino pela origem gravada em `sessionStorage` (`auth_origin`: `assistant` vai para `/assistant.html`; o resto, para `/app.html`). `AuthenticatedAppGate` mostra o login embutido quando não há sessão e aplica o bloqueio de plano.
- O app de finanças navega por estado (`AppSection`), sem rotas por URL; `react-router-dom` é usado só nas páginas públicas (`src/App.tsx`).
- Kit de UI em `src/ui` (button, card, badge, dialog, drawer, form, states, EmptyState, ConfirmDialog, MultiFilterPanel, ListToolbar); gráficos próprios em `src/screens/finance/painel/graficos` (barras, barras horizontais, pizza, medidor); avisos (toasts) próprios.
- `src/services/apiClient.ts` desembrulha `data` do envelope e faz logout no 401.
- `scripts/generate-public-route-html.mjs` gera o HTML das rotas públicas no build.

## 5. Agendamento, notificações e push

- Jobs agendados: rotas `POST /api/internal-jobs/*`, protegidas por segredo em cabeçalho e chamadas por agendamento no Render.
- Notificações atuais: alertas de vencimento de despesa (`expense_alerts`, `/api/notificacoes`) e painel na barra superior do app de finanças.
- Web Push com VAPID (`push_subscriptions`, `backend/src/services/webPush`).

## 6. Testes e verificação

- `node --test` via `tsx`: `npm test` na raiz (utilitários do front) e `npm --prefix backend test` (services e utils). São 50 arquivos de teste.
- Tipos do backend: `npm --prefix backend run build` (`tsc --noEmit`). Build do front: `npm run build`.
- Não há ESLint nem Prettier configurados.

## 7. Como rodar

- Backend local: `npm --prefix backend run dev` (porta 3010, banco local).
- Front: `npm run dev` (porta 5173).
- Nunca usar `dev:prod-db` nem `--banco producao` sem confirmação explícita.

## 8. Pontos de atenção

- Há trabalho em andamento em outro branch e alto volume de commits (386 desde 01/09/2026). O módulo deve nascer num branch próprio (`feat/R/licitacoes`) e tocar o mínimo em arquivos centrais (`backend/src/server.ts`, `backend/src/db/schema/index.ts`, `vite.config.ts`, `src/screens/public/LoginPage.tsx`, `src/services/session.ts`).
- O `AGENT.md` fala em "multi-prefeitura" (texto herdado de outro projeto). Na prática, o tenant do FINGERENCE é a conta (`contas`).
- O Node desta máquina é o 24; o padrão do projeto é o 22.17.0.
- A hospedagem do front em produção precisa aceitar a reescrita de `/licitacoes/*` para a entrada nova; confirmar no plano da Fase 3.
