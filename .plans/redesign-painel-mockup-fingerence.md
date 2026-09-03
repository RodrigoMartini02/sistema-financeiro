# Plano de Implementação: Redesign completo do Painel Financeiro (mockup Fingerence)

## Origem

- Arquivo de especificação: design handoff em `sistema financas/Redesign painel Fingerence.zip`, extraído para `design_handoff_painel_financeiro/`, contendo `README.md` (especificação célula-por-célula de todas as 6 seções, paleta, tipografia, raios, sombras) e `Painel Fingerence.dc.html` (fonte HTML com estilos inline, pixel-perfect, incluindo SVGs de referência dos gráficos).
- Data do planejamento: `2026-08-17`
- Classificação: `frontend-only`

## Resumo

Redesenho visual completo da tela **Painel** (`FinanceDashboard.tsx` e os componentes que ele usa) do sistema Fingerence (perfil pessoal), a partir de um mockup em alta fidelidade construído sobre os tokens reais do próprio repositório. O redesenho resolve quatro problemas do painel antigo identificados no handoff: (1) densidade visual excessiva com pouca hierarquia; (2) dados repetidos em blocos diferentes ("Suas metas do mês" × "Despesas por categoria"); (3) falta de um gráfico explicando como o saldo do mês se formou; (4) ambiguidade sobre se a faixa de comparação em "Leitura das despesas" é meta do usuário ou média de mercado.

**Nota de contexto (transparência):** ao investigar o projeto antes de planejar, constatei que este mesmo redesign já foi implementado no working tree atual (mudanças não commitadas nos mesmos 6 arquivos listados abaixo — `git diff --stat` mostra 335 inserções / 354 remoções) e que `npx tsc --noEmit` já passa limpo nesse estado. Existe inclusive um plano anterior com escopo idêntico (`.plans/redesign-painel-mockup-fingerence-v2.md`, não commitado) documentando esse trabalho. Este plano foi solicitado para ser tratado como implementação do zero, então as etapas abaixo assumem que as seções serão (re)construídas a partir do zero — mas, na prática, ao rodar `/implementar`, é esperado que boa parte do trabalho técnico já esteja presente no working tree, e a etapa se concentre em **validar fidelidade ao mockup e corrigir divergências**, não em reescrever do zero.

## Escopo

### Dentro do escopo

- `FinanceDashboard.tsx`: card "Saldo projetado + KPIs", seção "Análise de despesas" (6 cards), seção "Receitas × Despesas × Saldo — {ano}", seção "Cascata do mês".
- `src/screens/finance/charts/AnnualTrendChart.tsx`: reescrita usando Recharts `ComposedChart` (Bar receitas + Bar despesas + Line saldo acumulado + `ReferenceArea`/`ReferenceLine`).
- `src/screens/finance/charts/DonutChart.tsx`: reescrita usando Recharts `PieChart` + `Pie innerRadius` (reutilizado em receitas por origem e forma de pagamento).
- `src/screens/finance/charts/MonthWaterfallChart.tsx`: reescrita usando Recharts `BarChart` empilhado (série base transparente + série visível).
- `MonthCategoriesOverview.tsx`: reescrita da seção "Categorias do mês", absorvendo o bloco de metas removido de `IncomeBalanceGuide.tsx`.
- `IncomeBalanceGuide.tsx`: remoção do bloco "Suas metas do mês"; reescrita visual da seção "Leitura das despesas" (barra 20px, faixa de referência com bordas tracejadas, resumo lateral com frase acionável).
- Estados de carregando/vazio/com-dados para cada bloco, com as mensagens exatas do `.dc.html`.
- Condicionais reais vindas dos dados (badge de alerta só com categorias fora da faixa; "Outros lançamentos" só se valor > 0; Categorias do mês só com categorias lançadas; Carteira de contratos só com contratos no mês; aviso de perfil empresa) — **não** replicar as props `sc-if`/`mostrarX` do mockup, que existem só para inspeção do protótipo.

### Fora do escopo

