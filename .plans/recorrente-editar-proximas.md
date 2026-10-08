# Plano de Implementação: Edição de séries de despesa (recorrente e parcelado)

## Origem

- Arquivo de especificação: pedido do usuário na conversa de 07/10/2026, durante a conferência da fatura do cartão Mercado Pago
  - "se eu altero a data de compra para recorrente as futuras não alteram, e devem alterar, assim como valor, vencimento";
  - "editar despesa parcelada deve perguntar se altera todas ou só atual ou só atual e futuras".
- Data do planejamento: `2026-10-07` (atualizado no mesmo dia com o parcelado)
- Classificação: `frontend + backend` (sem migration)

Decisões do usuário:

1. **Recorrente:** a edição sempre vale para as próximas ocorrências em aberto, sem perguntar. O modal só avisa quantas vão mudar.
2. **O que passa:** tudo o que foi editado, campo a campo. Pagamento, anexos e nota fiscal ficam na ocorrência editada, porque são daquele mês.
3. **DonPetine** (série antiga, sem vínculo entre as ocorrências): fica fora. O usuário vai excluir e cadastrar de novo.
4. **Parcelado:**
   - o modal pergunta "Aplicar a: Só esta · Esta e as próximas · Todas", já marcado em "Só esta";
   - as parcelas **já pagas também entram**;
   - ficam de fora só as canceladas e as ligadas a pagamento de fatura, que a regra da fatura já trava.

Regra da fatura confirmada na conversa: num recorrente no crédito com cartão, a data de compra é o dia da cobrança. O vencimento é o da fatura em que essa compra cai, pelo **dia de fechamento** do cartão, como já acontece nas compras comuns no crédito.

**Segundo plano, depois deste** (anotações do mesmo dia, fora deste plano):
- valor do parcelado ao lançar: o campo é o valor da parcela, e "Sei o valor total" troca para o total. O assistente continua com o total;
- recorrência só até o fim do ano atual, com um modal perguntando se renova a série;
- o recorrente só conta depois da data de compra dele, em todas as somas, com a data de compra gravada em cada ocorrência.

## Resumo

- **Hoje:** editar uma ocorrência de despesa mensal, ou uma parcela, muda só aquela linha.
- **Com este plano:**
  - **recorrente:** as próximas ocorrências em aberto recebem os campos alterados. No crédito com cartão, quando a data de compra muda, cada próxima ganha a data de compra no mês dela, e o vencimento sai da regra da fatura;
  - **parcelado:** o modal deixa escolher entre só a parcela editada, ela e as próximas, ou todas as parcelas da compra.

## Escopo

### Dentro do escopo

- **Regra pura no backend (`expenseSeries.ts`):**
  - o vencimento da fatura pela data de compra;
  - as ocorrências e parcelas que entram em cada escopo;
  - quais campos mudaram;
  - os valores novos de cada linha.
- **Gravação:** a linha editada e as outras do escopo, numa só transação.
- **`PUT /expenses/:id`:**
  - aceita `applyTo` (`this`, `following` ou `all`), usado no parcelado;
  - responde quantas linhas da série também mudaram.
- **Modal de edição:**
  - no recorrente, o aviso "também nas próximas N";
  - no parcelado, a escolha do escopo, com a contagem de cada opção.
- **Testes:** da regra no backend, da leitura da entrada e da contagem no front.

### Fora do escopo

- As anotações do segundo plano (acima).
- Criação das séries: o mensal continua com 12 ocorrências, e só a primeira guarda a data de compra.
- Séries antigas sem vínculo (hoje só o DonPetine).
- Receita recorrente.
- Conferência da fatura de outubro do Mercado Pago, que ficou com o usuário.

## Leitura de contexto

- `/AGENT.md`
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `CLAUDE.md`, com o fluxo obrigatório
- Especificação: a conversa de 07/10/2026 e as decisões acima
- Código lido:
  - **Backend:**
    - `backend/src/services/expenseService.ts`: `buildRows` (série mensal de 12, data de compra só na primeira; parcelas com a data de compra em todas), `createExpense` (grupo com a 1ª apontando para si mesma), `findExpenseForUpdate`, `updateExpense` e `resolvePayment`;
    - `backend/src/routes/expenses.ts`, com o `PUT /:id`, `invoiceEditRefusal`, `resolveCardForWrite` e `GET /group/:grupoId`;
    - `backend/src/services/{expenseInput,cardInvoiceRules,entryQueries}.ts` e `backend/src/utils/date.ts` (`addMonthsClamped`).
  - **Front:**
    - `src/utils/expenseSchedule.ts`, com `invoiceDueDate`, a regra da fatura, e o teste dela;
    - `src/screens/finance/expense-dialog/{ExpenseDialog,draftRules,draftState}.ts(x)`;
    - `src/services/{financeService,queryKeys}.ts`: `fetchExpenseGroup` e `expenseGroup`;
    - `src/screens/despesas/DeleteInstallmentDialog.tsx`, que já busca a série;
    - `src/types/finance.ts`.
