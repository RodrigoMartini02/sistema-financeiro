# Plano de Implementação: Generalizar card "Categorias do mês" para todos os períodos do painel

## Origem

- Arquivo de especificação: não houve `.md` de feature fornecido — origem foi relato do usuário ao ver o card "Categorias do mês" ausente do painel com filtro em "Ano 2026" e pedido explícito de que ele se comporte "igual os demais gráficos ... só vai adequando os valores pelo período selecionado". Investigação feita via agente Explore.
- Data do planejamento: 2026-08-19
- Classificação: `fullstack` (frontend + backend, sem alteração de banco de dados)

## Resumo

O card "Categorias do mês" (`MonthCategoriesOverview`) hoje só aparece quando o filtro do painel financeiro está em um único mês (`singleMonth`), diferente dos demais gráficos (cascata, receitas×despesas×saldo) que já se ajustam a qualquer período (ano, intervalo, todo o período). Esta implementação generaliza o endpoint de orçamento (`getBudgetOverview`/`GET /orcamento/resumo`) para aceitar um intervalo de período, calcula a "meta" de cada categoria como `meta mensal cadastrada × número de meses do intervalo` (decisão já validada com o usuário), e remove o gate `singleMonth` da renderização desse card específico no painel — mantendo `singleMonth` intacto para os cards de contratos/parcelas futuras, que continuam genuinamente mensais.

## Escopo

### Dentro do escopo

- Generalizar `getBudgetOverview` (backend) para aceitar **ou** `{ month, year }` (uso atual do `BudgetPanel.tsx`) **ou** `{ deMes?, deAno?, ateMes?, ateAno? }` (uso novo do painel) — sem quebrar o consumidor existente.
- Calcular `targetAmount` de cada categoria como `targetValue × número de meses do intervalo` (modo `amount`) ou `incomeTotal(do intervalo) × targetValue / 100` (modo `income_percent`).
- Para o modo "todo o período" (sem `deChave`/`ateChave`), calcular o número de meses do histórico real (primeira data com lançamento do usuário até hoje), replicando o padrão já usado em `financial.ts:293-306`.
- Ajustar `suggestedAmount`: quando o período for um intervalo, usar o mês/ano final do intervalo como referência para a média dos 3 meses anteriores (decisão já validada).
- Atualizar a rota `GET /orcamento/resumo` para aceitar os parâmetros de intervalo (`de_mes`, `de_ano`, `ate_mes`, `ate_ano`), mantendo `mes`/`ano` funcionando como está para o `BudgetPanel.tsx`.
- Generalizar `fetchBudgetOverview`/`useBudgetOverview` (frontend) para aceitar ambos os shapes, preservando a assinatura usada por `BudgetPanel.tsx`.
- Em `FinanceDashboard.tsx`: remover o gate `singleMonth` da chamada ao hook de orçamento e da renderização de `MonthCategoriesOverview`, passando o `query` do período atual (mesmo já usado no panorama).
- Em `MonthCategoriesOverview.tsx`: tornar dinâmicos os textos "Categorias do mês" e "gasto no mês" conforme o período exibido (nova prop de label/descrição).

### Fora do escopo

