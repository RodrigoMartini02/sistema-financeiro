# Feature: Isolar a demo interativa em iframe/entry point próprio

## Contexto

A implementação atual da seção interativa da Home (`src/screens/public/components/demo-app/HomeInteractiveDemo.tsx`)
usa uma abordagem de "modo demo global": um `DemoModeProvider` (React Context) ativa uma flag de
módulo (`activeDemoResolver` em `src/services/demo/demoModeContext.tsx`) enquanto está montado, e
`apiRequest` (`src/services/apiClient.ts`) checa essa flag para desviar chamadas para um banco
fake em memória em vez da API real.

## Problema encontrado (evidência real, não hipótese)

Essa abordagem tem um bug de vazamento **confirmado em produção local**: a flag `activeDemoResolver`
é uma variável de módulo **compartilhada por toda a aplicação**, não escopada à árvore de
componentes da demo. Assim que a seção da demo é montada em qualquer lugar da página, **todas as
chamadas de `apiRequest` da Home inteira** — incluindo a query de avaliações reais
(`queryKey: ['avaliacoes-public']` em `src/screens/public/HomePage.tsx`) — passam a ser desviadas
para o banco fake. Como `/avaliacoes` não está mapeado no resolver fake, isso quebra com o erro
observado no console do navegador: `"data cannot be undefined... Affected query key:
[\"avaliacoes-public\"]"`.

Essa contaminação cruzada provavelmente também explica os outros bugs relatados nesta mesma sessão
de trabalho (calendário quebrando com "Não foi possível carregar o calendário", modal de despesa
aparecendo com posicionamento incorreto/tela cheia) — o erro do React Query pode estar
interrompendo a árvore de renderização de forma inconsistente.

## Investigação técnica já feita (não refazer)

Foram avaliadas e descartadas as seguintes correções antes de chegar à decisão de usar iframe:

1. **Mapear `/avaliacoes` no resolver fake**: resolveria esse sintoma pontual, mas não a causa —
   qualquer novo endpoint chamado por qualquer parte da Home fora da demo continuaria vazando.
2. **Interceptar via `QueryFunctionContext.client`** (o React Query passa uma referência ao
   `QueryClient` para cada `queryFn`): inviável sem reescrever a assinatura de cada `queryFn` nas
   telas reais, já que nenhuma delas hoje usa o parâmetro de contexto (`() => fetchX(...)`, não
   `(context) => fetchX(...)`).
3. **Rastrear por profundidade de chamada síncrona** (ativar a flag só durante a janela síncrona
   de uma chamada específica): tecnicamente viável, mas frágil — não elimina o risco em cenários
   de concorrência real (ex. usuário mexendo na demo exatamente quando a Home real dispara uma
   query), e o projeto já sofreu dois incidentes de vazamento nesta mesma sessão.
4. **Injeção por tela** (trocar os imports de service dentro de `ExpenseDialog`, `IncomeDialog`,
   `FinanceDashboard`, `MovimentacoesScreen` para receberem a fonte de dados via
   contexto/parâmetro): resolveria com segurança, mas exige tocar as 4 telas reais — o plano
   original evitou essa abordagem justamente para minimizar mudanças nelas.

**Decisão tomada com o usuário**: isolar via iframe/entry point HTML próprio, para que o "modo
demo" seja uma propriedade **estática do documento carregado**, não uma flag runtime dentro do
mesmo contexto JS da Home. Isso elimina o vazamento por construção — são dois documentos, duas
instâncias de módulo JS, dois `window` distintos, sem nenhuma variável compartilhada possível.

## Objetivo

Servir a seção interativa como uma página própria (`demo.html`, ou nome equivalente), carregada
dentro de um `<iframe>` embutido na seção correspondente da Home. O JS carregado dentro do iframe
sabe, desde a inicialização do documento, que está em modo demo — não depende de nenhuma flag
setada/desmontada em tempo de execução compartilhado com a Home.

## Escopo funcional

- Novo entry point Vite (`demo.html`, seguindo o padrão já existente de `app.html`/`index.html`
  em `vite.config.ts`).
- Novo ponto de entrada React que monta diretamente a árvore da demo (`AppShell` + telas reais +
  `DemoModeProvider` + banco fake), sem depender de estar embutido na árvore da `HomePage.tsx`.
- Dentro desse documento próprio, `apiRequest` pode saber que está em modo demo de forma estática
  (ex. checando a URL do próprio documento, ou uma constante de build), eliminando a necessidade
  da flag de módulo compartilhada atual.
- `HomeInteractiveDemo.tsx` na Home passa a renderizar um `<iframe src="/demo.html">` (ou
  equivalente) em vez de montar a árvore de componentes diretamente.
- Preservar a experiência visual atual (card contido, badge "Demonstração", sidebar/telas reais)
  — a composição visual já validada não deve mudar, só o mecanismo de isolamento por trás.

## Fora do escopo

- Qualquer nova funcionalidade na demo além do que já existe (Painel, Movimentações, Reservas,
  Relatórios, diálogos de despesa/receita).
- Mudança de conteúdo/copy da Home fora da seção da demo.
- A seção de benefícios/venda pedida anteriormente pelo usuário
  (`docs/features/home-secao-beneficios-vendas.md`) — tratada em spec/plano separado, após esta
  correção arquitetural ser resolvida.

## Riscos técnicos a avaliar no planejamento

- Comunicação entre iframe e página pai (ex. redimensionar altura do iframe conforme o conteúdo
  interno muda — hoje o card tem altura fixa de 680px via CSS, isso pode ser preservado igual
  dentro do iframe sem necessidade de comunicação cross-frame).
- SEO/acessibilidade de conteúdo dentro de iframe (normalmente não é indexado pelo Google da mesma
  forma que HTML inline — avaliar se isso importa para essa seção, dado que é conteúdo
  interativo/demonstrativo, não textual).
- Certificar que o iframe usa `sandbox` ou políticas apropriadas para não expor a sessão real (o
  iframe carrega a mesma origem, então cookies/localStorage são compartilhados por padrão — avaliar
  se isso é aceitável dado que a demo já não deve ler/escrever nada de sessão real de qualquer
  forma).
- Build: `demo.html` precisa ser gerado e servido corretamente tanto em dev (Vite) quanto em
  produção (build estático).

## Observações para o /planejar

- Ler `vite.config.ts` (já lido nesta investigação: dois entry points existentes, adicionar um
  terceiro é direto).
- Ler o estado atual completo de `src/screens/public/components/demo-app/HomeInteractiveDemo.tsx`,
  `src/services/demo/*`, `src/layout/AppShell.tsx` (já modificado para suportar `isDemoMode`) antes
  de decidir o que é reaproveitável como está e o que precisa mudar.
- Considerar se `src/services/demo/demoModeContext.tsx` (o mecanismo de flag global) deve ser
  removido por completo ou mantido apenas como uma forma mais simples de sinalizar "isso é a
  página demo" dentro do próprio documento isolado (sem risco de vazamento, já que não há mais
  Home real compartilhando o mesmo JS runtime).