- Dados da produção, só leitura em 07/10/2026:
  - 6 séries mensais com vínculo, com 65 ocorrências em aberto;
  - 1 série antiga sem vínculo, com ocorrências em aberto (o DonPetine).

Contexto multi-tenant: o `AGENT.md` fala em "prefeitura"; aqui o isolamento é por **dono**. As linhas da série são sempre lidas e gravadas filtrando pelo dono e pela série da despesa já autorizada.

## Impacto por área

### Frontend

- **`src/types/finance.ts`:** `ExpenseUpdateScope = 'this' | 'following' | 'all'`, e `ExpenseUpdateInput` ganha `applyTo?`.
- **`src/utils/expenseSeries.ts` (novo, com teste),** com as mesmas regras do servidor:
  - `openFollowingOccurrences(series, expense)`: as próximas em aberto de uma despesa mensal;
  - `installmentScopeRows(series, expense, scope)`: as parcelas de "Esta e as próximas" (número maior que o da editada) e de "Todas". Nas duas, pagas entram, e canceladas e ligadas à fatura ficam de fora.
- **`ExpenseDialog.tsx`,** na edição de despesa com série:
  - busca a série com `useQuery(queryKeys.expenseGroup(grupoId), fetchExpenseGroup)`, como o `DeleteInstallmentDialog`;
  - **recorrente:** o rótulo da cobrança vira "Mensal · também nas próximas N", quando N > 0;
  - **parcelado:** a escolha "Aplicar a: Só esta · Esta e as próximas (N) · Todas (M)", marcada em "Só esta". O valor vai no pedido como `applyTo`;
  - **carregando ou com erro na busca:** o rótulo fica "Mensal", e a escolha mostra as opções sem a contagem. O salvamento não depende dessa busca.
- **Depois de salvar:** o `invalidateExpenseQueries` de hoje já cobre a lista, a série e as somas.

### Backend

- **`backend/src/services/expenseSeries.ts` (novo, regras puras, com teste):**
  - **`invoiceDueDateForPurchase(purchaseDate, { closingDay, dueDay })`:** a mesma regra de `invoiceDueDate` do front, com os mesmos casos de teste.
  - **`isOpenFollowingOccurrence(row, edited)` (recorrente):**
    - mesma série, mensal, vigente e não paga;
    - fora de pagamento de fatura;
    - vencimento depois do gravado na editada.
  - **`isInstallmentInScope(row, edited, scope)` (parcelado):**
    - mesma série, parcela, vigente e fora de pagamento de fatura;
    - `following` pega o número de parcela maior que o da editada; `all` pega qualquer outra;
    - as pagas entram.
  - **`changedSeriesFields(current, next)`:** descrição, categoria, forma, cartão, valor (em centavos), data de compra e vencimento.
  - **`planRecurringUpdates(...)`:**
    - descrição, categoria, forma, cartão e valor: quando mudaram;
    - data de compra: a nova, mais a distância em meses até a editada (o dia 31 cai no último dia);
    - vencimento, quando mudou data de compra, vencimento, forma ou cartão: no crédito com cartão e com data de compra, o da fatura; senão, o vencimento novo da editada mais a distância.
  - **`planInstallmentUpdates(...)`:**
    - os mesmos campos do recorrente;
    - data de compra: a nova, igual para todas, porque as parcelas dividem a mesma compra;
    - vencimento, quando mudou data de compra, vencimento, forma ou cartão: o vencimento novo da editada mais a distância em meses, que é negativa nas parcelas anteriores, em "Todas".
  - **Status vigente:** a regra recebe `active` (booleano). O serviço monta esse valor com a constante `ACTIVE_STATUS`.
