# Plano de Implementação: Eliminar versão antiga (legado) do sistema financas

## Origem

- Arquivo de especificação: pedido direto do usuário ("elimine a versão antiga do projeto para não atrapalhar ou deixar herança"), item 3 de 4 da auditoria financeira priorizada
- Data do planejamento: 2026-07-12
- Classificação: `backend + infra/deploy`

## Resumo

O projeto passou por uma migração de um backend Express/CommonJS (`backend/server.js` + módulos em `backend/routes|controllers|middleware|cron|services|utils|config`) e de um frontend vanilla JS/CSS (`js/`, `css/`, páginas HTML soltas) para um backend TypeScript/Drizzle (`backend/src/`) e um frontend React (`src/`). A migração já está completa e em produção (Render Start Command já ajustado nesta sessão para `tsx src/server.ts`), mas os arquivos legados nunca foram removidos do repositório.

Investigação (grep cruzado + leitura de `vite.config.ts`, `backend/src/server.ts`, `main.tsx`, `.gitignore`) confirmou que **toda** a stack legada está órfã — sem nenhuma referência ativa fora dela mesma — com uma exceção: o cron de cobrança (`backend/cron/cobrancas.js`), que envia e-mails de vencimento de plano/trial e **parou de rodar em produção** quando o Start Command mudou, pois o `server.ts` novo nunca o iniciou. Este plano remove todo o legado e porta esse cron para o backend novo, fechando a lacuna funcional encontrada.

## Escopo

### Dentro do escopo

- Apagar frontend legado: `js/` (19 arquivos + subpasta vazia `despesas/`), `css/` (15 arquivos), `sw.js`, `offline.html`, `termoPrivacidade.html`, `mockup-tela-mes.html`
- Apagar backend legado: `backend/server.js`, `backend/routes/*.js` (16 arquivos), `backend/controllers/` (pasta já vazia), `backend/middleware/auth.js`, `backend/middleware/validation.js`, `backend/services/*.js` (11 arquivos — resíduo da feature de IA/OCR já removida), `backend/utils/expenseNormalizer.js`, `backend/config/database.js`
- Portar `backend/cron/cobrancas.js` para `backend/src/cron/cobrancas.ts`, seguindo o padrão `setTimeout` orientado a evento já usado em `backend/src/modules/futebol/cron.ts`, e iniciá-lo em `backend/src/server.ts`
- Remover script `dev:legacy` de `backend/package.json`
- Adicionar `dist/` e `*.log` ao `.gitignore`; remover do disco os logs soltos não rastreados (`backend-dev.log`, `backend-dev.err.log`, `vite-dev.log`, `vite-dev.err.log`, nas duas raízes)
- Remover diretório `docs/` (vazio)
- Remover `backend/scripts/migrate-receitas.sql` (script de migração já aplicado — colunas em uso ativo no app) e `manual/gen-ia-refatoracao.md` (documentação da feature de IA já removida) — decisões resolvidas com o usuário usando a recomendação default

### Fora do escopo

- `manifest.json`, `icons/`, `robots.txt`, `sitemap.xml`, `google8ffa04c2d41f9f5c.html` — ainda são ativos pretendidos para produção (PWA + SEO), só não estão sendo copiados para `dist/` por falta de pasta `public/` no Vite. É um bug de infra separado, não código legado — fica para um `/planejar` futuro.
- `backend/uploads/` — em uso ativo por `contract-attachments.ts`.
- `.plans/`, `.agents/skills/`, `AGENT.md`/`CLAUDE.md` da raiz do repo `sistema financas`, `js/ia.js`, `js/ia-mobile.js`, `css/ia.css`, `css/ia-mobile.css`, `ia.html`, `ia-mobile.html`, `backend/controllers/aiController.js`, `backend/routes/aiRoutes.js` — já estão sendo removidos por trabalho pendente não relacionado, presente no working tree antes deste plano. Não serão tocados nem re-adicionados ao commit deste plano.
- `backend/scripts/setup-dev-db.js` — ferramenta manual de setup de banco local, não referenciada por nenhum script npm; mantido.

## Leitura de contexto

- CLAUDE.md da raiz (`c:\Users\rodri\Music\Particular\CLAUDE.md`) — regra de aprovação explícita, regra de `.env`
- `vite.config.ts` — confirma build inclui só `app.html`+`index.html`
- `backend/src/server.ts` — confirma todas as rotas TS montadas (incl. aliases PT) e que só `startFootballCron()` é iniciado
- `backend/src/modules/futebol/cron.ts` — padrão de referência para o novo cron de cobrança
- `backend/src/db/schema/users.ts` — confirma colunas `planStatus`, `planType`, `planExpiration`, `createdAt` já existem
- `backend/routes/planos.js` (legado) — lógica original de `enviarEmailCobranca`
- `backend/cron/cobrancas.js` (legado) — lógica original do cron
- `backend/src/routes/auth.ts` — padrão EmailJS já em uso (`sendRecoveryEmail`)
- `.gitignore`, `package.json` (raiz e backend), `git status`/`git log` do repositório

