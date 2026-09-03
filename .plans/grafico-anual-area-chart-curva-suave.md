# Plano de Implementação: Gráfico Anual do Painel — AreaChart com curva suave

## Origem

- Arquivo de especificação: pedido direto do usuário no chat, após ver o gráfico atual e pedir para restaurar um estilo visual anterior ("linhas suaves, sem colunas, ponto de 0 central")
- Data do planejamento: 2026-08-18
- Classificação: `frontend-only`

## Resumo

O gráfico anual do Painel usa hoje `Bar` (colunas) + `Line` (linha reta com segmentos sólido/tracejado) via Recharts `ComposedChart`. Antes de um redesenho anterior (commit `8357442`), o gráfico era um `AreaChart` do Recharts com três `<Area type="monotone">` sobrepostas (Receitas, Despesas, Saldo), cada uma com gradiente de preenchimento e curva suave nativa — sem barras. O usuário confirmou que esse é o estilo que prefere. Este plano reverte o componente para esse estilo, preservando os comportamentos que a versão atual adicionou depois (destaque do mês ativo, indicação de meses sem lançamento, segmento de previsão tracejado, domínio Y para saldo negativo), adaptados ao formato de `AreaChart`.

## Escopo

### Dentro do escopo

- Reescrever `src/screens/finance/charts/AnnualTrendChart.tsx`: `AreaChart` com 3 `<Area type="monotone">` (Receitas verde `#10b981`, Despesas vermelho `#ef4444`, Saldo roxo `#6366f1`), cada uma com `<linearGradient>` de preenchimento
- Adaptar destaque do mês ativo (hoje via `ReferenceArea` + tick customizado no XAxis) para o novo chart
- Adaptar `ReferenceArea` "ainda sem lançamentos" para meses futuros sem dado
- Adaptar segmento de saldo previsto (tracejado, opacidade reduzida) — hoje feito com duas `<Line>` (`saldoSolido`/`saldoPrevisto`); recriar equivalente com duas `<Area>` de saldo (sólida até o mês corrente, tracejada depois)
- Manter `domain` do YAxis ajustado dinamicamente para acomodar saldo negativo (`ReferenceLine y={0}` quando aplicável)
- Manter a prop interface (`data`, `activeIndex`) sem alteração — zero mudança necessária em `FinanceDashboard.tsx` além da renderização em si

### Fora do escopo

- Highlights (Melhor mês / Maior gasto / Saldo acumulado) — decisão do usuário: manter como está
- Legenda customizada em HTML acima do gráfico — decisão do usuário: manter como está
- Qualquer outro gráfico do painel (`DonutChart`, `MonthWaterfallChart`, `CategoryBarChart` etc.)
- Dados/agregação (`chartData`, `fetchDashboardAnual`, backend)
- Tooltip customizado (não existe hoje no componente atual; não será adicionado nesta mudança, a menos que seja necessário para não regredir UX — ver riscos)

## Leitura de contexto

- `/AGENT.md` (raiz) — lido. É focado em backend/multi-tenant/PostgreSQL/Drizzle; não há seção de frontend. Sem impacto aplicável a esta mudança frontend-only.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` como arquivos separados neste projeto — a estrutura é `src/` (frontend) e `backend/` na raiz, com `AGENT.md` único cobrindo regras gerais (majoritariamente backend).
- `src/screens/finance/charts/AnnualTrendChart.tsx` (lido integralmente — versão atual)
- `src/screens/finance/FinanceDashboard.tsx` (lido — cálculo de `chartData`, `anualHighlights`, uso do componente, legenda e highlights)
- Histórico git: `git show 8357442~1:src/screens/finance/FinanceDashboard.tsx` (versão original AreaChart), commits `ccdcdc3`/`64427c9` (tentativa e reversão de curva suave só na linha, sem sucesso — feature abandonada na época)

## Impacto por área

### Frontend

- `src/screens/finance/charts/AnnualTrendChart.tsx`: reescrita completa do JSX interno (troca `ComposedChart`/`Bar`/`Line` por `AreaChart`/`Area`/`linearGradient`), mantendo a mesma interface de props
- `src/screens/finance/FinanceDashboard.tsx`: nenhuma mudança esperada — o componente é consumido via `<AnnualTrendChart data={chartData} activeIndex={month} />`, que não muda
- Sem impacto em hooks, query keys, formulários, estados de loading/error (o `isLoading` já é tratado no componente pai, fora do gráfico)
- Testar visualmente em tema claro e escuro (o projeto usa Tailwind `dark:`)

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/charts/AnnualTrendChart.tsx` (único arquivo com mudança de código)

## Estratégia de implementação

