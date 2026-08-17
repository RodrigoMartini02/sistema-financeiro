# Plano de Implementação: Reescrever Painel Financeiro para bater com o mockup

## Origem

- Arquivo de especificação: mockup HTML fornecido pelo usuário no chat ("Painel Fingerence.html")
- Data do planejamento: 2026-08-16
- Classificação: `frontend-only`

## Resumo

O Painel financeiro atual implementa a estrutura certa (seções, dados, componentes), mas diverge visualmente do mockup em vários pontos: cabeçalho diferente (título + botão "Atualizar" em vez de título + subtítulo dinâmico + "Atualizado há X min"), seletor de mês duplicado dentro do conteúdo (o header global do `AppShell` já tem o seletor certo), e classes Tailwind aproximadas em vez dos valores exatos de px/cor hex do mockup em várias seções. Esta reescrita trata o HTML do mockup como fonte de verdade para todo valor visual, seção por seção.

## Escopo

### Dentro do escopo

- **Cabeçalho do conteúdo**: substituir título "Painel financeiro" + botão "Atualizar" por título "Painel financeiro" + subtítulo dinâmico ("{Mês} de {Ano} · perfil {pessoal|empresa} · N lançamentos no período") + "Atualizado há X min" alinhado à direita, conforme mockup.
- Remover o `<MonthSelector />` (fileira de 12 botões) do conteúdo do Painel — o `PeriodSelector` do header global do `AppShell.tsx` já é o seletor compacto "◀ Maio 2026 ▶" idêntico ao mockup.
- Remover o botão "Atualizar" (`RefreshCw` + `handleRefresh`) — não existe no mockup; dados já são reativos via React Query.
- **`FinanceDashboard.tsx`**: reescrever classes de cada seção usando valores exatos do mockup (font-size, largura, cor hex, padding, border-radius) via classes Tailwind arbitrárias (`w-[336px]`, `text-[40px]`, `text-[#067647]`, etc.) onde o valor não tiver equivalente exato no padrão Tailwind do projeto.
- **`IncomeBalanceGuide.tsx`**, **`MonthCategoriesOverview.tsx`**, **`AnnualTrendChart.tsx`**, **`MonthWaterfallChart.tsx`**: ajustar valores visuais (cores, tamanhos, espaçamento) para bater com o mockup, mantendo a lógica de dados/props exatamente como está.
- Adicionar ao `AnnualTrendChart.tsx` a legenda "Previsto" (linha tracejada) e a barra de mês futuro pontilhada, presentes no mockup e ausentes hoje.

### Fora do escopo

- `AppShell.tsx` / `PeriodSelector` — já batem com o mockup, não serão tocados.
- `MonthSelector.tsx` — continua existindo para uso em Relatórios/Movimentações, só deixa de ser chamado dentro do Painel.
- Qualquer mudança de dados, queries, hooks, backend.
- Tema escuro (dark mode) — o mockup não define paleta dark; manter os pares `dark:` já existentes nos componentes sem tentar adivinhar valores novos.

## Leitura de contexto

- `/CLAUDE.md` (raiz do projeto)
- `src/screens/finance/FinanceDashboard.tsx` (lido integralmente)
- `src/screens/finance/IncomeBalanceGuide.tsx` (lido integralmente)
- `src/screens/finance/MonthCategoriesOverview.tsx` (lido integralmente)
- `src/screens/finance/charts/AnnualTrendChart.tsx` (lido integralmente)
- `src/screens/finance/charts/MonthWaterfallChart.tsx` (lido integralmente)
- `src/screens/finance/MonthSelector.tsx` (lido integralmente)
- `src/layout/AppShell.tsx` (header + `PeriodSelector` lidos)
- `src/ui/card.tsx` (componente `Card` base)
- Mockup completo fornecido pelo usuário ("Painel Fingerence.html") — usado como fonte de verdade para todos os valores visuais, confirmado visualmente pelo usuário via print do mockup aberto no navegador

## Impacto por área

### Frontend

