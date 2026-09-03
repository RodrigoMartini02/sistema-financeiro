# Plano de Implementação: Corrigir scroll horizontal na página inteira (mobile)

## Origem

- Arquivo de especificação: conversa direta com o usuário (bug relatado após uso do app mobile)
- Data do planejamento: `2026-08-08`
- Classificação: `frontend-only`

## Resumo

O usuário reportou que, em mobile, a "parte interna" do sistema não fica travada na tela como um app — aparece scroll horizontal na página inteira, obrigando a arrastar para o lado para ver o conteúdo. Investigação (feita antes deste plano) identificou a causa raiz: o `MonthSelector` (usado no topo do Painel, Despesas e Receitas) tem um container `flex-1` com `overflow-x-auto` mas sem `min-w-0`. Em Flexbox, um item sem `min-w-0` tenta caber seu conteúdo mínimo (as 12 pills de mês) antes de permitir que o `overflow-x-auto` corte o excesso — isso empurra a largura de todos os containers pais (card → `<main>` → página), fazendo a tela inteira "deslizar" em vez de conter o scroll apenas dentro do seletor de mês.

Além da correção pontual, o usuário aprovou adicionar uma camada de proteção estrutural (`overflow-x-hidden`) para que vazamentos de largura semelhantes, se surgirem no futuro em qualquer outro componente, fiquem contidos e não voltem a mover a página inteira.

## Escopo

### Dentro do escopo

- Corrigir o `MonthSelector` para que o `overflow-x-auto` das pills de mês funcione corretamente (não vaze largura para os containers pais).
- Adicionar `overflow-x: hidden`/`overflow-x-hidden` como rede de segurança em `html`/`body` (via `globals.css`) e no container raiz + `<main>` do `AppShell.tsx`.

### Fora do escopo

- Qualquer mudança visual ou de comportamento do `MonthSelector` além da correção de overflow (o scroll com snap continua existindo, só passa a ficar contido).
- Revisão de outros componentes além dos já identificados na investigação (tabelas, dialogs, cards já foram verificados e descartados como causa).
- Mudanças de UX/layout não relacionadas ao bug de scroll horizontal.

## Leitura de contexto

- `AGENT.md` e `CLAUDE.md` da raiz de `sistema financas/` (seção multi-tenant/RLS não aplicável a este domínio, conforme já registrado nos planos anteriores desta série)
- `src/screens/finance/MonthSelector.tsx` (lido integralmente)
- `src/layout/AppShell.tsx` (trecho do container raiz e `<main>` lido, L414-478)
- `src/styles/globals.css` (lido, confirmada ausência de regra `overflow-x` em `html`/`body`)
- Investigação prévia (subagente de exploração) descartou como causa: tabelas desktop com `min-w-[540px]` (corretamente escondidas via `hidden md:block`), grids de `ExpenseDialog`/`IncomeDialog`/`Dialog`, cards mobile (`ExpenseCard`/`IncomeCard`/`ReportCard`), `ResponsiveContainer` do Recharts, usos de `100vw` (todos calculados com `min()`), e elementos `position: absolute/fixed` (todos em páginas públicas de marketing, fora do app autenticado, com `overflow-hidden` no pai).

## Impacto por área

### Frontend

- `src/screens/finance/MonthSelector.tsx:39`: adicionar `min-w-0` à classe do container `flex flex-1 gap-1 overflow-x-auto snap-x snap-mandatory sm:overflow-visible scrollbar-none`, resultando em algo como `flex min-w-0 flex-1 gap-1 overflow-x-auto ...`. Isso não altera nenhum comportamento visual do componente (as pills continuam com scroll+snap em mobile e `flex-1` em desktop) — apenas corrige a mecânica de overflow do Flexbox.
- `src/styles/globals.css`: adicionar regra para `html, body { overflow-x: hidden; }` (ou `overflow-x: clip` se houver preferência por não criar um novo contexto de scroll — a decidir na implementação com base em compatibilidade). Aplicar apenas no eixo X para não interferir no scroll vertical normal da página.
- `src/layout/AppShell.tsx`: adicionar `overflow-x-hidden` ao container raiz (`L415`, `<div className="min-h-screen ...">`) e ao `<main>` (`L475`). Atenção: o header (`L429`) usa `position: sticky top-0` — `overflow-x-hidden` no eixo X isoladamente não deve quebrar `sticky` no eixo Y, mas isso deve ser validado visualmente após a mudança (o sticky do header precisa continuar funcionando ao rolar a página verticalmente).

