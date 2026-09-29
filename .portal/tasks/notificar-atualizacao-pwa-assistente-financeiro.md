# Task: Notificar atualização de PWA em vez de recarregar silenciosamente

## Contexto

O `sistema financas` distribui o Assistente Financeiro como um PWA instalável separado do sistema completo — decisão arquitetural já implementada e confirmada como correta: o `public/manifest.json` tem `start_url` apontando para `/assistant.html`, então instalar o "app" no celular hoje já instala especificamente o assistente, não o painel financeiro inteiro (que continua sendo acessado normalmente via navegador desktop em `app.html`). Esta task não altera essa decisão nem reestrutura quais telas são instaláveis.

O ciclo de vida do service worker é gerenciado manualmente (sem o módulo virtual do `vite-plugin-pwa`):

- `sistema financas/vite.config.ts:9-32` configura `VitePWA` com `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'` e `injectRegister: false` (linha 13) — o plugin não injeta nenhum script de registro nem expõe `virtual:pwa-register`/`useRegisterSW`.
- `sistema financas/src/sw.ts` é o worker em si (Workbox). Chama `clientsClaim()` (linha 25) e `void worker.skipWaiting()` (linha 26) de forma incondicional, no escopo global do módulo, sem esperar nenhuma mensagem ou ação do usuário. Também define runtime caching diferenciado por rota: navegação para `/assistant.html` usa `NetworkFirst` com cache `fingerence-assistant-shell-v1` (linhas 21, 30-33), qualquer outra navegação same-origin (`app.html`, `index.html`, etc.) usa `NetworkFirst` com cache `fingerence-app-shell-v1` (linhas 23, 35-38).
- `sistema financas/src/pwa/register.ts` é a função `registerPwaServiceWorker()`, chamada tanto em `sistema financas/src/assistantMain.tsx:8` (entrypoint do assistente) quanto em `sistema financas/src/main.tsx:14` (entrypoint do sistema completo). Ela registra `/sw.js` com `scope: '/'` (linha 14) e escuta o evento `controllerchange` (linhas 7-11), disparando `window.location.reload()` automaticamente assim que um novo service worker assume controle (com guard `reloading` para rodar apenas uma vez).
- Busca confirmada em toda a árvore `sistema financas/src`: não existe nenhum componente, hook ou string relacionada a aviso de atualização (`needRefresh`, `UpdateBanner`, `updatefound`, etc.) — zero ocorrências.

## Problema

Como `skipWaiting()` e `clientsClaim()` rodam incondicionalmente assim que o navegador detecta um novo `sw.js` (o que pode acontecer a qualquer momento em que o app esteja aberto — ao focar a aba, ou em checagens periódicas nativas do navegador), o PWA já instalado no celular do usuário troca de versão e recarrega a página sozinho, sem nenhum aviso prévio.

Isso é particularmente arriscado no Assistente Financeiro porque a tela envolve estado local não persistido durante o uso normal: uma mensagem sendo digitada no composer, um cartão de rascunho de transação aberto aguardando confirmação, um upload de anexo em andamento. Um reload forçado e silencioso nesse momento descarta esse estado sem aviso, o que é uma experiência ruim e pode levar a perda de dados que o usuário ainda não confirmou.

## Objetivo

Trocar o comportamento atual de "atualizar e recarregar silenciosamente" por um fluxo onde o usuário é avisado de que há uma nova versão disponível e pode escolher quando aplicá-la, preservando uma rede de segurança (fallback automático) para que ninguém fique preso indefinidamente numa versão antiga caso nunca interaja com o aviso.

## Decisão Técnica Desejada

Portar o padrão já validado e em produção no projeto irmão `escalacao futebol` (mesmo workspace, projeto separado em `c:\Users\rodri\Music\Particular\escalacao futebol`), adaptando de JavaScript puro para a stack TypeScript + Workbox já usada no `sistema financas`. O padrão de origem:

