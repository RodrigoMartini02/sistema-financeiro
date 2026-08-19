# Painel financeiro: panorama completo com filtro de período próprio

## Contexto

Hoje o Painel financeiro (`FinanceDashboard.tsx`) é filtrado por um mês/ano
controlado por um seletor global no cabeçalho (`AppShell.tsx` → `PeriodSelector`,
alimentado por `AppContext`). Esse seletor global também é usado por
Movimentações, Receitas, Despesas e Notificações.

O usuário quer que o Painel deixe de depender desse seletor global e passe a
mostrar a real situação financeira dele — histórico completo, não só um mês —
com filtros de período próprios, dentro da própria tela do Painel.

## Objetivo

1. Remover o seletor de mês/ano do cabeçalho (`AppShell.tsx`). Cada tela que
   ainda precisar de filtro de período (Movimentações, Receitas, Despesas,
   Notificações) passa a ter seu próprio controle de período embutido na tela,
   já que hoje dependem 100% do contexto global para funcionar.
2. O Painel ganha um filtro de período próprio, no topo da tela, com suporte a:
   - Ano específico
   - Mês específico (dentro de um ano)
   - Intervalo "de → até" (dois seletores mês/ano)
   - "Todo o período" (todos os lançamentos, desde o primeiro registro)
3. Ao abrir o Painel pela primeira vez, o filtro padrão é **o ano corrente**.
   O usuário pode trocar livremente para outro ano, um mês específico, um
   intervalo, ou "todo o período".
4. Os gráficos e cards existentes no Painel devem continuar funcionando sob
   esse novo filtro flexível. Onde um gráfico atual não fizer sentido para um
   período multi-ano ou "todo o período" (ex: gráfico mensal de 12 barras não
   cobre 5 anos de dados), ele deve ser ajustado ou substituído por uma
   visualização adequada ao período selecionado. Está liberado criar
   visualizações novas quando fizer sentido para mostrar estatísticas do
   período (ex: totais consolidados, comparação ano a ano, evolução de saldo
   acumulado ao longo de vários anos).
5. O usuário deve conseguir entender, olhando o Painel, sua situação
   financeira real: quanto entrou, quanto saiu, saldo acumulado, quantos
   lançamentos existem, até quando os dados vão, tendência dos últimos meses,
   e compromissos futuros (parcelas/contratos previstos) — tudo relativo ao
   período que ele escolheu filtrar.

## Estado atual (para referência)

- `AppContext` guarda `month`/`year` globais, usados por: `FinanceDashboard`,
  `MovimentacoesScreen`, `ReceitasScreen`, `DespesasScreen`,
  `NotificationPanel` (dentro de `AppShell`), `FinancialAssistant`.
- `PeriodSelector` (dentro de `AppShell.tsx`) é o único ponto que expõe
  `setMonth`/`setYear` no cabeçalho.
- Backend: `GET /api/financial/anual?ano=` retorna os 12 meses agregados de
  um único ano (receitas/despesas/saldo por mês). Não existe endpoint para
  intervalo multi-ano ou "desde o início".
- Frontend: `fetchDashboardAnual(ano)` em `financeService.ts` consome esse
  endpoint. `FinanceDashboard.tsx` já busca esse dado anual mas hoje só usa
  para alimentar o `AnnualTrendChart` (12 barras) e calcular deltas mês a mês.
- Gráficos existentes no Painel: `AnnualTrendChart` (barras + linha, 12
  meses de um ano), `DonutChart` (categoria/origem/forma de pagamento do
  mês), `MonthWaterfallChart` (cascata do mês).

## Fora de escopo

- Não alterar `sistema financas` fora do Painel/filtros de período descritos
  acima, exceto o necessário para cada tela (Movimentações, Receitas,
  Despesas, Notificações) ganhar seu próprio filtro de período quando o
  seletor global for removido.
- Não mexer no projeto `escalacao futebol`.
