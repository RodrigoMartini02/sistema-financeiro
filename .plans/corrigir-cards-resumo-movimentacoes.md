# Plano de Implementação: Corrigir precisão e composição dos cards de resumo em Movimentações

## Origem

- Arquivo de especificação: `.portal/tasks/Corrigir precisão e composição dos cards de resumo em Movimentações.md`
- Data do planejamento: `2026-09-01`
- Classificação: `frontend + backend`

## Resumo

Os cards de resumo em Movimentações (`Saldo anterior`, `Receitas`, `Despesas`, `Saldo projetado`, `Comprometimento`, em `src/screens/finance/MovimentacoesScreen.tsx`) têm três problemas relacionados, todos investigados e confirmados antes deste plano:

1. **Bug de dados** — as queries SQL de agregação (`backend/src/routes/months.ts:63` e `backend/src/routes/financial.ts:109`) somam despesas via `COALESCE(valor_final, valor_original)` (ou `COALESCE(valor_pago, valor_final, valor_original)` quando pagas), sem cair para a coluna legada `valor` como terceiro fallback — diferente do frontend (`expenseFromApi`, `src/services/financeService.ts:66`), que já faz `valor_final ?? valor_original ?? valor`. Confirmado via consulta read-only em produção: existem despesas reais com `valor_final IS NULL` e `valor_original IS NULL`, mas `valor` preenchido (ex.: despesa "DAS", id 18852, `valor: 86.05`). A tabela de listagem exibe o valor correto (usa o fallback do frontend); os cards somam `NULL`/`0` para esses registros.
2. **Cards não refletem os filtros da tabela** — `DespesasScreen.tsx` e `ReceitasScreen.tsx` mantêm filtros (status, categoria, forma de pagamento, data de pagamento, busca) como estado local, e o resultado filtrado nunca é comunicado ao componente pai (`MovimentacoesScreen.tsx`), que sempre exibe o total do mês inteiro nos cards, independente de qualquer filtro ativo na tabela abaixo.
3. **Composição pouco clara de "Saldo anterior"/"Saldo projetado"** — `saldoAnterior` vem de `meses.saldo_final` do mês anterior, que já é o **acumulado de todo o histórico** até aquele fechamento (não apenas o resultado de um mês isolado), mas é nomeado e exibido como se fosse só "o mês anterior". Além disso, esse valor só existe após o fechamento explícito do mês anterior (`POST /meses/:ano/:mes/fechar`, único ponto do backend que insere em `meses`) — hoje, "mês anterior não fechado" e "saldo anterior real igual a zero" são visualmente indistinguíveis.

## Escopo

### Dentro do escopo

- Adicionar `valor` como terceiro fallback nas duas queries SQL de agregação de despesas (`months.ts`, `financial.ts`).
- Adicionar `status = 'ativa'` na subquery de despesas de `financial.ts` (rota `GET /financial/anual`), hoje ausente ali mas presente na subquery de receitas ao lado e na query equivalente de `months.ts` — decisão confirmada com o usuário para manter consistência.
- Levantar o total (e contagem) dos itens filtrados de `DespesasScreen.tsx`/`ReceitasScreen.tsx` para `MovimentacoesScreen.tsx`, via callback, sem duplicar a lógica de filtro.
- Usar esse total filtrado no card "Despesas"/"Receitas" correspondente somente quando houver filtro ativo na aba correspondente; caso contrário, manter o total do mês inteiro.
- Renomear "Saldo anterior" para "Saldo atual" e recompor sua fórmula: soma do saldo acumulado (quando o mês anterior estiver fechado) mais as receitas já lançadas no mês corrente; quando o mês anterior não estiver fechado, exibir apenas as receitas do mês corrente.
- Exibir, no `note` do card "Saldo atual", a composição do valor (ex.: "Saldo anterior R$X + Receitas R$Y") ou um aviso visual quando o mês anterior estiver em aberto (ex.: "Maio/2026 ainda está aberto").
- Ajustar a fórmula de "Saldo projetado" para partir do novo "Saldo atual" menos despesas — resultado numérico equivalente ao comportamento atual em ambos os casos (mês anterior fechado ou aberto), confirmado matematicamente durante o planejamento.

### Fora do escopo

