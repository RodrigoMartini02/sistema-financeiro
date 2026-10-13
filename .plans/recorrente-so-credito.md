# Plano de Implementação: Recorrente só no cartão de crédito

## Origem

- Arquivo de especificação: conversa de 13/10/2026.
  - Regra do usuário: "recorrente é só em cartão de crédito... é uma forma de pagamento que só cartão de crédito tem".
  - Pedido: tirar "Recorrente" do Pix, do débito e do dinheiro no lançamento de despesa.
- Data do planejamento: `2026-10-13`
- Classificação: `frontend + backend`

Decisões do usuário em 13/10/2026:

1. **Cartão obrigatório:** a recorrente exige Crédito com um cartão escolhido. Sem cartão de crédito cadastrado, a opção não aparece.
2. **Juca:** na frase com "mensal", "assinatura", "fixa" ou "todo mês":
   - sem forma dita, vira Crédito, e o cartão vem da frase ou é escolhido no card;
   - com Pix, débito ou dinheiro dito, vira "Não repete", com a forma dita.

## Resumo

- **Hoje:**
  - o modal de despesa oferece "Recorrente" em qualquer forma. Fora do crédito, aparece "Todo dia X de cada mês";
  - o servidor aceita mensal em qualquer forma;
  - a edição de uma recorrente pode trocar a forma para Pix, débito ou dinheiro;
  - o Juca monta "mensal" sem olhar a forma. Sem forma dita, ele usa dinheiro, então "assinatura de 55 por mês" vira recorrente em dinheiro.
- **Com este plano:**
  - a recorrente existe só no Crédito com cartão, no modal, no Juca e no servidor;
  - a renovação de dezembro ignora séries fora do crédito;
  - sai o código que só servia à recorrente fora do crédito.

## Escopo

### Dentro do escopo

- **Modal de despesa:**
  - "Recorrente" na Cobrança só com Crédito e pelo menos um cartão de crédito cadastrado;
  - a cobrança volta para "Não repete" quando a forma sai do crédito;
  - na edição de uma recorrente, a forma fica no Crédito, e só o cartão pode trocar;
  - saem o "Todo dia X de cada mês", o campo do dia (`recurrenceDay`), a validação e a mensagem dele.
- **Servidor:**
  - o `POST /expenses` recusa mensal fora do crédito com cartão;
  - o `PUT /expenses/:id` recusa tirar uma recorrente do crédito com cartão;
  - a série nova e a renovação perdem o caminho sem cartão;
  - a renovação só oferece séries no crédito com cartão.
- **Juca:**
  - a leitura da frase segue a decisão 2;
  - no card, "Recorrente" só aparece com Crédito e cartão cadastrado, e trocar a forma volta para "Não repete".
- **Demo:** a mensal só com cartão, como no servidor.

### Fora do escopo

- **Contagem (`expenseCounting`):** não muda. O caminho fora do crédito continua valendo para os registros antigos.
- **Dados antigos:** as 2 recorrentes fora do crédito na produção, ambas pagas, ficam como estão. Não há migration.
- **Parcelado:** não muda.
- **Receitas:** a fixa e o "Repetir até" ficam para o plano parado.

## Leitura de contexto

- `/AGENT.md`
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `CLAUDE.md`, com o fluxo obrigatório
- Especificação: a conversa de 13/10/2026 e as decisões acima
- `.plans/recorrente-ano-e-contagem.md`, já na produção (merge `7840bc35`)
- Código lido:
  - **Modal de despesa:** em `src/screens/finance/expense-dialog/`, os arquivos `BillingPopover`, `PaymentMethodPopover`, `ExpenseRow`, `ExpenseDialog`, `draftRules` e `draftState`, além de `src/screens/finance/entry-dialog/batchState.ts`.
  - **Juca no front:** em `src/components/financial-assistant/`, os arquivos `FinancialAssistant.tsx` e `cardDraft.ts`, com o teste.
  - **Servidor:**
    - `backend/src/services/expenseInput.ts`, `expenseService.ts`, `expenseSeries.ts`, `seriesRenewalService.ts` e `expenseCounting.ts`;
    - `backend/src/routes/expenses.ts`, com o `resolveCardForWrite`.
  - **Juca no servidor:** `backend/src/services/assistantSlotParser.ts`, `assistantSlotSession.ts` e `financialCopilot.ts`, no `slotDraftToAssistantDraft`.
  - **Demo:** `src/services/demo/fakeApiResolver.ts`.
