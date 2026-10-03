# Plano de Implementação: limpeza do projeto e remoção do fluxo guiado

## Origem

- **Arquivo de especificação:** não houve. O pedido veio de uma conversa direta com o usuário em 2026-10-02: "verifique em meu projeto o que pode ser eliminado que está desnecessário, pastas, planos, backup… deixar só com o que é necessário".
- **Data do planejamento:** 2026-10-02.
- **Classificação:** `frontend + backend + database`. São duas migrations: aplicar a 0013 e criar e aplicar a 0058.

## Resumo

O plano faz quatro coisas:

1. **Remove arquivos e pastas sem uso:** cópias das skills para o Codex, tarefas e especificações antigas, ícones sem uso, a configuração de staging, a saída do build, todos os planos já concluídos e os backups com dados reais.
2. **Remove o fluxo guiado do assistente (Juca).** Ele está fora do produto desde 2026-09-15, e o usuário decidiu que não volta. Saem o editor de fluxo, o motor de perguntas uma a uma, a rota `/api/assistant-flows` e a tabela `assistente_fluxos`. O menu de chips e as saudações passam a ficar no código.
3. **Aplica a 0013 (`analytics_events`),** que nunca foi aplicada. Com ela, a aba "Acessos" passa a funcionar, e some o aviso que aparece no log.
4. **Cria e aplica a 0058,** que apaga a tabela `assistente_fluxos`.

## Decisões do usuário (2026-10-02)

1. **Plano citado no código:** apagar também o `card-preenchido-no-assistente.md` e o fluxo guiado inteiro ("não vai ser mais usado").
2. **Planos fora do git:** os 33 que nunca entraram no git e o `design-painel/` são apagados direto, sem guardar no histórico.
3. **Tabela do fluxo:** apagar `assistente_fluxos` agora, com uma migration.
4. **Migration 0013:** aplicar. A aba "Acessos" passa a funcionar.
5. **Itens já respondidos antes do plano:**
   - apagar os 3 backups `.plans/*.json`;
   - nos `.plans/`, apagar os planos concluídos e o `design-painel/`;
   - manter o `GLOSSARIO.md` e o `backend/scripts/backfill-empresa-categories.ts`.

## Escopo

### Dentro do escopo

- **Apagar arquivos:**
  - `.agents/`, `.portal/tasks/` (e `.portal/`, se ficar vazio) e `docs/` (só existe `docs/features/`);
  - `icons/perfilassistente.png` e `icons/favicon.svg`;
  - `backend/config/staging-setup.sql` e a linha dele no `.gitignore`;
  - `dist/`.
- **Apagar todo o conteúdo de `.plans/`, exceto este plano:**
  - os planos `.md`, já entregues ou já resolvidos (os versionados e os 33 fora do git);
  - `.plans/tasks/`, `.plans/design-painel/` e os 3 backups `.plans/*.json`.
- **Remover o fluxo guiado** na tela e no servidor, conforme o "Impacto por área".
- **Levar o menu de abertura para o código:** saudação, saudação de retorno, retorno longo e os 4 chips, com os textos atuais da produção.
- **Remover a dependência `@xyflow/react`.**
- **Migrations:**
  - aplicar a `0013_analytics_events.sql` no banco local e na produção;
  - criar e aplicar a `0058_remover_assistente_fluxos.sql`.

### Fora do escopo

- **Arquivos mantidos:** `GLOSSARIO.md`, `backend/scripts/backfill-empresa-categories.ts`, `backend/config/schema-dev.sql`, `icons/home-hero-bg.png` (usado pela home) e `backend/uploads/`.
- **Migrations antigas:** a `0039_assistente_fluxos.sql` é o histórico de criação da tabela e não muda.
- **Skills do Claude (`.claude/`):** os exemplos que citam `docs/features` ou `.portal/` ficam como estão. A `/criar-task` recria `.portal/tasks/` quando for usada.
- **Fluxos atuais do Juca:** a leitura da frase que preenche o card, o "Pagar despesa", as consultas, a voz e os anexos continuam iguais.
- **`node_modules`:** é necessário e se recria com `npm install`.

## Leitura de contexto

