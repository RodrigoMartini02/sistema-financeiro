# Plano de Implementação: Redesign completo do Painel Financeiro (mockup Fingerence v2)

## Origem

- Arquivo de especificação: design handoff em zip fornecido pelo usuário (`Redesign painel Fingerence.zip`, extraído de `sistema financas/`), contendo `design_handoff_painel_financeiro/README.md` e `Painel Fingerence.dc.html` (fonte de verdade pixel-perfect, HTML com estilos inline).
- Data do planejamento: 2026-08-17
- Classificação: `frontend-only`

## Resumo

Redesenho visual completo da tela **Painel** (`FinanceDashboard.tsx` e os componentes que ele usa) a partir de um novo mockup em alta fidelidade. Este é o **segundo** redesign do Painel em dois dias — já existem dois planos anteriores implementados (`redesenho-painel-financeiro-mockup.md` e `reescrever-painel-identico-mockup.md`, ambos de 2026-08-16), que deixaram o Painel estruturalmente parecido, mas o novo mockup exige mudanças que os planos anteriores não cobriam:

1. Migrar os 3 gráficos SVG artesanais (`AnnualTrendChart`, `DonutChart`, `MonthWaterfallChart`) para **Recharts** (`recharts@^3.9.1`, já instalado no projeto, não usado ainda em nenhum arquivo `.tsx`) — decisão oposta à do plano de ontem, que optou por manter SVG customizado.
2. Fundir o bloco "Suas metas do mês" (hoje dentro de `IncomeBalanceGuide.tsx`, linhas 241-296) com "Categorias do mês" (`MonthCategoriesOverview.tsx`) em uma única seção — hoje ainda coexistem como blocos separados mostrando a mesma distribuição duas vezes.
3. Refinar "Leitura das despesas" para deixar explícito que a faixa de referência é a "média das famílias brasileiras" (mercado), não uma meta definida pelo usuário — maior fonte de confusão do painel antigo segundo o handoff.
4. Aplicar fielmente todos os valores exatos de cor/tipografia/espaçamento/raio do novo mockup nas 6 seções, na ordem definida pelo usuário.

Segue a regra do projeto: **remover primeiro** toda a UI/HTML/CSS atual das seções afetadas (sem código morto/sobreposto), **depois aplicar** o novo design — duas etapas explícitas.

## Escopo

### Dentro do escopo

- `FinanceDashboard.tsx`: card "Saldo projetado + KPIs", seção "Análise de despesas" (6 cards), seção "Receitas × Despesas × Saldo — {ano}", seção "Cascata do mês".
- `src/screens/finance/charts/AnnualTrendChart.tsx`: reescrita completa usando Recharts `ComposedChart` (Bar receitas + Bar despesas + Line saldo acumulado + `ReferenceArea`/`ReferenceLine`).
- `src/screens/finance/charts/DonutChart.tsx`: reescrita completa usando Recharts `PieChart` + `Pie innerRadius` (usado 2x: receitas por origem, forma de pagamento).
- `src/screens/finance/charts/MonthWaterfallChart.tsx`: reescrita completa usando Recharts `BarChart` empilhado (série base transparente + série visível).
- `MonthCategoriesOverview.tsx`: reescrita da seção "Categorias do mês", agora absorvendo o bloco de metas removido de `IncomeBalanceGuide.tsx`.
- `IncomeBalanceGuide.tsx`: remoção do bloco "Suas metas do mês" (linhas 241-296); reescrita visual da seção "Leitura das despesas" (barra 20px, faixa de referência, resumo lateral com frase acionável).
- Estados de carregando/vazio/com-dados para cada bloco, com as mensagens exatas do `.dc.html`.
- Condicionais reais vindas dos dados (badge de alerta só com categorias fora da faixa; "Outros lançamentos" só se valor > 0; Categorias do mês só com categorias lançadas; Carteira de contratos só com contratos no mês; aviso de perfil empresa) — **não** replicar as props `sc-if`/`mostrarX` do mockup, que existem só para inspeção do protótipo.

### Fora do escopo

