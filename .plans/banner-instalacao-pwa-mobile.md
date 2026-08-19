# Plano de Implementação: Banner de instalação do PWA (Assistente Financeiro) para visitantes mobile

## Origem

- Arquivo de especificação: nenhum `.md` de feature fornecido — plano originado de relato do usuário ("ao acessar por celular, não notifica que tem versão app pra baixar") e investigação de código.
- Data do planejamento: `2026-08-18`
- Classificação: `frontend-only`

## Resumo

Hoje, ao acessar o site pelo celular, nenhum aviso convida o visitante a instalar o PWA. O único componente parecido (`UpdatePwaBanner`) trata de *atualização* de versão, não de *instalação* inicial — não existe nenhum código que capture `beforeinstallprompt` (Android/Chrome) ou oriente a instalação manual no iOS Safari (que não suporta esse evento). Este plano adiciona um banner de instalação no site público, reaproveitando o padrão visual/comportamental já usado em `CookieBanner.tsx`.

Importante: o PWA instalável hoje é o **Assistente Financeiro** (`manifest.json` aponta `start_url` para `/assistant.html`), não o painel completo do sistema — o banner deve deixar isso claro no texto, evitando criar expectativa de que o usuário está baixando o sistema financeiro inteiro.

## Escopo

### Dentro do escopo

- Novo componente `InstallPwaBanner.tsx`, cobrindo dois casos:
  - **Android/Chrome**: captura `beforeinstallprompt`, mostra banner com botão que dispara o prompt nativo (`event.prompt()`).
  - **iOS Safari**: detecta a plataforma via user agent, mostra banner com instrução manual ("toque em Compartilhar → Adicionar à Tela de Início"), já que iOS não dispara `beforeinstallprompt`.
- Texto do banner deixa claro que a instalação é do **Assistente Financeiro** (não do painel completo). Texto definido:
  - Android: título "Tenha o assistente na palma da sua mão, baixe agora mesmo", botão "Instalar", botão secundário "Agora não".
  - iOS: mesmo título, com instrução manual ("Toque em Compartilhar e depois em 'Adicionar à Tela de Início'"), botão "Agora não".
- Detecção de "já instalado" (`matchMedia('(display-mode: standalone)')` e `navigator.standalone` no iOS) para nunca mostrar o banner nesse caso.
- Escuta do evento `appinstalled` para ocultar o banner imediatamente se a instalação ocorrer por fora dele (ex.: ícone da barra de endereço do Chrome).
- Sequenciamento com `CookieBanner`: o banner de instalação só aparece depois que o usuário responder ao consentimento de cookies (aceitar ou recusar) — nunca simultaneamente.
- Persistência de dispensa com expiração: ao clicar "Agora não", o banner some por 7 dias (grava timestamp no `localStorage`), depois volta a aparecer se ainda elegível (não instalado, não em standalone).
- Montagem em `PublicSite()` (`App.tsx`), ao lado de `CookieBanner`.

### Fora do escopo

- Qualquer mudança no `manifest.json` (start_url, ícones, scope, shortcuts) — mantém como está, incluindo o fato de a instalação principal ser do assistente.
- Qualquer mudança em `UpdatePwaBanner`/`usePwaUpdate` (fluxo de atualização de versão, não de instalação).
- Mostrar esse banner dentro do app autenticado (`AppContent`) — só no site público, onde o visitante ainda não é usuário logado.
- Alterar o service worker (`src/sw.ts`) ou seu precache manifest.
- Métricas/analytics de quantas pessoas instalaram via o banner (poderia reaproveitar `recordAnalyticsEvent`, já existente no projeto, mas fica fora deste escopo inicial).
- Alterar o comportamento de `shortcuts` do manifest (atalho para `/app.html`) — permanece como está.

## Leitura de contexto