- `/AGENT.md`: lido. Descreve um sistema multi-prefeitura que não corresponde a este projeto. Foram aplicadas só as regras transversais.
- `/CLAUDE.md`: migrations e `.env` só com confirmação explícita, e nada de assumir ambiente local.
- `frontend/AGENT.md` e `backend/AGENT.md`: **não existem**.
- **Investigação, só leitura, em 2026-10-02:**
  - Os 312 planos foram comparados com o `git log`. Todos estão concluídos:
    - o das pizzas foi revertido a pedido;
    - o das categorias desativadas foi executado na produção.
  - Os 33 planos fora do git correspondem a entregas de 22 a 28/09.
  - `icons/perfilassistente.png` não é referenciado em lugar nenhum. O site usa `public/icons/assistente-perfil.webp`.
  - `icons/favicon.svg` (raiz) duplica `public/icons/favicon.svg`. O `index.html` e o `vite.config.ts` usam o caminho do `public/`.
  - `@xyflow/react` só aparece em `src/screens/config/fluxo/*`.
  - O editor de fluxo já estava escondido por `FLUXO_EDITOR_ATIVO = false` (`src/layout/AppShell.tsx` ~l.276).
  - O plano `card-preenchido-no-assistente.md` é citado em `AppShell.tsx` (~l.276) e em `financialCopilot.ts` (~l.391 e ~l.474).
  - A 0013 cria `analytics_events`. O código já grava eventos (`backend/src/services/analytics.ts`, `routes/analytics.ts`, `routes/auth.ts`), e a aba `src/screens/config/AcessosTab.tsx` consulta esses dados.

## Impacto por área

### Frontend

- **Apagar:**
  - `src/screens/config/fluxo/`, a pasta inteira: `AberturaNode`, `FluxoAssistenteTab`, `PainelEdicaoNo`, `PainelEdicaoResposta`, `PaletaCampos`, `PerguntaNode`, `RespostaNode`, `flowBranches`, `flowValidation`, `layoutRespostas` e `slotsDisponiveis`;
  - `src/services/assistantFlowService.ts`.
- **`src/App.tsx`:** sai o lazy import do `FluxoAssistenteTab` e o `case 'fluxo-assistente'`.
- **`src/layout/AppShell.tsx`:**
  - sai `'fluxo-assistente'` do tipo `AppSection`;
  - saem `FLOW_EDITOR_DOCUMENT`, `FLUXO_EDITOR_ATIVO` e `podeEditarFluxo`;
  - sai o botão do editor no menu;
  - a condição `hasConfigItems || podeEditarFluxo` vira `hasConfigItems`.
- **`src/utils/screenAccess.ts`:**
  - `resolveSection` perde o caso `'fluxo-assistente'`;
  - `allowedAssistantIntents` passa a tipar com `FinancialCopilotIntentHint` (`types/financialCopilot.ts`), não mais com o `FlowIntent` do serviço removido.
- **Novo `src/components/financial-assistant/abertura.ts`:**
  - tipo `AberturaAssistente`, com `saudacao`, `saudacaoRetorno`, `saudacaoRetornoLongo` e `opcoes: { intent, label, abertura }[]`;
  - constante `ABERTURA`, com os textos atuais da produção (ver Fase 0).
- **`saudacao.ts`:** passa a usar o tipo de `abertura.ts`.
- **`FinancialAssistant.tsx`:**
  - sai o `useQuery` da abertura (`fetchAbertura`, `queryKeys.assistantAbertura`) e entra a constante `ABERTURA` no lugar de `ABERTURA_PADRAO` e da busca;
  - sai o estado `slotState`/`setSlotState` e o seu envio;
  - o modo `'slot'` continua, porque ainda serve à pergunta "É despesa ou dinheiro que entrou?". Só o `slotState` dele sai.
- **`src/types/financialCopilot.ts`:** saem `FinancialCopilotSlotState`, `slotState` do request e da response e `payload.slotState`.
- **`src/services/assistantService.ts`:** para de enviar `slot_state`.
- **`src/services/queryKeys.ts`:** saem `assistantFlow` e `assistantAbertura`.
- **`package.json`:** sai `@xyflow/react`, com `npm uninstall @xyflow/react` para atualizar o lockfile.

### Backend

- **Apagar:**
  - `backend/src/services/assistantFlowEngine.ts` e `.test.ts`;
  - `assistantFlowStore.ts`, `assistantFlowSchema.ts` e `assistantFlowDefault.ts`;
  - `backend/src/routes/assistantFlows.ts`;
  - `backend/src/db/schema/assistantFlows.ts`.