- Tela "Assistente Financeiro" (outro mockup no mesmo pacote zip) — fica para um plano futuro separado.
- `AppShell.tsx` (sidebar + topbar) — reaproveitado como está; o handoff documenta seus valores apenas como referência, não pede redesenho.
- `MetricCard.tsx`, `MonthSelector.tsx`, `MovementMetricCard.tsx` — confirmado via grep que são usados em `MovimentacoesScreen.tsx`, `ReceitasScreen.tsx` e `DespesasScreen.tsx`. Não fazem parte do fluxo atual do Painel e não serão tocados.
- `BudgetPanel.tsx` — não é importado por `FinanceDashboard.tsx`, fica fora.
- `src/ui/card.tsx`, `src/ui/badge.tsx`, `src/ui/button.tsx`, `src/ui/dialogFormTokens.tsx` — reaproveitados como estão (Card é usado como wrapper; a paleta de `dialogFormTokens` já é a mesma origem da paleta do mockup, mas é compartilhada com `ExpenseDialog`/`IncomeDialog`, fora de escopo — não será alterada).
- `formatters.ts` (`formatCurrency`, `formatDate`) e `MONTH_NAMES` — mantidos sem alteração.
- Qualquer endpoint, hook de dados, query key ou lógica de cálculo de negócio nova — os dados exibidos continuam vindo exatamente dos mesmos hooks/queries já existentes (`useFinanceDashboard`, `useBudgetOverview`, `queryKeys.dashboardAnual`, `queryKeys.contratosStatusFaturamento`, `queryKeys.parcelasFuturas`).
- Interatividade nova (filtros, drill-down, tooltips customizados além do que Recharts oferece por padrão) — o handoff pede explicitamente "sem interatividade nesta fase".
- Backend, banco de dados, infra/deploy.

## Leitura de contexto

- `/CLAUDE.md` (raiz do projeto `Particular`)
- `sistema financas/CLAUDE.md`
- `sistema financas/AGENT.md` (nota: é um template genérico de backend multi-tenant que não reflete a realidade deste projeto solo-dev sem multi-tenant; tratado como não aplicável a este redesign frontend-only)
- `design_handoff_painel_financeiro/README.md` (lido integralmente — especificação célula-por-célula de todas as 6 seções, paleta, tipografia, raios, sombras)
- `design_handoff_painel_financeiro/Painel Fingerence.dc.html` (lido integralmente — 820 linhas, HTML fonte com estilos inline, valores pixel-perfect e SVGs de referência dos gráficos)
- `design_handoff_painel_financeiro/github.md` (mapa tela → arquivos de origem)
- `src/screens/finance/FinanceDashboard.tsx` (levantamento via agente Explore — 653 linhas, estrutura/hooks/seções mapeados)
- `src/screens/finance/MonthCategoriesOverview.tsx` (lido integralmente)
- `src/screens/finance/IncomeBalanceGuide.tsx` (lido integralmente)
- `src/screens/finance/BudgetPanel.tsx`, `MetricCard.tsx`, `MonthSelector.tsx`, `MovementMetricCard.tsx`, `formatters.ts` (levantamento via agente Explore)
- `src/layout/AppShell.tsx`, `src/ui/card.tsx`, `src/ui/badge.tsx`, `src/ui/button.tsx`, `src/ui/dialogFormTokens.tsx`, `src/styles/globals.css`, `src/types/finance.ts` (levantamento via agente Explore)
- `package.json` (confirmado `recharts@^3.9.1` instalado, não importado em nenhum `.tsx` de `src/screens/finance/`)
- `.plans/redesenho-painel-financeiro-mockup.md` e `.plans/reescrever-painel-identico-mockup.md` (planos anteriores, 2026-08-16, já implementados — usados para entender o estado atual e evitar contradição de decisões, especialmente a confirmação de que `MetricCard.tsx` está em uso ativo fora do Painel)

## Impacto por área

### Frontend

