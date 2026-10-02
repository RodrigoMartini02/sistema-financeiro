# Plano de Implementação: Valor efetivo nas despesas pagas com juros ou desconto

## Origem

- **Arquivo de especificação:** não há `.md`. O pedido veio da conversa de 2026-10-02: um print de Movimentações (outubro de 2026, filtro ativo) mostrava "Despesa do mês" = R$ 1.121,64, quando o valor pago era R$ 1.143,93. A diferença é o juro de R$ 22,29 de uma despesa no crédito.
- **Medição na produção (só leitura):** 9 de 922 despesas pagas têm valor pago diferente do previsto. Todas são juros, nenhuma é desconto, e somam R$ 539,70 entre julho e outubro de 2026. São 4 no crédito, em 2 contas.
- **Data do planejamento:** `2026-10-02`
- **Classificação:** `fullstack`. Muda o front e o servidor; o banco e as migrations não mudam.

## Resumo

O valor pago está sendo gravado (`valor_pago`), tanto pelo "Pagar" quanto pelo diálogo da despesa. O problema é que alguns pontos somam o valor previsto (`valor_original` / `valorFinal`) mesmo quando a despesa já foi paga com juros ou desconto. O correto é somar o valor efetivo: o pago, se a despesa está paga; o previsto, se não está.

- **Pontos com erro:**
  - Movimentações com filtro ativo;
  - orçamento;
  - calendário;
  - assistente;
  - copiloto.
- **Pontos que já estão certos:**
  - saldo do mês (`balanceService`);
  - painel (`painelCalculos.valorEfetivo`);
  - relatórios;
  - linha da tabela.

O plano cria uma regra única de valor efetivo no front e outra no servidor, aplica essa regra nos pontos com erro e elimina a duplicação da regra no front. Também remove uma rota sem uso, conforme a decisão 2.

## Decisões registradas

- **Decisão 1:** com filtro ativo em Movimentações, só a "Despesa do mês" segue o filtro. "Resultado do mês" e "Saldo atual" usam sempre os totais do mês, como "Saldo anterior" e "Receita do mês".
- **Decisão 2:** remover `GET /categories/stats/usage`. Ela soma o previsto de todas as despesas, sem filtro de período, e nenhuma tela usa.

## Escopo

### Dentro do escopo

#### Front

- **`src/utils/expenseValue.ts`** (novo, com teste):
  - `effectiveExpenseValue(expense)`: devolve o `valorPago` quando a despesa está paga e tem `valorPago`; caso contrário, devolve o `valorFinal`.
  - `paymentDifference(expense)`: devolve a diferença entre pago e previsto, ou `null` quando não houver diferença ou a despesa não estiver paga.
  - **Substitui:** as cópias de `valorExibido` e `diferencaValor` em `src/screens/finance/LancamentosTable.tsx` e em `src/screens/despesas/expenseStatus.tsx`.
- **`formatDiferenca`:** fica numa cópia só, em `src/screens/despesas/expenseStatus.tsx`. Sai a cópia da `LancamentosTable`.
- **`MovimentacoesScreen`:**
  - com filtro, a "Despesa do mês" soma `effectiveExpenseValue` das despesas filtradas;
  - o "Resultado do mês" passa a ser sempre receita do mês menos despesa do mês, ambos do servidor e sem filtro;
  - o "Saldo atual" não muda.
- **`calendar/CalendarView.tsx`:** cada despesa aparece com o valor efetivo.

#### Servidor