- Corrigir os dados na origem (`UPDATE despesas SET valor_final = valor WHERE valor_final IS NULL`) — frente separada e opcional, requer confirmação explícita do usuário antes de qualquer execução em produção, não incluída nesta implementação.
- Estender o comportamento de cards reagindo a filtros para a aba Planejamento (`BudgetPanel.tsx`).
- Qualquer mudança em "Receitas" e "Comprometimento" além de manter seu comportamento e posição atuais (exceto "Receitas" também passar a refletir filtro ativo, conforme item já no escopo).
- Mudanças em `CalendarView`, `RelatoriosScreen.tsx` ou outros consumidores das rotas `/meses/:ano/:mes/saldo` e `/financial/anual`, mesmo que a correção do fallback/status altere os valores que eles exibem.
- Revisão ou reformulação completa dos filtros existentes em `DespesasScreen.tsx`/`ReceitasScreen.tsx` — apenas o mecanismo de expor o resultado filtrado ao pai está no escopo.
- Aviso/estado diferenciado no card "Saldo projetado" quando o mês anterior está aberto — decisão confirmada de manter apenas o valor numérico, sem aviso adicional ali (o aviso fica restrito ao card "Saldo atual").

## Leitura de contexto

- `/AGENT.md` (raiz do workspace) — regras de workflow e contexto multi-tenant genérico, não diretamente aplicável (projeto single-tenant).
- `sistema financas/AGENT.md` — idêntico ao da raiz nesta cópia.
- `sistema financas/CLAUDE.md` — sequência obrigatória `/planejar → aprovação → /implementar → /finalizar`.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto — apenas o `AGENT.md`/`CLAUDE.md` da raiz, já considerados.
- `.portal/tasks/Corrigir precisão e composição dos cards de resumo em Movimentações.md` — task de origem deste plano.
- `src/screens/finance/MovimentacoesScreen.tsx` — componente pai com os 5 cards e as fórmulas atuais (linhas 201-207, 351-365).
- `src/screens/finance/MovementMetricCard.tsx` — componente de card, já expõe prop `note` (texto pequeno) reutilizável para composição/aviso.
- `src/screens/despesas/DespesasScreen.tsx` — filtros locais (`filtroStatus`, `filtroCategoria`, `filtroFormaPag`, `filtroDataPag`), array `filtered` (linhas 198-303).
- `src/screens/receitas/ReceitasScreen.tsx` — filtro de busca local (`busca`, linha 53), array filtrado (linhas 134-139).
- `src/services/financeService.ts` — `expenseFromApi` (linha 66, fallback `valor_final ?? valor_original ?? valor`), `fetchDashboardAnual`, `fetchMonthBalance`.
- `src/services/queryKeys.ts` — `queryKeys.mesStatus(year, month)` (padrão a reaproveitar para o mês anterior).
- `src/types/finance.ts` — `Expense.valorFinal` (já vem com fallback aplicado no frontend), `Income.valor`.
- `backend/src/routes/months.ts` — `calculateBalanceBreakdown` (linhas 52-89), rota `GET /:ano/:mes/saldo` (linha 114), rota `POST /:ano/:mes/fechar` (linha 134, único INSERT em `meses` de todo o backend, confirmado via busca).
- `backend/src/routes/financial.ts` — rota `GET /anual` (linhas 79-139), subqueries de receitas (com `status = 'ativa'`) e despesas (sem `status = 'ativa'` hoje).
- Consulta read-only em produção (já realizada nesta investigação, sem escrita): confirmado que a coluna `status` de `despesas` tem valor `'ativa'` em 568/568 registros consultados, e que os 9 registros do caso relatado têm `valor` preenchido com `valor_final`/`valor_original` nulos.

## Impacto por área

### Frontend