- Produção, em só leitura em 13/10/2026: há 2 recorrentes ativas fora do crédito com cartão, as duas pagas.

Contexto multi-tenant: o `AGENT.md` fala em "prefeitura"; aqui o isolamento é por **dono e conta**. As regras novas só restringem e não ampliam nenhum acesso.

## Impacto por área

### Frontend

- **Regras puras (`draftRules.ts`, com teste):**
  - **`canBeRecurring(draft, cards)`:** a forma é Crédito e há pelo menos um cartão de crédito compatível. Decide se a opção aparece.
  - **`withRecurringOnCredit(draft)`:** o rascunho mensal fora do Crédito volta para `single`.
  - **`validateDraft`:**
    - sai o `recurrenceDay`;
    - entra `errors.recurring` quando o rascunho é mensal e não está no crédito com cartão, se o `errors.card` ainda não cobre o caso.
  - **`errorMessage`:** sai "informe o dia do mês, de 1 a 31" e entra "a recorrente é só no cartão de crédito".
  - **`computedDueDate`:** sai o caminho `recurrence`, que é o dia do mês fora do cartão. O `DueDateKind` perde o `'recurrence'`.
  - **`summarizeDraft`:** a mensal fica "R$ X · todo mês na fatura {cartão} · até dezembro".
- **Rascunho (`draftState.ts`):**
  - saem o `recurrenceDay`, do `ExpenseDraft` e do `createDraft`, e o `DraftErrors.recurrenceDay`;
  - entra o `DraftErrors.recurring`;
  - o `dialogReducer` aplica `withRecurringOnCredit` depois do `update` e do `applySuggestion`. Isso cobre a linha, o lote, a barra "Lançando em" e a sugestão do histórico.
- **`BillingPopover.tsx`:**
  - a prop `recurringAvailable` esconde "Recorrente" quando é falsa;
  - sai a seção "Todo dia X de cada mês";
  - fica a nota do crédito, com o texto "A recorrência segue a fatura do cartão.".
- **`PaymentMethodPopover.tsx`:** a prop `creditOnly` mostra só Crédito, com os cartões, e a nota "A recorrente é só no cartão de crédito.".
- **`ExpenseRow.tsx`:** passa `recurringAvailable` (de `canBeRecurring`) ao `BillingPopover` e `creditOnly` ao `PaymentMethodPopover`, por uma prop nova `creditOnlyPayment`.
- **`ExpenseDialog.tsx`:** na edição de uma despesa recorrente, passa `creditOnlyPayment`.
- **Card do Juca (`FinancialAssistant.tsx`):**
  - a opção "Recorrente" da Cobrança só aparece com Crédito e cartões de crédito (`cardsForDraft`);
  - trocar a forma para fora do crédito com "mensal" marcado leva a cobrança para "nao".
- **`cardDraft.ts`:** sai o `recurrenceDay`. O vencimento da recorrente no crédito vem da fatura ou da data digitada.
- **Demo (`fakeApiResolver.ts`):** a mensal exige o cartão, com o erro "Recorrente é só no cartão de crédito." quando ele falta. Sai o caminho sem cartão.

### Backend

- **Leitura do pedido (`expenseInput.ts`, com teste):** no `readCreateExpenseInput`, a mensal exige a forma `INVOICE_EXPENSE_METHOD` e o `cardId`. Fora disso, a resposta é 400 com "Recorrente é só no cartão de crédito: escolha o cartão".
- **Regra da edição (`expenseSeries.ts`, com teste):** `recurringPaymentRefusal(current, next)`.
  - **Quando recusa:** a linha é recorrente, a forma ou o cartão mudou, e o resultado não é Crédito com cartão. A mensagem é "A recorrente fica no cartão de crédito: dá para trocar só o cartão".
  - **Linha antiga fora do crédito:** se a forma e o cartão não mudam, passa.
- **`routes/expenses.ts`:** o `PUT /:id` chama a regra depois do `invoiceEditRefusal` e responde 400.
- **`expenseService.createExpense`:**
  - a mensal sempre tem os dias do cartão. Se o cartão não for encontrado, a resposta usa a mensagem de cartão indisponível;
  - o `buildRows` recebe `InvoiceCardDays`, sem `null`.
- **`expenseSeries.ts`:**
  - o `monthlySeriesDates` perde o caminho sem cartão;
  - o `renewalDates` exige o cartão e mantém o vencimento mês a mês quando a última ocorrência não tem data de compra. Esse caso existe nos registros antigos.