- Tela "Assistente Financeiro" (outro mockup no mesmo pacote zip) — fica para um plano futuro separado.
- `AppShell.tsx` (sidebar + topbar) — reaproveitado como está; o handoff documenta seus valores apenas como referência, não pede redesenho.
- `MetricCard.tsx`, `MonthSelector.tsx`, `MovementMetricCard.tsx` — usados em `MovimentacoesScreen.tsx`, `ReceitasScreen.tsx` e `DespesasScreen.tsx`, fora do fluxo do Painel.
- `BudgetPanel.tsx` — não é importado por `FinanceDashboard.tsx`, fica fora.
- `src/ui/card.tsx`, `src/ui/badge.tsx`, `src/ui/button.tsx`, `src/ui/dialogFormTokens.tsx` — reaproveitados como estão.
- `formatters.ts` (`formatCurrency`, `formatDate`) e `MONTH_NAMES` — mantidos sem alteração.
- Qualquer endpoint, hook de dados, query key ou lógica de cálculo de negócio nova — os dados exibidos continuam vindo exatamente dos mesmos hooks/queries já existentes (`useFinanceDashboard`, `useBudgetOverview`, `queryKeys.dashboardAnual`, `queryKeys.contratosStatusFaturamento`, `queryKeys.parcelasFuturas`).
- Interatividade nova (filtros, drill-down, tooltips customizados além do padrão do Recharts) — o handoff pede explicitamente "sem interatividade nesta fase".
- Backend, banco de dados, infra/deploy.

## Leitura de contexto

- `/CLAUDE.md` (raiz do projeto `Particular`) — sequência obrigatória `/planejar → aprovação → /implementar → /finalizar`.
- `sistema financas/CLAUDE.md` — confirma stack (React + TypeScript + Vite + Tailwind / Express + PostgreSQL) e a mesma regra de autorização.
- `/AGENT.md` (raiz) — lido; é um template genérico de backend multi-tenant/prefeitura que **não se aplica** a este projeto solo-dev sem multi-tenant, e este plano é frontend-only. Tratado como não aplicável.
- `design_handoff_painel_financeiro/README.md` (lido integralmente) — especificação célula-por-célula das 6 seções, paleta, tipografia, raios, sombras.
- `design_handoff_painel_financeiro/github.md` — mapa tela → arquivos de origem do repositório.
- `src/screens/finance/FinanceDashboard.tsx` (lido integralmente, 684 linhas).
- `src/screens/finance/MonthCategoriesOverview.tsx`, `IncomeBalanceGuide.tsx` (lidos integralmente).
- `src/screens/finance/charts/AnnualTrendChart.tsx`, `DonutChart.tsx`, `MonthWaterfallChart.tsx` (lidos integralmente).
- `src/screens/finance/BudgetPanel.tsx`, `MetricCard.tsx`, `MonthSelector.tsx`, `formatters.ts` (lidos integralmente).
- `.plans/dashboard-redesign-painel-gestao.md` e `.plans/redesign-painel-mockup-fingerence-v2.md` (planos anteriores relacionados — usados para entender decisões já tomadas, como a confirmação de que `MetricCard` está em uso ativo fora do Painel).
- `git status` / `git diff --stat` / `git log` — usados para verificar o estado atual do working tree e histórico de commits relacionados.
- `npx tsc --noEmit` — executado, sem erros no estado atual.

## Impacto por área

### Frontend

- **Telas**: Painel financeiro (`FinanceDashboard.tsx`), único ponto de entrada.
- **Componentes reescritos**: `FinanceDashboard.tsx` (seções 1-4), `MonthCategoriesOverview.tsx` (seção 5, fundida com metas), `IncomeBalanceGuide.tsx` (seção 6), `AnnualTrendChart.tsx`, `DonutChart.tsx`, `MonthWaterfallChart.tsx` (migração para Recharts).
- **Hooks/dados**: sem mudança. Continuam: `useAppContext`, `useFinanceDashboard`, `useFirstAccessGuide`, `useBudgetOverview`, `useQuery` direto para `dashboardAnual`/`contratosStatusFaturamento`/`parcelasFuturas`.
- **Nova dependência de import**: `recharts` (já presente no `package.json`), importado nos 3 arquivos de chart.
- **Estados de loading/error/empty**: preservados e ajustados para bater com as mensagens exatas do `.dc.html` em cada um dos 6 blocos.
- **Responsividade**: o mockup é fixo em 1440px; manter breakpoints responsivos já existentes (`sm:`, `lg:`, `xl:`) adaptando os valores do mockup, já que o app real precisa funcionar em telas menores.
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

**Etapa 0 — Reconciliação com o estado atual**
0. Antes de remover/reescrever qualquer coisa, revisar o `git diff` atual dos 6 arquivos afetados linha a linha contra o `.dc.html`/`README.md`, já que o working tree pode já conter total ou parcialmente o redesign. Tratar divergências encontradas como o escopo real de trabalho, evitando reescrever trechos que já batem fielmente com o mockup.