## Impacto por área

### Frontend

Remoção pura de arquivos órfãos (`js/`, `css/`, `sw.js`, `offline.html`, `termoPrivacidade.html`, `mockup-tela-mes.html`). Nenhuma tela React (`src/`) referencia esses arquivos. `main.tsx` já desregistra ativamente qualquer service worker, confirmando que `sw.js` foi abandonado de propósito. Sem impacto em componentes, hooks ou query keys ativos.

### Backend

- Remoção do Express/CommonJS legado completo (`server.js` + módulos).
- Novo arquivo `backend/src/cron/cobrancas.ts`:
  - Query via Drizzle em `users`: `planStatus = 'ativo' AND planExpiration BETWEEN NOW() AND NOW() + 8 dias` → aviso em 7/1/0 dias restantes.
  - Query via Drizzle em `users`: `planStatus = 'trial'` → aviso em 3/1/0 dias restantes de um trial de 15 dias, calculado a partir de `createdAt`.
  - Envio de e-mail via EmailJS, reaproveitando `EMAILJS_SERVICE_ID`/`EMAILJS_USER_ID` já configurados e a env var já usada no legado `EMAILJS_TEMPLATE_COBRANCA_ID` (diferente do template de recuperação de senha).
  - Agendamento diário às 8h (`America/Sao_Paulo`) via `setTimeout` recalculado a cada execução (mesmo padrão de `nextOccurrence`/`scheduleNext` do cron do futebol), sem depender de `node-cron`.
  - `startCobrancaCron()` chamado em `backend/src/server.ts` ao lado de `startFootballCron()`.
- `backend/package.json`: remover script `dev:legacy`.

### Banco de dados

Sem impacto. Nenhuma migration nova. `migrate-receitas.sql` será apenas removido do repositório (arquivo, não execução) — as colunas que ele criava já existem e já estão em uso pelo app.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Este plano não executa nenhuma migration.

### Infra/Deploy

- `.gitignore`: adicionar `dist/` e `*.log`.
- Sem mudança de env vars obrigatória — `EMAILJS_TEMPLATE_COBRANCA_ID` já deveria existir no Render desde o uso legado; se não existir, o cron novo loga aviso e não envia e-mails (mesmo comportamento defensivo do código original), sem quebrar o boot do servidor.
- Sem mudança de Start Command (já corrigido em sessão anterior).

## Arquivos provavelmente afetados

**Apagar:**
- `js/` (pasta inteira)
- `css/` (pasta inteira)
- `sw.js`, `offline.html`, `termoPrivacidade.html`, `mockup-tela-mes.html`
- `backend/server.js`
- `backend/routes/anos.js`, `auth.js`, `avaliacoes.js`, `cartoes.js`, `categorias.js`, `despesas.js`, `financeiro.js`, `meses.js`, `paypal.js`, `perfis.js`, `planos.js`, `receitas.js`, `representantes.js`, `reservas.js`, `socios.js`, `usuarios.js`
- `backend/controllers/` (pasta vazia)
- `backend/middleware/auth.js`, `backend/middleware/validation.js`
- `backend/cron/cobrancas.js` (após portar)
- `backend/services/aiParser.js`, `boletoParser.js`, `categoryAI.js`, `extratoParser.js`, `genProviderGateway.js`, `genWorkspaceService.js`, `ocrService.js`, `pixReader.js`, `recurrenceDetector.js`, `secureKeyStore.js`, `visionService.js`
- `backend/utils/expenseNormalizer.js`
- `backend/config/database.js`
- `backend/scripts/migrate-receitas.sql`
- `docs/` (pasta vazia)
- `manual/gen-ia-refatoracao.md`

**Criar:**
- `backend/src/cron/cobrancas.ts`

**Editar:**
- `backend/src/server.ts`
- `backend/package.json`
- `.gitignore`

## Estratégia de implementação

