# Plano de Implementação: Isolar a demo interativa em iframe/entry point próprio

## Origem

- Arquivo de especificação: `docs/features/demo-isolamento-via-iframe.md`
- Data do planejamento: `2026-08-15`
- Classificação: `frontend-only`

## Resumo

A implementação atual da seção interativa da Home usa um mecanismo de "flag global de módulo"
(`src/services/demo/demoModeContext.tsx`) para desviar chamadas de `apiRequest` para um banco fake
enquanto a demo está montada. Esse mecanismo tem um bug de vazamento **confirmado** em produção
local: a flag é compartilhada por toda a aplicação, então, assim que a demo é montada, **todas as
chamadas de `apiRequest` da Home inteira** (incluindo a query real de avaliações) passam a ser
desviadas para o banco fake, quebrando com `"data cannot be undefined"` sempre que o endpoint não
está mapeado no resolver fake. Esse vazamento provavelmente também explica os outros bugs
relatados na mesma sessão (calendário quebrado, modal de despesa com posicionamento incorreto).

Este plano substitui esse mecanismo por isolamento real: um novo entry point de build
(`demo.html` + `src/demoMain.tsx`) carrega a árvore da demo em um documento/contexto JS
**fisicamente separado** da Home, embutido via `<iframe>`. Dentro desse documento, o "modo demo" é
uma propriedade estática (sempre verdadeira), não uma flag runtime compartilhada — eliminando o
vazamento por construção, já que não há mais nenhum módulo JS compartilhado entre a Home real e a
demo.

## Escopo

### Dentro do escopo

- Novo entry point Vite `demo.html` (raiz do projeto), seguindo o padrão já existente de
  `app.html`/`index.html` em `vite.config.ts`.
- Novo `src/demoMain.tsx`: ponto de entrada React dedicado que monta, de forma isolada, a árvore
  completa da demo — `QueryClientProvider` (com `QueryClient` próprio), `AppProvider`,
  `ConfirmProvider`, `FirstAccessGuideProvider`, `AppShell` + `FinanceDashboard` /
  `MovimentacoesScreen` / `ReservasScreen` / `RelatoriosScreen` + `IncomeDialog` / `ExpenseDialog`.
- `src/services/apiClient.ts`: simplificar `apiRequest` removendo a checagem de
  `isDemoModeActive()`/Context — dentro do documento `demo.html`, todas as chamadas devem
  simplesmente desviar para o banco fake de forma incondicional (constante estática de módulo, não
  flag mutável compartilhada com a Home).
- Remover `src/services/demo/demoModeContext.tsx` por completo (`DemoModeProvider`, `useDemoMode`,
  `isDemoModeActive`, `resolveDemoRequest`) — não é mais necessário no novo modelo.
- Manter e reaproveitar `src/services/demo/demoFakeDatabase.ts` e
  `src/services/demo/fakeApiResolver.ts` (lógica de dados fake em memória, já validada
  funcionalmente, sem relação com o bug de vazamento).
- `src/screens/public/components/demo-app/HomeInteractiveDemo.tsx`: passa a renderizar um
  `<iframe src="/demo.html" sandbox="allow-scripts allow-same-origin allow-forms">` dentro do card
  já existente (mantendo altura, bordas, sombra, badge visual já validados), em vez de montar a
  árvore de componentes React diretamente.
- `src/ui/dialog.tsx`: remover a dependência de `useDemoMode()` — dentro do iframe isolado, o
  `Dialog` deve simplesmente usar sempre `absolute inset-0` (todo o documento do iframe é a
  "demo"), eliminando a lógica condicional atual.
- `src/layout/AppShell.tsx`: reavaliar a prop `isDemoMode` — como `demoMain.tsx` é o único
  consumidor que precisa desse comportamento, a prop pode continuar existindo (controlada
  explicitamente por quem monta o `AppShell` dentro de `demoMain.tsx`, sempre `true`), sem
  depender de Context.

### Fora do escopo

- Seção de benefícios/venda pedida anteriormente pelo usuário
  (`docs/features/home-secao-beneficios-vendas.md`) — tratada em ciclo de planejamento separado,
  após esta correção arquitetural.
- Qualquer nova funcionalidade na demo além do que já existe (Painel, Movimentações, Reservas,
  Relatórios, diálogos de despesa/receita).