**Etapa 1 — Remoção**
1. Em `FinanceDashboard.tsx`: remover o JSX/classes das seções "Saldo projetado + KPIs", "Análise de despesas" (6 cards), "Receitas × Despesas × Saldo — {ano}" e "Cascata do mês" que não estejam fiéis ao mockup, junto com `useMemo`/cálculos locais que existiam só para o visual antigo — revalidando quais cálculos continuam necessários antes de remover.
2. Nos 3 arquivos de chart: remover conteúdo SVG artesanal remanescente (se houver) que não seja Recharts.
3. Em `IncomeBalanceGuide.tsx`: confirmar que o bloco "Suas metas do mês" não existe mais como seção separada.
4. Em `MonthCategoriesOverview.tsx`: remover JSX antigo divergente do mockup, mantendo cálculos (`items`, `total`, `acimaCount`, `semMetaCount`, `noLimiteCount`, `max`) que já batem conceitualmente com o novo design.
5. Grep para confirmar que nenhum outro arquivo importa os 3 charts de forma incompatível com a reescrita.

**Etapa 2 — Aplicação**
6. `AnnualTrendChart.tsx` com `ComposedChart`: `<Bar>` receitas (`#10b981`, 20px, raio 3px), `<Bar>` despesas (`#ef4444`, lado a lado), `<Line>` saldo acumulado (`#6366f1`, 2.5px, pontos raio 4 com miolo branco, ponto do mês selecionado raio 5 preenchido), `<ReferenceArea>` para mês selecionado (`#e6f7fa`) e meses futuros sem lançamento (`#f8fafb` + texto "ainda sem lançamentos"), trecho de projeção do mês seguinte com `stroke-dasharray` e opacidade 0.55. Eixo Y "R$ Xk", grid `#eef4f7`. Rodapé com "Melhor mês", "Maior gasto", "Saldo acumulado até {mês}".
7. `DonutChart.tsx` com `PieChart` + `Pie innerRadius` (aro de 20px, 132px total), reutilizável para os 2 usos (receitas por origem: verde/cinza; forma de pagamento: `#0891b2 #10b981 #f59e0b #6366f1`), texto central "TOTAL"/"PAGO" + valor, legenda lateral com bolinha + nome + % + valor.
8. `MonthWaterfallChart.tsx` com `BarChart` empilhado (série base `fill="transparent"` + série visível), degraus: Saldo anterior (`#cbd5e1`) → Receitas (`#10b981`) → um degrau vermelho (`#ef4444`) por categoria grande, maior→menor → "Outras N" (`#f87171`) → Saldo final (`#0891b2`); barras de 78px, raio 3px, conectores tracejados `#cbd5e1` entre topos; **validar matematicamente que os degraus somam exatamente o saldo final**.
9. Card "Saldo projetado + KPIs" em `FinanceDashboard.tsx`: bloco esquerdo 336px (saldo em 40px/700, `#067647`/`#b42318` conforme sinal) + grid 4 KPIs à direita (saldo anterior, receitas, despesas, comprometimento com medidor de 3 faixas e marcador) + rodapé com barras receitas/despesas pagas + "Você gastou X% do que entrou".
10. Seção "Análise de despesas" (6 cards, grid 3 colunas): Juros×Descontos (estado vazio padrão), Perfil das despesas (barra fixas/variáveis + pills OPEX/CAPEX), Parcelas futuras (lista + total comprometido), Saúde financeira (3 barras recebidas/pagas/pendentes), Receitas por origem (DonutChart), Forma de pagamento (DonutChart).
11. `MonthCategoriesOverview.tsx` como seção fundida "Categorias do mês": uma linha por categoria (nome 112px + barra flex:1 24px + valor 96px + status 152px), cor por status (over `#ef4444`, attention ≥95% `#f59e0b`, dentro `#0891b2`), marca do limite na posição `meta/maiorGasto*100%` (some quando sem meta), ordenação por valor decrescente, categorias sem meta continuam visíveis, 3 pills contadoras, legenda, rodapé com nota sobre Configurações › Metas.
12. "Leitura das despesas" em `IncomeBalanceGuide.tsx`: 3 indicadores com borda esquerda de 3px, barra de 20px com faixa de referência atrás (`#e9f1f5` + bordas tracejadas `#a9c2ce`) e valor real em 10px sólido na frente, texto explícito "média das famílias brasileiras"/"referência de mercado, não uma meta definida por você" na legenda e em cada linha, resumo lateral (236px) com frase acionável de corte sugerido.
13. Rodar `npx tsc --noEmit` e `npx vite build` dentro de `sistema financas/`.
14. Validar visualmente no navegador (`npm run dev` local) comparando cada seção contra o `.dc.html`/`.html` do mockup: mês com dados completos, mês vazio/sem lançamentos, perfil empresa (sem metas/"Leitura das despesas"), tema claro (mockup não define dark — manter pares `dark:` já existentes sem inventar valores novos).