- Telas: Painel financeiro (`FinanceDashboard.tsx`), acessado via `App.tsx` → `case 'painel'`.
- Componentes reescritos visualmente: `FinanceDashboard.tsx`, `IncomeBalanceGuide.tsx`, `MonthCategoriesOverview.tsx`, `AnnualTrendChart.tsx`, `MonthWaterfallChart.tsx`.
- Sem mudança de hooks, query keys, ou estados de loading/error/empty — só a camada visual.
- Sem mudança de acessibilidade (mantém `role="img"`, `aria-label` já existentes nos SVGs).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/IncomeBalanceGuide.tsx`
- `src/screens/finance/MonthCategoriesOverview.tsx`
- `src/screens/finance/charts/AnnualTrendChart.tsx`
- `src/screens/finance/charts/MonthWaterfallChart.tsx`

## Estratégia de implementação

1. Reescrever o cabeçalho do `FinanceDashboard.tsx`: remover botão Atualizar + `MonthSelector` interno; adicionar subtítulo dinâmico e "Atualizado há X min".
2. Reescrever o card "Resumo consolidado" (Saldo projetado + KPIs + barra de comparação) com valores exatos do mockup.
3. Reescrever a seção "Análise de despesas" (3 cards: Juros×Descontos, Perfil das despesas, Parcelas futuras) com valores exatos.
4. Reescrever `AnnualTrendChart.tsx`: adicionar legenda/linha "Previsto", ajustar cores/tamanhos de texto do SVG para bater com o mockup.
5. Reescrever `MonthWaterfallChart.tsx`: ajustar cores/tamanhos conforme mockup.
6. Reescrever `MonthCategoriesOverview.tsx`: ajustar cores/tamanhos conforme mockup.
7. Reescrever as seções "Despesas por categoria / Receitas por origem" e "Saúde financeira / Forma de pagamento" com valores exatos.
8. Reescrever `IncomeBalanceGuide.tsx` (Leitura das despesas) com valores exatos, mantendo posição no final (já corrigida em commit anterior).
9. Rodar `npx tsc --noEmit` e `npx vite build`.
10. Pedir ao usuário para validar visualmente no navegador (local) contra o mockup antes de finalizar.

## Regras de negócio identificadas

Nenhuma — mudança puramente visual/estilística.

## Regras multi-tenant e segurança

Não aplicável — componentes já consomem dados via hooks/queries existentes, sem alteração de acesso a dados.

## Validações necessárias

Nenhuma validação de formulário nova.

## Testes necessários

### Frontend

- Verificação visual manual, seção por seção, comparando com o mockup: header, resumo consolidado, análise de despesas, gráfico anual, cascata, categorias do mês, despesas por categoria/receitas por origem, saúde financeira/forma de pagamento, leitura das despesas.
- Testar com dados variados (mês zerado, mês com pico isolado, mês cheio) para garantir que o layout não quebra.
- Testar em telas menores (responsividade) já que o mockup é fixo em 1440px mas o app precisa funcionar em telas menores.

### Backend

Sem impacto esperado.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- **Risco de regressão em responsividade**: o mockup é uma captura fixa em 1440px de largura; o app real precisa continuar funcional em telas menores. Manter breakpoints responsivos (`sm:`, `lg:`, `xl:`) ao aplicar os valores do mockup, adaptando quando necessário.
- Escopo grande (5 arquivos, muitas seções) — risco de introduzir divergência sutil em algum card se cada seção não for validada individualmente contra o HTML do mockup.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Cabeçalho do Painel bate com o mockup (título + subtítulo dinâmico + "Atualizado há X min", sem botão Atualizar, sem seletor de mês duplicado).
- Todas as seções (resumo consolidado, análise de despesas, gráfico anual com legenda Previsto, cascata, categorias do mês, despesas por categoria/receitas por origem, saúde financeira/forma de pagamento, leitura das despesas) usam os valores visuais exatos do mockup.
- `npx tsc --noEmit` e `npx vite build` passam sem erros.
- Nenhuma mudança de dados, hooks ou backend.

## Observações para a skill implementar

- Usar este plano e o mockup HTML original (já compartilhado no chat) como fontes principais de contexto.
- Comparar cada seção individualmente contra o trecho correspondente do mockup antes de considerar concluída — não assumir que a estrutura JSX bater é suficiente, os valores de CSS (px, cor hex, largura) precisam bater também.
- Ao finalizar localmente, perguntar ao usuário se deseja enviar para produção, seguindo o fluxo padrão do projeto (`/finalizar`).