- Qualquer alteração em `BudgetPanel.tsx` (tela de Configurações › Metas) — continua usando mês/ano único, sem mudança de comportamento.
- Qualquer alteração nos cards de contratos (`contratosQ`) e parcelas futuras (`parcelasQ`) em `FinanceDashboard.tsx` — continuam gateados por `singleMonth`, pois são genuinamente mensais (contrato de faturamento e parcelas futuras não fazem sentido "somados" por um ano).
- Qualquer alteração no schema/migration de `orcamento_metas` — não é necessária, a meta continua sendo um valor único por categoria.
- Qualquer alteração na lógica de cálculo de status (`over`/`attention`/`healthy`/`without_target`) além de já usar o novo `targetAmount` calculado — a fórmula de status em si (`ratio >= 1` etc.) não muda.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — já lidos em planos anteriores desta sessão (idênticos): Drizzle preferencial, SQL raw/`sql` template só quando necessário e parametrizado, evitar `any`, nomes claros, toda query filtra por `usuario_id`.
- `frontend/AGENT.md` / `backend/AGENT.md` — não existem como arquivos dedicados neste projeto (já registrado em planos anteriores desta sessão).
- `sistema financas/CLAUDE.md` — já lido (fluxo /planejar → /implementar → /finalizar).
- Arquivos de código lidos: `backend/src/services/budgetService.ts` (completo), `backend/src/routes/budget.ts` (completo), `backend/src/routes/financial.ts` (linhas 146-386, padrão de filtro por intervalo), `backend/src/db/schema/expenses.ts` (colunas `month`/`year`), `backend/src/db/schema/copilot.ts` (schema `budgetTargets`, já confirmado em investigação anterior: sem coluna de mês/ano), `src/screens/finance/MonthCategoriesOverview.tsx` (completo), `src/hooks/useBudgetOverview.ts` (completo), `src/services/budgetService.ts` (completo), `src/screens/finance/BudgetPanel.tsx` (uso de `fetchBudgetOverview`), `src/services/queryKeys.ts` (linha 30, `budgetOverview`), `src/screens/finance/FinanceDashboard.tsx` (completo, já modificado no plano anterior desta sessão para `singleMonth` reconhecer intervalo de 1 mês).

## Impacto por área

### Frontend

- **`src/services/budgetService.ts`**: `fetchBudgetOverview` passa a aceitar um parâmetro de período mais flexível — `{ month, year } | { deMes?, deAno?, ateMes?, ateAno? }` — montando a query string (`mes`/`ano` OU `de_mes`/`de_ano`/`ate_mes`/`ate_ano`) conforme o shape recebido.
- **`src/hooks/useBudgetOverview.ts`**: assinatura do hook passa a aceitar o mesmo tipo de período; query key precisa refletir todos os campos relevantes para não colidir cache entre chamadas diferentes.
- **`src/services/queryKeys.ts`**: `budgetOverview` (linha 30) precisa de uma variante que aceite os 4 campos de intervalo além de `month`/`year`, para manter chaves de cache corretas e não conflitantes com o uso de `BudgetPanel.tsx`.
- **`src/screens/finance/FinanceDashboard.tsx`**: troca a chamada `useBudgetOverview(singleMonth?.mes ?? THIS_MONTH, singleMonth?.ano ?? THIS_YEAR)` (linha ~77) por uma chamada usando o `query` do período atual (já calculado via `periodToQuery(period)`, reaproveitando o mesmo objeto usado pelo panorama). Remove o gate `singleMonth &&` da renderização de `<MonthCategoriesOverview />` (linha ~620), passando a sempre renderizar quando `overviewQ.data` existir. `singleMonth` continua existindo e sendo usado apenas por `contratosQ`/`parcelasQ`.
- **`src/screens/finance/MonthCategoriesOverview.tsx`**: nova prop (ex.: `periodLabel: string`) para tornar dinâmicos os textos "Categorias do mês" (linha 41) e "gasto no mês" (linha 67) — reaproveitando `describePeriod(period)` já existente em `DashboardPeriodFilter.tsx`, passado de `FinanceDashboard.tsx`.
- **`src/screens/finance/BudgetPanel.tsx`**: nenhuma alteração de código — continua chamando `fetchBudgetOverview(month, year)` com o shape de mês único, que continuará suportado.
- Sem impacto em formulários, validação de inputs do usuário ou estados de loading/error/empty além do já existente (o padrão `overviewQ.isLoading`/`overviewQ.data` já é tratado da mesma forma).

### Backend

