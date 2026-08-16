# Plano de Implementação: Curva suave no gráfico anual do Painel

## Origem

- Arquivo de especificação: pedido direto do usuário no chat, após ver o resultado do redesenho do painel
- Data do planejamento: 2026-08-16
- Classificação: `frontend-only`

## Resumo

O componente `AnnualTrendChart.tsx` (criado durante o redesenho do painel financeiro, substituindo o antigo gráfico Recharts) desenha a linha de saldo acumulado com `<polyline>`, que conecta os pontos de dados com segmentos retos. A versão antiga, baseada em Recharts (`<Area type="monotone">`), interpolava os pontos com curva suave (monotone cubic / Catmull-Rom). O usuário viu o resultado do novo componente e preferiu o visual de curva suave da versão anterior. Este plano restaura esse efeito, trocando apenas a geração da linha (de `<polyline>` reta para `<path>` com curva suave), sem alterar mais nada do componente.

## Escopo

### Dentro do escopo

- Adicionar uma função utilitária que gera um atributo `d` de `<path>` SVG com curva suave (interpolação Catmull-Rom convertida para Bézier cúbico) a partir da mesma lista de pontos `(x, y)` já calculada por `xFor`/`yFor`
- Substituir `linePoints` (string usada pelo `<polyline>`) e o elemento `<polyline>` (linhas 30 e 72 do arquivo atual) pelo novo `<path>` com a curva suave, mantendo idênticos `stroke`, `strokeWidth`, `strokeLinecap`/`strokeLinejoin`
- Manter os círculos (`<circle>`) que marcam os pontos reais de cada mês exatamente como estão hoje — só a linha entre eles passa a ser curva

### Fora do escopo

- Alinhamento entre o destaque do mês ativo e as barras de receita/despesa — investigado nesta conversa antes do planejamento; ambos usam a mesma base de cálculo (`slot * index`), sem bug confirmado no código. Não será tocado.
- Qualquer outro gráfico do painel (`CategoryBarChart.tsx`, `DonutChart.tsx`, `MonthWaterfallChart.tsx`)
- Mudança de cores, grid, layout geral, tipografia ou espaçamento do gráfico anual
- Mudança de dados ou lógica de agregação (`chartData` em `FinanceDashboard.tsx`)

## Leitura de contexto

- `/CLAUDE.md` (raiz do projeto)
- `src/screens/finance/charts/AnnualTrendChart.tsx` (lido integralmente)
- `src/screens/finance/FinanceDashboard.tsx` (confirmado uso do componente e origem de `chartData`/`month` como `activeIndex`)
- Investigação prévia nesta conversa sobre suposto desalinhamento entre destaque de mês e barras — não confirmado como bug, mantido fora do escopo por decisão do usuário

## Impacto por área

### Frontend

- `src/screens/finance/charts/AnnualTrendChart.tsx`: adicionar função utilitária de geração de path com curva suave (Catmull-Rom → Bézier cúbico), aplicada apenas à linha de saldo acumulado. Nenhuma prop nova, nenhuma mudança de interface (`AnnualTrendChartProps` permanece igual).
- Sem impacto em hooks, query keys, formulários ou estados de loading/error — é uma mudança puramente de renderização SVG.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/charts/AnnualTrendChart.tsx` (único arquivo)

## Estratégia de implementação

1. Implementar função utilitária (ex.: `catmullRomToBezierPath(points: {x: number; y: number}[]): string`) que recebe a lista de pontos `(x, y)` e retorna a string `d` de um `<path>` SVG com curva suave, usando o algoritmo padrão de conversão Catmull-Rom → Bézier cúbico (sem dependência externa)
2. Calcular os pontos da linha de saldo (mesma lógica hoje usada em `linePoints`, mas como array de objetos `{x, y}` em vez de string)
3. Substituir `<polyline points={linePoints} .../>` por `<path d={pathSuave} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />`
4. Manter os `<circle>` existentes inalterados
5. Rodar `npx tsc --noEmit` e `npx vite build`
6. Testar visualmente com poucos meses de dado (cenário do print do usuário: 2-3 meses com valor, resto zerado) e com o ano cheio (12 meses), conferindo que a curva não distorce visualmente nem gera "overshoot" perceptível nas transições abruptas

## Regras de negócio identificadas

Nenhuma — mudança puramente visual, sem regra de negócio associada.

## Regras multi-tenant e segurança

Não aplicável — mudança isolada de renderização SVG no frontend, sem leitura/escrita de dados sensíveis.

## Validações necessárias

Nenhuma validação de formulário nova.

## Testes necessários

### Frontend

- Verificação visual manual: gráfico com poucos meses preenchidos (replicando o cenário do print do usuário) e com o ano completo
- Confirmar que o destaque do mês ativo, as barras de receita/despesa, o grid e os círculos continuam idênticos ao estado atual — só a linha de saldo muda
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

## Riscos e pontos de atenção

- Curvas Catmull-Rom podem gerar "overshoot" (a curva ultrapassa visualmente o valor de um ponto) em transições abruptas entre meses com dado e meses zerados — cenário exatamente como o do print do usuário. Vale usar a variante mais estável do algoritmo e validar visualmente com esse padrão de dados específico antes de considerar concluído.
- Baixo risco geral — mudança isolada em um único arquivo, sem tocar em dados, backend ou outros componentes do painel.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- A linha de saldo acumulado no gráfico anual do Painel é renderizada com curva suave entre os pontos, similar ao efeito da versão antiga (Recharts `monotone`)
- Barras, grid, destaque de mês ativo e círculos permanecem visualmente idênticos ao estado atual
- `npx tsc --noEmit` e `npx vite build` passam sem erros
- Nenhum outro componente ou tela é afetado

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Único arquivo afetado: `src/screens/finance/charts/AnnualTrendChart.tsx` — mudança pequena e focada, não expandir escopo
- Não investigar ou alterar o alinhamento entre destaque de mês e barras — já avaliado e descartado como bug nesta conversa
- Ao finalizar localmente, perguntar ao usuário se deseja enviar para produção, seguindo o fluxo padrão do projeto (`/finalizar`)