- `escalacao futebol/public/sw.js`: o `install` não chama `skipWaiting()` automaticamente. Em vez disso, há um listener de mensagem: `self.addEventListener('message', e => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting() })`. O `activate` mantém `self.clients.claim()`.
- `escalacao futebol/src/swRegistration.js`: expõe `registerServiceWorker(onUpdateAvailable)`, que registra o SW, detecta quando existe `registration.waiting` junto de um `controller` já ativo (= é atualização, não instalação inicial) via listeners de `updatefound`/`statechange`, e dispara o callback `onUpdateAvailable`. Também força `registration.update()` quando a aba volta a ficar visível (evento `visibilitychange`), para checar ativamente por nova versão. Expõe `applyUpdate(registration)`, que envia `postMessage({ type: 'SKIP_WAITING' })` ao worker em espera.
- `escalacao futebol/src/components/UpdatePWA.jsx`: banner fixo (parte inferior da tela) com texto "Nova versão disponível" e botão "Atualizar agora" que chama `applyUpdate`. Como rede de segurança contra quem nunca clica, também auto-aplica a atualização quando a aba fica oculta (`document.hidden` + `visibilitychange`) ou depois de um timeout (10 minutos no projeto de origem), o que ocorrer primeiro.
- O reload após `controllerchange` (com guard para rodar uma única vez) é mantido — esse comportamento já existe igual em `sistema financas/src/pwa/register.ts` hoje e continua fazendo sentido: depois que o `SKIP_WAITING` é aplicado (por clique ou pelo fallback), recarregar é o passo esperado.

Este não é um "copiar arquivo por arquivo" — o `sistema financas` usa Workbox (`clientsClaim`, `precacheAndRoute`, `registerRoute`) e TypeScript, então a adaptação precisa manter essas peças e só mudar o gatilho de `skipWaiting()`.

## Escopo Funcional

### Dentro do escopo

- Remover o `skipWaiting()` incondicional de `src/sw.ts`, substituindo por um listener de mensagem (`SKIP_WAITING`) que só ativa o novo worker quando solicitado.
- Atualizar `src/pwa/register.ts` (ou introduzir um novo módulo de registro) para capturar a `ServiceWorkerRegistration`, detectar quando existe uma atualização disponível (`registration.waiting` com `controller` ativo, e/ou eventos `updatefound`/`statechange`), e expor esse estado para a camada React via callback ou hook.
- Forçar checagem ativa de atualização quando a aba/app volta a ficar visível (`visibilitychange`), como no padrão de origem.
- Criar um componente de banner "Nova versão disponível" com botão "Atualizar agora", que envia a mensagem `SKIP_WAITING` ao worker em espera quando clicado.
- Manter um fallback automático (aba oculta e/ou timeout) para aplicar a atualização mesmo sem interação do usuário, evitando que alguém fique preso numa versão antiga indefinidamente.
- Preservar o comportamento de reload único após `controllerchange` que já existe hoje.
- Preservar integralmente o runtime caching diferenciado por rota já existente em `src/sw.ts` (`fingerence-assistant-shell-v1` vs `fingerence-app-shell-v1`) e o `precacheAndRoute`/`cleanupOutdatedCaches` do Workbox.

### Fora do escopo inicial

- Qualquer mudança na decisão de quais telas são instaláveis como PWA (o `start_url` do assistente em `public/manifest.json` permanece como está).
- Qualquer mudança no `manifest.json` (ícones, nome, `scope`, `shortcuts`).
- Qualquer mudança na engine de IA, extração de rascunho, ou lógica de negócio do assistente (redesign visual já entregue em trabalho anterior, não relacionado a esta task).
- Adicionar suporte a `beforeinstallprompt`/banner de instalação customizado — isso é uma necessidade diferente (convidar a instalar o app), já identificada separadamente, mas fora do escopo desta task, que trata apenas do aviso de atualização de uma instalação já existente.
- Alterar o runtime caching para incluir `/api/*` ou qualquer dado de sessão/financeiro — o cache deve continuar restrito a shell/assets estáticos, como já é hoje.

