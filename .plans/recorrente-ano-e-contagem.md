# Plano de Implementação: Recorrente só conta depois da data, recorrência até dezembro e valor da parcela

## Origem

- Arquivo de especificação: anotações do usuário na conversa de 07/10/2026 (o "segundo plano" das séries), planejadas em 08/10/2026:
  - "valor da despesa em lançar despesa deve ser o valor da parcela, se o usuário selecionar sei o valor total, aí sim altera para o valor total";
  - "recorrência é até ano vigente";
  - "recorrente não pode contar no saldo do cartão se não deu a data do vencimento ainda... só contabiliza 06/10 quando for 07/10, as futuras não contabilizam em lugar nenhum".
- Data do planejamento: `2026-10-08`
- Classificação: `frontend + backend + database`

Decisões do usuário:

- **De 07/10/2026:**
  - o assistente (Juca) continua com o valor total no parcelado;
  - na virada do ano, um modal pergunta se a série renova;
  - o recorrente só conta depois da data, em todas as somas. A ocorrência futura aparece na lista, sem somar;
  - cada ocorrência passa a ter a própria data de compra. As atuais são completadas por migration, só com confirmação.
- **De 08/10/2026:**
  1. O valor da parcela ao lançar entra neste plano.
  2. As ocorrências recorrentes em aberto depois de 2026 (65 na produção) são apagadas pela migration e renovadas pelo modal em dezembro.
  3. O modal de renovação aparece a partir de 1º de dezembro, ao abrir o app, até cada série ser decidida.
  4. Fora do crédito com cartão, quem decide quando a ocorrência começa a contar é o **vencimento**. No crédito com cartão, é a **data de compra** (a cobrança).

O plano das receitas fixas (fixa por pessoa e o ano inteiro como previsto) ficou parado, sem decisões, para depois deste.

## Resumo

- **Hoje:**
  - uma despesa mensal gera 12 ocorrências;
  - todas as ocorrências em aberto somam em tudo: saldo, Painel, relatórios, orçamento, limite do cartão e assistente. As 12 de uma assinatura ocupam o limite do cartão de uma vez;
  - ao lançar uma compra parcelada, o valor digitado é o total.
- **Com este plano:**
  - **contagem:** a ocorrência mensal só conta depois da data dela e aparece como "Agendada" até lá;
  - **duração:** a série vai até dezembro do ano da primeira ocorrência, e o modal de dezembro pergunta se renova para o ano seguinte;
  - **parcelado:** o campo passa a ser o valor da parcela, com a opção "Sei o valor total".

## Escopo

### Dentro do escopo

- **Contagem:**
  - a regra da contagem (`isCountedExpense` e `countedExpenseCondition`) em todas as somas;
  - o "Agendada" na lista de Movimentações e no card do celular;
  - a soma do card "Despesa do mês".
- **Data de compra:**
  - em cada ocorrência das séries novas no crédito com cartão, com o vencimento pela fatura de cada uma;
  - nas atuais, completada pela migration.
- **Duração da série:** até dezembro do ano da primeira ocorrência.
- **Renovação:**
  - as séries pendentes;
  - o modal no app;
  - as rotas para listar e decidir;
  - a tabela `renovacoes_serie`.
- **Migration 0082:** a tabela nova, a data de compra completada e as ocorrências apagadas depois do ano corrente.
- **Valor da parcela no lançamento:**
  - o modal de despesa, a entrada e o lote;
  - o assistente continua com o total.
- **Demo:** a rota de renovação responde vazia.

### Fora do escopo

- **"Pagar fatura":** a fatura continua com todas as compras do mês dela.
- **Receitas:** a fixa e o "Repetir até" (o plano parado).
- **Séries antigas sem vínculo** (o DonPetine): o usuário vai cadastrar de novo.
- **Listas do assistente:** as consultas que listam lançamentos (últimos lançamentos, busca, recorrentes previstas, despesas em aberto do chip) continuam mostrando as futuras. Só as **somas** seguem a regra nova.
- **Parcelas:** não mudam de contagem. A regra vale só para despesa mensal.

## Leitura de contexto