- **`backend/src/utils/expenseAmount.ts`** (novo): expressão SQL do Drizzle para o valor efetivo, `CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END`. É a mesma regra do painel e do saldo.
- **`budgetService`:** o valor efetivo passa a valer no pago, no previsto, no gasto por categoria e no histórico das sugestões. Saem o `amount` que só repetia o `originalAmount` e os `?? row.originalAmount`, que nunca entravam.
- **`assistantQueries`:** valor efetivo nas consultas que incluem despesas pagas:
  - resumo do período;
  - saldo atual;
  - saúde financeira;
  - gastos por categoria;
  - maiores gastos, ordenados pelo efetivo;
  - últimos lançamentos;
  - busca;
  - gastos por forma de pagamento;
  - contas a pagar;
  - recorrentes previstas;
  - parcelamentos abertos;
  - projeção de saldo;
  - variação por categoria.

  Saem os `amountPaid ?? amount`, que passam a ser desnecessários.
- **`financialCopilot`:** valor efetivo nos cards de resumo, categoria, lançamentos e próximos.
- **`routes/categories.ts`:** sai `GET /stats/usage`.

### Fora do escopo

- **Limite do cartão:** `cardLimitService` só soma despesas em aberto (`d.pago = false`), então o valor pago nunca entra no limite.
- **Saldo do mês, painel e relatórios:** já usam o valor efetivo; as expressões deles ficam como estão.
- **Alertas de vencimento, pagamento em lote e sugestão de valor do modal de pagar:** tratam despesas ainda não pagas.
- **Gravação do valor pago:** já está correta.

## Leitura de contexto

- **Regras:** `/AGENT.md` e `/CLAUDE.md`. Não há `/frontend/AGENT.md` nem `/backend/AGENT.md`; o `AGENT.md` da raiz cobre o repositório.
- **Front:**
  - `src/screens/finance/MovimentacoesScreen.tsx`
  - `src/screens/finance/LancamentosTable.tsx`
  - `src/screens/finance/calendar/CalendarView.tsx`
  - `src/screens/despesas/expenseStatus.tsx`
  - `src/screens/despesas/ExpenseCard.tsx`
  - `src/utils/expenseFilters.ts`
  - `src/services/financeService.ts` (`expenseFromApi`)
- **Servidor:**
  - `balanceService.ts`
  - `painelCalculos.ts`
  - `painelService.ts`
  - `reportService.ts`
  - `budgetService.ts`
  - `assistantQueries.ts`
  - `financialCopilot.ts`
  - `cardLimitService.ts`
  - `routes/categories.ts`
  - `routes/expenses.ts` (pagar)
  - `expenseService.ts`
  - `expenseInput.ts`

## Impacto por área

### Frontend

- **Movimentações:** os cards seguem a decisão 1 e somam o valor efetivo.
- **Calendário:** cada despesa mostra o valor efetivo.
- **Tabela e card de despesa:** usam a regra única. O que aparece na tela não muda.

### Backend

- **Orçamento, assistente e copiloto:** passam a somar o valor efetivo.
- **Rota removida:** `GET /api/categories/stats/usage`, que também responde pelo alias `/api/categorias`.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- **Novos:**
  - `src/utils/expenseValue.ts`
  - `src/utils/expenseValue.test.ts`
  - `backend/src/utils/expenseAmount.ts`
- **Front alterado:**
  - `src/screens/finance/MovimentacoesScreen.tsx`
  - `src/screens/finance/LancamentosTable.tsx`
  - `src/screens/finance/calendar/CalendarView.tsx`
  - `src/screens/despesas/expenseStatus.tsx`
  - `src/screens/despesas/ExpenseCard.tsx`
- **Servidor alterado:**
  - `backend/src/services/budgetService.ts`
  - `backend/src/services/assistantQueries.ts`
  - `backend/src/services/financialCopilot.ts`
  - `backend/src/routes/categories.ts`

## Estratégia de implementação

**Fase 0 — Branch**

1. Atualizar a `main` e criar `fix/R/valor-efetivo-despesas`.

**Fase 1 — Remover**

2. **Front:**
   - remover as cópias de `valorExibido` e `diferencaValor` na `LancamentosTable` e no `expenseStatus`;
   - remover a cópia de `formatDiferenca` na `LancamentosTable`;
   - remover a soma pelo previsto e o resultado filtrado em Movimentações;
   - remover o `value: expense.valorFinal` do calendário.
