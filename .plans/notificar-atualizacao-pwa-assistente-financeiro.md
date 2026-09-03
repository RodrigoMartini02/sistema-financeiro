# Plano de Implementação: Notificar atualização de PWA em vez de recarregar silenciosamente

## Origem

- Arquivo de especificação: `.portal/tasks/notificar-atualizacao-pwa-assistente-financeiro.md`
- Data do planejamento: `2026-08-17`
- Classificação: `frontend-only`

## Resumo

O `sistema financas` distribui o Assistente Financeiro como PWA instalável (via `public/manifest.json` com `start_url: /assistant.html`). Hoje, quando uma nova versão é publicada, o service worker (`src/sw.ts`) assume controle imediatamente (`skipWaiting()` + `clientsClaim()` incondicionais) e a página recarrega sozinha (`src/pwa/register.ts`, listener de `controllerchange`), sem qualquer aviso ao usuário — o que pode descartar estado não salvo (mensagem sendo digitada, rascunho de transação aberto).

Esta implementação troca esse comportamento por um fluxo com aviso: um hook `usePwaUpdate()` (substituindo por completo `register.ts`) detecta quando há atualização disponível e expõe um estado consumível por um componente self-contained `<UpdatePwaBanner />`, seguindo o mesmo padrão estrutural do `CookieBanner.tsx` já existente no projeto. O banner mostra "Nova versão disponível" com botão "Atualizar agora", e aplica a atualização automaticamente após 10 minutos ou quando a aba fica oculta, caso o usuário nunca interaja — evitando tanto o reload forçado silencioso de hoje quanto o risco de alguém ficar preso numa versão antiga indefinidamente.

O padrão é adaptado do projeto irmão `escalacao futebol` (`public/sw.js`, `src/swRegistration.js`, `src/components/UpdatePWA.jsx`), já validado em produção, traduzido de JavaScript puro para TypeScript + Workbox (`injectManifest`), e estendido para cobrir os dois entrypoints do `sistema financas` (`main.tsx` do sistema completo e `assistantMain.tsx` do assistente).

## Escopo

### Dentro do escopo

- Remover a ativação incondicional (`skipWaiting()`) do service worker em `src/sw.ts`, substituindo por ativação sob demanda via mensagem (`SKIP_WAITING`).
- Criar `src/pwa/usePwaUpdate.ts`: hook que registra o service worker, detecta atualização disponível (distinguindo de instalação inicial), força checagem ativa em `visibilitychange`, e expõe `{ updateAvailable, applyUpdate }`.
- Remover `src/pwa/register.ts` (lógica absorvida integralmente pelo novo hook).
- Criar `src/components/UpdatePwaBanner.tsx`: componente self-contained (sem props), consumindo `usePwaUpdate()` internamente, com banner "Nova versão disponível" + botão "Atualizar agora", paleta `#0891b2`/`#0e7490`, e fallback automático de 10 minutos ou ao ocultar a aba.
- Montar `<UpdatePwaBanner />` tanto no sistema completo (`src/App.tsx`) quanto no assistente (`src/screens/assistant/AssistantPwaScreen.tsx`), cobrindo ambos os pontos de instalação/uso do PWA.
- Atualizar `src/main.tsx` e `src/assistantMain.tsx` para parar de chamar a função antiga de registro solta no entrypoint (o registro passa a acontecer dentro do hook, disparado pela montagem do banner).
- Preservar integralmente o runtime caching diferenciado por rota já existente (`fingerence-assistant-shell-v1`, `fingerence-assistant-assets-v1`, `fingerence-app-shell-v1`) e o precache do Workbox.

### Fora do escopo

- Qualquer mudança em `public/manifest.json` (ícones, nome, `scope`, `shortcuts`, `start_url`).
- Qualquer mudança na decisão de quais telas são instaláveis como PWA — a decisão de que só o assistente é instalável permanece intacta.
- Suporte a `beforeinstallprompt`/banner de convite à instalação — é uma necessidade diferente, já identificada separadamente, tratada em task própria futura.
- Qualquer mudança na engine de IA, extração de rascunho ou lógica de negócio do assistente.
- Ampliar o runtime caching para incluir `/api/*` ou dados de sessão/financeiros.

## Leitura de contexto