- **Telas**: Painel financeiro (`FinanceDashboard.tsx`), único ponto de entrada.
- **Componentes reescritos**: `FinanceDashboard.tsx` (seções 1-4), `MonthCategoriesOverview.tsx` (seção 5, fundida com metas), `IncomeBalanceGuide.tsx` (seção 6, remove bloco de metas duplicado), `AnnualTrendChart.tsx`, `DonutChart.tsx`, `MonthWaterfallChart.tsx` (migração para Recharts).
- **Hooks/dados**: sem mudança. Continuam: `useAppContext`, `useFinanceDashboard`, `useFirstAccessGuide`, `useBudgetOverview`, `useQuery` direto para `dashboardAnual`/`contratosStatusFaturamento`/`parcelasFuturas`.
- **Nova dependência de import**: `recharts` (já no `package.json`, só precisa ser importado nos 3 arquivos de chart).
- **Estados de loading/error/empty**: preservados e ajustados para bater com as mensagens exatas do `.dc.html` em cada um dos 6 blocos.
- **Responsividade**: o mockup é fixo em 1440px; manter breakpoints responsivos already existentes (`sm:`, `lg:`, `xl:`) adaptando os valores do mockup, já que o app real precisa funcionar em telas menores.
- **Acessibilidade**: manter `role="img"`/`aria-label` equivalentes nos gráficos Recharts onde aplicável.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/MonthCategoriesOverview.tsx`
- `src/screens/finance/IncomeBalanceGuide.tsx`
- `src/screens/finance/charts/AnnualTrendChart.tsx`
- `src/screens/finance/charts/DonutChart.tsx`
- `src/screens/finance/charts/MonthWaterfallChart.tsx`

## Estratégia de implementação

Duas etapas explícitas, conforme regra do projeto (remoção completa antes de aplicar o novo código, sem sobreposição nem dead code):

**Etapa 1 — Remoção**
1. Em `FinanceDashboard.tsx`: remover o JSX/classes das seções "Saldo projetado + KPIs", "Análise de despesas" (6 cards), "Receitas × Despesas × Saldo — {ano}" e "Cascata do mês", junto com os `useMemo`/cálculos locais que existem só para alimentar esse visual antigo (`chartData`, `catData`, `origemData`, `formaData`, `perfilDesp`, `waterfallSteps`, etc. — revalidar quais continuam necessários para o novo visual antes de remover).
2. Deletar o conteúdo SVG artesanal de `AnnualTrendChart.tsx`, `DonutChart.tsx`, `MonthWaterfallChart.tsx` (mantendo os arquivos, que serão reescritos na Etapa 2 — ou apagando e recriando, a decidir na implementação).
3. Em `IncomeBalanceGuide.tsx`: remover o bloco "Suas metas do mês" (linhas 241-296) e o JSX antigo da seção "Comparação por categoria"/"Resumo do período", mantendo os hooks e cálculos de dados (`useBudgetOverview`, `activeGroups`, `classifiedTotal`, `incomeCommitment`, `alertCount`, `goalItems` — revalidar quais continuam necessários).
4. Em `MonthCategoriesOverview.tsx`: remover o JSX antigo da lista de categorias, mantendo os cálculos (`items`, `total`, `acimaCount`, `semMetaCount`, `noLimiteCount`, `max`) que já batem conceitualmente com o que o novo design pede.
5. Grep para confirmar que nenhum outro arquivo importa os 3 charts antes de finalizar a remoção do conteúdo.

**Etapa 2 — Aplicação**
6. Reescrever `AnnualTrendChart.tsx` com `ComposedChart`: `<Bar>` receitas (`#10b981`, 20px, raio 3px), `<Bar>` despesas (`#ef4444`, lado a lado), `<Line>` saldo acumulado (`#6366f1`, 2.5px, pontos raio 4 com miolo branco, ponto do mês selecionado raio 5 preenchido), `<ReferenceArea>` para mês selecionado (`#e6f7fa`) e meses futuros sem lançamento (`#f8fafb` + texto "ainda sem lançamentos"), trecho de projeção do mês seguinte com `stroke-dasharray` e opacidade 0.55. Eixo Y "R$ Xk", grid `#eef4f7`. Rodapé com "Melhor mês", "Maior gasto", "Saldo acumulado até {mês}".
7. Reescrever `DonutChart.tsx` com `PieChart` + `Pie innerRadius` (aro de 20px, 132px total), reutilizável para os 2 usos (receitas por origem: verde/cinza; forma de pagamento: `#0891b2 #10b981 #f59e0b #6366f1`), com texto central "TOTAL"/"PAGO" + valor, e legenda lateral com bolinha + nome + % + valor.
8. Reescrever `MonthWaterfallChart.tsx` com `BarChart` empilhado (série base `fill="transparent"` + série visível), degraus: Saldo anterior (`#cbd5e1`) → Receitas (`#10b981`) → um degrau vermelho (`#ef4444`) por categoria grande, maior→menor → "Outras N" (`#f87171`) → Saldo final (`#0891b2`); barras de 78px, raio 3px, conectores tracejados `#cbd5e1` entre topos; **validar matematicamente que os degraus somam exatamente o saldo final**.
9. Reescrever o card "Saldo projetado + KPIs" em `FinanceDashboard.tsx`: bloco esquerdo 336px (saldo em 40px/700, `#067647`/`#b42318` conforme sinal) + grid 4 KPIs à direita (saldo anterior, receitas, despesas, comprometimento com medidor de 3 faixas e marcador) + rodapé com barras receitas/despesas pagas + "Você gastou X% do que entrou".
10. Reescrever a seção "Análise de despesas" (6 cards, grid 3 colunas): Juros×Descontos (estado vazio padrão), Perfil das despesas (barra fixas/variáveis + pills OPEX/CAPEX), Parcelas futuras (lista + total comprometido), Saúde financeira (3 barras recebidas/pagas/pendentes), Receitas por origem (DonutChart), Forma de pagamento (DonutChart).
11. Reescrever `MonthCategoriesOverview.tsx` como a seção fundida "Categorias do mês": uma linha por categoria (nome 112px + barra flex:1 24px + valor 96px + status 152px), cor por status (over `#ef4444`, attention ≥95% `#f59e0b`, dentro `#0891b2`), marca de limite na posição `meta/maiorGasto*100%` (some quando sem meta), ordenação por valor decrescente, categorias sem meta continuam visíveis (comportamento já presente hoje — `items.filter(item => item.projectedAmount > 0)`, não filtra por ter meta), 3 pills contadoras, legenda, rodapé com nota sobre Configurações › Metas.
12. Reescrever "Leitura das despesas" em `IncomeBalanceGuide.tsx`: 3 indicadores com borda esquerda de 3px, barra de 20px com faixa de referência atrás (`#e9f1f5` + bordas tracejadas `#a9c2ce`) e valor real em 10px sólido na frente, texto explícito "média das famílias brasileiras"/"referência de mercado, não uma meta definida por você" na legenda e em cada linha, resumo lateral (236px) com frase acionável de corte sugerido.
13. Rodar `npx tsc --noEmit` e `npx vite build` dentro de `sistema financas/`.
14. Validar visualmente no navegador (`npm run dev` local) comparando cada seção contra o `.dc.html`/`.html` do mockup: mês com dados completos, mês vazio/sem lançamentos, perfil empresa (sem metas/"Leitura das despesas"), tema claro (mockup não define dark — manter pares `dark:` já existentes sem inventar valores novos).