- **`expenseInput.ts`:** `EXPENSE_UPDATE_SCOPES = ['this', 'following', 'all']`. `readUpdateExpenseInput` lê `applyTo` (ausente vale `this`; inválido dá 400), com teste.
- **`expenseService.ts`:**
  - **`findExpenseForUpdate`:** passa a trazer também descrição, categoria, data de compra, `recurring`, `installmentGroupId` e `currentInstallment`.
  - **`updateExpense`:** passa a receber a despesa atual e o escopo, e corre numa transação.
    - Grava a editada como hoje.
    - **Recorrente com série:** aplica às próximas em aberto.
    - **Parcela com série e `applyTo` diferente de `this`:** aplica ao escopo.
    - As linhas da série são lidas com `FOR UPDATE`, filtrando pelo dono e pela série, e `mes` e `ano` são regravados pelo vencimento novo.
    - Devolve a editada e quantas linhas da série mudaram.
  - **Cartão para a regra da fatura:** quando o resultado é crédito com cartão, `closingDay` e `dueDay` vêm do cartão já autorizado por `resolveCardForWrite`.
- **`routes/expenses.ts`, `PUT /:id`:**
  - passa a despesa atual e o `applyTo` para o serviço;
  - responde com `seriesUpdated`;
  - a trava da fatura na editada continua igual.

### Banco de dados