- **`backend/src/db/schema/index.ts`:** sai `export * from './assistantFlows'`.
- **`backend/src/server.ts`:** saem o import e o `app.use('/api/assistant-flows', …)`.
- **`assistantSlotSession.ts`:**
  - ficam `loadSlotCatalog`, `suggestCategory` e `readDraftFromMessage`, com o que eles usam;
  - saem `SlotSessionState`, `SlotSessionStep`, `parseSlotSessionState` e seus validadores (`asText`, `asAmount`…), `startSlotSession`, `advanceSlotSession`, `finalizeSlotDraft`, `buildStep` e `resolvePendingCategory`;
  - sai também `withCatalogScopedReferences`, se só o guiado usar;
  - saem os imports de `getActiveFlowEngine`, `AssistantFlowEngine`, `applySlotAnswer` e `isAffirmativeAnswer`.
- **`assistantSlotParser.ts`:**
  - fica `seedDraftFromMessage`, com os extratores que ele usa (valor, parcelas, forma de pagamento, cartão, descrição e categoria, se usada);
  - saem `applySlotAnswer`, `SlotParseResult`, `isAffirmativeAnswer` e os conjuntos `AFFIRMATIVE`, `NEGATIVE`, `CORRECTION` e `SKIP`;
  - saem os helpers usados só pelo guiado (`parsePositiveInteger` e outros). Antes de remover, conferir cada um com `grep`.
- **`assistantSlotFilling.ts`:**
  - ficam os tipos e `createEmptySlotDraft`/`cardsForPaymentMethod`, se o leitor usar;
  - saem `clearDependentSlots`, `applyDraftDefaults`, `SlotId`/`SlotQuestion` e o que mais só o guiado usar;
  - o `assistantToolRunner.ts` usa `SlotCatalog`, que fica.
- **`financialCopilot.ts`:**
  - saem `resolveSlotState`, `MISUNDERSTOOD_PREFIX`, o parâmetro `slotState`, a lógica `hasActiveSlotSession` e o campo `slotState` da resposta;
  - saem os comentários que citam `.plans/card-preenchido-no-assistente.md` e "fluxo guiado preservado";
  - o `runSlotFlow` (o card) continua igual.
- **`backend/src/routes/assistant.ts`:** sai `slotState: parseSlotSessionState(body['slot_state'])` e o import.
- **Testes:**
  - `assistantFlowEngine.test.ts` é apagado;
  - em `assistantSlotFilling.test.ts`, saem os testes do guiado (`nextSlotQuestion`, `applySlotAnswer`, `advanceSlotSession`, `pendingConfirmations`) e ficam os testes do leitor (`seedDraftFromMessage`, `inferKind…`).
- **Backend `tsconfig`:** não tem `noUnusedLocals`. Para conferir as sobras, procurar cada símbolo removido com `grep`.

### Banco de dados

1. **Aplicar a `0013_analytics_events.sql`:** cria `analytics_events` e os índices. Vale para o banco local e para a produção, uma por vez, com o comando do projeto e com confirmação.
2. **Criar a `backend/drizzle/0058_remover_assistente_fluxos.sql`:**
   - cabeçalho no padrão das anteriores, explicando que o fluxo guiado foi removido e avisando para aplicar na produção **depois do deploy**;
   - conteúdo `DROP TABLE IF EXISTS assistente_fluxos;`.
3. **Ordem obrigatória:**
   - o script de migrations recusa a 0058 com a 0013 pendente, então a 0013 vem antes;
   - na produção, a 0058 só depois do deploy do código novo. O código antigo ainda lê a tabela, embora caia no menu padrão se ela não existir.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Em modo automático, o classificador bloqueia a escrita na produção: o usuário sai do modo automático e aprova.

### Infra/Deploy

- Não muda nenhuma variável de ambiente.
- O deploy remove a rota `/api/assistant-flows`. A tela nova não a usa mais.
- Se a tela antiga continuar em cache e chamar `/api/assistant-flows/abertura`, recebe 404, e o chat cai no `ABERTURA_PADRAO` que ela já tem. Não quebra.

## Arquivos provavelmente afetados

- **Apagados:**
  - `.agents/`, `.portal/`, `docs/` e `dist/`;
  - `icons/perfilassistente.png` e `icons/favicon.svg`;
  - `backend/config/staging-setup.sql`;
  - `.plans/*`, exceto este plano;
  - `src/screens/config/fluxo/` e `src/services/assistantFlowService.ts`;
  - `backend/src/services/assistantFlow{Engine,Engine.test,Store,Schema,Default}.ts`;
  - `backend/src/routes/assistantFlows.ts` e `backend/src/db/schema/assistantFlows.ts`.
