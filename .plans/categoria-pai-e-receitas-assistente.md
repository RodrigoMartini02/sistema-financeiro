# Plano de Implementação: Categoria pai no filtro, receitas do assistente e copiloto

## Origem

- Arquivo de especificação: conversa de 2026-10-05.
  - Achados dos prints de `.plans/quem-paga-e-filtros-painel.md`.
  - Respostas do usuário: "1 sim 2 sim 3 sim"; depois, as decisões "1 - sim, 2 - 1, 3 - 1".
- Data do planejamento: `2026-10-05`
- Classificação: `fullstack`

## Resumo

Acréscimo à branch `feat/R/quem-paga-e-filtros-painel`, antes do `/finalizar`. São três correções.

1. **Filtro de categoria:** marcar o grupo de uma categoria pai traz o pai e as subcategorias.
   - Hoje o botão de filtros marca só as subcategorias. As despesas lançadas direto no pai ficam de fora, no Painel, em Lançamentos e em Relatórios.
   - No banco local, o grupo "Alimentação" dá R$ 1.778,97 em vez de R$ 6.051,15.
2. **Receitas no assistente:** as consultas passam a respeitar o status. Hoje elas somam receitas canceladas e previstas.
3. **Copiloto** (cards de reserva do chat): deixa de somar e listar despesas canceladas e segue a mesma regra das receitas.
   - A parte das despesas é uma falha da etapa 2 do plano anterior: a regra "cancelada fora de tudo" já valia para ele.

## Escopo

### Dentro do escopo

- **Botão de filtros (`MultiFilterPanel`):**
  - marcar o grupo marca o pai e todas as subcategorias; desmarcar desmarca todos;
  - o cabeçalho reflete o pai e as subcategorias.
- **Aviso do Painel filtrado:** o grupo inteiro marcado aparece só com o nome do pai.
- **Consultas de receita do assistente (`assistantQueries`):**
  - cada função recebe o status de receita certo;
  - "contas a receber" passa a separar pelo status;
  - a descrição da ferramenta para o modelo é atualizada.
- **Copiloto (`financialCopilot`):**
  - despesas só ativas em todos os cards;
  - receitas pela mesma regra do assistente.

### Fora do escopo

- Lançar despesa direto na categoria pai: o modal de despesa continua como está.
- As consultas de despesa do assistente, já corrigidas nesta branch (`969d5e8f` e `65bee57c`).
- O filtro de receitas por classificação (não tem pai e subcategoria no botão de filtros).
- O texto "N categorias" no resumo do PDF de Relatórios. Ele conta ids e mostra "3 categorias" para um grupo com duas subcategorias; fica como está.
- Uma linha "Sem subcategoria" dentro do grupo (decisão 1 escolheu a opção sem linha nova).

## Leitura de contexto

- `/AGENT.md`
- `/CLAUDE.md`
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `.plans/quem-paga-e-filtros-painel.md` (plano anterior, mesma branch)
- Filtro de categoria:
  - `src/ui/MultiFilterPanel.tsx` (`toggleParent` e o comentário "o valor do pai em si nunca entra no Set")
  - `src/screens/finance/useEntryFilters.ts`
  - `src/utils/categorySuggestions.ts` (`categoryFilterOptions`)
  - `src/utils/expenseFilters.ts` (`filterExpenses`, que compara o id exato)
  - `backend/src/services/reportService.ts` (id exato)
  - `backend/src/services/painelCalculos.ts` (`filtrarDespesasPainel`, id exato)
  - `src/screens/finance/FinanceDashboard.tsx` (nomes do aviso)