- `/AGENT.md`
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `CLAUDE.md`, com o fluxo obrigatório
- Especificação: as conversas de 07 e 08/10/2026 e as decisões acima
- `.plans/recorrente-editar-proximas.md`, com a edição de série, já na produção
- Código lido:
  - **Criação e regras da série:** `backend/src/services/{expenseService,expenseSeries,entryQueries}.ts` e `backend/src/utils/{expenseAmount,date}.ts`.
  - **Pontos de soma:** `backend/src/services/{balanceService,painelService,reportService,budgetService,cardLimitService,financialCopilot,assistantQueries}.ts` e `backend/src/routes/accountMembers.ts` (o total por conta, na linha 541).
  - **Front:**
    - `src/screens/finance/{MovimentacoesScreen,LancamentosTable}.tsx`;
    - `src/screens/despesas/{expenseStatus,ExpenseCard}.tsx`;
    - `src/utils/{expenseFilters,expenseValue,expenseSchedule}.ts`;
    - `src/screens/finance/expense-dialog/{ExpenseDialog,ExpenseRow,draftRules,draftState,InstallmentsPopover}.ts(x)`;
    - `src/components/financial-assistant/cardDraft.ts`.
- Dados da produção, só leitura em 08/10/2026:
  - 8 séries recorrentes com vínculo, com 83 ocorrências futuras em aberto;
  - 65 ocorrências em aberto depois de 2026, em 7 séries: Amazon Prime, três da Apple, Google, Loft Fiança e Spotify;
  - 76 recorrentes no crédito com cartão sem data de compra, 70 delas em aberto.

Contexto multi-tenant: o `AGENT.md` fala em "prefeitura"; aqui o isolamento é por **dono e conta**. A condição de contagem só filtra mais, sobre as condições de dono e conta de cada consulta. A renovação mexe só nas séries do próprio usuário.

## Impacto por área

### Frontend

- **`src/utils/expenseCounting.ts` (novo, com teste),** com a mesma regra do servidor:
  - **`countingDate(expense)`:** a data de compra (ou o vencimento, se não houver) no crédito com cartão; o vencimento nas outras formas;
  - **`isCountedExpense(expense, today)`:** conta a despesa não mensal, a paga, ou a mensal cuja data de contagem é anterior a hoje.
- **`expenseStatus.tsx` e a cópia em `LancamentosTable.tsx`:** um status novo, `agendada`.
  - Vale para a mensal em aberto que ainda não conta.
  - Aparece em cinza, com o rótulo "Agendada" e o título "Conta a partir de dd/mm".
- **`MovimentacoesScreen.tsx`:**
  - o card "Despesa do mês" soma só as que contam;
  - a nota diz "N lançamento(s) · M agendada(s)" quando há agendadas;
  - a lista continua mostrando todas.
- **Modal de renovação (`src/screens/finance/SeriesRenewalModal.tsx`, novo):**
  - **Onde abre:** na moldura do app (`AppShell`), quando o servidor devolve séries pendentes. O servidor só devolve a partir de 1º de dezembro, e continua devolvendo enquanto houver série sem decisão, inclusive em janeiro.
  - **O que mostra:** a lista com descrição, valor, forma e cartão e a última ocorrência. Cada série vem marcada.
  - **Botões:**
    - "Renovar selecionadas" renova as marcadas e grava "não renovar" nas desmarcadas;
    - "Não renovar nenhuma";
    - fechar deixa para depois.
  - **Depois de decidir:** chama `invalidateExpenseQueries`.
  - **Estados:** carregando (nada aparece), erro (nada aparece; tenta de novo na próxima abertura) e vazio (não abre).
- **Serviço e chave de consulta:**
  - `src/services/seriesRenewalsService.ts` (novo), com `fetchSeriesRenewals()` e `decideSeriesRenewals(decisions)`;
  - `queryKeys.seriesRenewals()`, que entra em `EXPENSE_DEPENDENT_QUERIES`.
- **Valor da parcela no lançamento:**
  - **`draftState.ts`:** `amountIsTotal: boolean` no rascunho, falso por padrão.
  - **`draftRules.ts`:**
    - `installmentAmounts(draft)`: com `amountIsTotal`, divide o total como hoje; sem ele, cada parcela vale o valor digitado, respeitando os ajustes feitos à mão;
    - um `installmentsTotal(draft)` novo;
    - o resumo mostra "3x de R$ 240,00 = R$ 720,00".
  - **`ExpenseRow.tsx`:**
    - o rótulo vira "Valor da parcela", ou "Valor total" com a caixa marcada;
    - a caixa "Sei o valor total" aparece no parcelado, na entrada e no lote.
  - **`ExpenseDialog.tsx`:** a soma do lote usa o total do parcelado, e o cabeçalho usa o rótulo novo.
  - **Assistente (`cardDraft.ts`):** no parcelado, o rascunho nasce com `amountIsTotal = true`, então a frase continua sendo o total.