- `MovimentacoesScreen.tsx`:
  - Novo estado para armazenar o total/contagem filtrado recebido de `DespesasScreen`/`ReceitasScreen` (ex.: `filteredDespesasSummary`, `filteredReceitasSummary`, cada um `{ total: number; count: number; active: boolean } | null`).
  - Substituir `despesas = annualMonth?.despesas ?? dashboard?.balance.despesas ?? 0` por: usar o total filtrado quando `filteredDespesasSummary?.active` for `true`; caso contrário, manter o cálculo atual. Mesmo padrão para receitas.
  - Buscar status de fechamento do mês anterior: nova `useQuery` reaproveitando o padrão de `queryKeys.mesStatus(prevYear, prevMonth)` (mesmo formato de chave já usado para o mês corrente), calculando `prevMonth`/`prevYear` com a mesma lógica já usada no backend (`month === 0 ? 11 : month - 1`).
  - Recompor `saldoAtual = mesAnteriorFechado ? (saldoAnterior + receitas) : receitas` e `saldoProjetado = saldoAtual - despesas`.
  - Atualizar o card `MovementMetricCard` de "Saldo anterior" para label "Saldo atual", com `note` dinâmico: composição (`"Saldo anterior {valor} + Receitas {valor}"`) quando o mês anterior estiver fechado, ou aviso (`"{Mês/Ano} ainda está aberto"`) quando não estiver.
  - Manter "Saldo projetado" com o `note` atual ("Se tudo for pago em dia") e sem mudança de comportamento quando o mês anterior está aberto (decisão confirmada).
- `DespesasScreen.tsx`:
  - Nova prop opcional `onFilteredSummaryChange?: (summary: { total: number; count: number; active: boolean }) => void`.
  - `useEffect` disparando esse callback sempre que `filtered` (já calculado, linha 282-300) ou `hasFilter2` (já calculado, linha 302-303) mudarem, calculando `total = filtered.reduce((s, i) => s + i.valorFinal, 0)`.
- `ReceitasScreen.tsx`:
  - Mesmo padrão: nova prop `onFilteredSummaryChange`, `useEffect` disparando com o total dos itens filtrados pela busca local (linha 134-139) e `active = busca.trim() !== ''`.
- Sem novas query keys além da extensão de `queryKeys.mesStatus` para o mês anterior (já parametrizada, não requer mudança de estrutura).
- Sem novos estados de loading/error além dos já existentes (`finance.dashboard.error`, `annual.error`, e o novo `mesStatusQuery` do mês anterior seguindo o mesmo padrão do já existente para o mês atual).
- Sem testes automatizados nesta área do projeto (confirmado anteriormente) — validação manual obrigatória.

### Backend

- `backend/src/routes/months.ts`, dentro de `calculateBalanceBreakdown` (linha 63): alterar a query de soma de despesas para incluir `valor` como terceiro fallback:
  - `COALESCE(valor_pago, valor_final, valor_original, valor)` quando `pago = true`.
  - `COALESCE(valor_final, valor_original, valor)` quando `pago = false`.
- `backend/src/routes/financial.ts`, subquery de despesas da rota `GET /anual` (linha ~108-116):
  - Mesmo fallback de três níveis descrito acima.
  - Adicionar `AND status = 'ativa'` à cláusula `WHERE`, alinhando com a subquery de receitas ao lado (linha 101-102) e com a query de `months.ts`.
- Nenhuma rota nova. Nenhuma mudança de contrato de resposta (mesmos campos, valores mais precisos).

### Banco de dados

`Sem impacto esperado`. Nenhuma migration necessária — a correção é inteiramente de leitura (queries SQL existentes). A correção de dados legados (preencher `valor_final`/`valor_original` a partir de `valor`) permanece fora do escopo, como frente separada e opcional.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/routes/months.ts`
- `sistema financas/backend/src/routes/financial.ts`
- `sistema financas/src/screens/finance/MovimentacoesScreen.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

1. Corrigir a query de despesas em `months.ts:63`, adicionando `valor` como terceiro fallback em ambos os ramos do `CASE` (pago/não pago).
2. Corrigir a subquery de despesas em `financial.ts` (rota `/anual`): adicionar o mesmo fallback de três níveis e a cláusula `status = 'ativa'`.
3. Em `DespesasScreen.tsx`: adicionar prop `onFilteredSummaryChange`, calcular `total`/`count`/`active` a partir de `filtered`/`hasFilter2` já existentes, disparar via `useEffect`.
4. Em `ReceitasScreen.tsx`: mesmo padrão, usando o array já filtrado pela busca local.
5. Em `MovimentacoesScreen.tsx`:
   - Adicionar estado para os summaries filtrados recebidos dos filhos.
   - Passar `onFilteredSummaryChange` para `<DespesasScreen>` e `<ReceitasScreen>`.
   - Usar o total filtrado (quando `active`) no lugar do total do mês, no card de Despesas/Receitas.
   - Adicionar `useQuery` para o status de fechamento do mês anterior.
   - Recompor `saldoAtual`/`saldoProjetado` conforme fórmula definida.
   - Atualizar label, `note` e valor do card "Saldo anterior" → "Saldo atual".