- **`backend/src/services/budgetService.ts`**:
  - `getBudgetOverview` (linhas 93-196): assinatura do `input` passa a aceitar `{ userId, profileId, month, year }` OU `{ userId, profileId, deMes?, deAno?, ateMes?, ateAno? }`. Internamente, normalizar para `deChave`/`ateChave` (padrão `ano*12+mes`, igual a `financial.ts`), tratando o caso de mês único como um intervalo de 1 mês (`deChave === ateChave`).
  - `expenseProfileCondition`/`incomeProfileCondition` (linhas 61-82): trocar o filtro de igualdade exata (`eq(expenses.month, month), eq(expenses.year, year)`) por uma condição de intervalo usando `sql` template do Drizzle: `sql`(${expenses.year} * 12 + ${expenses.month}) BETWEEN ${deChave} AND ${ateChave}``, replicando o padrão já usado (em SQL raw) em `financial.ts:186`. Justificativa para usar `sql` template aqui (permitido pelo AGENT.md quando o Drizzle não resolve bem): não há coluna computada `ano*12+mes` no schema, e Drizzle não expõe operação aritmética composta em `where` sem `sql`.
  - Calcular `mesesNoIntervalo = ateChave - deChave + 1`. Quando não houver `deChave`/`ateChave` (modo "todo o período"), buscar a data do primeiro lançamento do usuário (replicando a lógica de `financial.ts:293-306`) para determinar `mesesNoIntervalo`.
  - `targetAmount`: modo `amount` → `targetValue * mesesNoIntervalo`; modo `income_percent` → `(incomeTotal_do_intervalo * targetValue) / 100` (já é assim, só passa a receber `incomeTotal` agregado do intervalo em vez de um único mês).
  - `suggestedAmount`/`previousThreePeriods` (linhas 84-91, 149-154): usar o mês/ano final do intervalo (`ateMes`/`ateAno`, ou mês/ano corrente se "todo o período") como referência, mantendo a lógica de "3 meses anteriores a essa referência" inalterada.
  - `historicalRows` (linhas 130-137) já busca despesas sem filtro de mês — continua sendo usado só para `suggestedAmount`, sem alteração de escopo.
- **`backend/src/routes/budget.ts`**: rota `GET /resumo` (linhas 17-35) passa a aceitar `de_mes`, `de_ano`, `ate_mes`, `ate_ano` além de `mes`/`ano`, com parsing/validação similar ao já usado em `financial.ts:150-176` (paridade de padrão). Se `mes`/`ano` vierem preenchidos, usa o shape de mês único (compatibilidade com `BudgetPanel.tsx`); caso contrário, usa o shape de intervalo.
- Toda query nova/alterada continua filtrando por `usuario_id` (já garantido pelas condições existentes) — nenhuma mudança nesse aspecto de segurança.

### Banco de dados