- **Demo (`fakeApiResolver.ts`):** `GET /expenses/series-renewals` responde `[]`.

### Backend

- **`backend/src/services/expenseCounting.ts` (novo, com teste):**
  - **`isCountedExpense({ recurring, paid, paymentMethod, cardId, purchaseDate, dueDate }, today)`:** a regra pura.
  - **`countedExpenseCondition(today)`:** a mesma regra em SQL (Drizzle `sql`): não ser mensal em aberto com data de contagem maior ou igual a hoje. A data de contagem é `COALESCE(data_compra, data_vencimento)` no crédito com cartão e `data_vencimento` nas outras formas.
  - **`today`:** vem de `getTodayIsoInTimezone()`, no fuso de São Paulo.
- **Pontos de soma:**
  - **Condição base:** `entryQueries.expenseBaseConditions` ganha `countedExpenseCondition(today)`. Isso cobre o saldo do mês (`balanceService`), o Painel e os relatórios. O `today` entra como parâmetro opcional, com o padrão `getTodayIsoInTimezone()`, para os testes.
  - **`budgetService.ts`:** as duas consultas do gasto.
  - **`cardLimitService.ts`:** a soma das compras em aberto do cartão.
  - **`routes/accountMembers.ts`:** o total por conta.
  - **`financialCopilot.ts`:** as três consultas.
  - **`assistantQueries.ts`, nas somas:** `resumoPeriodo`, `saldoAtual`, `saudeFinanceira`, `gastosPorCategoria`, `maioresGastos`, `gastosPorFormaPagamento`, `contasAPagar` e `comprometimentoFuturo`.
  - **`assistantQueries.ts`, nas listas:** continuam como estão.
  - **`painelService`:** os "Juros a vencer" e as faturas renegociadas não mudam, porque não são somas de gasto do período.
- **Série mensal nova (`expenseService.buildRows`):**
  - **Duração:** as ocorrências vão da primeira até dezembro do ano dela. Sai `MONTHLY_OCCURRENCES`.
  - **Crédito com cartão:** cada ocorrência recebe a data de compra (a primeira mais i meses, com `addMonthsClamped`) e o vencimento da fatura dela (`invoiceDueDateForPurchase`). O cartão é lido em `createExpense`.
  - **Outras formas:** como hoje, com o vencimento mês a mês e a data de compra só na primeira.
- **Regras puras da série (`expenseSeries.ts`, com teste):**
  - `monthlySeriesDates(first, card)`: as datas da série até dezembro;
  - `renewalDates(last, card)`: janeiro a dezembro do ano seguinte, a partir da última ocorrência;
  - `isRenewalPending(lastDueDate, today, decided)`: a última ocorrência é de dezembro do ano X, hoje é 1º de dezembro de X ou depois, e não há decisão para X + 1.
- **Renovação (`backend/src/services/seriesRenewalService.ts`, novo):**
  - **`listPendingRenewals(userId, accountId)`:** as séries mensais do usuário na conta, agrupadas por `grupo_parcelamento_id`, com ocorrência vigente e pendentes por `isRenewalPending`. Devolve id da série, descrição, valor, forma, cartão e a última data.
  - **`decideRenewals(userId, decisions)`:** em transação.
    - Para cada série do usuário: `renovar = true` cria as ocorrências do ano seguinte na mesma série, copiando da última ocorrência a descrição, a categoria, a forma, o cartão, o valor e a conta. No crédito com cartão, as datas vêm da fatura.
    - Grava a decisão em `renovacoes_serie`.
    - Série que não é do usuário, ou já decidida, é ignorada sem erro.
- **Rotas (`routes/seriesRenewals.ts`, nova, montada em `/api/expenses/series-renewals`):**
  - montagem com `authenticate`, `requireActivePlan` e `requireScreenAccess('accessExpenses')`;
  - `GET /` lista as pendentes;
  - `POST /` grava as decisões. O corpo é `{ decisions: [{ seriesId, renew }] }`, lido por uma leitura com teste.

### Banco de dados

**Migration `backend/drizzle/0082_recorrente_ano_e_renovacao.sql`,** com o cabeçalho no padrão do projeto (o que faz, ORDEM e ATENCAO):