- Receitas e copiloto:
  - `backend/src/services/assistantQueries.ts` (`incomeRange` e `incomeAll` sem status; `contasAReceber` com o comentário "Receita nao tem status de pagamento no modelo")
  - `backend/src/services/assistantTools.ts` (descrições `saldo_atual` e `contas_a_receber`)
  - `backend/src/services/financialCopilot.ts` (`accountExpenseCondition` e `accountIncomeCondition` sem status)
  - `backend/src/services/entryQueries.ts` (`ACTIVE_STATUS`, `RECEIVABLE_STATUSES`, `incomeBaseConditions`)
  - `backend/src/services/budgetService.ts` (já filtra `ativa`)
  - `backend/src/services/aiIntegrations.ts` (`getActiveAiProvider`; o banco local não tem provedor ativo)
  - `backend/src/services/assistantDateRange.ts` e `assistantPayment.ts` (padrão de módulo puro com teste)

## Impacto por área

### Frontend

- **`src/utils/filterGroupSelection.ts` (novo, funções puras):**
  - marcar e desmarcar o grupo com o pai;
  - estado do cabeçalho: marcado, parcial ou vazio;
  - teste em `filterGroupSelection.test.ts`.
- **`MultiFilterPanel.tsx`:**
  - usa essas funções;
  - o comentário errado sai: há despesas lançadas direto no pai.
- **`categorySuggestions.ts`:**
  - nova função dos nomes do aviso: com o grupo inteiro marcado, só o nome do pai; senão, os nomes marcados;
  - teste em `categorySuggestions.test.ts` (novo).
- **`FinanceDashboard.tsx`:** os nomes do aviso passam a vir dessa função.
- **`useEntryFilters.ts`:** só o comentário de `categoryIds`.
- **Sem mudança:** chaves de cache (o Painel já inclui `categoryIds`), pedidos e estados de carregamento, erro e vazio.

### Backend

- **`assistantQueries.ts`:**
  - a consulta de receitas recebe a lista de status. Recebidas = `[ACTIVE_STATUS]`; não canceladas = `[ACTIVE_STATUS, ...RECEIVABLE_STATUSES]`. As constantes vêm de `entryQueries`.
  - Aplicação por função:
    - `resumoPeriodo` (e `comparativoPeriodos`), `saldoAtual` e `saudeFinanceira`: só recebidas;
    - `projecaoSaldo`: não canceladas;
    - `buscarLancamentos` e `ultimosLancamentos`: não canceladas, com a marca `received` nos itens de receita da busca;
    - `contasAReceber`: não canceladas, separadas pela regra de contas a receber, com as marcas `received` e `overdue` em cada item. O comentário sobre a data sai.
- **`assistantReceivables.ts` (novo, função pura):** a regra de contas a receber (situação × status × data), com teste em `assistantReceivables.test.ts`. Segue o padrão de `assistantDateRange.ts`.
- **`assistantTools.ts`:** a descrição de `contas_a_receber` e do parâmetro de situação explicam em aberto, vencido e todos, e que cancelada fica fora.
- **`financialCopilot.ts`:**
  - `accountExpenseCondition` passa a filtrar `ACTIVE_STATUS`, o que vale para os cards de resumo, categorias, lançamentos e próximos vencimentos;
  - `accountIncomeCondition` recebe a lista de status: o resumo usa só recebidas e os lançamentos usam as não canceladas.
- **Permissões e escopo:** os filtros de pessoa e conta continuam iguais. Só entra o filtro de status.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/ui/MultiFilterPanel.tsx`
- `src/utils/filterGroupSelection.ts` e `src/utils/filterGroupSelection.test.ts` (novos)
- `src/utils/categorySuggestions.ts` e `src/utils/categorySuggestions.test.ts` (teste novo)
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/useEntryFilters.ts` (comentário)
- `backend/src/services/assistantQueries.ts`
- `backend/src/services/assistantReceivables.ts` e `backend/src/services/assistantReceivables.test.ts` (novos)
- `backend/src/services/assistantTools.ts`
- `backend/src/services/financialCopilot.ts`

## Estratégia de implementação

1. **Branch:** continuar em `feat/R/quem-paga-e-filtros-painel`. Nada de branch nova.
2. **Tela, filtro do pai:**
   - `filterGroupSelection.ts` com teste;
   - `MultiFilterPanel` usa as funções, e o comentário é corrigido;
   - função dos nomes do aviso com teste, usada no `FinanceDashboard`;
   - comentário de `useEntryFilters`;
   - commit.