6. Rodar `npx tsc --noEmit` e `npm run build` no projeto `sistema financas` (frontend) e conferir que o backend continua compilando/rodando sem erros (`cd backend && npx tsc --noEmit`, se aplicável ao setup do projeto).
7. Validação manual: casos descritos na seção de testes abaixo.

## Regras de negócio identificadas

- O valor de uma despesa deve ser lido com fallback em três níveis: `valor_final` (ou `valor_pago` quando paga) → `valor_original` → `valor` (coluna legada). Essa regra já existe no frontend e deve passar a existir também nas duas queries de agregação do backend.
- Os cards "Despesas"/"Receitas" devem refletir o subconjunto filtrado da tabela correspondente quando houver filtro ativo; os demais cards (Saldo atual, Saldo projetado, Comprometimento) continuam representando o mês inteiro.
- "Saldo atual" só inclui o saldo acumulado de meses anteriores quando o mês imediatamente anterior tiver sido explicitamente fechado (`meses.fechado = true`); caso contrário, mostra apenas as receitas já lançadas no mês corrente.
- "Saldo projetado" é sempre `saldoAtual - despesas`, sem exceção — o valor numérico não muda em função de o mês anterior estar fechado ou não (decisão confirmada com o usuário).
- Despesas com `status != 'ativa'` (ex.: canceladas) nunca devem ser somadas em nenhum dos cards — regra já aplicada em `months.ts` e agora estendida a `financial.ts`.

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. As queries afetadas já filtram por `usuario_id` e por `perfil_id` (via `profileWhere` em `months.ts`, e via a mesma lógica de `perfil_id`/fallback pessoal em `financial.ts`) — este comportamento existente deve ser preservado integralmente nas duas queries corrigidas, alterando apenas a expressão de soma do valor e a cláusula de status. Nenhum dado sensível novo é exposto; a mudança é de precisão numérica e composição visual de dados já acessíveis ao usuário autenticado dono dos registros.

## Validações necessárias

- Nenhum novo formulário ou input de usuário é introduzido — não há novas validações de payload/schema.
- Garantir que o cálculo de `total`/`count` filtrado no frontend não quebre quando `filtered`/`allItems` estiver vazio (retornar `0`/`0`/`active: false` nesses casos).
- Garantir que a nova `useQuery` do mês anterior trate corretamente o caso de mês/ano na virada do ano (`month === 0 → mes 11 do ano anterior`), replicando a lógica já usada em `calculateBalanceBreakdown` no backend.

## Testes necessários

### Frontend

- Validação manual: card "Despesas" com lançamentos que só têm `valor` preenchido — deve somar corretamente (usar os registros já identificados em produção, ex. despesas de junho/2026 com `valor_final: null`).
- Validação manual: aplicar filtro de Status/Categoria na tabela de Despesas — confirmar que o card "Despesas" reflete apenas os itens filtrados; remover o filtro — confirmar que volta ao total do mês.
- Validação manual: aplicar busca em Receitas — confirmar o mesmo comportamento no card "Receitas".
- Validação manual: mês anterior fechado — card "Saldo atual" mostra composição (saldo anterior + receitas); mês anterior aberto — card mostra apenas receitas do mês, com aviso visível.
- Validação manual: comparar "Saldo projetado" antes e depois da mudança para o mesmo mês/dados — valor numérico deve permanecer idêntico.
- Não há suíte de testes automatizados nesta área do projeto — validação manual é obrigatória e substitui testes automatizados nesta entrega.

### Backend

- Validação manual das rotas `GET /meses/:ano/:mes/saldo` e `GET /financial/anual`, com o usuário/perfil que possui os registros legados identificados, confirmando que o total de despesas retornado passa a incluir o valor da coluna `valor` quando `valor_final`/`valor_original` forem nulos.
- Validação manual de que despesas com `status != 'ativa'` continuam excluídas da soma em `financial.ts` após a correção.

### E2E

Não aplicável — não há suíte E2E no projeto.

## Comandos de validação sugeridos

```bash
cd "sistema financas"
npx tsc --noEmit
npm run build
```