1. **Tabela `renovacoes_serie`:**
   - `id SERIAL PRIMARY KEY`;
   - `grupo_parcelamento_id INTEGER NOT NULL REFERENCES despesas(id) ON DELETE CASCADE`;
   - `ano INTEGER NOT NULL`;
   - `renovar BOOLEAN NOT NULL`;
   - `usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE`;
   - `decidido_em TIMESTAMP NOT NULL DEFAULT now()`;
   - `UNIQUE (grupo_parcelamento_id, ano)`.
2. **Data de compra completada:**
   - nas recorrentes no crédito com cartão sem data de compra, ela passa a ser a da primeira ocorrência da série (a âncora, `id = grupo_parcelamento_id`) mais a distância em meses entre os vencimentos;
   - `date + interval` limita o fim do mês;
   - só onde a âncora tem data de compra.
3. **Ocorrências apagadas depois do ano corrente:**
   - são as ocorrências recorrentes em aberto, não pagas, sem ligação com pagamento de fatura e com vencimento depois de 31/12 do ano de `CURRENT_DATE`;
   - a regra é pelo ano corrente, e não por uma data fixa, para nunca apagar ocorrências do ano em curso se a migration for aplicada mais tarde.

- **Schema do Drizzle:** `backend/src/db/schema/seriesRenewals.ts` (novo), exportado em `index.ts`.
- **ORDEM:** aplicar **antes** do deploy do backend, porque as rotas da renovação leem a tabela nova. Os passos 2 e 3 funcionam também com o código de hoje.
- **Banco local:** aplicar primeiro no local, com confirmação.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Sem variável de ambiente nova nem job novo. A renovação aparece ao abrir o app, sem rotina diária.
- **Ordem na produção:**
  1. a 0082, com `--confirmo`, fora do auto mode;
  2. o deploy.

## Arquivos provavelmente afetados

- **Backend:**
  - `backend/drizzle/0082_recorrente_ano_e_renovacao.sql` (novo);
  - `backend/src/db/schema/seriesRenewals.ts` (novo) e `backend/src/db/schema/index.ts`;
  - `backend/src/services/expenseCounting.ts` e o teste dele (novos);
  - `backend/src/services/entryQueries.ts`, `balanceService.ts`, `painelService.ts`, `reportService.ts`, `budgetService.ts`, `cardLimitService.ts`, `financialCopilot.ts` e `assistantQueries.ts`;
  - `backend/src/routes/accountMembers.ts`;
  - `backend/src/services/expenseService.ts`;
  - `backend/src/services/expenseSeries.ts` e o teste dele;
  - `backend/src/services/seriesRenewalService.ts` e `backend/src/routes/seriesRenewals.ts` (novos), com a leitura do corpo testada, e `backend/src/server.ts`.
- **Front:**
  - `src/utils/expenseCounting.ts` e o teste dele (novos);
  - `src/screens/despesas/expenseStatus.tsx` e `src/screens/finance/LancamentosTable.tsx`;
  - `src/screens/finance/MovimentacoesScreen.tsx`;
  - `src/screens/finance/SeriesRenewalModal.tsx` e `src/services/seriesRenewalsService.ts` (novos), e `src/services/queryKeys.ts`;
  - `src/layout/AppShell.tsx`;
  - `src/screens/finance/expense-dialog/{draftState,draftRules,ExpenseRow,ExpenseDialog}.ts(x)` e o teste de `draftRules`;
  - `src/components/financial-assistant/cardDraft.ts`;
  - `src/services/demo/fakeApiResolver.ts`;
  - `src/types/finance.ts`.
- `.plans/recorrente-ano-e-contagem.md` (este plano)

## Estratégia de implementação

1. **Branch:** `feat/R/recorrente-ano-e-contagem`, a partir da `main` atualizada.
2. **Regras puras, testes primeiro:** `expenseCounting.ts` (backend e front) e as datas da série e da renovação em `expenseSeries.ts`.
3. **Banco:** a migration 0082 e o schema da tabela nova. Aplicar no local só com confirmação.
4. **Contagem no backend:** `countedExpenseCondition` na condição base e em cada ponto de soma listado.
5. **Série nova:** até dezembro, com a data de compra em cada ocorrência no crédito com cartão.
6. **Renovação:** o serviço, a rota, a leitura com teste e a montagem em `server.ts`.
7. **Front, contagem:** o status "Agendada" e a soma de Movimentações.
8. **Front, renovação:** o serviço, a chave, o modal e a montagem no `AppShell`. A demo responde vazio.
9. **Front, valor da parcela:** o rascunho, as regras com teste, a linha, o lote e o assistente.
10. **Validação:** os comandos abaixo e a conferência no local (`/run`).