3. **Servidor, receitas do assistente:**
   - status explícito nas consultas;
   - `assistantReceivables.ts` com teste;
   - descrição de `contas_a_receber`;
   - commit.
4. **Servidor, copiloto:**
   - despesas só ativas;
   - receitas pela regra (resumo: recebidas; lançamentos: não canceladas);
   - commit.
5. **Roteiro no banco local:** amplia o roteiro do plano anterior, com os usuários `*@roteiro-quem-paga.test` apagados no fim.
   - Receitas de A: recebida no mês (passada), prevista futura, prevista atrasada, faturada futura e cancelada. Mais uma despesa cancelada.
   - Confere:
     - resumo do período, saldo atual e saúde financeira só com a recebida;
     - projeção com recebidas e a receber, sem a cancelada;
     - contas a receber: em aberto = prevista futura e faturada; vencido = prevista atrasada; todos = as quatro não canceladas; marcas `received` e `overdue`;
     - busca: a cancelada não aparece e a prevista vem com `received` falso;
     - último lançamento: não traz a cancelada.
   - Copiloto: o chat (`runFinancialCopilot`) com frases que caem em cada card. Confirmar antes que o banco local continua sem provedor de IA ativo.
     - O resumo conta só a receita recebida e não conta a despesa cancelada.
     - A despesa cancelada não aparece em categorias, próximos vencimentos e lançamentos, e a receita cancelada não aparece em lançamentos.
   - Registro no plano.
6. **Validação:** verificação de tipos, testes e builds do front e do back. Teste de tela no jsdom (`tmpclaude-*`):
   - Lançamentos, com despesas em "Alimentação" (809) e "Academia" (823):
     - marcar o grupo mostra as duas, com o cabeçalho marcado;
     - marcar só "Academia" mostra só ela, com o cabeçalho parcial.
   - Relatórios: marcar o grupo envia `category_id=809`, além das subcategorias.
   - Painel: o pedido leva 809, 823 e 914, e o aviso mostra "Painel filtrado: Alimentação".
   - Registro no plano.
7. **Prints** (computador e celular), no Edge, com a página temporária e respostas do banco local:
   - o botão de filtros com o grupo Alimentação marcado;
   - o Painel filtrado por Alimentação.
   - **A implementação para aqui** até o usuário aprovar.
8. **`/finalizar`:**
   - cobre a branch inteira (este plano e o anterior), sem migration;
   - depois do deploy, conferir na produção, só lendo, a verificação do plano anterior: o total de outubro do Rodrigo é R$ 4.785,24.

## Regras de negócio identificadas

- **Grupo de categoria no filtro:**
  - marcar o grupo marca o pai e todas as subcategorias; marcar uma subcategoria marca só ela;
  - o pai só entra pelo cabeçalho.
- **Cabeçalho do grupo:**
  - marcado: o pai e todas as subcategorias estão marcados;
  - parcial: parte deles está marcada;
  - vazio: nada está marcado.
- **Aviso do Painel:** grupo inteiro → só o nome do pai; senão, os nomes marcados.
- **Status das receitas:** recebida = `ativa`; a receber = `prevista` ou `faturada`; `cancelada` nunca conta.
- **Assistente:**
  - somas do que entrou (resumo do período, comparativo, saldo atual, saúde financeira): só as recebidas;
  - projeção de saldo: recebidas e a receber;
  - listas (busca, último lançamento): recebidas e a receber, com a marca de recebida;
  - contas a receber:
    - em aberto: a receber com data de hoje em diante;
    - vencido: a receber com data passada;
    - todos: recebidas e a receber.
- **Copiloto:**
  - despesas só ativas, pelo pagador (`expensePayer`);
  - o resumo conta só as receitas recebidas;
  - os lançamentos trazem as receitas não canceladas.

## Regras multi-tenant e segurança