## Regras de negócio identificadas

- Perfil "empresa" não tem metas de orçamento nem "Leitura das despesas" — comportamento a preservar (`IncomeBalanceGuide` já trata isso, `MonthCategoriesOverview` retorna `null` para perfil empresa).
- Cascata do mês: os degraus precisam somar exatamente o saldo final — regra de validação explícita do handoff, a checar no cálculo antes de renderizar.
- Categorias do mês: sem meta não devem desaparecer da lista.
- "Outros lançamentos" só aparece se `overview.unclassifiedProjectedTotal > 0`.
- Carteira de contratos só aparece se houver contratos no mês.
- A faixa de referência em "Leitura das despesas" é média de mercado (famílias brasileiras), não meta do usuário — distinção que precisa ficar textualmente explícita (legenda + texto de apoio + cada linha).
- Variação % vs mês anterior: alta em despesa é ruim (`#fef3f2`/`#b42318`); alta em receita é boa (`#ecfdf3`/`#067647`) — a semântica se inverte entre receita e despesa.

## Regras multi-tenant e segurança

Não aplicável — projeto solo-dev sem multi-tenant/RLS. Não há mudança de backend, endpoint ou exposição de dado novo; os dados exibidos continuam vindo dos mesmos hooks/queries já existentes, sem alteração de origem ou filtro.

## Validações necessárias

Nenhuma validação de formulário nova — este plano é redesenho de visualização de dados já existentes, sem novos inputs.

## Testes necessários

### Frontend

- Verificação visual manual, seção por seção, comparando com `Painel Fingerence.html`/`.dc.html`: saldo projetado + KPIs, análise de despesas (6 cards), gráfico anual (Recharts), cascata do mês (Recharts), categorias do mês fundida, leitura das despesas.
- Testar com dados variados: mês zerado/sem lançamentos, mês com pico isolado em uma categoria, mês cheio (múltiplas categorias, contratos, parcelas futuras).
- Testar perfil empresa (sem metas, aviso de visão indisponível para "Leitura das despesas").
- Testar responsividade em telas menores que 1440px.
- Confirmar que a cascata do mês soma exatamente ao saldo final em pelo menos 2 cenários de dados diferentes.
- Confirmar que `MovimentacoesScreen.tsx`, `ReceitasScreen.tsx`, `DespesasScreen.tsx` continuam funcionando normalmente.

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

- **Working tree já contém mudanças não commitadas nos mesmos 6 arquivos** (confirmado via `git diff --stat`: 335 inserções / 354 remoções) — a skill `/implementar` vai operar sobre esse estado, não sobre um estado limpo; risco de tratar como "já pronto" sem validar fidelidade real ao mockup, ou de reescrever desnecessariamente trechos que já estão corretos.
- **Volume grande de mudança visual** em arquivos centrais do Painel — risco de regressão em estados de borda (vazio, erro, perfil empresa) hoje já tratados corretamente.
- **Cascata do mês**: risco de erro de arredondamento/ordenação fazendo os degraus não somarem exatamente o saldo final.
- **Fusão de "metas do mês" + "categorias do mês"**: risco de perder silenciosamente informação existente hoje (ex. "Restam R$ X"/"acima da meta").
- **Paleta hex hardcoded**: o projeto não centraliza a paleta do Painel em um único arquivo de tokens — os valores hex são aplicados diretamente via Tailwind arbitrário, repetindo o padrão já usado hoje.
- **Working tree já tem uma versão anterior do redesign nos mesmos arquivos**: maior risco de sobreposição/duplicação de código nesta implementação específica — reescrever "em cima" do estado atual sem remover trechos antigos pode deixar cálculos duplicados, JSX morto ou duas versões do mesmo gráfico coexistindo. Exige checagem deliberada de cada arquivo antes de considerar a seção pronta.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — escopo, ordem das 6 seções e exclusão de `MetricCard`/`MonthSelector`/`MovementMetricCard`/`AppShell`/`BudgetPanel` do escopo já foram confirmados.