- Mudança de conteúdo/copy da Home fora da seção da demo.
- Persistência real, autenticação real — o banco fake em memória continua exatamente como está.

## Leitura de contexto

- `/AGENT.md` (raiz do projeto) — lido em ciclos anteriores desta sessão. Majoritariamente
  backend/multi-tenant; sem impacto direto nesta feature frontend-only. Não existem
  `frontend/AGENT.md`/`backend/AGENT.md` separados.
- `docs/features/demo-isolamento-via-iframe.md` — especificação desta feature, já documenta a
  investigação técnica completa (evidência do erro real no console do navegador, 4 abordagens
  avaliadas e descartadas antes de chegar à decisão de iframe).
- `vite.config.ts` — lido por completo; confirma dois entry points existentes (`app`, `login`)
  compartilhando o mesmo `root`; adicionar um terceiro (`demo`) segue o mesmo padrão.
- `src/main.tsx` — lido por completo; confirma que `index.html` e `app.html` **compartilham** o
  mesmo script `src/main.tsx` → `<App />`, que decide internamente qual árvore mostrar via
  `pathname`. Isso confirma que um iframe apontando para `index.html`/`app.html` com algum
  parâmetro não bastaria para isolamento real de módulo — é necessário um script de entrada
  fisicamente separado (`src/demoMain.tsx`) para garantir que os módulos JS (incluindo
  `apiClient.ts`) sejam carregados como instâncias completamente novas, sem qualquer estado
  compartilhado com a Home.
- `src/App.tsx` — lido por completo; referência de como a árvore autenticada real monta
  `AppProvider` → `ConfirmProvider` → `FirstAccessGuideProvider` → `AppShell` + diálogos — o mesmo
  padrão estrutural deve ser replicado (não reinventado) dentro de `demoMain.tsx`.
- `app.html`/`index.html` — lidos; confirmam estrutura mínima de HTML (meta tags, `#root`,
  `<script type="module" src="/src/main.tsx">`) a ser replicada em `demo.html` apontando para
  `src/demoMain.tsx`.
- `src/services/demo/demoModeContext.tsx`, `fakeApiResolver.ts`, `demoFakeDatabase.ts` — lidos em
  ciclos anteriores desta sessão; primeiro será removido, os outros dois reaproveitados sem
  alteração de lógica.
- `src/screens/public/components/demo-app/HomeInteractiveDemo.tsx`, `src/ui/dialog.tsx`,
  `src/layout/AppShell.tsx` — lidos em ciclos anteriores; pontos de alteração já identificados.

## Impacto por área

### Frontend

- **Novo**: `demo.html` — HTML mínimo, mesmo padrão de `app.html` (meta `robots: noindex,
  nofollow`, já que não é conteúdo a ser indexado separadamente), apontando para
  `src/demoMain.tsx`.
- **Novo**: `src/demoMain.tsx` — monta a árvore isolada da demo com um `QueryClient` próprio,
  todos os providers necessários (`AppProvider`, `ConfirmProvider`, `FirstAccessGuideProvider`),
  `AppShell` com `isDemoMode` sempre `true`, e as 4 telas reais + diálogos, replicando a estrutura
  que hoje existe em `DemoAppContent` dentro de `HomeInteractiveDemo.tsx`.
- **Editado**: `src/services/apiClient.ts` — remover a checagem `isDemoModeActive()` +
  `resolveDemoRequest`; no lugar, usar uma constante de módulo (ex. `const IS_DEMO_DOCUMENT = true`
  em um arquivo próprio importado apenas por `demoMain.tsx`, ou detecção estática via
  `import.meta.env` /flag de build) que decide, de forma incondicional dentro daquele bundle, se
  toda chamada desvia para o banco fake. Fora do documento `demo.html`, o comportamento de
  `apiRequest` volta a ser exatamente o original (sem qualquer branch condicional em runtime
  compartilhado).
- **Removido**: `src/services/demo/demoModeContext.tsx`.
- **Mantidos sem alteração de lógica**: `src/services/demo/demoFakeDatabase.ts`,
  `src/services/demo/fakeApiResolver.ts`.