## Requisitos de Frontend

- `src/sw.ts`: substituir o `skipWaiting()` incondicional por ativação sob demanda via `message`, mantendo `clientsClaim()`, `cleanupOutdatedCaches()`, `precacheAndRoute()` e as rotas de runtime caching existentes sem alteração de comportamento.
- `src/pwa/register.ts`: evoluir a função de registro para detectar e expor atualização disponível, sem quebrar a assinatura usada hoje em `src/main.tsx:14` e `src/assistantMain.tsx:8` (ou adaptar ambos os pontos de chamada, se a assinatura mudar).
- Novo componente de banner de atualização, com texto e botão de ação, usando `React.CSSProperties`/Tailwind consistente com o padrão visual já usado no restante do app.
- Decidir (registrar como pergunta ao planejamento) se o banner é montado em ambos os entrypoints (`assistantMain.tsx` e `main.tsx`) ou centralizado em algum provider/context compartilhado, dado que os dois usam a mesma função de registro de SW.
- Nenhuma alteração de rota, hook de dados, query key ou serviço de API — a mudança é isolada à camada de ciclo de vida do PWA.

## Requisitos de Backend

Sem impacto backend identificado inicialmente.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

- Sem impacto de isolamento entre perfis/tenants — a mudança é inteiramente do lado do ciclo de vida do service worker e não toca em dados de usuário, sessão ou API.
- Garantir que o fallback automático de atualização não dispare em um momento que descarte dados não salvos sem qualquer aviso prévio ao usuário — por isso o fallback deve ser condicionado a inatividade/aba oculta ou timeout, nunca instantâneo.

## Requisitos de Migração ou Compatibilidade

- Usuários que já têm o PWA do assistente instalado devem receber essa mudança como uma atualização normal (a própria mudança precisa passar pelo novo fluxo, ou pelo fluxo antigo pela última vez, dependendo de quando for publicada) — não deve haver necessidade de desinstalar/reinstalar o app.
- Preservar a compatibilidade dos nomes de cache já em uso (`fingerence-assistant-shell-v1`, `fingerence-assistant-assets-v1`, `fingerence-app-shell-v1`) para não invalidar caches existentes sem necessidade.

## Requisitos de Testes

### Frontend

- Testar manualmente o fluxo de atualização: build de uma versão nova do `sw.ts`, confirmar que o worker fica em estado `waiting` em vez de assumir controle imediatamente.
- Testar que o banner aparece quando há atualização disponível, tanto no modo `standalone` do assistente (`assistant.html`) quanto no app completo (`app.html`), se decidido que o banner cobre os dois.
- Testar o clique em "Atualizar agora": confirmar que a página recarrega com a nova versão ativa.
- Testar o fallback automático (aba oculta e/ou timeout) sem clique no botão.
- Confirmar que o comportamento de instalação inicial (primeira vez que o SW é registrado, sem `controller` ativo ainda) não dispara o banner indevidamente.

### Backend

Não aplicável — sem alteração de backend nesta task.

### E2E

