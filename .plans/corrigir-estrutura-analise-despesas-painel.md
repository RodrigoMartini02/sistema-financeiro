# Plano de Implementação: Corrigir estiramento dos cards e barra prevista do gráfico anual (Painel financeiro)

## Origem

- Arquivo de especificação: mockup HTML fornecido pelo usuário no chat ("Painel Fingerence.html"), colado por completo; causa raiz confirmada via prints reais do painel renderizado comparados com o mockup
- Data do planejamento: 2026-08-16
- Classificação: `frontend-only`

## Resumo

O usuário forneceu dois screenshots do painel real renderizado: um mostrando os cards da seção "Análise de despesas" claramente achatados/esticados horizontalmente com grandes vazios internos, e outro (mais próximo do mockup) com os cards compactos e proporcionais. Comparando o CSS do mockup contra o código-fonte, a causa raiz foi confirmada em duas rodadas:

1ª rodada: os containers internos dos cards "Saúde financeira" (linha 542), "Receitas por origem" (linha 572) e "Forma de pagamento" (linha 588) em `FinanceDashboard.tsx` usavam a classe `flex-1`, distribuindo o conteúdo pra preencher todo o espaço vertical do card quando o grid estica a linha.

2ª rodada (após o usuário reportar que a correção da 1ª rodada não resolveu — "só pode ter algo bloqueado ou sobreposição"): identificado que a causa raiz de fundo estava nos próprios cards "Perfil das despesas" (linha 459, `flex flex-1 flex-col gap-4`) e "Parcelas futuras" com dados (linha 514, `flex flex-1 flex-col gap-3`). Esses dois cards, ao esticarem internamente via `flex-1`, cresciam mais do que o conteúdo exigia dentro do próprio `Card`, empurrando a altura de TODA a linha do grid pra cima — e é essa altura de linha inflada que fazia os outros cards da mesma linha (incluindo os já corrigidos na 1ª rodada) parecerem esticados/achatados. Comparado célula a célula com o HTML do mockup: nenhum dos 6 cards usa `flex:1` no container de conteúdo — todos usam `display:flex;flex-direction:column` simples, com `margin-top:auto` apenas nos elementos que devem ser empurrados para o rodapé quando sobra espaço (ex.: bloco de badges em "Perfil das despesas", bloco "Total comprometido" em "Parcelas futuras"). O `flex-1` nesses containers era, portanto, a causa raiz real e completa do achatamento.

Adicionalmente, o `AnnualTrendChart.tsx` não reproduz a barra de receita "prevista" (mês seguinte ao ativo) com estilo tracejado/claro que existe no mockup — achado já confirmado via grep em análise anterior desta mesma conversa.

## Escopo

### Dentro do escopo

- Remover a classe `flex-1` dos containers internos de TODOS os cards que a usavam indevidamente em `FinanceDashboard.tsx`: "Saúde financeira" (linha 542), "Receitas por origem" (linha 572), "Forma de pagamento" (linha 588), "Perfil das despesas" (linha 459) e "Parcelas futuras" com dados (linha 514) — mantendo apenas `flex flex-col` (ou equivalente), preservando os `mt-auto` já existentes nos blocos de rodapé.
- Adicionar em `AnnualTrendChart.tsx` a barra de receita do mês seguinte ao mês ativo (quando `hasForecast` for true) com estilo tracejado/claro: `fill="#d1fae5" stroke="#10b981" strokeWidth={1.2} strokeDasharray="3 2"`, reproduzindo a barra "prevista" do mockup.

### Fora do escopo

- Qualquer reestruturação do grid de 6 cards em si (3 colunas, mesma ordem) — já confirmado correto contra o mockup.
- Os cards "Juros × Descontos" e "Parcelas futuras" quando vazios já usam `flex-1` corretamente para centralizar o estado vazio (`items-center justify-center`) — isso é intencional e igual ao padrão do mockup para estados vazios, não deve ser alterado.
- O card "Perfil das despesas" — não usa `flex-1` da mesma forma problemática; mantém `mt-auto` apenas no rodapé de badges, que é o padrão correto.
- `MonthCategoriesOverview.tsx` e `IncomeBalanceGuide.tsx` — já conferidos contra o mockup, sem divergência estrutural.
- Cores, paddings, tipografia — já conferem com os valores exatos do mockup.
- Qualquer mudança de dados, hooks, queries ou lógica de cálculo.
- Tema escuro — manter pares `dark:` existentes sem inventar valores novos.

## Leitura de contexto