## Regras de negócio identificadas

- Perfil "empresa" não tem metas de orçamento nem "Leitura das despesas" — comportamento atual preservado (`IncomeBalanceGuide` já trata isso, `MonthCategoriesOverview` retorna `null` para perfil empresa).
- Cascata do mês: os degraus precisam somar exatamente o saldo final — regra de validação explícita do handoff, a checar no cálculo antes de renderizar.
- Categorias do mês: sem meta não devem desaparecer da lista (confirmado que já é o comportamento atual, não é mudança).
- "Outros lançamentos" só aparece se `overview.unclassifiedProjectedTotal > 0` (já implementado em `IncomeBalanceGuide.tsx`, manter).
- Carteira de contratos só aparece se houver contratos no mês (já implementado em `FinanceDashboard.tsx`, manter).
- A faixa de referência em "Leitura das despesas" é média de mercado (famílias brasileiras), não meta do usuário — distinção que precisa ficar textualmente explícita (legenda + texto de apoio + cada linha), não é uma regra de cálculo nova, é clareza de comunicação.

## Regras multi-tenant e segurança

Não aplicável — projeto solo-dev sem multi-tenant/RLS (apesar do `AGENT.md` genérico mencionar isso, não reflete a realidade deste projeto). Não há mudança de backend, endpoint ou exposição de dado novo; os dados exibidos continuam vindo dos mesmos hooks/queries já existentes, sem alteração de origem ou filtro.

## Validações necessárias

Nenhuma validação de formulário nova — este plano é redesenho de visualização de dados já existentes, sem novos inputs.

## Testes necessários

### Frontend

- Verificação visual manual, seção por seção, comparando com `Painel Fingerence.html`/`.dc.html`: saldo projetado + KPIs, análise de despesas (6 cards), gráfico anual (Recharts), cascata do mês (Recharts), categorias do mês fundida, leitura das despesas.
- Testar com dados variados: mês zerado/sem lançamentos, mês com pico isolado em uma categoria, mês cheio (múltiplas categorias, contratos, parcelas futuras).
- Testar perfil empresa (sem metas, aviso de visão indisponível para "Leitura das despesas").
- Testar responsividade em telas menores que 1440px (mockup é fixo, app precisa continuar funcional).
- Confirmar que a cascata do mês soma exatamente ao saldo final em pelo menos 2 cenários de dados diferentes.
- Confirmar que `MovimentacoesScreen.tsx`, `ReceitasScreen.tsx`, `DespesasScreen.tsx` continuam funcionando normalmente (não usam nada removido/alterado deste plano).

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