Sem impacto em hooks de dados, query keys, ou lógica de negócio — mudança é puramente estrutural/CSS.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/MonthSelector.tsx`
- `src/styles/globals.css`
- `src/layout/AppShell.tsx`

## Estratégia de implementação

1. Corrigir `MonthSelector.tsx:39` adicionando `min-w-0` à classe do container das pills.
2. Adicionar regra `overflow-x: hidden` (eixo X apenas) em `html, body` no `globals.css`.
3. Adicionar `overflow-x-hidden` no container raiz (`min-h-screen`) e no `<main>` do `AppShell.tsx`.
4. Validar visualmente (via `npm run dev` + DevTools mobile, viewports 320-414px) que:
   - A página não desliza mais horizontalmente em nenhuma tela (Painel, Despesas, Receitas, Relatórios).
   - O `MonthSelector` continua com scroll horizontal interno + snap funcionando normalmente.
   - O header sticky continua colado no topo ao rolar a página verticalmente.
5. Rodar `npm run build` para confirmar ausência de erros de TypeScript.

## Regras de negócio identificadas

Nenhuma — correção é puramente estrutural/CSS, sem alteração de regras de negócio.

## Regras multi-tenant e segurança

Não aplicável — mudança isolada de CSS/layout, sem leitura/escrita de dados sensíveis ou lógica de permissão.

## Validações necessárias

Nenhuma validação de schema/input é alterada.

## Testes necessários

### Frontend

- Testar manualmente em viewport de 320px, 375px, 414px: confirmar ausência de scroll horizontal na página inteira em Painel, Despesas, Receitas e Relatórios.
- Confirmar que o `MonthSelector` mantém o scroll horizontal interno com snap funcionando (não regrediu para "sem scroll e cortado", nem "vazando de novo").
- Confirmar que o header sticky (`AppShell.tsx`) continua fixo no topo ao rolar a página verticalmente, em mobile e desktop.
- Confirmar que a experiência desktop (≥1024px) permanece idêntica à atual.

### Backend

Não aplicável.

### E2E

Não aplicável — sem suíte de testes automatizados configurada no projeto.

## Comandos de validação sugeridos

```bash
npm run build
```

## Riscos e pontos de atenção

- **Risco baixo na correção do `MonthSelector`**: `min-w-0` é uma correção padrão e amplamente usada para esse exato problema de Flexbox — não deve ter efeito colateral visual.
- **Risco médio-baixo no `overflow-x-hidden` global**: aplicar `overflow-x: hidden` em `html`/`body` é seguro na grande maioria dos casos, mas é importante garantir que a regra afete apenas o eixo X (não usar `overflow: hidden` sem o `-x`), para não quebrar o scroll vertical da página nem qualquer comportamento de `position: sticky` no eixo Y. Deve ser validado visualmente após implementação, especialmente o header sticky do `AppShell`.
- Essa camada de proteção é uma "rede de segurança", não substitui a correção da causa raiz — por isso ambas as partes entram no mesmo plano.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Em viewports de 320-414px, nenhuma tela do app autenticado (Painel, Despesas, Receitas, Relatórios) apresenta scroll horizontal na página inteira.
- O `MonthSelector` mantém seu comportamento de scroll horizontal interno com snap, contido dentro do próprio componente.
- O header sticky continua funcionando normalmente em mobile e desktop.
- A experiência desktop permanece visualmente e funcionalmente idêntica à atual.
- `npm run build` passa sem erros de TypeScript.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `AGENT.md`/`CLAUDE.md` da raiz de `sistema financas/`, desconsiderando as seções multi-tenant/RLS.
- Mudança pequena e focada — não expandir escopo para outros componentes além dos 3 arquivos listados.
- Criar branch de feature nova (`fix/R/scroll-horizontal-mobile` ou equivalente), já que a branch anterior já foi mergeada em `main`.
- Validar visualmente o header sticky após adicionar `overflow-x-hidden` — é o ponto de maior atenção deste plano.
- Não executar migrations (não aplicável).