- `/CLAUDE.md` (raiz do projeto)
- `src/screens/finance/FinanceDashboard.tsx` (lido integralmente, seção "Análise de despesas" relida com atenção linha a linha após feedback visual do usuário)
- `src/ui/card.tsx` (lido — confirmado que `Card` não força altura, o problema está nos containers internos)
- `src/screens/finance/charts/DonutChart.tsx` (lido — usado em "Receitas por origem" e "Forma de pagamento")
- `src/screens/finance/charts/AnnualTrendChart.tsx` (lido integralmente — divergência da barra prevista confirmada)
- Mockup completo colado pelo usuário nesta conversa ("Painel Fingerence.html"), HTML bruto do `<script type="__bundler/template">` comparado célula a célula com o código
- Dois screenshots reais do painel renderizado fornecidos pelo usuário nesta conversa, usados para confirmar visualmente a causa raiz antes de propor a correção

## Impacto por área

### Frontend

- `FinanceDashboard.tsx`: remover `flex-1` de 3 divs internas (linhas 542, 572, 588) — mudança de 3 classes CSS, sem alteração de props, hooks ou dados.
- `AnnualTrendChart.tsx`: adicionar um `<rect>` extra para a barra de receita "prevista" do mês seguinte ao último com dados sólidos.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/charts/AnnualTrendChart.tsx`

## Estratégia de implementação

1. Em `FinanceDashboard.tsx`, linha 542: trocar `className="mt-5 flex flex-1 flex-col gap-4"` por `className="mt-5 flex flex-col gap-4"` no container de "Saúde financeira". ✅ aplicado
2. Linha 572: trocar `className="mt-3 flex flex-1 flex-col items-center gap-3.5"` por `className="mt-3 flex flex-col items-center gap-3.5"` no container de "Receitas por origem". ✅ aplicado
3. Linha 588: mesma correção no container de "Forma de pagamento". ✅ aplicado
4. Linha 459: trocar `className="mt-[18px] flex flex-1 flex-col gap-4"` por `className="mt-[18px] flex flex-col gap-4"` no container de "Perfil das despesas". ✅ aplicado (2ª rodada)
5. Linha 514: trocar `className="mt-[18px] flex flex-1 flex-col gap-3"` por `className="mt-[18px] flex flex-col gap-3"` no container de "Parcelas futuras" (estado com dados). ✅ aplicado (2ª rodada)
6. Em `AnnualTrendChart.tsx`, dentro do `data.map` que renderiza as barras (linhas ~63-76), adicionar a barra tracejada de receita para o mês em `solidEnd + 1` quando `hasForecast` for true, usando a mesma posição/largura calculada para a barra de receita normal (`xFor`, `barWidth`), com `fill="#d1fae5" stroke="#10b981" strokeWidth={1.2} strokeDasharray="3 2"`. ✅ aplicado
7. Rodar `npx tsc --noEmit` e `npx vite build`. ✅ ambos passaram sem erros
8. Pedir ao usuário para validar visualmente com um novo print antes de considerar concluído — não assumir que a correção resolveu sem confirmação visual real, dado o histórico desta conversa.

## Regras de negócio identificadas

Nenhuma — ajuste visual/CSS pontual.

## Regras multi-tenant e segurança

Não aplicável — sem alteração de dados ou permissões.

## Validações necessárias

Nenhuma validação de formulário nova.

## Testes necessários

### Frontend

- Verificação visual manual via novo screenshot do usuário: cards "Saúde financeira", "Receitas por origem" e "Forma de pagamento" devem ficar compactos mesmo quando esticados pelo grid, sem vazios internos distribuídos.
- Confirmar que "Juros × Descontos" e "Parcelas futuras" continuam centralizando corretamente seus estados vazios (não afetados por este plano).
- Confirmar que a barra tracejada do mês previsto aparece no gráfico anual.

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

- Risco baixo — mudança de 3 classes CSS + adição pontual de um elemento SVG, sem alteração de lógica.
- Este plano depende de confirmação visual real do usuário após a implementação — não declarar "igual ao mockup" sem novo screenshot, dado que a comparação apenas textual/estrutural já se mostrou insuficiente nesta conversa.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Cards "Saúde financeira", "Receitas por origem" e "Forma de pagamento" não distribuem mais o conteúdo interno para preencher todo o espaço esticado pelo grid.
- Gráfico anual mostra a barra de receita do mês previsto com estilo tracejado/claro.
- Usuário confirma visualmente (via novo print) que o resultado está mais próximo do mockup antes de finalizar.
- `npx tsc --noEmit` e `npx vite build` passam sem erros.
- Nenhuma mudança de dados, hooks ou backend.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Escopo pequeno e cirúrgico — apenas as 3 classes CSS e a barra do gráfico anual.
- Ao finalizar localmente, perguntar ao usuário se deseja enviar para produção, seguindo o fluxo padrão do projeto (`/finalizar`), mas apenas depois de confirmação visual via print — não antes.