- `sistema financas/AGENT.md` — regras de backend multi-tenant/Drizzle que não se aplicam a esta implementação frontend-only.
- `sistema financas/CLAUDE.md` e `CLAUDE.md` (raiz) — sequência obrigatória `/planejar` → aprovação → `/implementar` → `/finalizar`, merge direto em `main` sem PR.
- `.portal/tasks/notificar-atualizacao-pwa-assistente-financeiro.md` — especificação de entrada.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados dentro de `sistema financas`.
- Arquivos inspecionados nesta sessão: `src/sw.ts`, `src/pwa/register.ts`, `vite.config.ts`, `src/assistantMain.tsx`, `src/main.tsx`, `src/bootstrap/AppProviders.tsx`, início de `src/App.tsx`, `src/components/CookieBanner.tsx` (padrão de referência para o novo banner).
- Arquivos de referência no projeto irmão `escalacao futebol`: `public/sw.js`, `src/swRegistration.js`, `src/components/UpdatePWA.jsx`, `src/main.jsx`.

## Impacto por área

### Frontend

- **`src/sw.ts`**: remover a linha `void worker.skipWaiting();` (chamada incondicional). Adicionar `self.addEventListener('message', (event) => { if (event.data?.type === 'SKIP_WAITING') void worker.skipWaiting(); })`. Manter `clientsClaim()` no escopo do módulo (ativa o novo worker em todas as abas assim que ele deixa de estar em `waiting`, mas só depois do `skipWaiting()` explícito). Manter `cleanupOutdatedCaches()`, `precacheAndRoute(self.__WB_MANIFEST)` e as três rotas de runtime caching (`assistantShell`, `appShell`, `assistantAssets`) sem qualquer alteração de lógica ou nomes de cache.
- **Novo `src/pwa/usePwaUpdate.ts`**: hook React que, em um `useEffect` (só roda em produção, replicando o guard `import.meta.env.PROD` hoje em `register.ts`), registra `/sw.js` com `scope: '/'`; escuta `controllerchange` (reload único, com guard, preservando o comportamento atual); detecta `registration.waiting` junto de `navigator.serviceWorker.controller` já ativo logo após o registro (= atualização disponível desde a primeira checagem); escuta `updatefound` no registration e `statechange` no worker `installing`, disparando o estado de atualização disponível quando o novo worker chega a `installed` enquanto já existe um `controller` ativo (distinguindo de instalação inicial, quando não há controller ainda); escuta `visibilitychange` para chamar `registration.update()` quando a aba volta a ficar visível. Expõe `{ updateAvailable: boolean, applyUpdate: () => void }`, onde `applyUpdate` envia `registration.waiting?.postMessage({ type: 'SKIP_WAITING' })`.
- **Remoção de `src/pwa/register.ts`**: toda a lógica migra para dentro do hook; nenhum outro arquivo deve continuar importando `registerPwaServiceWorker`.
- **Novo `src/components/UpdatePwaBanner.tsx`**: sem props (`export function UpdatePwaBanner()`), chama `usePwaUpdate()` internamente. Quando `updateAvailable` é falso, retorna `null` (padrão idêntico ao `CookieBanner`). Quando verdadeiro, renderiza um banner fixo na parte inferior da tela (`fixed bottom-0`, `z-50`, respeitando `env(safe-area-inset-bottom)` como no `escalacao futebol`), com texto "Nova versão disponível", subtexto explicativo curto, e botão "Atualizar agora" chamando `applyUpdate()`. Dentro de um `useEffect` reagindo a `updateAvailable`, registra listener de `visibilitychange` (aplica quando `document.hidden`) e um `setTimeout` de 10 minutos (`10 * 60 * 1000`) que também chama `applyUpdate()`, limpando ambos no cleanup.
- **`src/App.tsx`**: importar e renderizar `<UpdatePwaBanner />` no mesmo nível/próximo de onde `<CookieBanner />` já é renderizado.
- **`src/screens/assistant/AssistantPwaScreen.tsx`**: importar e renderizar `<UpdatePwaBanner />` dentro da árvore (dentro do `AuthenticatedAppGate` ou ao lado do `FinancialAssistant`, a definir durante a implementação com base em onde fica visualmente correto sem sobrepor a UI do assistente).
- **`src/main.tsx`**: remover o import e a chamada de `registerPwaServiceWorker()` — o registro passa a acontecer via `usePwaUpdate()` dentro de `<UpdatePwaBanner />`, que já está montado em `App.tsx`.
- **`src/assistantMain.tsx`**: mesma remoção do import/chamada de `registerPwaServiceWorker()`.
- Nenhuma mudança em hooks de dados, query keys, rotas ou serviços de API — escopo isolado ao ciclo de vida do PWA.
- Estados de loading/error/empty: não aplicável (o banner é um overlay simples com dois estados: visível/invisível).
- Testes frontend: não há suíte automatizada no projeto; validação será manual (ver seção de testes).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado. A mudança não requer nenhuma env var, alteração de build ou storage — é uma mudança de comportamento client-side do service worker já existente.