- **Editado**: `src/screens/public/components/demo-app/HomeInteractiveDemo.tsx` — remove toda a
  árvore de providers/componentes montada diretamente; passa a renderizar um `<iframe>` apontando
  para `/demo.html`, preservando o card visual (título, descrição, bordas, sombra) já validado.
- **Editado**: `src/ui/dialog.tsx` — remove import de `useDemoMode`; o cálculo de `isDemoMode`
  local é removido, `Dialog` usa sempre a mesma classe de posicionamento (`fixed inset-0`), já que
  cada documento (Home real ou `demo.html`) agora tem seu próprio comportamento de página inteira
  correto por padrão — dentro do iframe, `fixed` já se comporta relativo ao viewport do iframe
  (que ocupa 100% do espaço do `<iframe>` no DOM), não da janela do navegador inteira.
- **Editado**: `src/layout/AppShell.tsx` — a prop `isDemoMode` continua existindo (usada para
  esconder `PerfilSwitcher`, notificações reais, `FinancialAssistant`, "Planos", "Configurações"),
  mas deixa de ter qualquer relação com Context — é apenas uma prop booleana passada explicitamente
  por quem monta o `AppShell` dentro de `demoMain.tsx`.
- Sem impacto em query keys reais, hooks reais ou services reais além do necessário — as 4 telas
  mantêm seu código-fonte inalterado (mesmo princípio do plano anterior).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

- Build passa a gerar 3 entry points HTML (`app.html`, `index.html`, `demo.html`) em vez de 2 —
  sem impacto de infraestrutura além do build em si (mesmo processo `vite build` já usado).

## Estratégia de implementação

1. Criar `demo.html` (raiz do projeto), copiando a estrutura mínima de `app.html`, apontando para
   `/src/demoMain.tsx`.
2. Criar `src/demoMain.tsx`: monta `QueryClientProvider` (com `QueryClient` próprio, mesmas
   `defaultOptions` já usadas no `demoQueryClient` atual) → `AppProvider` → `ConfirmProvider` →
   `FirstAccessGuideProvider` → `AppShell` (com `isDemoMode` sempre `true`) + as 4 telas +
   `IncomeDialog`/`ExpenseDialog`, replicando a lógica hoje em `DemoAppContent`.
3. Adicionar o entry point `demo` em `vite.config.ts` (`rollupOptions.input`).
4. Simplificar `src/services/apiClient.ts`: remover a checagem de Context; usar detecção estática
   (constante de módulo dedicada, importada só pelo bundle de `demoMain.tsx`) para desviar
   incondicionalmente para o banco fake dentro desse documento.
5. Remover `src/services/demo/demoModeContext.tsx`.
6. Simplificar `src/ui/dialog.tsx` (remover `useDemoMode`, sempre `fixed inset-0`).
7. Atualizar `src/screens/public/components/demo-app/HomeInteractiveDemo.tsx` para renderizar o
   `<iframe>` no lugar da árvore de componentes.
8. Rodar `npx tsc --noEmit` e `npx vite build`, confirmando que os 3 entry points são gerados sem
   erro.
9. Validação funcional via `/run`:
   - Acessar `/demo.html` diretamente e confirmar que a demo funciona isoladamente (lançar
     despesa/receita, calendário, reservas, relatórios).
   - Acessar a Home (`/`) e confirmar que a seção da demo (agora em iframe) funciona igual, **e**
     que a query de avaliações reais e o restante da Home não são mais afetados.
   - Testar especificamente os dois bugs relatados (calendário, modal de despesa) para confirmar
     que foram resolvidos pela mudança de arquitetura.

## Regras de negócio identificadas

- O "modo demo" nunca deve, em nenhuma circunstância, afetar chamadas de rede feitas pela Home
  real — esta é a regra que motivou todo este plano, após um vazamento confirmado.
- Nenhum dado inserido na demo deve ser persistido ou enviado à API real.
- A demo deve continuar sendo visualmente idêntica à experiência já validada anteriormente (card
  contido, badge "Demonstração", sidebar/telas reais).

## Regras multi-tenant e segurança

Não aplicável a tenant/prefeitura. Pontos de atenção:

- Isolamento de contexto JS via iframe elimina o risco de vazamento de dados fake para a Home real
  por construção (dois documentos/módulos JS distintos).
