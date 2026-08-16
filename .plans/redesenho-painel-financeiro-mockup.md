# Plano de Implementação: Redesenho do Painel Financeiro

## Origem

- Arquivo de especificação: mockup HTML fornecido pelo usuário diretamente no chat (não persistido como `.md` de feature)
- Data do planejamento: 2026-08-16
- Classificação: `frontend-only`

## Resumo

Redesenho visual completo do Painel financeiro (`FinanceDashboard.tsx`, `IncomeBalanceGuide.tsx`, `BudgetPanel.tsx`) a partir de um mockup fornecido pelo usuário, mantendo a identidade visual já usada no restante do app (navy `#0D2E3C` + teal `#0EC4D8`, cards brancos com borda `#e6eef3`, radius 16px, tipografia Instrument Sans). A sidebar/header (`AppShell.tsx`) fica fora do escopo — já bate com o mockup e o usuário confirmou que não muda.

Todos os dados necessários já existem via endpoints e hooks atuais (`useFinanceDashboard`, `fetchDashboardAnual`, `fetchBudgetOverview`) — não há necessidade de endpoint novo, incluindo a seção "Cascata do mês", que é composição no frontend de dados já buscados.

## Escopo

### Dentro do escopo

- Substituir os 5 `MetricCard`s do topo do painel por um card de resumo consolidado (saldo projetado em destaque + métricas + barra comparativa receitas/despesas)
- Restyle dos 3 cards de "Análise de despesas" (Juros×Descontos, Perfil das despesas, Parcelas futuras)
- Trocar todos os gráficos Recharts por SVG customizado fiel ao mockup:
  - Gráfico anual "Receitas × Despesas × Saldo" (AreaChart → barras + linha em SVG)
  - "Despesas por categoria" (BarChart → barras horizontais SVG)
  - "Receitas por origem" e "Forma de pagamento" (PieChart → donut SVG)
  - Perda de tooltip interativo assumida conscientemente pelo usuário
- Nova seção "Cascata do mês" (waterfall: saldo anterior → receitas → despesas por categoria → saldo final), composta a partir de dados já buscados (`data.balance` + despesas agrupadas por categoria), sem endpoint novo
- Restyle da seção "Categorias do mês" (hoje em `BudgetPanel.tsx`): barras horizontais com linha de meta sobreposta, badges de contagem (acima do limite / no limite / sem meta)
- Restyle do bloco "Leitura das despesas" (`IncomeBalanceGuide.tsx`): cards com borda esquerda colorida, mesma estrutura de dados atual
- Trabalho em duas etapas explícitas: remoção de código/estilo antigo (sem sobreposição, sem dead code) primeiro, aplicação do novo design depois

### Fora do escopo

- `AppShell.tsx` (sidebar, header, navegação) — confirmado pelo usuário que não muda
- Qualquer endpoint novo no backend
- `ExpenseDialog.tsx` / modais de despesa e receita (redesenho separado, já registrado para o futuro)
- Telas de Movimentações, Relatórios, Reservas
- Deletar `MetricCard.tsx` — ainda usado em `MovimentacoesScreen.tsx`, só deixa de ser importado no painel

## Leitura de contexto

- `/CLAUDE.md` (raiz do projeto)
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/IncomeBalanceGuide.tsx`
- `src/screens/finance/BudgetPanel.tsx`
- `src/screens/finance/MetricCard.tsx`
- `src/layout/AppShell.tsx`
- `src/types/budget.ts`
- `src/services/financeService.ts` (`fetchDashboardAnual`, `RawBalance`, `fetchParcelasFuturas`)
- `backend/src/routes/financial.ts` (confirmação de que `/financial/anual` já supre os dados necessários)
- Mockup HTML completo fornecido pelo usuário nesta conversa

## Impacto por área

### Frontend

- Reescrita visual de `FinanceDashboard.tsx`: novo card de resumo consolidado, 3 cards de análise restilizados, cascata nova, gráficos SVG customizados
- Reescrita visual de `IncomeBalanceGuide.tsx`: mesma estrutura de dados (`BudgetOverview`, `referenceGroups`, `items`), novo layout de cards com borda lateral colorida
- Reescrita visual de `BudgetPanel.tsx`: barras horizontais com linha de meta sobreposta em vez do formato atual de badge+texto
- `MetricCard.tsx` permanece no código (uso ativo em `MovimentacoesScreen.tsx`), só deixa de ser importado em `FinanceDashboard.tsx`
- Possível novo componente/arquivo para a lógica e SVG da "Cascata do mês" (decisão de estrutura durante a implementação)
- Sem novas query keys — reaproveita `queryKeys.dashboardAnual`, `queryKeys.budgetOverview` e o hook `useFinanceDashboard` já existentes
- Estados de loading/error/empty preservados, seguindo o mesmo padrão já usado nos componentes atuais
- Sem novos formulários ou inputs — é redesenho de visualização, não de interação

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: este plano não autoriza executar migrations automaticamente. O ambiente atual pode estar apontando para produção — qualquer migration futura exige confirmação explícita do usuário.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/IncomeBalanceGuide.tsx`
- `src/screens/finance/BudgetPanel.tsx`
- `src/screens/finance/MetricCard.tsx` (import removido do painel, arquivo mantido — ainda usado em `MovimentacoesScreen.tsx`)
- Possível novo arquivo para a "Cascata do mês" (ex.: `src/screens/finance/WaterfallChart.tsx` ou lógica inline em `FinanceDashboard.tsx`, a decidir na implementação)