- `AGENT.md` e `CLAUDE.md` da raiz — lidos (mesma ressalva de sempre sobre seções multi-tenant/prefeitura não aplicáveis a este projeto).
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- Arquivos inspecionados: `src/components/CookieBanner.tsx` (padrão de referência: banner fixo dispensável com `localStorage`), `src/components/UpdatePwaBanner.tsx` e `src/pwa/usePwaUpdate.ts` (confirmado: cobrem só atualização, não instalação), `src/App.tsx` (estrutura `PublicSite()` vs. `AppContent()`, ponto de montagem do `CookieBanner`, linhas 80-99), `public/manifest.json` (configuração atual do PWA — `start_url: "/assistant.html?source=pwa"`, ícones 192/512/maskable já corretos, `shortcuts` para `/app.html`), `vite.config.ts` (`manifest: false` no plugin, manifest é arquivo estático servido diretamente), `src/sw.ts` (não será tocado).

## Impacto por área

### Frontend

- `src/components/InstallPwaBanner.tsx` (novo): componente com lógica de detecção de plataforma (Android com `beforeinstallprompt` vs. iOS Safari vs. já instalado), captura/armazenamento do evento `beforeinstallprompt`, banners visuais para cada caso, integração com `localStorage` para dispensa com expiração de 7 dias, e coordenação com o estado do `CookieBanner` (só aparece depois de consentimento resolvido).
- `src/App.tsx`: import e montagem de `InstallPwaBanner` dentro de `PublicSite()`, após `CookieBanner`.
- Sem impacto em hooks de dados, React Query, ou backend — puramente client-side, baseado em eventos do navegador e `localStorage`.
- Sem necessidade de estados de loading/error/empty (não há chamada de rede).

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/components/InstallPwaBanner.tsx` (novo)
- `src/App.tsx`

## Estratégia de implementação

1. Criar `InstallPwaBanner.tsx`:
   - Estado interno para o evento `beforeinstallprompt` capturado (`event.preventDefault()` + guardar referência em estado/ref).
   - Detecção de "já instalado": `window.matchMedia('(display-mode: standalone)').matches` ou `(navigator as any).standalone === true` (iOS) — se true, não renderiza nada.
   - Detecção de iOS Safari via `navigator.userAgent` (padrão comum: `/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream`, excluindo Chrome/Firefox no iOS se necessário).
   - Leitura do estado de consentimento de cookies (reaproveitar `getConsent()` já exportado por `CookieBanner.tsx`) para só renderizar depois que o usuário tiver respondido.
   - Leitura/gravação de dispensa com expiração: chave própria em `localStorage` (ex. `pwa_install_dismissed_until`), comparando timestamp atual contra o valor salvo (+7 dias).
2. Renderizar banner Android (quando `beforeinstallprompt` foi capturado, cookies resolvidos, não dispensado/expirado): título "Tenha o assistente na palma da sua mão, baixe agora mesmo", botão "Instalar" chamando `event.prompt()` + tratamento de `userChoice`, botão "Agora não" gravando a dispensa.
3. Renderizar banner iOS (quando é iOS Safari, cookies resolvidos, não em standalone, não dispensado/expirado): mesmo título "Tenha o assistente na palma da sua mão, baixe agora mesmo", com instrução manual (ícone de "Compartilhar" + "Adicionar à Tela de Início"), botão "Agora não" gravando a dispensa. Sem botão de ação automática (não existe API para isso no iOS).
4. Escutar evento `appinstalled` no `window` para ocultar o banner imediatamente caso a instalação ocorra por outro caminho.
5. Montar `<InstallPwaBanner />` em `App.tsx`, dentro de `PublicSite()`, após `<CookieBanner />`.
6. Rodar build do frontend.
7. Teste manual: Chrome Android (dispositivo real ou emulador) — confirmar banner aparece após aceitar/recusar cookies, instalar funciona, dispensar oculta por 7 dias; Safari iOS (dispositivo real) — confirmar banner de instrução aparece, dispensar funciona.

## Regras de negócio identificadas

- O banner de instalação só aparece no site público, nunca dentro do app já autenticado.
- Usuário que já tem o app instalado (modo standalone) nunca vê o banner.
- O banner só aparece depois que o usuário já respondeu ao `CookieBanner` — nunca os dois simultaneamente.
- Dispensar o banner ("Agora não") o esconde por 7 dias; depois desse período, volta a aparecer se ainda elegível.
- O texto do banner deixa claro que a instalação é do Assistente Financeiro, não do painel completo do sistema.
- iOS e Android recebem UX diferentes por limitação do navegador — iOS sempre mostra instrução manual, nunca um botão de ação automática.

## Regras multi-tenant e segurança

Não aplicável — funcionalidade client-side, sem acesso a dados de usuário ou backend.

## Validações necessárias

- Nenhuma validação de formulário — não há input de usuário além dos cliques nos botões do banner.

## Testes necessários

### Frontend

- Banner Android aparece quando `beforeinstallprompt` dispara, cookies já resolvidos, e não dispensado/expirado.
- Banner Android não aparece se já em modo standalone, ou se cookies ainda não foram respondidos, ou se dispensado há menos de 7 dias.
- Banner iOS aparece em Safari/iOS quando não está em standalone, cookies resolvidos, não dispensado/expirado.
- Clicar "Instalar" (Android) dispara `prompt()` corretamente e oculta o banner após a escolha do usuário.
- Clicar "Agora não" grava a dispensa com expiração de 7 dias e oculta o banner.
- Evento `appinstalled` oculta o banner mesmo sem clique no botão "Instalar".
- Banner nunca aparece dentro do app autenticado.

### Backend

Nenhum — sem impacto de backend.

### E2E

- Fluxo manual: acessar o site em Android/Chrome real ou emulador, responder ao CookieBanner, ver o banner de instalação, instalar, confirmar que abre em modo standalone no Assistente Financeiro.
- Fluxo manual: acessar em iPhone/Safari real, responder ao CookieBanner, ver o banner de instrução manual, seguir os passos, confirmar instalação.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- `beforeinstallprompt` só dispara sob heurísticas de engajamento do Chrome (não é imediato na primeira visita) — isso é comportamento do navegador, não um bug do código; o banner só pode aparecer quando o evento realmente disparar.
- Testar em Safari real (iOS) é necessário — não há emulação perfeita via DevTools desktop; recomenda-se dispositivo físico ou serviço tipo BrowserStack.
- `navigator.standalone` é API não padrão específica do iOS Safari — usada apenas dentro do branch de detecção iOS, nunca como checagem universal.
- Texto do banner precisa deixar claro que é o Assistente sendo instalado (não o painel completo) para não gerar expectativa equivocada — conforme decisão do usuário.
- `getConsent()` de `CookieBanner.tsx` precisa ser exportado/reaproveitado corretamente para a checagem de sequenciamento funcionar sem duplicar lógica de leitura de localStorage.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` (Decisões de sequenciamento com CookieBanner, duração da dispensa, e menção ao Assistente no texto já resolvidas.)

## Critérios de aceite do plano

- Banner de instalação aparece no site público para visitantes Android/Chrome elegíveis, após resposta ao CookieBanner.
- Banner de instrução manual aparece para visitantes iOS Safari, após resposta ao CookieBanner.
- Nenhum dos dois aparece para quem já tem o app instalado.
- Dispensar o banner impede que ele volte a aparecer por 7 dias.
- Texto do banner menciona claramente o Assistente Financeiro.
- Build do frontend passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir o padrão visual/estrutural de `CookieBanner.tsx`.
- Não modificar `manifest.json`, `sw.ts`, ou `UpdatePwaBanner`/`usePwaUpdate`.
- Garantir que o banner de instalação nunca apareça simultaneamente ao `CookieBanner`.
- Reaproveitar `getConsent()` de `CookieBanner.tsx` em vez de duplicar a lógica de leitura do consentimento.