1. Criar `backend/src/cron/cobrancas.ts` portando a lógica de `backend/cron/cobrancas.js` + `enviarEmailCobranca` de `backend/routes/planos.js`, em Drizzle/TypeScript, seguindo o padrão `setTimeout` de `futebol/cron.ts`.
2. Importar e chamar `startCobrancaCron()` em `backend/src/server.ts`, ao lado de `startFootballCron()`.
3. Rodar `cd backend && npm run build` (`tsc --noEmit`) para validar o cron novo antes de apagar o legado.
4. Apagar toda a lista de arquivos/pastas legados (frontend e backend) via `git rm`.
5. Remover script `dev:legacy` de `backend/package.json`.
6. Atualizar `.gitignore` (`dist/`, `*.log`) e remover do disco os arquivos de log soltos não rastreados.
7. Remover `docs/` e `manual/gen-ia-refatoracao.md`.
8. Rodar `npx vite build` (frontend) e `cd backend && npm run build` novamente para confirmar que nada quebrou.
9. Stage seletivo (apenas os arquivos deste plano — repositório tem outras alterações pendentes não relacionadas que devem permanecer intocadas), commit, seguir fluxo padrão de `/finalizar`.

## Regras de negócio identificadas

- E-mail de cobrança para plano ativo: disparado quando faltam exatamente 7, 1 ou 0 dias para `planExpiration`.
- E-mail de aviso de trial: trial dura 15 dias a partir de `createdAt`; aviso disparado quando faltam exatamente 3, 1 ou 0 dias.
- Link de renovação no e-mail aponta para `${FRONTEND_URL}/app.html?planos=1`.
- Tipo de plano exibido no e-mail: `anual` → "Premium", outro → "Plus"; trial → "Grátis".

## Regras multi-tenant e segurança

Não aplicável a maior parte do escopo (remoção de arquivos órfãos). O cron novo lê dados de todos os usuários (`users`) para fins de notificação — mesmo comportamento do cron legado, sem exposição de dados entre usuários (cada e-mail é enviado individualmente ao próprio dono do plano). Sem novos endpoints HTTP, sem impacto em autenticação/autorização de rotas existentes.

## Validações necessárias

- Confirmar `tsc --noEmit` passa com o novo `backend/src/cron/cobrancas.ts`.
- Confirmar `backend/src/server.ts` continua compilando e montando todas as rotas após as remoções.
- Confirmar `vite build` do frontend continua gerando `dist/app.html` + `dist/index.html` sem erros após remover `js/`/`css/`/HTML soltos.

## Testes necessários

### Frontend

- Build de produção (`npx vite build`) sem erros.
- Smoke test manual: login, navegação básica, sem 404 de assets no console (nenhuma tela deveria referenciar os arquivos removidos).

### Backend

- Build (`tsc --noEmit`) sem erros.
- Boot local do servidor (`npm run dev` ou `npm start`) sem erros, log confirmando os dois crons iniciados (`[futebol cron]` e o novo `[cobranca cron]`).
- Teste manual/lógico do cálculo de `diasRestantes` do novo cron (sem esperar 24h): pode ser validado via script `node -e` isolado, como foi feito para o cálculo de datas do bug de "mover despesa" em plano anterior.

### E2E

- Não aplicável — sem mudança de fluxo de usuário.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx vite build
```

## Riscos e pontos de atenção

- Se `EMAILJS_TEMPLATE_COBRANCA_ID` não estiver configurado no Render, os e-mails de cobrança não serão enviados (mas o servidor não quebra — mesmo comportamento defensivo do código legado, que já tratava a ausência de credenciais com um `console.warn`).
- Repositório tem alterações pendentes não relacionadas no working tree (herança de outras tarefas em andamento) — a implementação deve isolar o commit deste plano dessas alterações, evitando `git add -A`.
- Remoção é ampla (>30 arquivos); build deve ser validado antes e depois de cada etapa (cron novo primeiro, remoção depois) para isolar qualquer regressão.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — ambas as decisões (cron de cobrança e os dois itens de baixo risco) foram resolvidas com o usuário: portar o cron agora; apagar `migrate-receitas.sql` e `manual/gen-ia-refatoracao.md`.

## Critérios de aceite do plano

- Nenhum arquivo listado em "Fora do escopo" é alterado ou apagado.
- `cd backend && npm run build` e `npx vite build` passam sem erros após todas as remoções.
- `backend/src/server.ts` inicia o cron de cobrança novo junto do cron do futebol.
- Nenhuma rota `/api/*` deixa de responder.
- Nenhuma migration é executada.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Portar o cron de cobrança ANTES de apagar `backend/cron/cobrancas.js`, para poder comparar a lógica lado a lado durante a implementação.
- Não executar migrations sem confirmação explícita do usuário.
- Isolar o commit das alterações pendentes não relacionadas já presentes no working tree (usar stage seletivo por arquivo, não `git add -A`).
- Rodar build do backend e do frontend antes de considerar a etapa concluída.