Não aplicável inicialmente, a menos que o planejamento identifique cobertura E2E já existente para fluxo de PWA.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/sw.ts`
- `sistema financas/src/pwa/register.ts`
- `sistema financas/src/assistantMain.tsx`
- `sistema financas/src/main.tsx`
- Novo componente de banner de atualização — caminho a definir durante o planejamento (ex.: `sistema financas/src/components/pwa/` ou `sistema financas/src/components/financial-assistant/`, dependendo de onde ele deve viver).

### Backend

Sem impacto — não deve haver arquivos afetados no backend.

### Banco de Dados

Sem impacto.

## Critérios de Aceite

- Uma nova versão publicada do app não recarrega a tela do usuário automaticamente sem aviso prévio.
- Um banner "Nova versão disponível" (ou texto equivalente) aparece quando há atualização pronta, com uma ação clara para aplicá-la.
- Clicar em "Atualizar agora" aplica a atualização e recarrega a página com a nova versão.
- Caso o usuário nunca interaja com o banner, a atualização é aplicada automaticamente após inatividade/aba oculta ou um tempo limite definido, evitando que a instalação fique presa indefinidamente numa versão antiga.
- A instalação inicial do PWA (primeiro registro do service worker, sem versão anterior ativa) não exibe o banner de atualização indevidamente.
- O runtime caching diferenciado por rota (`assistant.html` vs demais páginas) e o precache do Workbox continuam funcionando como hoje.
- Nenhuma mudança na decisão de quais telas são instaláveis como PWA nem no `manifest.json`.

## Perguntas Para o Planejamento

- O banner deve ser montado em ambos os entrypoints (`assistantMain.tsx` e `main.tsx`), ou centralizado em algum lugar compartilhado entre eles (ex.: dentro de `registerPwaServiceWorker` mesmo, retornando estado consumível por um hook comum)?
- O fallback de timeout deve usar os mesmos 10 minutos do `escalacao futebol`, ou outro valor faz mais sentido para o perfil de uso do assistente financeiro?
- O texto e o estilo visual do banner devem seguir a paleta recém-aplicada no redesign do assistente (`#0891b2`/`#0e7490`), ou usar um padrão neutro/genérico reaproveitável também pelo app completo?
- Existe alguma preferência por expor o estado de "atualização disponível" via um hook React reutilizável (ex.: `usePwaUpdate()`) em vez de props/callbacks diretos, dado que dois entrypoints diferentes (`main.tsx`, `assistantMain.tsx`) precisam consumir esse estado?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `sistema financas/AGENT.md` e o `CLAUDE.md` do projeto (raiz e `sistema financas/CLAUDE.md`) antes de planejar — não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados dentro de `sistema financas`.
- Inspecione `src/sw.ts`, `src/pwa/register.ts`, `vite.config.ts`, `src/assistantMain.tsx` e `src/main.tsx` por completo antes de propor as etapas, já que a mudança precisa ser cirúrgica no ciclo de vida do service worker sem quebrar o runtime caching existente.
- Ao adaptar o padrão de `escalacao futebol`, não copie arquivos JavaScript diretamente — traduza para TypeScript e para as APIs do Workbox já em uso (`clientsClaim`, `precacheAndRoute`, `registerRoute`), preservando a estrutura de módulo (`injectManifest`) já configurada em `vite.config.ts`.
- Classifique a implementação como `frontend`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations (não deveriam ser necessárias nesta task).
- Gere um plano em `.plans/` (conforme o fluxo `/planejar` → `/implementar` → `/finalizar` definido no `CLAUDE.md` deste projeto) com etapas pequenas, revisáveis e seguras, considerando que uma falha no ciclo de vida do service worker pode afetar usuários que já têm o app instalado em produção.

---

**Arquivos considerados na elaboração desta task:** `sistema financas/AGENT.md`, `sistema financas/CLAUDE.md`, `CLAUDE.md` (raiz), e inspeção direta de `sistema financas/src/sw.ts`, `sistema financas/src/pwa/register.ts`, `sistema financas/vite.config.ts`, `sistema financas/src/assistantMain.tsx`, `sistema financas/src/main.tsx`, `sistema financas/public/manifest.json` (via investigação anterior nesta sessão), e dos arquivos de referência no projeto irmão `escalacao futebol` (`public/sw.js`, `src/swRegistration.js`, `src/components/UpdatePWA.jsx`), confirmados como existentes via busca de arquivos antes da escrita desta task. Não foram encontrados `frontend/AGENT.md` nem `backend/AGENT.md` dedicados dentro de `sistema financas`.