- As consultas do assistente e do copiloto mantêm os filtros de pessoa (`scope.userId`, `expensePayer`) e de conta. Este plano só acrescenta o filtro de status.
- O filtro de categoria continua validado no servidor: `readQueryIdList` no Painel e o leitor de Relatórios. Mandar o id do pai não amplia o que a pessoa vê, porque as consultas seguem limitadas às despesas dela e da conta.
- Nada de dado de outra conta em mensagens de erro: não há mensagem nova.

## Validações necessárias

- Sem entrada nova.
- Os ids de categoria seguem as validações atuais: inteiros > 0 no Painel e nos Relatórios.
- Os status de receita são constantes do servidor (`ACTIVE_STATUS`, `RECEIVABLE_STATUSES`), nunca vêm do pedido.

## Testes necessários

### Frontend

- **`filterGroupSelection.test.ts`:**
  - marcar o grupo marca o pai e as subcategorias; desmarcar limpa todos;
  - marcar uma subcategoria não marca o pai;
  - estado do cabeçalho marcado, parcial e vazio;
  - subcategorias marcadas uma a uma (sem o pai) → parcial.
- **`categorySuggestions.test.ts`:** grupo inteiro → nome do pai; parte do grupo → nomes das subcategorias; categoria solta → o nome dela.
- **Tela no jsdom:** os cenários da etapa 6.

### Backend

- **`assistantReceivables.test.ts`:** em aberto, vencido e todos × recebida, prevista, faturada e cancelada × data passada, de hoje e futura.
- **Roteiro no banco local:** etapa 5.

### E2E

- No navegador:
  - Painel e Lançamentos com o grupo Alimentação;
  - no assistente, "quanto recebi este mês" e "o que tenho a receber", com IA ativa.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p tsconfig.json