## Regras de negócio identificadas

1. **Quando a despesa mensal conta:**
   - a ocorrência em aberto só conta a partir do dia seguinte à data dela: no crédito com cartão, a data de compra (a cobrança); nas outras formas, o vencimento;
   - a paga conta sempre;
   - a regra vale em todas as somas: saldo, Painel, relatórios, orçamento, limite do cartão, resumo de membros, copiloto e somas do assistente.
2. **Ocorrência futura:** aparece na lista como "Agendada", sem somar. "Pagar fatura" continua com todas as compras da fatura.
3. **Duração da série:** a série mensal nova vai da primeira ocorrência até dezembro do ano dela.
4. **Data de compra:** no crédito com cartão, cada ocorrência tem a sua data de compra, e o vencimento sai da fatura dela.
5. **Renovação:**
   - de 1º de dezembro em diante, o app pergunta, para cada série que termina em dezembro, se ela renova;
   - renovar cria janeiro a dezembro do ano seguinte, na mesma série;
   - a decisão fica gravada e não é perguntada de novo;
   - fechar o modal deixa para depois.
6. **Séries atuais:** as ocorrências em aberto depois do ano corrente são apagadas uma vez, pela migration, e voltam pela renovação.
7. **Valor do parcelado ao lançar:**
   - o campo é o valor da parcela, e "Sei o valor total" troca para o total;
   - o assistente continua com o total.

## Regras multi-tenant e segurança

- **Contagem:** a condição só se soma às condições de dono e conta de cada consulta, e não amplia nenhum acesso.
- **Renovação:**
  - lista e grava só as séries do próprio usuário (`despesas.usuario_id = usuário`), na conta pedida;
  - a decisão sobre uma série de outro usuário é ignorada;
  - a gravação acontece em transação, com a série travada (`FOR UPDATE` na âncora), e a unicidade (série, ano) impede renovar duas vezes.
- **Erros:** em português, sem dado de outra conta; nada de `catch {}` silencioso.

## Validações necessárias

- **`POST /api/expenses/series-renewals`:**
  - `decisions` é uma lista de 1 a 100 itens;
  - `seriesId` é um id inteiro;
  - `renew` é um booleano;
  - fora disso, a resposta é 400.
- **Lançamento:** com `amountIsTotal` falso, o valor da parcela continua sendo maior que zero. A validação de hoje vale para o total e para a parcela.

## Testes necessários

### Frontend

- **`src/utils/expenseCounting.test.ts`:**
  - no crédito com cartão, pela data de compra, e sem ela, pelo vencimento;
  - nas outras formas, pelo vencimento;
  - conta a partir do dia seguinte;
  - a paga conta;
  - a não mensal conta.
- **`draftRules.test.ts`:**
  - o valor da parcela vira as parcelas e o total;
  - "Sei o valor total" divide como hoje;
  - os ajustes à mão continuam;
  - o resumo "3x de … = …".
- **O assistente:** o parcelado continua sendo o total, conferido nos testes do `cardDraft`.

### Backend

- **`expenseCounting.test.ts`:** os mesmos casos do front.
- **`expenseSeries.test.ts`:**
  - **série até dezembro:** uma compra em outubro gera outubro a dezembro, e uma primeira ocorrência em janeiro gera o ano todo;
  - **datas no crédito:** compra mês a mês e vencimento pela fatura;
  - **renovação:** janeiro a dezembro do ano seguinte;
  - **pendência:** antes de 1º de dezembro, não está pendente; com decisão gravada, também não; e a pendência continua em janeiro.
- **Leitura do corpo da renovação:** válido, vazio, acima de 100 e tipos errados.

### E2E

Conferência manual no banco local (`/run`):

- **Assinatura nova no crédito com cartão, cobrada no dia 17:**
  - nascem as ocorrências até dezembro, com as datas de compra e os vencimentos pela fatura;
  - o limite do cartão só ocupa as cobranças que já passaram;
  - as futuras aparecem como "Agendada".
- **Movimentações de um mês futuro:** as recorrentes aparecem como "Agendada" e o card "Despesa do mês" não as soma.
- **Painel, relatórios, orçamento e assistente:** a recorrente futura não soma. Ao passar a data, passa a somar.
- **Aluguel no Pix, recorrente:** conta a partir do dia seguinte ao vencimento, ou antes se for pago.
- **Renovação:** mudando a data do local para dezembro, o modal aparece.
  - "Renovar" cria o ano seguinte;
  - "Não renovar" não pergunta de novo;
  - fechar volta a perguntar.