## Arquivos provavelmente afetados

- `sistema financas/src/sw.ts`
- `sistema financas/src/pwa/register.ts` (removido)
- `sistema financas/src/pwa/usePwaUpdate.ts` (novo)
- `sistema financas/src/components/UpdatePwaBanner.tsx` (novo)
- `sistema financas/src/App.tsx`
- `sistema financas/src/screens/assistant/AssistantPwaScreen.tsx`
- `sistema financas/src/main.tsx`
- `sistema financas/src/assistantMain.tsx`

## Estratégia de implementação

1. Editar `src/sw.ts`: remover `skipWaiting()` incondicional, adicionar listener de `message` para `SKIP_WAITING`. Preservar todo o resto do arquivo (rotas de runtime caching, `clientsClaim()`, `precacheAndRoute`).
2. Criar `src/pwa/usePwaUpdate.ts` com a lógica de registro, detecção de atualização e `applyUpdate`, adaptando `swRegistration.js` para TypeScript e para um hook React (`useEffect` + `useState` internos ao hook).
3. Criar `src/components/UpdatePwaBanner.tsx`, seguindo a estrutura de `CookieBanner.tsx` (componente sem props, `useState`/`useEffect` internos, retorna `null` quando não aplicável), consumindo `usePwaUpdate()`, com o texto, paleta (`#0891b2`/`#0e7490`) e fallback de 10 minutos.
4. Remover `src/pwa/register.ts`.
5. Editar `src/main.tsx`: remover import e chamada de `registerPwaServiceWorker`; importar e renderizar `<UpdatePwaBanner />` dentro de `App.tsx` (não diretamente em `main.tsx`, para ficar dentro da árvore de providers).
6. Editar `src/App.tsx`: importar `UpdatePwaBanner` e renderizá-lo próximo ao `<CookieBanner />` existente.
7. Editar `src/assistantMain.tsx`: remover import e chamada de `registerPwaServiceWorker`.
8. Editar `src/screens/assistant/AssistantPwaScreen.tsx`: importar e renderizar `<UpdatePwaBanner />`.
9. Rodar `npx tsc --noEmit -p tsconfig.json` para validar tipos.
10. Rodar `npm run build` para validar build completo (inclui geração do service worker via `vite-plugin-pwa`).
11. Validação manual conforme a seção de testes abaixo.

## Regras de negócio identificadas

- Nenhuma atualização de service worker deve recarregar a página do usuário sem aviso prévio.
- O banner só deve aparecer quando há de fato uma atualização (worker novo em `waiting` com um `controller` já ativo) — nunca na primeira instalação do PWA (quando ainda não há controller).
- Se o usuário não interagir com o banner, a atualização deve ser aplicada automaticamente após inatividade (aba oculta) ou 10 minutos, o que ocorrer primeiro — ninguém deve ficar preso indefinidamente numa versão antiga.
- O reload da página só deve ocorrer uma única vez por ciclo de atualização (guard contra reload em loop), preservando o comportamento já existente.

## Regras multi-tenant e segurança

- Sem impacto de isolamento entre perfis/tenants — mudança inteiramente do lado do ciclo de vida do service worker, sem tocar em dados de usuário, sessão ou chamadas de API.
- O cache do service worker continua restrito a shell/assets estáticos (HTML de entrypoint, JS/CSS versionados, ícones) — nenhuma rota `/api/*` deve ser adicionada ao runtime caching nesta implementação.

## Validações necessárias

- Nenhuma validação de formulário ou input de usuário é introduzida.
- Validar que o listener de `message` no service worker só reage à forma exata `{ type: 'SKIP_WAITING' }`, sem processar outras mensagens inesperadas.
- Validar compatibilidade de tipos TypeScript do hook com `strict: true`, `noUnusedLocals`, `noUnusedParameters` (config já confirmada em `tsconfig.json`).

## Testes necessários

### Frontend

Não há suíte de testes automatizados no projeto. Validação manual via `npm run dev` e `npm run build` + `npm run preview` (para testar o service worker real, que só roda em produção):

- Build de uma versão "nova" do app (qualquer alteração trivial), confirmar via DevTools → Application → Service Workers que o novo worker fica em estado `waiting`, sem assumir controle sozinho.
- Confirmar que o banner "Nova versão disponível" aparece no sistema completo (`app.html`/`index.html`) quando há atualização pendente.
- Confirmar que o banner aparece também no assistente (`assistant.html`, modo `standalone`).
- Clicar em "Atualizar agora": confirmar que a página recarrega e a nova versão assume controle.
- Testar o fallback por aba oculta: deixar o banner aparecer, mudar de aba/minimizar, confirmar que a atualização é aplicada sem clique.
- Testar o fallback por timeout: deixar o banner aparecer sem interação por 10 minutos, confirmar aplicação automática (pode ser acelerado temporariamente durante o teste manual, revertendo antes do commit).
- Confirmar que a primeira instalação do PWA (sem versão anterior) não exibe o banner indevidamente.
- Confirmar que o runtime caching diferenciado (`assistant.html` vs demais rotas) continua funcionando após a mudança.