## Critérios de aceite do plano

- As 6 seções do Painel (na ordem: Saldo projetado + KPIs, Análise de despesas, Receitas×Despesas×Saldo, Cascata do mês, Categorias do mês, Leitura das despesas) refletem fielmente cores, tipografia, espaçamento e raios do `Painel Fingerence.dc.html`.
- Os 3 gráficos (`AnnualTrendChart`, `DonutChart`, `MonthWaterfallChart`) usam Recharts, não SVG artesanal.
- "Suas metas do mês" não existe mais como bloco separado — está fundida em "Categorias do mês".
- "Leitura das despesas" deixa explícito textualmente que a faixa é referência de mercado, não meta do usuário.
- Cascata do mês soma exatamente o saldo final em todos os cenários testados.
- Categorias sem meta continuam visíveis na lista.
- Nenhum dado exibido é inventado — tudo vem de hooks/queries já existentes.
- `npx tsc --noEmit` e `npx vite build` passam sem erros.
- Nenhum import ou código órfão do SVG artesanal antigo permanece.
- `MetricCard.tsx`, `MonthSelector.tsx`, `MovementMetricCard.tsx`, `AppShell.tsx`, `BudgetPanel.tsx` permanecem intocados e funcionando normalmente.
- Não existe nenhum resquício de código do redesign anterior: sem função/componente duplicado fazendo o que o novo já faz, sem trecho comentado "por segurança", sem versão antiga de um cálculo coexistindo com a nova, sem prop/variável que ficou sem uso depois da fusão de seções.
- Não há duas implementações da mesma seção ou do mesmo gráfico coexistindo (ex.: SVG artesanal antigo e Recharts novo lado a lado, ainda que um esteja com `display:none` ou fora do JSX renderizado).

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com a leitura **integral** de `design_handoff_painel_financeiro/README.md` e `Painel Fingerence.dc.html` durante a implementação de cada seção.
- **Antes de reescrever qualquer arquivo, rodar `git diff` nos 6 arquivos afetados** — o working tree já pode conter total ou parcialmente este redesign (ver Etapa 0). Comparar o estado atual contra o mockup seção por seção e tratar divergências reais como escopo de trabalho, evitando reescrever código que já está fiel.
- Seguir as duas etapas (remoção → aplicação) apenas para as divergências encontradas, não como reescrita cega de arquivos já corretos.
- **Sem sobreposição de código, nunca**: ao aplicar o novo design, remover completamente o que está sendo substituído antes de escrever a nova versão — não deixar a versão antiga comentada, "guardada" atrás de uma condição sempre falsa, ou coexistindo com a nova (dois cálculos do mesmo valor, dois componentes de gráfico para a mesma seção, dois blocos JSX para a mesma informação). Isso vale mesmo quando o trecho antigo "parece" já bater com o mockup — decidir explicitamente manter ou remover, nunca deixar os dois por precaução.
- **Sem duplicação**: se uma lógica (cálculo, formatação, validação de estado vazio) já existe em outro ponto do arquivo ou em um arquivo irmão dentro do escopo, reaproveitar em vez de reescrever uma segunda vez com nome diferente.
- Antes de dar a implementação por concluída, revisar cada um dos 6 arquivos afetados procurando especificamente por: imports não usados, variáveis/funções declaradas e não referenciadas, blocos JSX comentados, e qualquer trecho que faça a mesma coisa que outro trecho no mesmo arquivo.
- Não tocar em `AppShell.tsx`, `MetricCard.tsx`, `MonthSelector.tsx`, `MovementMetricCard.tsx`, `BudgetPanel.tsx`, `dialogFormTokens.tsx`.
- Não remover a seção "Suas metas do mês" antes de confirmar que toda informação relevante dela está coberta pela "Categorias do mês" fundida.
- Não replicar as props `sc-if`/`mostrarResumo`/`mostrarMetas`/`mostrarVazios` do mockup — são só para inspeção do protótipo.
- Não alterar `.env`, não executar migrations, não fazer commit.
- Ao finalizar a implementação local, seguir o fluxo padrão do projeto (`/finalizar`): commit + push + perguntar sobre merge em main (sem PR, direto — projeto solo-dev).