1. Ler a versão original (`git show 8357442~1:...FinanceDashboard.tsx`) como referência de estilo (gradientes, `CartesianGrid`, cores)
2. Definir os 3 `<linearGradient>` (Receitas, Despesas, Saldo) com os mesmos stops de opacidade da versão original (5%/95%, opacidade inicial ~0.15–0.25 fade para 0)
3. Substituir `<Bar dataKey="receitas">`/`<Bar dataKey="despesas">` por `<Area type="monotone" dataKey="receitas" .../>` e `<Area type="monotone" dataKey="despesas" .../>`
4. Substituir as duas `<Line>` de saldo (`saldoSolido`/`saldoPrevisto`) por duas `<Area>` equivalentes, mantendo a mesma lógica de `chartData` (`saldoSolido`/`saldoPrevisto`) já calculada no componente — sem alterar essa lógica de derivação de dados, só a renderização
5. Adaptar o destaque do mês ativo: reavaliar se `ReferenceArea` (faixa de fundo) continua funcionando visualmente bem sobre áreas preenchidas (pode precisar de opacidade ajustada para não conflitar com o gradiente); manter o tick customizado do XAxis
6. Adaptar a `ReferenceArea` cinza "ainda sem lançamentos" da mesma forma
7. Manter `YAxis domain={yDomain}` com o cálculo atual (já contempla saldo negativo) e `ReferenceLine y={0}` condicional
8. Rodar `npx tsc --noEmit` e `npx vite build` na raiz do projeto (`sistema financas`)
9. Testar visualmente: ano com poucos meses preenchidos (cenário do print original do usuário), ano completo, tema claro e escuro, mês ativo no meio do ano e no último mês com dado

## Regras de negócio identificadas

Nenhuma — mudança puramente visual, sem regra de negócio associada. A lógica de `saldoSolido`/`saldoPrevisto`/`hasEmptyRange` já existente é reaproveitada sem alteração de comportamento.

## Regras multi-tenant e segurança

Não aplicável — mudança isolada de renderização no frontend, sem leitura/escrita de dados sensíveis, sem novo endpoint.

## Validações necessárias

Nenhuma validação de formulário nova.

## Testes necessários

### Frontend

- Verificação visual manual: gráfico com poucos meses preenchidos (2-3 meses com valor, resto vazio) — cenário que motivou a `ReferenceArea` "ainda sem lançamentos"
- Verificação visual com ano completo (12 meses preenchidos)
- Confirmar destaque do mês ativo continua legível sobre o preenchimento com gradiente das áreas
- Confirmar segmento de saldo previsto (tracejado) continua visualmente distinto do saldo sólido
- Testar com saldo acumulado negativo em algum mês (domínio Y deve continuar acomodando corretamente)
- Testar em tema claro e escuro

### Backend

Sem impacto esperado.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

(executados a partir de `c:\Users\rodri\Music\Particular\sistema financas`)

## Riscos e pontos de atenção

- **Sobreposição visual das 3 áreas**: com `Area` (preenchimento) em vez de `Bar` (colunas lado a lado), Receitas e Despesas vão se sobrepor visualmente quando ambas tiverem valor alto no mesmo mês — a versão original resolvia isso com opacidade baixa nos gradientes (~0.25 no topo, fade para 0), mas vale validar visualmente que a legibilidade não piora em relação às barras atuais, especialmente em meses onde receita e despesa são próximas.
- **`ReferenceArea` sobre `Area` preenchida**: o destaque do mês ativo (faixa de fundo ciano) pode ficar menos perceptível quando há uma área colorida com gradiente por cima; pode precisar de ajuste de ordem de renderização (ordem dos elementos no JSX) ou opacidade.
- **Ausência de tooltip**: nem a versão atual nem a original (no ponto investigado) têm tooltip funcional documentado nesta investigação — se for perceptível como regressão durante o teste visual, reportar antes de considerar concluído (fora do escopo original, mas pode exigir decisão rápida).
- Risco geral baixo — mudança isolada em um único arquivo, sem tocar em dados, backend ou outros componentes do painel.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — as duas decisões de escopo foram resolvidas durante o planejamento (ver "Decisões aplicadas" abaixo).

## Decisões aplicadas

- Decisão 1 (comportamentos extras do gráfico atual: destaque de mês ativo, área "ainda sem lançamentos", previsão tracejada, domínio Y para saldo negativo): adaptar todos os 4 para funcionar com `Area` em vez de `Bar`/`Line`, em vez de descartá-los.
- Decisão 2 (highlights e legenda customizada em `FinanceDashboard.tsx`): manter exatamente como estão — só o gráfico interno muda.

## Critérios de aceite do plano

- O gráfico anual do Painel renderiza como `AreaChart` com 3 áreas sobrepostas (Receitas/Despesas/Saldo), gradiente de preenchimento e curva suave `type="monotone"`, sem barras
- Destaque do mês ativo, área "ainda sem lançamentos", segmento de previsão tracejado e domínio Y para saldo negativo continuam funcionando visualmente
- Highlights e legenda customizada em `FinanceDashboard.tsx` permanecem inalterados
- `npx tsc --noEmit` e `npx vite build` passam sem erros
- Nenhum outro componente do painel é afetado

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Único arquivo com mudança de código: `src/screens/finance/charts/AnnualTrendChart.tsx`
- Não expandir escopo para highlights, legenda ou outros gráficos do painel
- Ao terminar localmente, seguir o fluxo padrão do projeto (`/finalizar`) e perguntar sobre envio a produção