npm test
npx vite build
npm --prefix backend run build
npm --prefix backend test
npx tsx <roteiro no banco local>
npx tsx tmpclaude-<cenarios>.tsx
```

## Riscos e pontos de atenção

- **Totais com filtro de grupo sobem:** no banco local, o grupo Alimentação vai de R$ 1.778,97 para R$ 6.051,15, igual a "Onde mais gastou". É o efeito desejado.
- **Respostas do assistente mudam:** "quanto recebi", "saldo atual" e "contas a receber" deixam de contar previstas e canceladas. A ferramenta `saldo_atual` já prometia "só o que foi recebido".
- **Cabeçalho parcial:** marcar as subcategorias uma a uma deixa o cabeçalho parcial, porque o pai só entra pelo cabeçalho.
- **Cards do copiloto:** só aparecem sem provedor de IA, sem cota ou com falha da IA. Com IA ativa, valem as consultas do assistente, também corrigidas aqui.
- **Seleção em lote de Lançamentos:** segue os filtros. Com o pai incluído, as despesas dele passam a entrar na seleção, como esperado.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **Painel, grupo "Alimentação" marcado:**
  - o pedido leva 809, 823 e 914;
  - "Saiu" dá R$ 6.051,15 no banco local;
  - o aviso mostra "Painel filtrado: Alimentação".
- **Painel, só "Academia" marcada:** "Saiu" dá R$ 1.778,97 e o cabeçalho fica parcial.
- **Lançamentos:** o grupo marcado traz as despesas do pai e das subcategorias.
- **Relatórios:** o pedido do grupo marcado leva o id do pai.
- **Assistente:**
  - cada consulta segue a regra de status: somas com recebidas, projeção com a receber, contas a receber por status;
  - nenhuma soma ou lista traz cancelada.
- **Copiloto:** nenhum card soma ou lista despesa cancelada, e o resumo conta só as receitas recebidas.
- **Checks:** tipos, testes, builds, roteiro e teste de tela passando; prints aprovados.

## Observações para a skill implementar

- **Fonte:** usar este plano e o anterior (`.plans/quem-paga-e-filtros-painel.md`, mesma branch); seguir `/AGENT.md` e `/CLAUDE.md`.
- **Branch e commits:** continuar em `feat/R/quem-paga-e-filtros-painel`, com um commit por etapa.
- **Queries:**
  - as alteradas seguem em Drizzle, reaproveitando as constantes de `entryQueries.ts`;
  - nada de SQL cru novo.
- **Código:**
  - identificadores em inglês e textos de tela em português;
  - nada de `any`;
  - regras puras com teste.
- **Efeitos no front:** nunca depender de conjuntos ou listas recriados a cada render.
- **Arquivos temporários:** `tmpclaude-*` e os scripts do scratchpad, apagados no fim. Os dados do roteiro ficam só no banco **local** e são apagados no fim.
- **Migrations:** este plano não tem migration. Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
- **Registro:** no fim deste plano, a cada etapa concluída.

## Registro de andamento

- **Etapa 1 (branch):** continua `feat/R/quem-paga-e-filtros-painel`.
- **Etapa 2 (tela, filtro do pai):** commit `be275896`.
  - `filterGroupSelection.ts` (`groupHeaderState`, `toggleGroupSelection`) com 6 testes. O `MultiFilterPanel` usa as duas funções, e o comentário errado saiu.
  - `categoryFilterNames` com 5 testes, usada no aviso do Painel.
  - Comentários de `useEntryFilters` e `categoryFilterOptions` atualizados.
- **Etapa 3 (servidor, receitas do assistente):** commit `b4ff3b51`.
  - **Desvio:** `RECEIVED_INCOME_STATUSES` e `LIVE_INCOME_STATUSES` entram em `entryQueries.ts`, derivadas das constantes de lá, para o assistente e o copiloto usarem as mesmas listas.
  - `incomeRange` exige os status, e cada função usa a lista da regra.
  - `contasAReceber` separa pelo status, com as marcas `received` e `overdue`.
  - `assistantReceivables.ts` (puro, 5 testes) recebe "recebida ou não" e a data. **Desvio:** a cancelada sai na consulta, e quem confere isso é o roteiro; por isso a matriz do teste não tem "cancelada".
  - **Desvio:** na busca, a marca de recebida usa o campo `pago` que os itens já tinham. Para receita ele estava fixo em `true`; agora é `pago` = recebida, em vez de um campo novo que contradiria esse.
  - A descrição de `contas_a_receber` foi atualizada.
- **Etapa 4 (servidor, copiloto):** commit `67caf731`.
  - `accountExpenseCondition` passou a filtrar `ativa`.
  - `accountIncomeCondition` passou a receber os status: o resumo usa só recebidas; os lançamentos, as não canceladas.
- **Etapa 5 (roteiro no banco local):** 31/31 (as 18 do plano anterior e 13 novas); usuários de teste apagados no fim.
  - Cada verificação nova falharia no código antigo. Exemplos:
    - o resumo daria 6.900 em vez de 1.000;
    - a despesa cancelada apareceria em "Sem categoria" e nos próximos vencimentos;
    - "em aberto" traria a venda cancelada.
  - O banco local está sem provedor de IA, conferido no próprio roteiro.
- **Etapa 6 (validação):**
  - `tsc` do front ok; testes 165/165 (front) e 339/339 (back); build do back ok.
  - `vite build` ok na segunda tentativa. A primeira caiu por falta de memória momentânea do Node, com 9 GB livres no sistema, e não por erro no código.
  - Tela no jsdom: 15/15.
    - Painel: o pedido leva 809, 823 e 914; o cabeçalho fica marcado; o aviso mostra "Alimentação".
    - Lançamentos: o grupo traz a despesa do pai e a da sub; só "Academia" deixa o cabeçalho parcial.
    - Relatórios: o pedido leva o id do pai.
- **Etapa 7 (prints):** `computador-11`, `computador-12`, `celular-13` e `celular-14` em `tmpclaude-prints/`. O antigo `computador-06` (grupo com R$ 1.778,97) foi apagado. **Aguardando aprovação.**