3. **Servidor:**
   - no orçamento, remover o `amount` repetido e os `?? row.originalAmount`;
   - no assistente e no copiloto, remover os `amount: expenses.originalAmount` e os `amountPaid ?? amount`;
   - remover a rota `/stats/usage`.

**Fase 2 — Aplicar**

4. Criar `src/utils/expenseValue.ts` e o teste. Usar a regra na tabela, no card de despesa, em Movimentações (seguindo a decisão 1) e no calendário.
5. Criar `backend/src/utils/expenseAmount.ts` e usar a expressão no orçamento, no assistente (incluindo a ordenação de "maiores gastos") e no copiloto.

**Fase 3 — Validar**

6. Rodar `npx tsc --noEmit`, `npm test`, `npm run build`, `npm --prefix backend run build` e `npm --prefix backend test`.
7. **Roteiro local**, com o backend numa porta livre e o banco do `.env.dev`:
   - criar despesas de teste e pagar uma com juros (pelo "Pagar") e uma com desconto;
   - conferir os totais do orçamento (pago e previsto);
   - conferir as consultas do assistente: resumo do período, gastos por categoria e maiores gastos, chamadas direto pelos serviços com um escopo de teste;
   - conferir o card de resumo do copiloto;
   - conferir que `/categories/stats/usage` responde 404.
8. **Fumaça jsdom de Movimentações**, com `fetch` simulado:
   - com o filtro "Pago", a "Despesa do mês" soma o valor efetivo, enquanto "Resultado do mês" e "Saldo atual" ficam iguais aos de sem filtro;
   - no calendário, a despesa paga com juros mostra o valor pago.
9. Apagar os dados de teste e encerrar o backend pela árvore de processos.

## Regras de negócio identificadas

- **Valor efetivo da despesa:** se ela está paga, vale o valor pago, com juros ou desconto; se não está, vale o previsto.
- **Filtro em Movimentações:** só a "Despesa do mês" segue o filtro. "Saldo anterior", "Receita do mês", "Resultado do mês" e "Saldo atual" são sempre do mês inteiro.

## Regras multi-tenant e segurança

Não muda nada. As consultas mantêm os mesmos filtros de usuário e conta; só troca a coluna que é somada.

## Validações necessárias

Nenhuma validação de entrada nova.

## Testes necessários

### Frontend

- **Teste unitário de `effectiveExpenseValue` e `paymentDifference`**, cobrindo:
  - despesa paga com juros;
  - despesa paga com desconto;
  - despesa paga sem `valorPago`;
  - despesa não paga.
- **Fumaça jsdom** (passo 8).

### Backend

- **Roteiro local** (passo 7). A expressão SQL é validada contra o banco local.

### E2E

- Roteiro e fumaça locais, com limpeza ao final.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

- **Totais maiores:** o orçamento e o assistente passam a mostrar valores maiores nos meses com juros. Na produção, isso afeta julho a outubro de 2026, somando R$ 539,70.
- **Ordem de "maiores gastos":** pode mudar.
- **"Resultado do mês" com filtro:** deixa de acompanhar o filtro (decisão 1).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Com filtro, a "Despesa do mês" de Movimentações soma o valor pago das despesas pagas. No exemplo do print, fica R$ 1.143,93.
- "Resultado do mês" e "Saldo atual" não mudam com o filtro.
- O calendário mostra o valor pago das despesas pagas.
- Orçamento, assistente e copiloto usam o valor efetivo.
- A regra do front existe num único lugar, sem cópias de `valorExibido` ou `diferencaValor`.
- `/categories/stats/usage` não existe mais.
- tsc, testes e builds passam.

## Observações para a skill implementar

- **Ordem:** a Fase 1 remove e a Fase 2 aplica.
- **Banco:** sem migration.
- **Proibições:**
  - não fazer commit nem push;
  - não alterar o `.env`.