- **`seriesRenewalService.ts`:** a listagem e a decisão consideram só séries cuja última ocorrência vigente está no crédito com cartão.
- **Juca (`assistantSlotParser.seedDraftFromMessage`, com teste em `assistantSlotFilling.test.ts`):** a regra da decisão 2 entra antes de procurar o cartão na frase. Assim, "assinatura Netflix 55 no Nubank" já encontra o Nubank.
- **Multi-tenant:** sem mudança. O cartão continua validado pelo `resolveCardForWrite`, liberado para quem lança e compatível com a forma.

### Banco de dados

Sem impacto esperado. Não há migration: as 2 recorrentes antigas fora do crédito ficam como histórico.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado: não há variável de ambiente nova nem job. Se um front antigo, em cache, ainda oferecer "Recorrente" no Pix, o servidor recusa com uma mensagem clara.

## Arquivos provavelmente afetados

- **Front:**
  - `src/screens/finance/expense-dialog/BillingPopover.tsx`, `PaymentMethodPopover.tsx`, `ExpenseRow.tsx` e `ExpenseDialog.tsx`;
  - `src/screens/finance/expense-dialog/draftRules.ts` e `draftRules.test.ts`;
  - `src/screens/finance/expense-dialog/draftState.ts`;
  - `src/components/financial-assistant/FinancialAssistant.tsx`, `cardDraft.ts` e `cardDraft.test.ts`;
  - `src/services/demo/fakeApiResolver.ts`.
- **Backend:**
  - `backend/src/services/expenseInput.ts` e `expenseInput.test.ts`;
  - `backend/src/services/expenseSeries.ts` e `expenseSeries.test.ts`;
  - `backend/src/routes/expenses.ts`;
  - `backend/src/services/expenseService.ts` e `seriesRenewalService.ts`;
  - `backend/src/services/assistantSlotParser.ts` e `assistantSlotFilling.test.ts`.
- `.plans/recorrente-so-credito.md` (este plano)

## Estratégia de implementação

1. **Branch:** `feat/R/recorrente-so-credito`, a partir da `main` atualizada.
2. **Regras puras, testes primeiro:**
   - no front: `canBeRecurring`, `withRecurringOnCredit` e a validação;
   - no backend: a leitura do pedido e o `recurringPaymentRefusal`.
3. **Modal:** o rascunho e o reducer, o `BillingPopover`, o `PaymentMethodPopover`, a linha e o diálogo. O código do "Todo dia X" sai primeiro, sem sobras.
4. **Servidor:** o `PUT`, a criação da série e a renovação.
5. **Juca:** a frase no servidor, o card no front e o `cardDraft`.
6. **Demo:** a mensal só com cartão.
7. **Validação:** os comandos abaixo e a conferência no local (`/run`).

## Regras de negócio identificadas

1. **Exclusividade:** a recorrente é uma forma de cobrança exclusiva do cartão de crédito e exige Crédito com cartão escolhido.
2. **Sem cartão cadastrado:** sem cartão de crédito cadastrado, a opção "Recorrente" não aparece.
3. **Troca de forma:** trocar a forma com Recorrente marcado leva a cobrança para "Não repete".
4. **Edição:** na edição de uma recorrente, a forma fica no Crédito. O cartão pode trocar, e as próximas em aberto acompanham, como hoje.
5. **Recorrentes antigas fora do crédito:** ficam como histórico. Continuam editáveis sem trocar a forma e não renovam.
6. **Juca:**
   - "mensal", "assinatura", "fixa" ou "todo mês" sem forma dita vira Crédito;
   - com Pix, débito ou dinheiro dito, vira "Não repete".
7. **Somas:** a contagem e as somas não mudam.

## Regras multi-tenant e segurança

- **Validação no servidor:** a regra vale no `POST` e no `PUT`, não só no front.
- **Cartão:** continua validado pelo `resolveCardForWrite`, liberado para quem lança e compatível com a forma.
- **Renovação:** continua só nas séries do próprio usuário.
- **Erros:** em português, sem dado de outra conta, e sem `catch {}` silencioso.

## Validações necessárias

- **`POST /api/expenses`:** com `billingType: 'monthly'`, exige `paymentMethod: 'credito'` e um `cardId`. Fora disso, a resposta é 400 com "Recorrente é só no cartão de crédito: escolha o cartão".
- **`PUT /api/expenses/:id`:** numa recorrente, trocar a forma ou o cartão para algo que não seja Crédito com cartão dá 400 com "A recorrente fica no cartão de crédito: dá para trocar só o cartão".
- **Front:** o rascunho mensal fora do crédito com cartão mostra "A recorrente é só no cartão de crédito.".