## Estratégia de implementação

Duas etapas explícitas, por pedido do usuário (remoção completa antes de aplicar o novo código, sem sobreposição nem dead code):

**Etapa 1 — Remoção**
1. Auditar `FinanceDashboard.tsx`, `IncomeBalanceGuide.tsx` e `BudgetPanel.tsx` para mapear tudo que será substituído (pode usar `/limpar` como apoio)
2. Remover imports e uso do Recharts (`BarChart`, `AreaChart`, `PieChart`, `Cell`, `Tooltip`, `Legend`, `ReferenceLine`, etc.) e o array `CORES` se não for reaproveitado
3. Remover o bloco dos 5 `MetricCard`s de `FinanceDashboard.tsx` (sem deletar `MetricCard.tsx`)
4. Remover classes Tailwind e estruturas JSX que ficarem órfãs junto com os blocos removidos

**Etapa 2 — Aplicação**
5. Implementar o card de resumo consolidado
6. Implementar os 3 cards de "Análise de despesas" restilizados
7. Implementar os gráficos SVG customizados (anual, categorias, origem, forma de pagamento)
8. Implementar a "Cascata do mês" (lógica de agregação a partir de dados já buscados + SVG)
9. Restilizar `BudgetPanel.tsx` (categorias + metas, barra com linha de meta sobreposta)
10. Restilizar `IncomeBalanceGuide.tsx` (cards com borda lateral colorida)
11. Rodar `npx vite build` e `npx tsc --noEmit`
12. Testar visualmente em `localhost:5173`: mês com dados, mês vazio, perfil empresa, tema claro/escuro

## Regras de negócio identificadas

- Perfil "empresa" não tem metas de orçamento nem "Leitura das despesas" — comportamento atual preservado, sem alteração de regra
- Referências de "faixa esperada" (percentual médio de famílias brasileiras) vêm de `budgetReference.ts` — não mexer na lógica de cálculo, só no visual de apresentação
- Metas de categoria (`BudgetOverviewItem.targetAmount`/`targetValue`) só existem no perfil pessoal, regra já implementada e mantida

## Regras multi-tenant e segurança

Não aplicável neste plano — não há mudança de backend nem exposição de dado novo. Os dados exibidos continuam vindo dos mesmos endpoints já filtrados por `perfil_id` (`getActiveProfileId()`), sem alteração na origem ou no filtro dos dados.

## Validações necessárias

Nenhuma validação de formulário nova — este plano não introduz inputs novos, é redesenho de visualização de dados já existentes.

## Testes necessários

### Frontend

- Verificação visual manual: mês com dados completos, mês sem lançamentos, perfil empresa (sem metas/"Leitura das despesas"), tema claro e escuro
- Confirmar que `MovimentacoesScreen.tsx` continua funcionando normalmente após a remoção do uso de `MetricCard` no painel (o componente em si não pode ser deletado)

### Backend

Sem impacto esperado.

### E2E

Não aplicável inicialmente.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Perda de interatividade: SVG estático substitui os tooltips do Recharts ao passar o mouse — risco assumido conscientemente pelo usuário
- "Cascata do mês" é lógica de agregação nova (mesmo sem endpoint novo) — risco de erro na ordenação/cálculo dos cortes por categoria; testar com dados reais variados antes de considerar pronto
- Volume da mudança: reescreve praticamente 3 arquivos inteiros — risco de regressão visual em estados de borda (vazio, erro, perfil empresa) que hoje já são tratados
- `MetricCard.tsx` não pode ser deletado — uso ativo confirmado em `MovimentacoesScreen.tsx`

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- O painel financeiro reflete fielmente a estrutura visual do mockup (cores, radius, tipografia, layout)
- Nenhum dado exibido é inventado — tudo vem de queries/hooks já existentes
- A "Cascata do mês" calcula corretamente a partir de dados reais do período selecionado
- `MovimentacoesScreen.tsx` continua funcionando normalmente após a mudança
- Build (`npx vite build`) e typecheck (`npx tsc --noEmit`) passam sem erros
- Nenhum código ou import do Recharts permanece órfão após a Etapa 1 de remoção

## Observações para a skill implementar

- Seguir rigorosamente as duas etapas (remoção completa → aplicação do novo design) antes de codar qualquer linha nova, conforme pedido explícito do usuário
- Não tocar em `AppShell.tsx` (sidebar, header, navegação)
- Não deletar `MetricCard.tsx` — está em uso ativo em `MovimentacoesScreen.tsx`
- Usar este plano como fonte principal de contexto, junto com o mockup HTML já discutido na conversa que originou este plano
- Ao finalizar a implementação local, perguntar ao usuário se deseja enviar para produção, seguindo o fluxo padrão do projeto (`/finalizar`)
