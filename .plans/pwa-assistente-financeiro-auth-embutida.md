# Plano de Implementação: PWA instalável restrito ao Assistente Financeiro (auth embutida)

## Origem

- Arquivo de especificação: nenhum (planejado a partir de exploração de código, sem `FEATURE_FILE`)
- Data do planejamento: 2026-08-21
- Classificação: `frontend-only`

## Resumo

Hoje o PWA instalável (`assistant.html`) já está corretamente restrito ao assistente: é o `start_url` do manifest, e o painel completo (`app.html`) fica fora do cache do service worker. O problema é que o fluxo de autenticação quebra esse isolamento — `AuthenticatedAppGate` redireciona sempre para `/index.html` quando não há token, e o login (`LoginPage.saveSession`) sempre manda para `/app.html` depois. Resultado: quem instala "o assistente" é jogado para fora dele tanto para entrar quanto para se cadastrar, e acaba caindo no painel completo.

A mudança embute login/cadastro dentro do próprio bundle do assistente (reaproveitando `LoginPage` sem alteração visual) e faz o pós-login permanecer no assistente quando a origem foi o PWA instalado, replicando o padrão de app satélite autocontido (estilo Magalu).

## Escopo

### Dentro do escopo

- `AuthenticatedAppGate`: quando não há token, renderizar `LoginPage` embutida em vez de redirecionar para `/index.html`.
- `LoginPage`/`saveSession`: destino pós-login/cadastro passa a depender da origem (assistente vs. site/painel), persistida em `sessionStorage`.
- Google OAuth iniciado a partir do assistente: round-trip por `/index.html` (redirect_uri não muda), com reencaminhamento final para `/assistant.html` quando a origem salva for o assistente.
- Ajuste no `vite.config.ts` (`injectManifest.globPatterns`) se novos assets/chunks do login precisarem ser pré-cacheados no service worker do assistente.
- Validação manual completa do fluxo (instalar PWA → login/cadastro → permanece no assistente).

### Fora do escopo

- Qualquer mudança de backend (`/auth/*` endpoints permanecem os mesmos).
- Mudanças visuais/redesign da `LoginPage` — será reaproveitada exatamente como está.
- Lógica de "depende do tipo de conta" para decidir destino pós-login — origem assistente sempre fica no assistente.
- Onboarding/tutorial dentro do assistente para novos usuários.
- Deploy/infra além do possível ajuste de `globPatterns` do service worker.

## Leitura de contexto

- `/AGENT.md` e `/sistema financas/AGENT.md` — lidos. Nota: o conteúdo é genérico de um projeto multi-prefeitura/multi-tenant + RLS que não corresponde ao domínio real deste projeto (finanças pessoais/empresariais). Apliquei apenas as partes genéricas de workflow e qualidade de código; regras de multi-tenant/RLS não se aplicam aqui.
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados **não existem** neste projeto (estrutura é `sistema financas/src` e `sistema financas/backend`, sem AGENT.md próprios por pasta) — segui apenas os AGENT.md da raiz e do projeto.
- Arquivos de código explorados: `vite.config.ts`, `assistant.html`, `app.html`, `index.html`, `public/manifest.json`, `App.tsx`, `assistantMain.tsx`, `AssistantPwaScreen.tsx`, `AuthenticatedAppGate.tsx`, `useAuthSession.ts`, `authService.ts`, `LoginPage.tsx`, `InstallPwaBanner.tsx`.

## Impacto por área

### Frontend

- `src/components/auth/AuthenticatedAppGate.tsx` — substituir `window.location.replace('/index.html')` por renderização inline de `LoginPage` quando `!session.hasToken`; gravar origem `'assistant'` em `sessionStorage` antes de exibir o login.
- `src/screens/public/LoginPage.tsx`:
  - `saveSession()` deixa de ter `/app.html` fixo; lê a origem salva em `sessionStorage` e decide entre `/assistant.html` (se origem = assistente) ou `/app.html` (padrão/fallback).
  - `handleGoogleClick()` grava a origem atual em `sessionStorage` antes do redirect para o Google (o navegador sai da página, perdendo qualquer estado em memória).
  - Handler do callback OAuth (linha ~85) usa a mesma lógica de destino ao chamar `saveSession`.
  - Limpar a chave de origem em `sessionStorage` após o uso, em todos os caminhos (login direto, cadastro, Google).
- `src/screens/assistant/AssistantPwaScreen.tsx` — sem mudança estrutural grande esperada; validar que o login embutido funciona bem no contexto standalone (sem `BrowserRouter`).
- Sem mudança em query keys, forms ou schemas — `authService.ts` só muda se necessário para suportar a leitura/escrita da origem (pode ficar só em `LoginPage.tsx`/`AuthenticatedAppGate.tsx`).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Possível ajuste em `vite.config.ts` (`globPatterns` do `injectManifest`) para garantir que os assets do login fiquem pré-cacheados no SW do assistente — a confirmar durante a implementação, dependendo de como o Vite fizer o code-splitting do `LoginPage` quando importado também pelo bundle do assistente.

## Arquivos provavelmente afetados

- `sistema financas/src/components/auth/AuthenticatedAppGate.tsx`
- `sistema financas/src/screens/public/LoginPage.tsx`
- `sistema financas/src/screens/assistant/AssistantPwaScreen.tsx`
- `sistema financas/vite.config.ts` (globPatterns do SW, se necessário)

## Estratégia de implementação

