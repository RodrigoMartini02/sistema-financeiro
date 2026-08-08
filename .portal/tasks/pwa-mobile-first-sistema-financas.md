# Task: Transformar sistema finanças em PWA mobile-first completo

## Contexto

O "sistema financas" é uma aplicação de gestão financeira pessoal/empresarial (perfis "pessoal" e "empresa"), construída em React + TypeScript + Vite + Tailwind no frontend, com backend Express.js + TypeScript + PostgreSQL. O projeto já possui `manifest.json` configurado como PWA (`display: standalone`) e a tag viewport correta (`width=device-width, initial-scale=1.0, viewport-fit=cover`) em `index.html` e `app.html`, sinalizando intenção prévia de uso mobile/instalável, ainda não realizada na prática.

Uma análise de usabilidade mobile foi conduzida (sem alterações de código) e identificou que o app hoje funciona como "desktop com hambúrguer": existe apenas um breakpoint real de layout (`lg:`, 1024px) que colapsa a sidebar em um drawer (`src/layout/AppShell.tsx:417-438`), mas o conteúdo interno das telas — tabelas, formulários, seletor de mês — não foi adaptado para telas estreitas.

Do ponto de vista conceitual, sistemas financeiros pessoais são um caso de uso natural para mobile/PWA: lançamento de despesas/receitas costuma acontecer no momento do gasto (fora de casa), e consulta de saldo/limite é uma necessidade recorrente fora do desktop. PWA evita loja de app, reaproveita a base de código existente e já está parcialmente configurado (manifest, viewport).