- **Alterados:**
  - `.gitignore`, `package.json` e `package-lock.json`;
  - `src/App.tsx` e `src/layout/AppShell.tsx`;
  - `src/utils/screenAccess.ts` (e o teste, se a mudança de tipo pedir);
  - `src/components/financial-assistant/{FinancialAssistant.tsx,saudacao.ts}`;
  - `src/types/financialCopilot.ts`, `src/services/assistantService.ts` e `src/services/queryKeys.ts`;
  - `backend/src/db/schema/index.ts` e `backend/src/server.ts`;
  - `backend/src/routes/assistant.ts` e `backend/src/services/{financialCopilot,assistantSlotSession,assistantSlotParser,assistantSlotFilling}.ts`;
  - `backend/src/services/assistantSlotFilling.test.ts`.
- **Novos:**
  - `src/components/financial-assistant/abertura.ts`;
  - `backend/drizzle/0058_remover_assistente_fluxos.sql`.

## Estratégia de implementação

### Fase 0: preparar

1. Rodar `git checkout main`, `git pull origin main` e `git checkout -b chore/R/limpeza-projeto`.
2. **Ler na produção, só com SELECT, a abertura do fluxo ativo:** `SELECT definicao->'abertura' FROM assistente_fluxos WHERE ativo = true`. Os textos lidos vão para `abertura.ts`.
   - Se não houver linha ou abertura, valem os textos do `DEFAULT_FLOW_DEFINITION.abertura` atual: "Oi! Sou o Juca. O que vamos lançar?", o retorno, o retorno longo e os 4 chips (Lançar despesa, Pagar despesa, Lançar receita, Consultar), com as falas de cada um.
   - Se a abertura salva tiver só 3 opções, completar com "Pagar despesa" na 2ª posição, como faz o `comAberturaPadrao` hoje.

### Fase 1: remover

1. **Arquivos e pastas da limpeza:**
   - pastas versionadas: `git rm -r`;
   - arquivos fora do git: `rm -rf`, incluindo os 33 planos e o `design-painel/` (definitivo, por decisão do usuário) e os backups `.json`;
   - **não** apagar este plano.
2. **`.gitignore`:** remover a linha `backend/config/staging-setup.sql`.
3. **Fluxo guiado na tela e no servidor,** conforme o "Impacto por área".
4. **Menu:** criar `abertura.ts` e usá-lo no `FinancialAssistant` e no `saudacao.ts`.
5. **Dependência:** rodar `npm uninstall @xyflow/react`.
6. **Sobras:** rodar `grep` de `assistantFlow|FlowAbertura|fetchAbertura|slot_state|slotState|SlotSessionState|applySlotAnswer|advanceSlotSession|startSlotSession|fluxo-assistente|xyflow|card-preenchido` em `src` e `backend/src`. Não deve restar nada, exceto o modo `'slot'` e os nomes do leitor (`SlotDraft`, `SlotCatalog`, `runSlotFlow`).

### Fase 2: migrations, uma por vez, com confirmação

1. Rodar `npm --prefix backend run migrations:status -- --banco local` e `-- --banco producao`. O esperado é a 0013 pendente nos dois.
2. Aplicar a 0013 no banco local: `npm --prefix backend run migrations:aplicar -- 0013 --banco local`.
3. Aplicar a 0013 na produção: `npm --prefix backend run migrations:aplicar -- 0013 --banco producao --confirmo`. Isso exige o "sim" do usuário e que ele saia do modo automático.
4. Criar a `0058_remover_assistente_fluxos.sql` e aplicar no banco local.
5. **A 0058 na produção fica para depois do merge e do deploy,** durante o `/finalizar`, com o "sim" do usuário.

### Fase 3: validar

1. **Tela:** `npx tsc --noEmit`, `npm test` e `npx vite build`.
2. **Servidor:** `npm --prefix backend run build` e `npm --prefix backend test`.
3. **Servidor local na 3013,** com o banco local:
   - a aba "Acessos" registra um login (`analytics_events` recebe a linha);
   - `GET /api/assistant-flows/abertura` responde 404.