## Testes necessários

### Frontend

- **`draftRules.test.ts`:**
  - **`canBeRecurring`:** Crédito com cartões, Pix, e Crédito sem cartão de crédito cadastrado;
  - **`withRecurringOnCredit`:** a mensal no Pix vira `single`, e no Crédito continua mensal;
  - **validação e mensagem** da recorrente fora do crédito;
  - **resumo:** "todo mês na fatura {cartão} · até dezembro";
  - **envio** da mensal no crédito, com o vencimento pela fatura. Ele substitui os testes da mensal no Pix, do dia 31 e do dia inválido.
- **`cardDraft.test.ts`:** a recorrente no crédito com o Nubank vence pela fatura ou na data digitada.

### Backend

- **`expenseInput.test.ts`:**
  - mensal no Pix recusada;
  - mensal no Crédito sem cartão recusada;
  - mensal no Crédito com cartão aceita.
- **`expenseSeries.test.ts`:**
  - **`recurringPaymentRefusal`:**
    - troca para Pix recusada;
    - troca de cartão aceita;
    - recorrente antiga no Pix aceita se a forma não muda;
    - despesa que não é recorrente livre;
  - **série e renovação:** `monthlySeriesDates` e `renewalDates` sem o caminho sem cartão. Saem os testes da série no Pix.
- **`assistantSlotFilling.test.ts`:**
  - "assinatura netflix 55 no nubank" dá Crédito, Nubank e mensal;
  - "aluguel 1500 todo mês no pix" dá Pix e "Não repete";
  - "academia 100 todo mês" dá Crédito e mensal, sem cartão.

### E2E

Conferência manual no banco local (`/run`):

- **Modal:**
  - "Recorrente" só aparece com Crédito;
  - trocar para Pix volta para "Não repete";
  - sem cartão de crédito cadastrado, a opção não aparece.
- **Edição de uma assinatura:** a forma só mostra Crédito, e trocar o cartão leva às próximas.
- **Juca:** as três frases dos testes.
- **Demo:** lançar uma recorrente no crédito.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npx vite build
npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

- **Sem cartão de crédito cadastrado:** a pessoa deixa de ver "Recorrente". Foi decidido assim.
- **Juca:** uma frase como "aluguel todo mês no pix" vira despesa única. Foi decidido assim.
- **Recorrentes antigas fora do crédito:** as 2 ficam como histórico e não renovam.
- **Testes existentes:** a mensal no Pix e o `recurrenceDay` aparecem em testes que precisam ser reescritos, sem perder a cobertura do crédito.
- **Front antigo em cache (PWA):** pode oferecer "Recorrente" no Pix até atualizar. O servidor recusa com uma mensagem clara.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- **Oferta da opção:** o modal e o card do Juca só oferecem "Recorrente" no Crédito com cartão, e trocar a forma volta para "Não repete".
- **Servidor:** recusa mensal fora do crédito com cartão e recusa a troca da forma de uma recorrente para fora do crédito.
- **Renovação:** só considera séries no crédito com cartão.
- **Limpeza:** o "Todo dia X de cada mês" e o campo do dia não existem mais.
- **Juca:** segue a decisão 2.
- **Checks:** os comandos acima passam.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal.
- **Branch:** `feat/R/recorrente-so-credito`, a partir da `main` atualizada.
- **Banco e ambiente:** não há migration, e o `.env` não muda.
- **Seguir o `/AGENT.md`:**
  - identificadores em inglês e textos em português;
  - Drizzle nas queries;
  - sem `any`;
  - sem `catch {}` silencioso;
  - constantes do domínio (`INVOICE_EXPENSE_METHOD`) no lugar de `'credito'` solto.
- **Código antigo:** apagar o código da recorrente fora do crédito, sem sobras.
- **Commits:** `.portal/` e `GLOSSARIO.md` nunca entram.

## Notas da implementação (13/10/2026)

- **Juca sem cartão de crédito cadastrado:** a frase "mensal", "assinatura", "fixa" ou "todo mês" também vira "Não repete". Senão o Juca montaria uma recorrente impossível de salvar, contra a decisão 1.
- **`withRecurringOnCredit`:** ficou em `draftState.ts`, ao lado do reducer, e não em `draftRules.ts`, para evitar um import circular entre os dois arquivos. O teste dele está em `draftRules.test.ts`, junto com o do reducer.
- **`createDraft` e `draftFromExpense`:** perderam o `todayIso`, que só servia ao dia da recorrente.