Arquivos já identificados e verificados como existentes:
- `src/layout/AppShell.tsx` (shell, sidebar/drawer, header, notificações)
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/relatorios/RelatoriosScreen.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/MonthSelector.tsx`
- `src/screens/finance/PaymentModal.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/ui/dialog.tsx`
- `src/ui/dialogFormTokens.tsx`
- `public/manifest.json`
- `index.html`, `app.html`

**Observação sobre AGENT.md do projeto:** o `AGENT.md` presente em `sistema financas/` descreve um contexto de "sistema multi-prefeitura, multi-tenant + RLS" que não corresponde a este sistema (que é finanças pessoal/empresarial de perfis, sem RLS/multi-tenant identificado no domínio). As regras de workflow (`/planejar → aprovação → /implementar → /finalizar`, nunca alterar `.env`, nunca rodar migrations sem confirmação) permanecem válidas e devem ser seguidas; as regras específicas de isolamento multi-tenant/prefeitura não se aplicam a este domínio e devem ser desconsideradas pela skill `planejar`, salvo se a investigação do código revelar o contrário.

## Problema

As telas de maior uso diário (Despesas, Receitas, lançamento de novas transações) têm problemas sérios de usabilidade em toque/tela pequena, tornando o uso mobile do sistema hoje inconveniente ao ponto de não ser recomendado como fluxo principal fora do desktop:

1. **Tabelas tradicionais com scroll horizontal forçado.** `DespesasScreen.tsx` usa `<table>` com `colgroup` de larguras fixas somando ~1170-1240px dentro de `overflow-x-auto` (~L593-608); `ReceitasScreen.tsx` usa `min-w-[540px]` (~L371); `RelatoriosScreen.tsx` segue o mesmo padrão (~L468). Não existe alternativa em cards empilhados para nenhuma delas.
2. **Formulário principal (Nova/Editar Despesa) não colapsa para 1 coluna.** `ExpenseDialog.tsx` usa grids fixos de 2 colunas (`gridTemplateColumns: '1.35fr 1fr'`, L482/617) e 4 colunas (L620, L643) sem media query, além de um campo de valor com `width: 260` fixo em px (L721) que pode causar overflow em telas ≤375px.
3. **MonthSelector ilegível em smartphone.** `MonthSelector.tsx` (L39-61) renderiza 12 "pills" de mês em uma única linha sem quebra, usado nas 3 telas mais acessadas (Dashboard, Despesas, Receitas) — texto cortado e toque impreciso.
4. **Alvos de toque abaixo do mínimo recomendado (44px).** Botões `h-8 w-8`/`h-7 w-7` (28-32px) no header (`AppShell.tsx:432,453,461`) e nas ações de linha das tabelas (`DespesasScreen.tsx:158-180,746-771`), com 3 botões de ação colados por linha — risco real de toque no botão errado (ex.: "Cancelar" em vez de "Pago").
5. **Diálogos secundários também não colapsam.** `PaymentModal.tsx` (L55) e possivelmente outros usam grids fixos (`gridTemplateColumns: '1fr 1fr'`) sem versão de 1 coluna.
6. **Gráficos de pizza no dashboard podem espremer em telas muito estreitas** (`FinanceDashboard.tsx`, layout `flex` lado a lado entre gráfico e legenda).

Isso representa uma dívida de UX que contradiz a intenção já expressa no código (PWA standalone configurado) e limita o valor do sistema exatamente no cenário de uso mais natural para um app financeiro: registrar uma despesa/receita no momento em que ela acontece.

## Objetivo

Tornar o sistema finanças plenamente usável como PWA mobile-first, cobrindo todas as telas e ações principais — não apenas um subconjunto reduzido — de forma que o usuário consiga lançar despesas/receitas, consultar saldo/resumo, navegar e revisar tabelas (Despesas, Receitas, Relatórios) confortavelmente em um smartphone, sem depender de scroll horizontal ou de mirar em alvos de toque pequenos.

## Decisão Técnica Desejada

Escopo amplo, definido explicitamente pelo usuário: **todas** as telas/ações principais devem ficar mobile-first, e **todas** as tabelas densas (Despesas, Receitas, Relatórios) devem ganhar versão em cards empilhados responsivos no mobile — nenhuma tela fica de fora do escopo por ser "avançada demais" ou reservada só para desktop.

Direção técnica geral (a ser detalhada/validada durante o planejamento):
- Introduzir breakpoints intermediários reais (não só `lg:`) onde o conteúdo interno das telas precisar se adaptar, não apenas a sidebar.
- Para as tabelas (Despesas, Receitas, Relatórios): manter a tabela tradicional em desktop e renderizar uma versão em cards empilhados (uma "linha" = um card com os campos principais e ações) abaixo de um breakpoint definido, evitando scroll horizontal como solução primária.
- Para formulários/diálogos (`ExpenseDialog`, `PaymentModal`, outros): grids de 2/4 colunas devem colapsar para 1 coluna em telas estreitas; larguras fixas em `px` que hoje arriscam overflow devem virar larguras relativas/responsivas.
- Para `MonthSelector`: repensar a apresentação em telas pequenas (ex.: scroll horizontal controlado com snap, dropdown/select nativo, ou grid de 2-3 linhas) em vez de 12 pills em uma linha só.
- Para alvos de toque: elevar os controles de ação (header e linhas de tabela/cards) para dimensões mais próximas do recomendado (~44px), reorganizando ações coladas (ex.: menu de ações em vez de 3 botões lado a lado) onde fizer sentido.
- Avaliar necessidade de navegação inferior (bottom navigation) para as ações mais usadas em mobile, dado que hoje toda navegação depende do header/hambúrguer no topo — decisão final deve ser validada no planejamento.

A escolha exata de padrões (biblioteca de componentes, se cards serão componentes novos ou reaproveitamento de `ExpensePanel.tsx` já existente como referência de padrão "lista tipo card") deve ser avaliada durante o planejamento.

## Escopo Funcional

### Dentro do escopo

- Adaptação responsiva do shell/navegação (header, MonthSelector, sidebar/drawer) para mobile.
- Lançamento de despesa/receita (ExpenseDialog e fluxos equivalentes) usável em tela pequena, sem overflow e com campos em 1 coluna.
- Consulta de saldo/resumo do mês (Dashboard) adaptado a telas estreitas, incluindo gráficos.
- Listagem de transações (Despesas, Receitas) em versão de cards responsivos, substituindo/complementando a tabela em telas pequenas.
- Tela de Relatórios também adaptada para cards responsivos em mobile.
- Diálogos secundários (ex.: `PaymentModal.tsx`) com grids que colapsam em 1 coluna.
- Ajuste de alvos de toque (botões de ação) para tamanho adequado ao toque nas telas e componentes acima.

### Fora do escopo inicial

- Alterações de backend/API (a menos que o planejamento identifique necessidade real, ex.: paginação para suportar cards mobile com carregamento incremental).
- Funcionalidades novas de PWA além de exibição responsiva (ex.: notificações push, sincronização offline, service worker avançado) — a menos que o usuário decida incluir depois.
- Redesign visual/branding fora do necessário para responsividade.
- Alteração de regras de negócio financeiras (cálculos, categorização, etc.).
- Publicação em lojas de app (Play Store/App Store) — o escopo é PWA via navegador/instalável, não empacotamento nativo.

## Requisitos de Frontend

- Introduzir breakpoints Tailwind adicionais (`sm:`, `md:`) onde necessário, além do `lg:` já usado para a sidebar, para adaptar conteúdo interno das telas.
- Criar/adaptar componentes de card responsivo para Despesas, Receitas e Relatórios, reaproveitando padrões já existentes no código quando possível (ex.: `src/screens/finance/ExpensePanel.tsx` já usa `<ul>`/cards em outro contexto e pode servir de referência).
- Refatorar `ExpenseDialog.tsx` e `PaymentModal.tsx` para que grids de múltiplas colunas colapsem em 1 coluna abaixo de um breakpoint definido, e substituir larguras fixas em `px` (ex. `width: 260` em `ExpenseDialog.tsx:721`) por unidades relativas/responsivas.
- Redesenhar `MonthSelector.tsx` para telas pequenas (abordagem a definir no planejamento: scroll horizontal com snap, select nativo, ou grid multi-linha).
- Ajustar dimensões de alvos de toque (`AppShell.tsx`, ações de linha em `DespesasScreen.tsx`) para próximo de 44px, reorganizando ações coladas quando necessário.
- Preservar o comportamento e a aparência em desktop — as mudanças devem ser aditivas via responsividade, não substituir a experiência desktop já validada.

## Requisitos de Backend

Sem impacto backend identificado inicialmente. Caso o planejamento decida por paginação/infinite scroll para as listas em cards mobile, isso pode exigir ajuste em endpoints existentes — a avaliar durante o planejamento.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

Não aplicável neste domínio — o "sistema financas" não é multi-tenant/multi-prefeitura (ver observação em Contexto sobre o `AGENT.md` genérico do projeto). Não há dados sensíveis adicionais expostos por esta mudança além dos já existentes na aplicação (dados financeiros do próprio usuário autenticado); nenhuma alteração de permissão ou visibilidade de dados está prevista.

## Requisitos de Migração ou Compatibilidade

- Nenhuma migração de dados é necessária.
- Compatibilidade com a experiência desktop atual deve ser preservada integralmente — as mudanças são responsivas (mobile-first como adição), não uma reescrita do layout desktop.
- Nomenclatura de código novo (componentes, props, arquivos) deve seguir inglês, conforme padrão de qualidade de código, mesmo que o restante do código-base atual use nomes em português (tratar como legado).

## Requisitos de Testes

### Frontend

- Testar manualmente em viewport de smartphone (320px, 375px, 414px) as telas: Dashboard, Despesas, Receitas, Relatórios, ExpenseDialog (novo/editar), PaymentModal.
- Verificar ausência de overflow horizontal não intencional em cada tela/diálogo listado.
- Verificar que os cards responsivos de Despesas/Receitas/Relatórios exibem os mesmos dados e ações que a tabela desktop (paridade funcional).
- Verificar alvos de toque nos novos componentes de ação (idealmente com ferramenta de auditoria de acessibilidade/Lighthouse mobile).

### Backend

Não aplicável inicialmente (sem mudança de backend prevista).

### E2E

- Avaliar durante o planejamento se fluxos críticos (criar despesa, marcar como paga, editar receita) merecem cobertura E2E em viewport mobile, caso já exista suíte E2E no projeto.

## Arquivos Provavelmente Afetados

### Frontend

- `src/layout/AppShell.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/relatorios/RelatoriosScreen.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/PaymentModal.tsx`
- `src/screens/finance/MonthSelector.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/ui/dialog.tsx`
- `src/ui/dialogFormTokens.tsx`
- Possivelmente novos componentes de card responsivo (ex.: `src/screens/despesas/DespesaCard.tsx`, `src/screens/receitas/ReceitaCard.tsx`, `src/screens/relatorios/RelatorioCard.tsx` ou nomes equivalentes a definir no planejamento)
- `tailwind.config.cjs` (caso novos breakpoints customizados sejam necessários)

### Backend

- Sem impacto identificado inicialmente. A identificar durante o planejamento caso paginação/infinite scroll seja adotada.

### Banco de Dados

- Sem impacto identificado.

## Critérios de Aceite

- Em viewports de 320px a 414px de largura, nenhuma das telas listadas (Dashboard, Despesas, Receitas, Relatórios, ExpenseDialog, PaymentModal) apresenta overflow horizontal não intencional.
- Despesas, Receitas e Relatórios exibem uma versão em cards empilhados em telas mobile, com paridade de dados e ações em relação à tabela desktop.
- `ExpenseDialog` e `PaymentModal` exibem campos em 1 coluna em telas mobile, sem campos cortados ou sobrepostos.
- `MonthSelector` é legível e tocável com precisão em telas de smartphone (texto do mês não é cortado, área de toque adequada).
- Botões de ação (header e linhas/cards de tabela) têm área de toque próxima de 44px ou reorganização (ex. menu de ações) que elimine o risco de toque acidental identificado.
- A experiência desktop existente permanece visualmente e funcionalmente equivalente à atual (sem regressão).
- Nomenclatura de componentes/arquivos novos está em inglês.

## Perguntas Para o Planejamento

- Qual o breakpoint exato a adotar para alternar tabela ↔ cards (ex.: `md`/768px) e ele deve ser único para as 3 telas (Despesas, Receitas, Relatórios) ou pode variar por tela conforme densidade de colunas?
- Existe já algum design/mockup do usuário para os cards mobile de Despesas/Receitas/Relatórios, ou o planejamento deve propor um layout de card baseado nos campos hoje exibidos nas tabelas?
- `MonthSelector` deve virar select nativo, scroll horizontal com snap, ou grid de 2-3 linhas? Há preferência de UX do usuário a coletar antes do plano final?
- Deve-se avaliar bottom navigation bar para mobile nesta task, ou isso fica para uma iteração futura (já que altera a arquitetura de navegação, não só responsividade de telas)?
- Existe suíte de testes E2E hoje no projeto (ex. Playwright/Cypress) que deveria cobrir os novos fluxos mobile, ou os testes serão só manuais nesta primeira entrega?
- As ações de linha na tabela desktop (Despesas: 3 botões colados) devem manter os mesmos 3 botões em mobile (só maiores) ou consolidar em um menu de ações (kebab menu) no card mobile?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `AGENT.md` e `CLAUDE.md` na raiz de `sistema financas/` antes de planejar.
- Desconsidere as seções de multi-tenant/RLS do `AGENT.md` do projeto — não se aplicam a este domínio (ver observação em Contexto).
- Inspecione os arquivos citados nesta task antes de escrever o plano, confirmando linhas e estrutura atual (podem ter mudado desde a análise original).
- Classifique a implementação como `frontend`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Gere um plano em `.plans/` (padrão deste projeto, conforme `CLAUDE.md`) com etapas pequenas, revisáveis e seguras, mantendo compatibilidade total com a experiência desktop existente.
- Sugira uma ordem de implementação incremental (ex.: shell/navegação → formulários/diálogos → tabelas em cards → refinamento de alvos de toque) para permitir revisão e aprovação por etapas, dado o escopo amplo desta task.