- `sandbox="allow-scripts allow-same-origin allow-forms"` no iframe: `allow-same-origin` é
  necessário para o iframe carregar recursos normalmente (CSS, fontes) da mesma origem;
  `allow-forms` é necessário para os formulários de despesa/receita/reserva funcionarem;
  `allow-scripts` é necessário para a aplicação React rodar. Nenhuma permissão além dessas deve
  ser adicionada (ex. não incluir `allow-top-navigation`, `allow-popups`).
- Mesmo com `allow-same-origin`, a demo não deve ler nem escrever nenhum dado de
  `localStorage`/`sessionStorage` de sessão real — isso já é garantido pela banco fake em memória
  não tocar nesses storages, independentemente do isolamento de iframe.

## Validações necessárias

Não aplicável — sem formulários novos, sem payloads novos além dos já existentes nas telas reais
reaproveitadas.

## Testes necessários

### Frontend

- Verificação manual: `/demo.html` acessado diretamente funciona (todas as 4 telas + diálogos).
- Verificação manual: Home (`/`) com a demo embutida em iframe funciona identicamente à experiência
  anterior.
- Verificação manual: query de avaliações reais na Home **não é mais afetada** quando a demo está
  visível na página (teste de regressão direto do bug encontrado).
- Verificação manual: calendário em Movimentações (dentro do iframe) carrega sem erro.
- Verificação manual: modal de nova despesa/receita (dentro do iframe) aparece corretamente
  contido, sem vazar para fora do card/iframe.
- Verificação manual: nenhuma requisição de rede real sai do iframe (aba de rede do navegador).

### Backend

Não aplicável.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Maior mudança arquitetural desta série de trabalho na Home — introduz um terceiro entry point de
  build; validar cuidadosamente que os 3 HTMLs continuam sendo gerados e servidos corretamente
  tanto em dev (`vite dev`) quanto em produção (`vite build` + servidor de produção).
- Comunicação de altura entre iframe e página pai: mantendo altura fixa (mesmo padrão de 680px já
  usado hoje no card), não deveria ser necessário nenhum mecanismo de `postMessage` para
  redimensionamento — mas deve ser validado visualmente que não sobra espaço em branco nem corta
  conteúdo.
- SEO: conteúdo dentro de iframe normalmente não é indexado da mesma forma que HTML inline — isso é
  aceitável aqui, já que é conteúdo interativo/demonstrativo, não textual de marketing.
- Esta é uma correção de bug crítico (vazamento confirmado), não uma feature nova — o critério de
  sucesso principal é a Home real voltar a funcionar corretamente independente do estado da demo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Decisões sobre remoção do `demoModeContext.tsx` e
permissões do `sandbox` do iframe foram confirmadas pelo usuário.

## Critérios de aceite do plano

- A demo funciona corretamente dentro do iframe (`/demo.html`), com todas as 4 telas e diálogos
  operacionais.
- A Home real (fora da demo) não é mais afetada por nenhum estado da demo — em particular, a query
  de avaliações (`avaliacoes-public`) continua funcionando normalmente com a demo visível na
  página.
- O bug do calendário ("Não foi possível carregar o calendário") não ocorre mais.
- O bug do modal de despesa (posicionamento incorreto/tela cheia) não ocorre mais.
- `src/services/demo/demoModeContext.tsx` não existe mais no projeto.
- Build gera os 3 entry points (`app.html`, `index.html`, `demo.html`) sem erro.
- `tsc --noEmit` e `vite build` passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com a investigação documentada em
  `docs/features/demo-isolamento-via-iframe.md`.
- Esta é uma correção de bug de vazamento confirmado — priorizar corretude sobre velocidade;
  validar explicitamente o cenário que causou o bug original (Home real + demo montada
  simultaneamente) antes de considerar a implementação concluída.
- Reaproveitar ao máximo a lógica já validada em `demoFakeDatabase.ts` e `fakeApiResolver.ts` —
  não reescrever essa parte.
- Não instalar novas dependências.
- Não persistir nenhum dado da demo em backend/API real, em nenhuma circunstância.
- Validar visualmente com `/run` antes de considerar a implementação concluída, testando
  especificamente os dois bugs relatados nesta sessão para confirmar que foram resolvidos.