`Sem impacto esperado` — nenhuma tabela, coluna ou índice novo. A tabela `orcamento_metas` continua com um valor único por `(usuario_id, perfil_id, categoria_id)`, sem coluna de mês/ano.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/services/budgetService.ts`
- `sistema financas/backend/src/routes/budget.ts`
- `sistema financas/src/services/budgetService.ts`
- `sistema financas/src/hooks/useBudgetOverview.ts`
- `sistema financas/src/services/queryKeys.ts`
- `sistema financas/src/screens/finance/FinanceDashboard.tsx`
- `sistema financas/src/screens/finance/MonthCategoriesOverview.tsx`

## Estratégia de implementação

1. Backend: generalizar `getBudgetOverview` e as funções de condição de período em `budgetService.ts` para aceitar intervalo, mantendo compatibilidade com o shape de mês único.
2. Backend: atualizar a rota `/orcamento/resumo` em `budget.ts` para aceitar e validar os novos parâmetros de query, replicando o padrão de validação já usado em `financial.ts`.
3. Frontend: generalizar `fetchBudgetOverview` em `src/services/budgetService.ts` e o hook `useBudgetOverview` para aceitar ambos os shapes.
4. Frontend: atualizar `queryKeys.budgetOverview` para uma chave de cache que cubra os dois formatos sem colidir.
5. Frontend: em `FinanceDashboard.tsx`, trocar a chamada ao hook de orçamento para usar o `query` do período atual (em vez de `singleMonth`), e remover o gate `singleMonth &&` da renderização de `MonthCategoriesOverview`, passando `periodLabel={describePeriod(period)}` (ou equivalente).
6. Frontend: em `MonthCategoriesOverview.tsx`, adicionar a prop de label dinâmico e usá-la nos textos "Categorias do mês"/"gasto no mês".
7. Rodar `npx vite build` (frontend) e `npm run build` (backend, `tsc --noEmit`) para validar.
8. Testar manualmente no navegador: abrir o painel em "Mês atual" (card deve continuar funcionando como hoje), trocar para "Ano corrente" (card deve aparecer com valores anuais e metas multiplicadas por 12 ou pelos meses já decorridos do ano — confirmar durante implementação qual critério faz mais sentido: 12 meses fixos vs. meses já decorridos do ano corrente), "Todo o período" (card aparece com meta multiplicada pelo histórico real), "Intervalo personalizado" de 3 meses (meta × 3), e confirmar que `BudgetPanel.tsx` (Configurações › Metas) continua funcionando sem mudança de comportamento.

## Regras de negócio identificadas

- A meta de cada categoria é um valor mensal fixo, recorrente — não há "meta de um mês específico".
- Ao exibir um período maior que 1 mês, a meta comparável é `meta mensal × número de meses do período`, e a comparação é contra o gasto TOTAL do período (não a média mensal) — decisão explícita do usuário.
- O card de categorias deve se comportar como os demais gráficos do painel: sempre visível, valores ajustados ao período selecionado.
- Os cards de contratos e parcelas futuras continuam exclusivos de mês único — não são afetados por esta mudança.

## Regras multi-tenant e segurança

- Não aplicável a multi-tenant (projeto não é multi-prefeitura), mas o equivalente aqui é isolamento por `usuario_id`/`perfil_id`, já garantido em todas as condições existentes (`expenseProfileCondition`, `incomeProfileCondition`, filtro de `budgetTargets` por `userId`+`profileId`) e mantido nas versões generalizadas.
- Nenhum novo dado sensível é exposto — os mesmos campos (`targetAmount`, `projectedAmount`, `paidAmount`, `status`) continuam sendo retornados, apenas calculados sobre um intervalo maior.
- Validação de `deMes`/`deAno`/`ateMes`/`ateAno` no backend deve seguir o mesmo rigor já aplicado em `financial.ts` (checar ranges válidos, não confiar apenas na validação do frontend).

## Validações necessárias

- `deChave <= ateChave` quando ambos informados (mesma validação já usada em `financial.ts:173-176`).
- `mesesNoIntervalo` sempre >= 1 (evitar divisão por zero ou meta zerada por erro de cálculo).
- Quando não há nenhum lançamento no histórico do usuário (conta nova), o cálculo de "meses do histórico real" para o modo "todo o período" precisa de um fallback sensato (ex.: 1 mês), evitando `NaN`/erro.
- Compatibilidade: chamadas existentes de `BudgetPanel.tsx` (`fetchBudgetOverview(month, year)`) devem continuar funcionando sem alteração de comportamento.

## Testes necessários

### Frontend

- Teste manual: abrir o painel em "Mês atual" e confirmar que o card de categorias mostra os mesmos valores de antes desta mudança.
- Teste manual: trocar para "Ano corrente" e confirmar que o card aparece, com metas multiplicadas e textos refletindo "Ano 2026" (ou equivalente).
- Teste manual: trocar para "Todo o período" e confirmar que o card aparece com meta proporcional ao histórico real.
- Teste manual: aplicar um "Intervalo personalizado" de 3 meses e confirmar que a meta é 3× a meta mensal.
- Teste manual: abrir Configurações › Metas (`BudgetPanel.tsx`) e confirmar que a listagem/edição de metas continua funcionando exatamente como antes.

### Backend

- Teste manual via API: `GET /orcamento/resumo?mes=X&ano=Y` (shape antigo) continua retornando o mesmo formato de sempre.
- Teste manual via API: `GET /orcamento/resumo?de_mes=X&de_ano=Y&ate_mes=X2&ate_ano=Y2` retorna `targetAmount` corretamente multiplicado pelo número de meses do intervalo.
- Teste manual via API: `GET /orcamento/resumo` sem nenhum parâmetro de período (modo "todo o período") retorna meta proporcional ao histórico real do usuário.

### E2E

Não há suíte E2E identificada no projeto; testes manuais via UI cobrem o fluxo.

## Comandos de validação sugeridos

```bash
npx vite build
```

```bash
cd backend && npm run build
```

(Ambos a partir de `sistema financas/`, mesmo padrão já usado nos dois planos anteriores desta sessão.)

## Riscos e pontos de atenção

- Mudança de contrato do endpoint `/orcamento/resumo`: preciso manter os dois shapes de parâmetros funcionando simultaneamente para não quebrar `BudgetPanel.tsx`. Isso será validado explicitamente durante a implementação e nos testes manuais.
- Metas multiplicadas por muitos meses (ex.: "Todo o período" com anos de histórico) podem gerar números grandes que precisam ser exibidos com clareza — vale conferir visualmente se o layout do card comporta bem esses valores.
- Uso de `sql` template do Drizzle para a condição de intervalo é uma exceção às queries 100% Drizzle-API, mas está alinhado com o próprio `AGENT.md` ("SQL raw só deve ser usado quando o Drizzle não suportar bem a operação... A query for parametrizada corretamente") e com o padrão já aceito em `financial.ts`/`months.ts` nesta mesma sessão.
- Risco de regressão no `suggestedAmount`: ajustar a referência para "mês final do intervalo" precisa ser testado para não quebrar o caso de mês único (que já funciona hoje).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Decisões já validadas com o usuário:
- Meta do período = meta mensal × número de meses do intervalo, comparada contra o gasto total (não a média).
- `suggestedAmount` usa o mês/ano final do intervalo como referência.
- `getBudgetOverview`/`fetchBudgetOverview` aceitam ambos os shapes (mês único e intervalo), sem duplicar lógica em uma função separada.

Um ponto técnico será decidido durante a implementação (não é uma decisão de produto, é um detalhe de cálculo): quando o modo for "Ano corrente" e o ano ainda não tiver terminado, se `mesesNoIntervalo` usa os 12 meses do ano cheio ou só os meses já decorridos até o mês atual. Vou seguir o padrão mais consistente com o resto do painel (que já trata "Ano corrente" como o ano completo de jan-dez, ver `periodToQuery` linha 29: `{ deMes: 0, deAno: period.ano, ateMes: 11, ateAno: period.ano }`) — ou seja, 12 meses fixos, mesmo que o ano não tenha terminado. Isso será aplicado por padrão; se o resultado visual não fizer sentido, ajusto durante a validação manual antes de finalizar.

## Critérios de aceite do plano

- O card "Categorias do mês" aparece em todos os modos de filtro do painel (mês, ano, intervalo, todo o período), com valores ajustados ao período selecionado.
- A meta de cada categoria no período é `meta mensal × número de meses do intervalo`.
- Os textos do card refletem o período selecionado (não ficam fixos em "do mês" quando o período é maior).
- `BudgetPanel.tsx` (Configurações › Metas) continua funcionando exatamente como antes, sem alteração de comportamento.
- Os cards de contratos e parcelas futuras continuam restritos a mês único.
- `npx vite build` e `npm run build` (backend) passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — não aplicável a esta correção.
- Seguir `/AGENT.md` e `sistema financas/AGENT.md` (idênticos): preferir Drizzle, usar `sql` template do Drizzle (não SQL raw via `pool.query`) para a condição de intervalo em `budgetService.ts`, já que esse arquivo usa a API do Drizzle em todo o resto — manter consistência com o arquivo, diferente de `financial.ts`/`months.ts` que já usavam SQL raw puro.
- Manter compatibilidade total com `BudgetPanel.tsx` — não alterar esse arquivo.
- Validar visualmente no navegador os cenários listados em "Testes necessários" antes de considerar a tarefa concluída, conforme a diretriz geral do projeto para mudanças de UI.