4. **Teste básico da tela do Juca** (`smoke_paridade.mts` no scratchpad, ajustado para o menu vir do código): 4 chips na ordem certa, despesa, receita e pagamento. Depois, limpeza e o servidor local desligado.
5. **`migrations:status` no banco local:** nada pendente.

## Regras de negócio identificadas

- **O Juca não muda para quem usa:** mesmo menu, mesmas saudações e mesmos fluxos de lançamento, pagamento e consulta.
- **Textos do menu:** passam a ser editados no código. Não existe mais editor.
- **Aba "Acessos":** passa a mostrar os acessos às páginas e os logins a partir da aplicação da 0013. Não há dados antigos.

## Regras multi-tenant e segurança

- **Isolamento:** o projeto não é multi-tenant e nada muda nas regras de isolamento.
- **Rota removida:** `/api/assistant-flows` era restrita ao admin para edição. Removida, deixa de ser superfície de ataque.
- **Backups `.json`:** têm dados pessoais reais. São apagados de vez, sem passar pelo git.
- **`analytics_events`:** grava o tipo do evento, o caminho e o `usuario_id`. É o que o código atual já tenta gravar.

## Validações necessárias

- **Antes de apagar cada item da limpeza:** fazer `grep` para garantir que nada no código, no build ou no `vite.config.ts` aponta para ele.
- **Depois de remover o guiado:** checagem de tipos e testes sem erro. O `grep` de sobras da Fase 1 não deve achar nada.
- **Depois das migrations:** o status sem nada pendente no banco local. Na produção, só a 0058 fica pendente até o deploy.

## Testes necessários

### Frontend

- `npm test`. Se `screenAccess.test.ts` precisar, ajustar o tipo. Não há teste do editor (ele não tinha testes).

### Backend

- `npm --prefix backend test`, sem os testes do guiado. Os do leitor (`seedDraftFromMessage`), do pagamento e do copiloto continuam.

### E2E

- Teste básico do Juca em jsdom contra o servidor local, verificação da aba "Acessos" no banco local e conferência do usuário no celular depois do deploy.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npx vite build

npm --prefix backend run build
npm --prefix backend test

npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:status -- --banco producao
```

## Riscos e pontos de atenção

1. **Exclusões definitivas:** os 33 planos fora do git, o `design-painel/` e os backups `.json` não podem ser recuperados (decisão 2).
2. **Escrita na produção:** a 0013 e depois a 0058 exigem que o usuário saia do modo automático e aprove.
3. **Ordem:** a 0058 na produção só depois do deploy. A 0013 pode ir antes, porque o código atual já a usa.
4. **Textos do menu:** são lidos da produção na Fase 0. Se houver personalização, ela vai para o código.
5. **Volume da remoção** (cerca de 5.600 linhas):
   - as funções do leitor ficam nos mesmos arquivos das funções do guiado, então é preciso remover com cuidado, conferindo os usos;
   - a checagem de tipos e os testes do leitor garantem que o card continua igual.
6. **Volume da aba "Acessos":** cada acesso a página grava uma linha. Com poucos usuários o volume é desprezível.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.`

## Critérios de aceite do plano

- **Itens da limpeza:** não existem mais, e o `grep` não acha referência a eles.
- **Editor de fluxo:** fora do código. O `GET /api/assistant-flows/*` responde 404.
- **Juca:** abre com os mesmos 4 chips e saudações e lança despesa, receita e pagamento como antes. O teste básico da tela passa.
- **Banco:**
  - `analytics_events` existe no banco local e na produção, e um login no banco local grava evento;
  - `assistente_fluxos` não existe no banco local; na produção, deixa de existir depois do deploy;
  - o `migrations:status` fica sem nada pendente.
- **Checagens:** tipos, testes e builds da tela e do servidor passam.

## Observações para a skill implementar

- Usar este plano como fonte principal e **não apagar este próprio arquivo**.
- Seguir a ordem **remover, depois aplicar**, e conferir cada remoção com `grep`.
- **Migrations:**
  - uma por vez, nomeada, com o script do projeto e o "sim" do usuário;
  - na produção, fora do modo automático;
  - a 0058 na produção só depois do deploy.
- Não alterar o `.env`.
- Execução enxuta, com status breve; o resumo curto fica para o fim.
- Ao concluir, seguir para `/finalizar` (commit, push, merge com confirmação e, depois do deploy, a 0058 na produção).