1. Extrair a lógica de "para onde ir depois do login" de `saveSession` para uma função que decide o destino com base numa origem persistida (ex: `sessionStorage.getItem('auth_origin')`), lida antes do redirect.
2. Antes de redirecionar para o Google (`handleGoogleClick`), salvar a origem atual (`'assistant'` ou `'app'`) em `sessionStorage`.
3. Ajustar `AuthenticatedAppGate` para: ao montar sem token, gravar a origem `'assistant'` em `sessionStorage` e renderizar `LoginPage` inline (em vez de `window.location.replace('/index.html')`).
4. Em `LoginPage.saveSession()` e no handler do callback OAuth, ler a origem salva em `sessionStorage` e decidir o destino: `'assistant'` → `window.location.href = '/assistant.html'`; caso contrário (ou ausente) → `/app.html` como hoje. Limpar a chave após o uso.
5. Confirmar que o Google OAuth `redirect_uri` permanece `/index.html` (sem mudança no Google Console) — o `index.html` sempre recebe o callback, e é ele quem decide reencaminhar para `/assistant.html` ou ficar em `/app.html` com base na origem salva.
6. Validar visualmente o fluxo completo: instalar PWA → abrir sem login → cadastrar (CPF/senha e Google) → permanece no assistente → fechar/reabrir → sessão persiste.
7. Conferir o `dist/sw.ts` gerado para garantir que os novos assets do login estão cacheados corretamente no PWA do assistente.

## Regras de negócio identificadas

- App instalado (PWA) tem `start_url` = `/assistant.html`; deve permanecer o assistente do início ao fim, incluindo login/cadastro.
- Painel completo (`/app.html`) continua existindo e acessível, mas não é mais o destino automático de quem entra pelo assistente.
- Login/cadastro fora do assistente (via `index.html`/site) mantém comportamento atual, indo para `/app.html`.
- Google OAuth continua disponível também dentro do assistente, com round-trip por `/index.html` e retorno a `/assistant.html`.

## Regras multi-tenant e segurança

Não aplicável — este projeto não é multi-tenant/RLS (isso está apenas herdado do AGENT.md genérico da raiz). Pontos de segurança relevantes aqui:

- Token continua armazenado em `sessionStorage`/`localStorage` como hoje — sem mudança no mecanismo de sessão.
- Garantir que o Google OAuth `redirect_uri` continua batendo com o que está registrado no Google Console (não pode ser alterado livremente sem também atualizar lá) — este plano não altera o redirect_uri.
- A chave de origem em `sessionStorage` não deve conter dados sensíveis, apenas um marcador (`'assistant' | 'app'`).

## Validações necessárias

- Nenhuma mudança de schema de formulário — reaproveita validação existente do `LoginPage`.
- Validar que o marcador de origem em `sessionStorage` tem fallback seguro: se ausente ou inválido, comportamento padrão é `/app.html` (nunca travar o usuário sem destino).

## Testes necessários

### Frontend

- Sem suíte de testes automatizados de frontend identificada no projeto — validação será manual (ver E2E abaixo).

### Backend

Não aplicável.

### E2E

- Abrir `assistant.html` sem token → ver `LoginPage` embutida (não sair para `/index.html`).
- Cadastrar novo usuário a partir do assistente (CPF/senha) → permanece no assistente autenticado.
- Logar a partir do assistente (CPF/senha) → permanece no assistente.
- Login via Google a partir do assistente → round-trip por `/index.html` → retorna e permanece em `/assistant.html`.
- Login via `index.html`/site (fora do assistente) → continua indo para `/app.html` (regressão).
- Fechar e reabrir o PWA instalado → sessão persiste, sem novo login.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas" run dev
```

Não há `lint`/`typecheck`/`test` dedicados nos scripts do `package.json` além de `dev`, `build`, `preview` — a confirmar se `tsc --noEmit` deve rodar como parte da validação do build.

## Riscos e pontos de atenção

- Origem salva em `sessionStorage` pode ser perdida em alguns fluxos in-app-browser (raro) entre a saída para o Google e o retorno — fallback deve ser sempre `/app.html` (comportamento atual), nunca travar o usuário.
- Service worker (`injectManifest`) precisa recachear corretamente os novos assets carregados pelo login dentro do bundle do assistente, senão o login pode falhar offline/na primeira instalação.
- Risco de regressão no fluxo atual do site/painel (`app.html`) se a extração do destino pós-login for malfeita.
- `AuthenticatedAppGate` é usado hoje só pelo assistente — mudança não deve afetar `App.tsx` (painel), que mantém sua própria lógica de redirect separada (`App.tsx:129`).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões de OAuth (round-trip por `index.html`) e visual (reaproveitar `LoginPage` sem alteração) já foram confirmadas pelo usuário.

## Critérios de aceite do plano

- Usuário que instala o PWA do assistente e não tem conta consegue se cadastrar sem sair do app instalado.
- Usuário que instala o PWA e já tem conta consegue logar (CPF/senha ou Google) sem ficar preso fora do app instalado.
- Após login/cadastro pela origem assistente, o usuário permanece no chat do assistente (nunca é levado automaticamente para `/app.html`).
- Fluxo de login pelo site (`index.html`) continua levando para `/app.html` como hoje — sem regressão.
- Build do PWA (`npm run build`) continua gerando o service worker corretamente, cacheando os assets necessários do assistente incluindo a tela de login embutida.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations (não há nenhuma nesta feature).
- Seguir os padrões de código já usados em `LoginPage.tsx` e `AuthenticatedAppGate.tsx` — não introduzir novo state manager ou lib de roteamento.
- Manter alterações pequenas e focadas nos arquivos listados.
- Implementar a decisão já confirmada de OAuth via round-trip por `/index.html` com marcador de origem em `sessionStorage`.
- Reaproveitar `LoginPage.tsx` sem alteração visual — apenas ajustar a lógica de destino pós-login.