Sem impacto esperado. Nenhuma migration: a série já é ligada por `grupo_parcelamento_id`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/services/expenseSeries.ts` e `backend/src/services/expenseSeries.test.ts` (novos)
- `backend/src/services/expenseInput.ts` e `backend/src/services/expenseInput.test.ts`
- `backend/src/services/expenseService.ts`
- `backend/src/routes/expenses.ts`
- `src/types/finance.ts`
- `src/utils/expenseSeries.ts` e `src/utils/expenseSeries.test.ts` (novos)
- `src/screens/finance/expense-dialog/ExpenseDialog.tsx`
- `.plans/recorrente-editar-proximas.md` (este plano)

## Estratégia de implementação

1. **Branch:** `feat/R/recorrente-edicao-serie`, a partir da `main` atualizada.
2. **Regra pura do backend, testes primeiro:** `expenseSeries.ts`.
   - Os casos de `invoiceDueDateForPurchase` são copiados de `src/utils/expenseSchedule.test.ts`.
   - Entram os escopos do parcelado e as datas deslocadas para trás.
3. **Entrada:** `applyTo` em `readUpdateExpenseInput`, com teste.
4. **Serviço:** `findExpenseForUpdate` com os campos novos, e `updateExpense` em transação com a série.
5. **Rota:** o `PUT /:id` com o escopo e a resposta `seriesUpdated`.
6. **Front:** os tipos, `utils/expenseSeries.ts` com teste, e o aviso do recorrente e a escolha do parcelado no `ExpenseDialog`.
7. **Validação:** os comandos abaixo e a conferência no local (`/run`).

## Regras de negócio identificadas

1. **Recorrente:**
   - a edição de uma ocorrência sempre vale para as próximas ocorrências em aberto da mesma série, sem perguntar;
   - pagas, canceladas e ligadas à fatura não mudam.
2. **Parcelado:**
   - a edição de uma parcela pergunta: só esta, esta e as próximas, ou todas, já marcado em "só esta";
   - as pagas entram;
   - canceladas e ligadas à fatura não mudam.
3. **Passa só o que foi alterado:** descrição, categoria, forma de pagamento, cartão, valor, data de compra e vencimento.
4. **Ficam só na linha editada:** pagamento (pago, data e valor pago), anexos e nota fiscal.
5. **Recorrente, data de compra alterada:**
   - cada próxima recebe o mesmo dia no mês dela; o dia 31 vira o último dia em meses mais curtos;
   - no crédito com cartão, o vencimento sai do fechamento do cartão. Exemplo com fechamento no dia 2 e vencimento passando para o dia 9: compra em 17/10 vence em 09/11, e em 17/11, vence em 09/12.
6. **Recorrente, vencimento alterado,** sem data de compra ou fora do crédito com cartão: as próximas vão para o mesmo dia no mês delas.
7. **Parcelado, datas:**
   - a data de compra é a mesma em todas as parcelas do escopo;
   - o vencimento acompanha o novo da editada, mês a mês, inclusive para trás em "Todas".

## Regras multi-tenant e segurança

- **Dono:** vem de `resolveOwnerForWrite`, como hoje.
- **Linhas da série:** são lidas e gravadas com `usuario_id = dono` e pela série da despesa já autorizada.
- **Cartão:** é o já autorizado por `resolveCardForWrite`.
- **Endpoint:** nenhum novo. O `applyTo` é validado no servidor.
- **Concorrência:** transação com `FOR UPDATE` nas linhas da série.
- **Erros:** em português, sem dado de outra conta; nada de `catch {}` silencioso.

## Validações necessárias

- `applyTo`: `this`, `following` ou `all`. Ausente vale `this`; qualquer outro valor dá 400.
- Valores e datas das outras linhas saem do servidor, nunca do cliente.

## Testes necessários

### Frontend

- **`src/utils/expenseSeries.test.ts`:**
  - as próximas em aberto do recorrente: fora a paga, a cancelada, a ligada à fatura, a editada e as anteriores;
  - os escopos do parcelado: as pagas entram; a cancelada e a ligada à fatura ficam de fora; e "Todas" inclui as anteriores.

### Backend

- **`backend/src/services/expenseSeries.test.ts`:**
  - **`invoiceDueDateForPurchase`:** os mesmos casos do front;
  - **escopos:** as próximas do recorrente, e os escopos `following` e `all` do parcelado, com as pagas entrando;
  - **`changedSeriesFields`:** o valor em centavos; e o que não mudou não aparece.
  - **`planRecurringUpdates`:**
    - só o valor;
    - o exemplo do DonPetine;
    - o dia 31 em fevereiro;
    - vencimento fora do crédito;
    - mês pago no meio;
    - troca de cartão;
    - pagamento, anexos e nota fiscal nunca entram.
  - **`planInstallmentUpdates`:**
    - a data de compra igual para todas;
    - os vencimentos deslocados, inclusive para trás;
    - só o valor;
    - mês pulado no meio.
- **`backend/src/services/expenseInput.test.ts`:** `applyTo` ausente vale `this`; os três valores são aceitos; um inválido é recusado.

### E2E

Conferência manual no banco local (`/run`):

- **Recorrente no crédito com cartão, editando a 3ª ocorrência:**
  - mudar o valor muda da 3ª em diante;
  - mudar a data de compra faz os vencimentos seguirem a fatura;
  - o rótulo mostra "Mensal · também nas próximas N".
- **Parcelado em 6x, editando a 3/6:**
  - "Só esta" muda só ela;
  - "Esta e as próximas" muda da 3 à 6, inclusive uma já paga;
  - "Todas" muda da 1 à 6;
  - a parcela ligada à fatura não muda;
  - as contagens aparecem nas opções.
- **Recorrente com uma ocorrência paga no meio:** a paga não muda.
- **Despesa sem série:** a edição continua mudando só ela.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npx vite build
npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

- **Várias linhas numa edição:** a transação garante que ou todas mudam ou nenhuma.
- **Recorrente sempre passa para as próximas:** um ajuste que era de um mês só também passa adiante. Para voltar, edite a ocorrência seguinte.
- **Parcelado, "Todas" e "Esta e as próximas" mudam parcelas já pagas:**
  - o valor da parcela muda também nelas;
  - nas pagas, o Painel passa a mostrar a diferença entre o valor pago e o novo como juros ou desconto.
- **Regra da fatura em dois lugares:** fica no front e no backend, com os mesmos casos de teste.
- **Série antiga sem vínculo:** não passa adiante (hoje só o DonPetine).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- **Recorrente:** a edição de uma ocorrência com série muda a própria e as próximas em aberto, só nos campos alterados. No crédito com cartão, os vencimentos seguem a fatura.
- **Parcelado:** a edição de uma parcela muda o escopo escolhido, com as pagas incluídas.
- **O que não muda:** canceladas e ligadas à fatura ficam como estavam. Pagamento, anexos e nota fiscal nunca passam adiante.
- **Modal:** mostra o aviso do recorrente e a escolha do parcelado, com as contagens.
- **Despesa sem série:** sem mudança de comportamento.
- **Checks:** os comandos acima passam.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal.
- **Branch:** `feat/R/recorrente-edicao-serie`, já criada a partir da `main`.
- **Arquivos novos sem commit:** `recurringSeries.ts` e o teste dele viram `expenseSeries.ts`.
- **Sem migration e sem mexer em `.env`.**
- **Seguir o `/AGENT.md`:**
  - identificadores em inglês e textos em português;
  - Drizzle nas queries;
  - sem `any`;
  - sem `catch {}` silencioso.
- **Criação das séries:** não mexer.
- **Commits:** `.portal/` e `GLOSSARIO.md` nunca entram.