- **Lançamento parcelado:**
  - "3x" com R$ 240 dá R$ 720 no total;
  - com "Sei o valor total", R$ 720 dá 3x de R$ 240.
- **Assistente:** "comprei um celular de 1.200 em 10x" continua dando 10x de R$ 120.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npx vite build
npm --prefix backend run build
npm --prefix backend test
```

Banco local, só com a confirmação do usuário:

```bash
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0082 --banco local
```

## Riscos e pontos de atenção

- **As somas mudam em todo o app:** saldo, Painel, relatórios, orçamento, limite e assistente ficam menores enquanto houver recorrentes futuras. Cada ponto precisa de conferência.
- **Ponto de soma esquecido:** daria número diferente entre telas. A lista dos pontos está acima; procurar qualquer outro durante a implementação.
- **Limite do cartão:** sobe, porque as futuras deixam de ocupá-lo. É o esperado.
- **Migration:**
  - apaga 65 ocorrências futuras na produção, e a renovação de dezembro as recria;
  - completa 76 datas de compra;
  - precisa de confirmação e vai fora do auto mode na produção.
- **Data de hoje:** usa o fuso de São Paulo nos dois lados; a virada do dia precisa dar a mesma resposta no front e no servidor.
- **Renovação:**
  - a série renovada continua com o mesmo vínculo de grupo, então a edição de série passa para o ano novo também;
  - a cobrança de dezembro no crédito vence em janeiro, por isso o modal começa em 1º de dezembro.
- **Plano de receitas parado:** vem depois, e a migration dele passa a ser a 0083.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- **Contagem:** a ocorrência mensal em aberto só soma depois da data dela, em todas as somas listadas, e aparece como "Agendada" até lá.
- **Série nova:** vai até dezembro. No crédito com cartão, cada ocorrência tem a data de compra e o vencimento pela fatura.
- **Renovação:** o modal aparece a partir de 1º de dezembro, renova ou recusa por série, e não pergunta de novo o que foi decidido.
- **Migration:** apaga as ocorrências em aberto depois do ano corrente e completa as datas de compra.
- **Lançamento parcelado:** o campo é o valor da parcela, com "Sei o valor total". O assistente continua com o total.
- **Checks:** os comandos acima passam.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal.
- **Branch:** `feat/R/recorrente-ano-e-contagem`, a partir da `main` atualizada.
- **Migrations:** não executar nenhuma sem a confirmação explícita do usuário. No local primeiro; na produção, com `--confirmo`, fora do auto mode e antes do deploy.
- **Não mexer em `.env`.**
- **Seguir o `/AGENT.md`:**
  - identificadores em inglês e textos em português;
  - Drizzle nas queries (SQL cru só na migration);
  - sem `any`;
  - sem `catch {}` silencioso.
- **Contagem:**
  - a condição fica em um lugar só (`expenseCounting.ts`) e é usada por todos os pontos de soma;
  - não duplicar a regra;
  - a pura e a SQL precisam dar o mesmo resultado nos testes.
- **Commits:** `.portal/` e `GLOSSARIO.md` nunca entram.

## Notas da implementação (13/10/2026)

- **Fim da renovação:** a série fica pendente de 1º de dezembro a 31 de janeiro. Sem esse fim, as séries que acabaram em dezembros passados voltariam a ser perguntadas.
- **"Sei o valor total":** a caixa ficou no seletor de Cobrança, junto do número de parcelas, porque a coluna do valor tem 90 a 100 px. Ela aparece na entrada e no lote.
- **Resumo do parcelado:** passou a "3x de R$ 240,00 = R$ 720,00 · próxima vence dd/mm".
- **Assistente:**
  - a `projecaoSaldo` também segue a contagem;
  - o `saldoAtual` e o `comprometimentoFuturo` não mudaram, porque um soma só as pagas e o outro só as parcelas.
- **Textos e demo:** os textos "12 ocorrências" viraram "até dezembro". A demo também grava a mensal até dezembro, como o servidor.
- **Consequência da regra nas somas de "a pagar":** a recorrente fora do cartão só conta depois do vencimento, então ela não aparece como "a vencer". Isso vale para os "Próximos 30 dias" e o "Comprometido" do Painel e para as contas a pagar do assistente. A agenda do calendário continua mostrando a recorrente no dia.
- **Séries antigas:** a que termina antes de dezembro, sem ocorrência depois do ano corrente, não entra na renovação. Ela acaba como antes.