Validação manual obrigatória (UI), com backend e frontend rodando localmente (ver skill `/run`):
- Abrir Movimentações → aba Despesas, mês/ano com os registros legados conhecidos (junho/2026), confirmar card "Despesas" correto.
- Aplicar e remover filtros de Status/Categoria/Forma de pagamento/Data de pagamento, observando o card "Despesas" reagir.
- Repetir teste de busca na aba Receitas.
- Alternar entre um mês com o anterior fechado e um com o anterior aberto, conferindo o card "Saldo atual" e seu texto de composição/aviso.
- Conferir que "Saldo projetado" não muda de valor entre a versão antiga e a nova, para os mesmos dados.

## Riscos e pontos de atenção

- A correção do fallback SQL pode alterar valores numéricos exibidos em outros consumidores das mesmas rotas (`/meses/:ano/:mes/saldo`, `/financial/anual`) — por exemplo, gráficos anuais ou relatórios (`AnnualTrendChart.tsx`, `RelatoriosScreen.tsx`) que dependam desses endpoints. Não estão no escopo desta implementação, mas os valores que exibirão passarão a ser mais corretos (nunca menos), o que é a direção desejada.
- Adicionar `status = 'ativa'` na subquery de despesas de `financial.ts` pode reduzir valores no resumo anual caso existam despesas canceladas sendo somadas indevidamente hoje nesse endpoint específico — mudança desejada e confirmada, mas é bom que o usuário saiba que o resumo anual pode exibir valores menores após esta correção, caso haja despesas canceladas no histórico.
- O cálculo do total filtrado no frontend depende de `Expense.valorFinal`, que já aplica o fallback de 3 níveis no cliente — isso significa que, mesmo antes da correção do backend, os totais filtrados exibidos nos cards (quando um filtro estiver ativo) já sairão corretos; a inconsistência só persiste no total do mês inteiro (não filtrado), que depende das queries SQL corrigidas neste plano.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — as duas decisões pendentes levantadas durante o planejamento foram resolvidas com o usuário:
- Corrigir também a ausência de `status = 'ativa'` na subquery de despesas de `financial.ts` (confirmado: sim).
- Comportamento de "Saldo projetado" quando o mês anterior está aberto (confirmado: mantém o valor atual, sem aviso adicional nesse card específico).

## Critérios de aceite do plano

- O card "Despesas" (e o resumo anual) soma corretamente lançamentos que só têm a coluna legada `valor` preenchida.
- A mesma correção de fallback é aplicada nas duas rotas afetadas, sem introduzir divergência entre elas.
- A subquery de despesas em `financial.ts` passa a filtrar por `status = 'ativa'`, alinhada com a de receitas.
- Ao aplicar um filtro na tabela de Despesas ou Receitas, o card correspondente passa a exibir o total dos itens filtrados; ao remover o filtro, volta a exibir o total do mês inteiro.
- Os demais cards (Saldo atual, Saldo projetado, Comprometimento) não recalculam a partir de um subconjunto filtrado.
- O card "Saldo atual" exibe a composição (saldo herdado + receitas do mês) quando o mês anterior estiver fechado, e apenas as receitas do mês com aviso visual quando o mês anterior estiver em aberto.
- "Saldo projetado" mantém o mesmo valor numérico que teria pela fórmula anterior, para os mesmos dados de entrada, em ambos os cenários (mês anterior fechado ou aberto).
- "Receitas" e "Comprometimento" preservam comportamento e posição atuais (exceto "Receitas" também refletir filtro ativo, quando aplicável).
- Nenhuma migration foi executada; nenhum dado em produção foi alterado como parte desta implementação.
- `npx tsc --noEmit` e `npm run build` passam sem erros novos introduzidos por esta mudança.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto; a task de origem em `.portal/tasks/` tem contexto adicional de investigação, mas este plano já incorpora as decisões técnicas confirmadas.
- Seguir `sistema financas/CLAUDE.md` (sequência `/planejar → aprovação → /implementar → /finalizar`; nunca commitar/push sem passar por `/finalizar`).
- Não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados — seguir os padrões de código já presentes nos arquivos listados.
- Manter alterações pequenas e focadas exatamente no escopo acima; não implementar a correção de dados legados (`UPDATE` em `despesas`), não estender o comportamento de filtro para `BudgetPanel.tsx`.
- Preservar fielmente o comportamento de filtro de tenant/perfil (`profileWhere`, fallback pessoal) já existente nas duas queries alteradas.
- Nenhuma migration ou alteração de `.env` é necessária ou permitida neste plano.