### Backend

Não aplicável — sem alteração de backend.

### E2E

Não aplicável — nenhuma suíte E2E identificada cobrindo fluxo de PWA.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p tsconfig.json
npm --prefix "sistema financas" run build
npm --prefix "sistema financas" run preview
```

Observação: o projeto não possui scripts `lint` ou `test` dedicados no `package.json`. O service worker só é gerado/ativado em build de produção (`import.meta.env.PROD`), então o teste manual do fluxo de atualização real precisa ser feito com `npm run build` + `npm run preview`, não com `npm run dev`.

## Riscos e pontos de atenção

- Mudança em ciclo de vida de service worker afeta diretamente usuários que já têm o PWA instalado em produção — a implementação atual chega até eles como a última atualização com o comportamento antigo (reload silencioso), e a partir dela o novo fluxo assume.
- Remover `src/pwa/register.ts` exige atualizar todos os importadores (`main.tsx`, `assistantMain.tsx`) na mesma mudança, para não deixar import quebrado — checar com uma busca por `registerPwaServiceWorker` antes de considerar a etapa concluída.
- `App.tsx` (sistema completo) e `AssistantPwaScreen.tsx`/`AppProviders` (assistente) têm bootstraps independentes — o hook `usePwaUpdate()` precisa funcionar corretamente em ambos sem depender de contexto compartilhado entre eles.
- Sem testes automatizados de frontend — toda a validação depende do teste manual detalhado acima, incluindo aguardar (ou simular) o timeout de 10 minutos.
- Nenhum risco de vazamento multi-tenant, migration ou schema identificado.
- Ambiente pode estar apontando para produção — o teste do fluxo de atualização deve ser feito com cautela para não confundir usuários reais durante a validação, preferencialmente testando em ambiente local com `npm run preview` antes de publicar.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões relevantes foram resolvidas durante o planejamento (banner nos dois entrypoints, timeout de 10 minutos, paleta do redesign do assistente, hook `usePwaUpdate()` reutilizável, `register.ts` absorvido pelo hook).

## Critérios de aceite do plano

- Uma nova versão publicada do app não recarrega a tela do usuário automaticamente sem aviso prévio.
- O banner "Nova versão disponível" aparece corretamente tanto no sistema completo quanto no assistente quando há atualização pendente.
- Clicar em "Atualizar agora" aplica a atualização e recarrega a página com a nova versão ativa.
- O fallback automático (aba oculta ou 10 minutos) aplica a atualização mesmo sem interação do usuário.
- A instalação inicial do PWA não exibe o banner indevidamente.
- O runtime caching diferenciado por rota e o precache do Workbox continuam funcionando como antes.
- `src/pwa/register.ts` foi removido e nenhum arquivo o importa mais.
- `npx tsc --noEmit` e `npm run build` concluem sem erros.
- Nenhuma mudança no `manifest.json` ou na decisão de quais telas são instaláveis como PWA.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto da task original em `.portal/tasks/notificar-atualizacao-pwa-assistente-financeiro.md`.
- Seguir a sequência do `CLAUDE.md` do projeto: implementar só após aprovação já concedida; `/finalizar` cuidará de commit + push + pergunta sobre merge em `main`.
- Não executar migrations — não deveriam ser necessárias nesta implementação.
- Antes de remover `src/pwa/register.ts`, confirmar via busca (`grep`/equivalente) que nenhum outro arquivo além de `main.tsx` e `assistantMain.tsx` o importa.
- Implementar em etapas pequenas na ordem da "Estratégia de implementação" acima, testando manualmente com `npm run build` + `npm run preview` após concluir o hook e o componente, não só ao final.
- Ao criar `UpdatePwaBanner.tsx`, seguir de perto a estrutura de `src/components/CookieBanner.tsx` (componente sem props, autogerenciado) para manter consistência com o padrão já estabelecido no projeto.
- Manter todas as strings visíveis ao usuário em português; nomes de novos arquivos/identificadores em inglês, seguindo a convenção do projeto.
- Rodar `npx tsc --noEmit -p tsconfig.json` e `npm --prefix "sistema financas" run build` ao final para validar tipos e build.