- **Volume grande de mudança visual** em arquivos centrais do Painel (3 componentes reescritos + 3 gráficos recriados do zero) — risco de regressão em estados de borda (vazio, erro, perfil empresa) hoje já tratados corretamente.
- **Migração para Recharts é reescrita completa**, não adaptação incremental — os 3 gráficos atuais são SVG artesanal sem relação estrutural com componentes Recharts; qualquer comportamento fino do SVG atual (proporções exatas, posicionamento) precisa ser revalidado do zero contra o `.dc.html`.
- **Cascata do mês**: risco de erro de arredondamento/ordenação fazendo os degraus não somarem exatamente o saldo final — validar com테스트 de dados reais antes de considerar pronto.
- **Fusão de "metas do mês" + "categorias do mês"**: muda onde o usuário encontra essa informação (duas seções viram uma) — sem mudança de dado, só de local/apresentação; testar que nenhuma informação existente hoje (ex. "Restam R$ X"/"acima da meta" de `goalItems`) se perde silenciosamente na fusão.
- **Paleta hex hardcoded**: o projeto não centraliza a paleta usada no Painel em um único arquivo de tokens (mesmo `dialogFormTokens.tsx` existindo para outro propósito) — os novos valores hex precisarão ser aplicados diretamente via Tailwind arbitrário (`text-[#0f2b38]`), repetindo o padrão já usado hoje, para não introduzir um refactor de tokens fora de escopo.
- **Dois planos anteriores no mesmo diretório com nomes parecidos** (`redesenho-painel-financeiro-mockup.md`, `reescrever-painel-identico-mockup.md`) — já implementados; este plano os substitui/superset para as seções listadas, mas não os invalida retroativamente (documentam decisões históricas válidas, como o uso confirmado de `MetricCard` fora do Painel).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — escopo, migração para Recharts, e exclusão de `MetricCard`/`MonthSelector`/`MovementMetricCard`/`AppShell` do escopo já foram confirmados explicitamente com o usuário durante o planejamento.

## Critérios de aceite do plano

- As 6 seções do Painel (na ordem definida: Saldo projetado + KPIs, Análise de despesas, Receitas×Despesas×Saldo, Cascata do mês, Categorias do mês, Leitura das despesas) refletem fielmente cores, tipografia, espaçamento e raios do `Painel Fingerence.dc.html`.
- Os 3 gráficos (`AnnualTrendChart`, `DonutChart`, `MonthWaterfallChart`) usam Recharts, não SVG artesanal.
- "Suas metas do mês" não existe mais como bloco separado — está fundida em "Categorias do mês".
- "Leitura das despesas" deixa explícito textualmente que a faixa é referência de mercado, não meta do usuário.
- Cascata do mês soma exatamente o saldo final em todos os cenários testados.
- Categorias sem meta continuam visíveis na lista.
- Nenhum dado exibido é inventado — tudo vem de hooks/queries já existentes.
- `npx tsc --noEmit` e `npx vite build` passam sem erros.
- Nenhum import ou código órfão do SVG artesanal antigo permanece após a Etapa 1.
- `MetricCard.tsx`, `MonthSelector.tsx`, `MovementMetricCard.tsx`, `AppShell.tsx`, `BudgetPanel.tsx` permanecem intocados e funcionando normalmente nas telas que os usam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com a leitura **integral** de `design_handoff_painel_financeiro/README.md` e `Painel Fingerence.dc.html` durante a implementação de cada seção — não resumir de memória, há dezenas de valores exatos (cores hex, tamanhos de fonte, espaçamentos, proporções de SVG) que precisam ser reproduzidos fielmente.
- Seguir rigorosamente as duas etapas (remoção completa → aplicação do novo design) antes de codar qualquer linha nova.
- Não tocar em `AppShell.tsx`, `MetricCard.tsx`, `MonthSelector.tsx`, `MovementMetricCard.tsx`, `BudgetPanel.tsx`, `dialogFormTokens.tsx`.
- Não remover a seção "Suas metas do mês" antes de confirmar que toda informação relevante dela (ex. "Restam R$ X"/"acima da meta") está coberta pela nova "Categorias do mês" fundida.
- Não replicar as props `sc-if`/`mostrarResumo`/`mostrarMetas`/`mostrarVazios` do mockup — são só para inspeção do protótipo; as condicionais reais vêm dos dados.
- Ao finalizar a implementação local, seguir o fluxo padrão do projeto (`/finalizar`): commit + push + perguntar sobre merge em main (sem PR, direto — projeto solo-dev).
