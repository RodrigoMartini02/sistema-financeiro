# Plano de Implementação: Pagamento da fatura do cartão

## Origem

- Arquivo de especificação: pedido do usuário na conversa de 07/10/2026 ("fluxo de pagamento de despesas de cartão de crédito", seções 1 a 14), refeito na mesma conversa para o modelo da fatura
- Data do planejamento: `2026-10-07`
- Classificação: `frontend + backend + database`

Histórico: o pagamento **por despesa** chegou a ser implementado (plano `.plans/pagamento-despesa-cartao.md`, commit `76bc8474`, branch `feat/R/pagamento-cartao`, com push e sem merge). Depois o usuário corrigiu o modelo: o que se paga é a **fatura do cartão no mês**, como no banco. Este plano substitui aquele.

Decisões do usuário:

1. **Fatura no mês:** o pagamento é da fatura do cartão no mês, nunca de uma despesa.
2. **Despesa no crédito com cartão não é paga sozinha.**
   - O "Pagar" fica bloqueado na linha, no lote, no chip "Pagar despesa" do assistente e no "Pago" do modal de edição.
   - As outras formas (Pix, débito e dinheiro) seguem como hoje.
3. **Botões:** "Pagar despesas" (o lote de hoje, para as demais formas) e "Pagar fatura" ficam lado a lado e sempre visíveis, em cima da lista de Movimentações.
4. **Três formas:**
   - total;
   - parcial, em que o restante mais os juros vira uma despesa na próxima fatura;
   - parcelado, que abre o parcelamento da fatura nas próximas faturas.
5. **Parcelas de compras de outros meses:** continuam em aberto, porque só a fatura do mês foi renegociada.
6. **Renegociação como no banco,** sem contar nada duas vezes:
   - no parcial, as compras ficam pagas e contam pelo que foi pago, na proporção de cada uma;
   - no parcelado, as compras ficam pagas e não somam no mês.
7. **Categoria "Renegociação de fatura":** criada automaticamente, para o restante e as parcelas.
8. **"Encargos da fatura — <cartão>":** no pagamento total, os juros de atraso e o que o banco cobra acima da soma lançada viram essa despesa, na categoria própria "Encargos de cartão", também criada automaticamente.
9. **Sem status novo:** a compra fica ligada ao pagamento da fatura, e a tela mostra "Renegociada" em cinza, com uma nota. O Painel avisa a renegociação.
10. **Branch nova** `feat/R/pagamento-fatura-cartao`, a partir da `main`. A `feat/R/pagamento-cartao` fica abandonada e só é apagada do remoto com o ok do usuário no `/finalizar`.

## Resumo

- **Hoje:** a despesa no crédito é paga como qualquer outra, uma a uma, e não existe pagamento parcial nem parcelamento da fatura.
- **Com este plano:**
  - surge o "Pagar fatura": escolhe-se o cartão e paga-se a fatura do mês que está na tela, inteira, em parte ou parcelada;
  - a despesa no crédito com cartão deixa de ser paga avulsa.
- **Na renegociação (parcial ou parcelado):**
  - as compras da fatura ficam ligadas ao pagamento;
  - o restante ou as parcelas viram despesas novas nas faturas seguintes, com os juros guardados à parte;
  - a lista mostra a compra renegociada em cinza, com a nota, e o Painel mostra os juros e o aviso.

As somas (saldo, Painel, relatórios, orçamento, assistente e limite) continuam lendo só despesas `ativa` pelo valor efetivo. Por isso:
- a compra paga em parte conta pelo que foi pago;
- a compra parcelada conta R$ 0 no mês;
- o restante e as parcelas contam nos meses deles.

Nada conta duas vezes.

## Escopo

### Dentro do escopo

- **Branch e banco local:** branch nova a partir da `main`. No banco local, desfazer a 0081 antiga (`pagamentos_cartao`) e aplicar a nova, sempre com a confirmação do usuário.
- **Migration 0081 nova:** tabela `pagamentos_fatura` e três colunas em `despesas`.
- **Rotas `/api/card-invoices`:** faturas do mês por cartão, pagar (total, parcial ou parcelado) e desfazer.
- **Regras puras com testes,** no backend e no front.
- **Bloqueio do pagamento avulso** no crédito com cartão: `/pay`, a lista do chip do assistente, o lote e o "Pago" da edição.
- **Travas:** compra paga pela fatura e linha gerada não são canceladas nem excluídas; os campos travados não mudam na edição.
- **Lista de Movimentações** (tabela e cartão do celular):
  - os dois botões;
  - o "Pagar" desligado no crédito com cartão;
  - a compra "Renegociada" em cinza, com a nota e o valor "R$ X de R$ Y";
  - as linhas geradas com a descrição própria.
- **Modal "Pagar fatura":** o cartão, as compras, as três formas, o resumo, o histórico dos pagamentos da fatura e o "Desfazer".
- **Painel:**
  - juros pagos (na proporção do que foi pago) e "Juros a vencer";
  - nenhum desconto falso para a compra renegociada;
  - aviso de fatura renegociada no bloco de cartões.
- **Categorias automáticas:** "Renegociação de fatura" e "Encargos de cartão".
- **Demo** (`demo.html`): as rotas novas emuladas.

### Fora do escopo

- **Entrada no parcelamento:** a 1ª parcela é sempre no mês seguinte ao da fatura.
- **Fatura com fechamento próprio:** o mês da fatura vem do vencimento das compras, que é como as compras no crédito já são gravadas.
- **Relatórios e PDF:** não ganham a marca de renegociação; seguem pelos valores.
- **Criação de despesa,** no modal e no assistente: "Marcar como pagas no vencimento" das parcelas de compras antigas continua. É registro de compra antiga, não pagamento.
- **Pagamento de despesa no débito:** continua avulso.
- **Branch de integração do local** (`local/R/integracao`): é uma pergunta separada, ainda sem resposta.
- **Apagar a `feat/R/pagamento-cartao` do remoto:** só no `/finalizar`, com o ok do usuário.
- **Assistente:** nenhum fluxo de "pagar fatura" por frase.

## Leitura de contexto

- `/AGENT.md` (raiz)
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `CLAUDE.md`, com o fluxo obrigatório e as regras de `.env` e migrations
- Especificação: a conversa de 07/10/2026 e as decisões acima
- `.plans/pagamento-despesa-cartao.md` e o commit `76bc8474`: o modelo por despesa, de onde vêm funções que servem de novo
- Código lido:
  - **Banco e migrations:**
    - `backend/src/db/schema/{expenses,cards,categories,index}.ts`;
    - `backend/drizzle/0066_despesa_receita_origem.sql`, como padrão de cabeçalho de migration;
    - `backend/scripts/migrations.ts` e `backend/src/utils/migrationStatus.ts`.
  - **Rotas:**
    - `backend/src/routes/expenses.ts`, com a lista em SQL cru (`d.*`, com os joins), `/pay`, `/mover`, cancelar, excluir e o `PUT`;
    - `backend/src/routes/cards.ts`: a mudança de vencimento já trata como fatura todas as compras no crédito do cartão, de quem quer que tenha lançado;
    - `backend/src/server.ts`: `/api/expenses` montada com `authenticate`, `requireActivePlan` e `requireScreenAccess('accessExpenses')`.
  - **Serviços:**
    - `backend/src/services/{expenseService,expenseInput,cardDueDate,cardLimitService,entryQueries,painelCalculos,painelService,assistantQueries,defaultCategories,expenseCategoryCatalog,contractSchedule}.ts`;
    - `backend/src/utils/{familyVisibility,requestInput,date}.ts`: `resolveOwnerForWrite`, `canEditOthersEntries`, `resolveVisibleCardOwnerIds`, `RequestInputError` e `addMonthsClamped`.
  - **Telas de Lançamentos e Painel:**
    - `src/screens/finance/{LancamentosTable,MovimentacoesScreen,BatchPaymentModal,PaymentModal,CardLimitRow}.tsx`;
    - `src/screens/despesas/{ExpenseCard,expenseStatus,DeleteInstallmentDialog}.tsx`;
    - `src/screens/finance/expense-dialog/{ExpenseDialog,ExpenseRow,InstallmentsPopover,draftRules}.ts(x)`;
    - `src/screens/finance/painel/{JurosDescontos,ComoDinheiroSaiu}.tsx`.
  - **Assistente:** `src/components/financial-assistant/{InstallmentList,cardDraft}.ts(x)`.
  - **Utilitários, serviços e demo do front:**
    - `src/utils/{expenseFilters,expenseValue,expenseSchedule}.ts`;
    - `src/services/{financeService,queryKeys}.ts` e `src/types/finance.ts`;
    - `src/services/demo/{fakeApiResolver,demoFakeDatabase}.ts`.

Contexto multi-tenant: o `AGENT.md` fala em "prefeitura"; aqui o isolamento é por **dono e conta**. A fatura é do dono do cartão. Quem pode pagar vem do token: o dono do cartão, ou quem tem a permissão de editar lançamentos de outros na conta do cartão. O projeto não usa RLS.

## Impacto por área

### Frontend

- **Tipos** (`src/types/finance.ts`):
  - **`Expense` ganha:**
    - `invoicePaymentId` (`pagamento_fatura_id`);
    - `invoicePaymentMethod` (`'total' | 'partial' | 'installments'`, vindo do join);
    - `invoicePaymentInstallments` e `invoiceMonth` (`'AAAA-MM'` da fatura renegociada);
    - `invoiceOriginPaymentId` (`origem_pagamento_fatura_id`) e `invoiceInterest` (`valor_juros_fatura`).
  - **Tipos novos:** `CardInvoiceMonth`, `CardInvoice`, `CardInvoiceItem`, `InvoicePaymentEntry` e `InvoicePaymentInput`.
  - **`PainelData`:** `jurosDescontos.upcomingInterest?` e `renegotiatedInvoices?`, os dois opcionais para aceitar a resposta antiga.
- **Serviço:**
  - em `financeService.ts`, `RawExpense` e `expenseFromApi` leem os campos novos;
  - `src/services/cardInvoicesService.ts` (novo) traz `fetchCardInvoices(accountId, invoiceMonth)`, `payCardInvoice(input)` e `undoInvoicePayment(paymentId)`.
- **Query keys** (`queryKeys.ts`):
  - `cardInvoices: (accountId, invoiceMonth) => ['card-invoices', accountId ?? 'ativa', invoiceMonth]`, perto de `expenseGroup`, longe do trecho que a `feat/R/site-novo` mudou;
  - `'card-invoices'` entra em `EXPENSE_DEPENDENT_QUERIES`;
  - pagar e desfazer chamam `invalidateExpenseQueries`.
- **Regra pura nova `src/utils/cardInvoice.ts` (com teste):**
  - **Mês da fatura:** `invoiceMonthParam(month, year)` monta `'AAAA-MM'`, e `invoiceMonthLabel('2026-10')` devolve `'out/2026'`.
  - **`summarizeInvoicePayment`,** por forma:
    - total: os encargos (o que passou da soma) e a recusa quando o valor é menor que a soma;
    - parcial: o restante (soma − pago + juros);
    - parcelado: as parcelas, com os centavos que sobram na última;
    - nos três: % dos juros e taxa ao mês da Tabela Price no parcelado.
  - **Auxiliares** (copiados do commit `76bc8474`): `monthlyInterestRate`, `installmentsLabel` e `formatPercent`.
  - **Lista:**
    - `isCreditWithCard(expense)` (`formaPagamento === 'credito' && cartaoId != null`);
    - `isRenegotiated(expense)`, quando há `invoicePaymentId` e a forma é parcial ou parcelado;
    - `renegotiationNote(expense)`, por exemplo "Fatura de out/2026 parcelada em 3x" ou "Fatura de out/2026 com pagamento parcial";
    - `isInvoiceProtected(expense)`: ligada ao pagamento ou gerada por ele;
    - `invoiceEditLock(expense)`: `'invoice-item' | 'generated' | 'credit-payment' | null`.
- **Movimentações** (`LancamentosTable.tsx` e `ExpenseCard.tsx`):
  - **Barra fixa em cima da lista,** sempre visível, com os dois botões lado a lado:
    - "Pagar despesas", desligado até haver seleção, com o aviso "Marque na lista as despesas que quer pagar". Abre o `BatchPaymentModal` de hoje;
    - "Pagar fatura", que abre o `InvoicePaymentModal` no mês da tela;
    - a contagem da seleção e "Limpar" continuam aparecendo quando há algo marcado.
  - **Linha no crédito com cartão:**
    - sem caixa de seleção (`isBatchSelectable` passa a excluir o crédito com cartão);
    - o botão de pagar fica desligado, com o aviso "Pago pela fatura do cartão" (ou "Já pago").
  - **Compra renegociada:**
    - a linha fica em cinza, como a paga;
    - o Status mostra "Renegociada", com a nota, que é um botão que abre o `InvoicePaymentModal` naquele cartão e mês;
    - o Valor mostra o efetivo e, embaixo, "de R$ Y" no lugar da diferença de juros ou desconto.
  - **Linha gerada:** a descrição vem pronta ("Restante da fatura de out/2026 — Nubank", "Parcelamento da fatura de out/2026 — Nubank" com "1/3" no Tipo, "Encargos da fatura de out/2026 — Nubank").
  - **Travas:** cancelar e excluir ficam desligados nas linhas protegidas, com o aviso "Esta despesa faz parte de um pagamento de fatura. Para mudar, desfaça o pagamento da fatura."
  - **Mapas de status:** ganham `renegociada`, tanto em `expenseStatus.tsx` quanto na cópia em `LancamentosTable.tsx`.
- **Modal novo `InvoicePaymentModal.tsx` ("Pagar fatura do cartão"):**
  - **Cartão:** os cartões que a pessoa pode pagar aparecem como opções, cada um com o total em aberto do mês. Com um só, ele já vem escolhido.
  - **A fatura:**
    - vencimento (o dia do cartão no mês) e o total em aberto;
    - a lista das compras, que pode ser recolhida, com descrição, valor, parcela e quem lançou;
    - sem compras em aberto: "Fatura sem valor em aberto".
  - **Histórico:**
    - cada pagamento da fatura: forma, data, valores, para onde foi o restante e quem registrou;
    - o "Desfazer" fica desligado, com o motivo, quando o servidor diz que não pode;
    - os estornados aparecem como "Estornado em … por …".
  - **Forma, em três opções:**
    - **Total:** "Valor pago" começa com a soma. Acima dela, mostra "Encargos: R$ X (vira a despesa 'Encargos da fatura')"; abaixo, avisa que é menor que a soma e manda usar o Parcial ou conferir os lançamentos.
    - **Parcial:** "Valor pago agora" (maior que zero e menor que a soma) e "Juros do rotativo" (vazio = 0). Mostra "Restante na fatura de nov/2026: R$ …".
    - **Parcelado:** "Número de parcelas" (2 a 360) e "Juros do parcelamento". Mostra "3x de R$ … a partir de nov/2026" e a taxa ao mês, com "≈".
  - **Data do pagamento:** hoje, por padrão.
  - **Resumo:** soma das compras, pago agora, encargos ou juros, o que vai para as próximas faturas e "as compras ficam: pagas | renegociadas (contam R$ X)".
  - **Ações:** "Cancelar" e "Confirmar pagamento". Este fica desligado com dado inválido ou enquanto envia; o erro do servidor aparece dentro do modal.
  - **Estados:** carregando, erro e vazio ("Nenhum cartão de crédito com fatura neste mês").
- **Modal de edição** (`ExpenseDialog.tsx` e `ExpenseRow.tsx`, no padrão de `readOnlyBilling`):
  - **No crédito com cartão:** "Pago", data e valor pago desligados, com o aviso "Pago pela fatura do cartão".
  - **Compra paga pela fatura:** também valor, forma e cartão (só leitura) e vencimento.
  - **Linha gerada:** valor, forma e cartão travados.
- **Grade de parcelas** (`DeleteInstallmentDialog.tsx`): a linha protegida não pode ser marcada e fica fora de "selecionar todas".
- **Painel:**
  - `JurosDescontos.tsx` ganha a linha "Juros a vencer" (`upcomingInterest ?? 0`);
  - `ComoDinheiroSaiu.tsx`, no bloco "Cartões de crédito", lista `renegotiatedInvoices` ("Fatura de out/2026 — Nubank: R$ 430 foram para nov/2026" ou "parcelada em 3x de R$ 360 a partir de nov/2026");
  - o bloco aparece também quando só há renegociação no período.
- **Demo:**
  - `fakeApiResolver.ts` emula `GET /card-invoices`, `POST /card-invoices/payments` e `DELETE /card-invoices/payments/:id`, com as mesmas regras de forma simplificada;
  - `demoFakeDatabase.ts` só ganha campos opcionais no `RawExpenseDemo`.

### Backend

- **Schema do Drizzle:**
  - `db/schema/invoicePayments.ts` (novo): `invoicePayments`, com os tipos `InvoicePayment` e `NewInvoicePayment`, e `INVOICE_PAYMENT_METHODS = { total: 'total', partial: 'parcial', installments: 'parcelado' }`;
  - `db/schema/expenses.ts`: `invoicePaymentId`, `invoiceOriginPaymentId` e `invoiceInterest`, com índices parciais;
  - as referências circulares usam `(): AnyPgColumn =>`;
  - `db/schema/index.ts` exporta o arquivo novo.
- **Regras puras:**
  - **`services/cardInvoiceInput.ts`** (novo, com teste): `readInvoicePaymentInput(body)`. Validações abaixo.
  - **`services/cardInvoiceRules.ts`** (novo, com teste):
    - **`invoiceDueDate(invoiceMonthIso, dueDay, offset)`:** o dia do cartão no mês da fatura mais `offset` meses (31 cai no último dia). Reaproveita `moveDueDateToDay` e `addMonthsClamped`.
    - **`computeInvoicePayment(items, input, card)`:**
      - total: os encargos;
      - parcial: a proporção de cada compra, em centavos exatos e determinística, pela maior sobra e, no empate, pelo id; mais os juros carregados e o restante, com juros e vencimento;
      - parcelado: cada compra com R$ 0, os juros carregados e as N parcelas, com valor, juros e vencimento.
      - Os juros por parcela nunca passam da parcela; vem de `splitInterestWithinInstallments`, copiado do `76bc8474`.
      - Usa `splitInstallments` de `contractSchedule.ts`.
    - **`invoicePaymentRefusal`:** fatura sem compras em aberto; total menor que a soma; parcial fora de (0, soma); parcelado com menos de R$ 0,01 por parcela.
    - **`invoiceEditRefusal(lock, current, next)`.**
    - **`isInvoiceProtected(row)`.**
    - **`undoRefusal(generatedRows, paymentId)`.**
    - **`generatedDescription(kind, invoiceMonth, cardName)`,** limitada a 255 caracteres.
- **`services/cardInvoiceService.ts` (novo, Drizzle):**
  - **`listCardInvoices(requesterId, accountId, invoiceMonth)`:**
    - os cartões de crédito (tipo `credito`, `ambos` ou nulo) da conta, que a pessoa pode pagar. O filtro de conta é o mesmo de `cardLimitService`;
    - para cada um: as compras em aberto do mês e os pagamentos daquela fatura, com `canUndo` e o motivo, e nomes por `findPeopleNames`.
  - **`payCardInvoice(requesterId, input)`,** em transação:
    1. Trava o cartão (`FOR UPDATE`) e confere a permissão.
    2. Trava as compras em aberto do mês (`FOR UPDATE`): `cartao_id` = cartão, `forma_pagamento = 'credito'`, `status = 'ativa'`, não pagas e vencendo no mês, de qualquer autor.
    3. Aplica as recusas e calcula com `computeInvoicePayment`.
    4. Busca ou cria as categorias automáticas.
    5. Grava o pagamento.
    6. Atualiza as compras: `pago`, `data_pagamento`, `valor_pago` (o próprio valor no total, a parte paga no parcial, 0 no parcelado) e `pagamento_fatura_id`.
    7. Grava as linhas geradas.
  - **`undoInvoicePayment(requesterId, paymentId)`,** em transação:
    1. Trava o pagamento e confere a permissão no cartão.
    2. Recusa se alguma linha gerada foi paga por outro pagamento.
    3. Exclui as linhas geradas.
    4. Devolve as compras para não pagas, sem a ligação.
    5. Marca o pagamento como estornado (`estornado_em = now()`, `estornado_por`).
  - **`findOrCreateInvoiceCategory(executor, ownerId, accountType, name)`:**
    - usa o mesmo `INSERT ... ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING` de `ensureDefaultCategories` e depois lê o id. O SQL cru se justifica: o Drizzle não expressa conflito em índice funcional;
    - o tipo é o da conta do cartão (`contas.tipo`), ou `'pessoal'` quando o cartão não tem conta.
  - **`hasInvoiceProtectedRows(ownerId, scope)`,** para cancelar e excluir.
  - **`isCreditWithCardExpense(ownerId, expenseId)`,** para o `/pay`.
- **Linhas geradas:**
  - **Dono e conta:** `usuario_id` é o dono do cartão e `conta_id` é a conta do cartão.
  - **Cartão e forma:** `cartao_id` é o cartão, com `forma_pagamento = 'credito'`, `status = 'ativa'` e `data_compra` igual à data do pagamento.
  - **Ligação:** `origem_pagamento_fatura_id` e `valor_juros_fatura`.
  - **Restante:** uma linha, não paga, que vence no dia do cartão no mês seguinte, na categoria "Renegociação de fatura".
  - **Parcelas:** N linhas não pagas, com `parcelado`, `numero_parcelas` e `parcela_atual`. A 1ª é o grupo e aponta para si mesma, como em `createExpense`. Vencem mês a mês a partir do mês seguinte, na categoria "Renegociação de fatura".
  - **Encargos (só no total):**
    - uma linha já paga, com `pago`, `data_pagamento`, `valor_pago` igual ao valor e `pagamento_fatura_id` do próprio pagamento;
    - vence no dia do cartão no mês da fatura;
    - fica na categoria "Encargos de cartão", com `valor_juros_fatura` igual ao valor.
- **Juros carregados:**
  - numa renegociação, cada compra com `valor_juros_fatura` passa adiante a parte dos juros que não foi paga: no parcial, os juros da compra × (1 − parte paga ÷ valor); no parcelado, tudo;
  - essa soma entra nos juros das linhas novas e fica registrada em `valor_juros_carregados`.
- **Rotas novas** (`routes/cardInvoices.ts`, montada em `server.ts` como `/api/card-invoices`, com `authenticate`, `requireActivePlan` e `requireScreenAccess('accessExpenses')`):
  - `GET /?invoice_month=AAAA-MM&conta_id=` lista as faturas do mês por cartão;
  - `POST /payments` (201) paga e devolve a fatura atualizada;
  - `DELETE /payments/:paymentId` desfaz e devolve a fatura atualizada;
  - erros com `RequestInputError` e `sendRequestError`, com o contexto (usuário, cartão, mês e pagamento) no log.
- **Rotas existentes** (`routes/expenses.ts` e `expenseService.ts`):
  - **`GET /`:** `LEFT JOIN pagamentos_fatura pf ON pf.id = d.pagamento_fatura_id`, trazendo `pf.forma`, `pf.numero_parcelas`, `pf.mes` e `pf.ano`. Os campos novos de `despesas` já vêm pelo `d.*`.
  - **`PUT /:id`:**
    - `findExpenseForUpdate` passa a trazer a trava e os campos travados;
    - `invoiceEditRefusal` recusa com 400 a mudança de campo travado;
    - no crédito com cartão, o estado do pagamento não muda pela edição: nem marcar, nem desmarcar;
    - `updateExpense` não regrava os campos travados.
  - **Cancelar e excluir, nos três modos:** 400 para linha protegida.
  - **`POST /:id/pay`:**
    - 400 "Despesa no crédito é paga pela fatura do cartão." quando a despesa é crédito com cartão;
    - a mesma condição se repete no `WHERE` do `UPDATE`, contra corrida.
  - **`GET /em-aberto`** (chip do assistente): `despesasEmAberto`, em `assistantQueries.ts`, deixa de fora o crédito com cartão.
- **Painel:**
  - **`painelCalculos.ts`** (com teste):
    - `DespesaPainel` ganha `invoicePaymentId` e `invoiceInterest`;
    - `jurosDaDespesa`: se não está paga, 0; se está ligada ao pagamento de fatura, `invoiceInterest × valorPago ÷ valorOriginal`; nas outras, a regra de hoje;
    - `descontoDaDespesa`: 0 quando ligada; nas outras, a regra de hoje;
    - função nova `sumUpcomingInterest` (soma de `invoiceInterest` das não pagas).
  - **`painelService.ts`:**
    - colunas novas em `colunasDespesa`;
    - consulta das linhas em aberto com `valor_juros_fatura > 0`, de qualquer data, com `expenseBaseConditions` e os filtros em memória;
    - `jurosDescontos.upcomingInterest`;
    - `renegotiatedInvoices`: pagamentos ativos, parciais ou parcelados, dos cartões das pessoas do escopo, com o mês da fatura dentro do período.
- **Sem mudança de código:**
  - relatórios e PDF, saldo, orçamento, copiloto, alertas de vencimento e limite do cartão. Todos somam só `ativa`, pelo valor efetivo e pelo que está em aberto;
  - a mudança de vencimento do cartão: as linhas geradas em aberto acompanham a mudança.

### Banco de dados

**Migration `backend/drizzle/0081_pagamentos_fatura.sql`,** com o cabeçalho no padrão da 0066 (o que faz, ORDEM e ATENCAO):

- **Tabela `pagamentos_fatura`:**
  - **Identificação:**
    - `id SERIAL PRIMARY KEY`;
    - `cartao_id INTEGER NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE`;
    - `usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE` (dono do cartão, que é o dono da fatura);
    - `registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`;
    - `mes INTEGER NOT NULL CHECK (mes BETWEEN 0 AND 11)` e `ano INTEGER NOT NULL`: o mês da fatura, na mesma convenção de `despesas.mes`.
  - **Forma e valores:**
    - `forma VARCHAR(10) NOT NULL CHECK (forma IN ('total', 'parcial', 'parcelado'))`;
    - `valor_compras DECIMAL(10,2) NOT NULL`: a soma das compras pagas ou renegociadas;
    - `valor_pago DECIMAL(10,2) NOT NULL`: o que foi pago agora (no total, compras + encargos; no parcial, o valor informado; no parcelado, 0);
    - `valor_encargos DECIMAL(10,2) NOT NULL DEFAULT 0`: no total, o que passou da soma;
    - `valor_juros DECIMAL(10,2) NOT NULL DEFAULT 0`: os juros informados no parcial e no parcelado;
    - `valor_juros_carregados DECIMAL(10,2) NOT NULL DEFAULT 0`;
    - `valor_para_frente DECIMAL(10,2) NOT NULL DEFAULT 0`: o restante ou a soma das parcelas;
    - `numero_parcelas INTEGER` e `valor_parcela DECIMAL(10,2)`.
  - **Datas:**
    - `data_pagamento DATE NOT NULL`;
    - `data_criacao TIMESTAMP NOT NULL DEFAULT now()`;
    - `estornado_em TIMESTAMP` e `estornado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`.
  - **`CHECK` de coerência:**
    - total: sem parcelas, `valor_para_frente = 0` e `valor_pago = valor_compras + valor_encargos`;
    - parcial: `valor_pago > 0`, `valor_pago < valor_compras` e sem parcelas;
    - parcelado: `valor_pago = 0` e de 2 a 360 parcelas, com `valor_parcela > 0`;
    - os valores nunca negativos.
  - **Índices:** `idx_pagamentos_fatura_cartao_mes (cartao_id, ano, mes)` e `idx_pagamentos_fatura_usuario (usuario_id)`.
- **Colunas novas em `despesas`, todas nulas por padrão:**
  - `pagamento_fatura_id INTEGER REFERENCES pagamentos_fatura(id) ON DELETE SET NULL`: o pagamento que pagou ou renegociou a linha;
  - `origem_pagamento_fatura_id INTEGER REFERENCES pagamentos_fatura(id) ON DELETE SET NULL`: o pagamento que gerou a linha (restante, parcela ou encargos);
  - `valor_juros_fatura DECIMAL(10,2)`: a parte do valor da linha que é juros ou encargos, só nas linhas geradas;
  - índices parciais `idx_despesas_pagamento_fatura` e `idx_despesas_origem_pagamento_fatura`, `WHERE ... IS NOT NULL`.
- **ORDEM:** aplicar **antes** do deploy do backend. Só acrescenta tabela, colunas e índices; o código atual não lê nem grava nada disso.
- **Banco local:** a 0081 antiga (`0081_pagamentos_cartao.sql`) está aplicada só lá. Antes da nova, reverter com SQL avulso, que não entra no repositório, rodado por um script de uma vez que só aceita a URL local (`localhost:5433`), como `scripts/migrations.ts`:
  1. Conferência só de leitura: quantas linhas usam `pagamento_cartao_id`, `status = 'parcelada'` ou `valor_juros_pagamento`.
  2. Com a confirmação do usuário, numa transação:
     - excluir as linhas com `pagamento_cartao_id`;
     - `status = 'parcelada'` volta a `'ativa'`;
     - as linhas com `valor_juros_pagamento` voltam a não pagas;
     - `DROP` das três colunas e de `pagamentos_cartao`;
     - `DELETE` do registro `0081_pagamentos_cartao.sql` em `schema_migrations`.
  3. Aplicar a 0081 nova (`migrations:aplicar -- 0081 --banco local`).
- **Produção:** nunca recebeu a 0081 antiga; recebe só a nova.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Sem mudança em infraestrutura:** nenhuma variável de ambiente nova, nenhum job novo.
- **Ordem na produção, com o ok do usuário:**
  1. Migration 0081 (`--confirmo`, fora do auto mode).
  2. Deploy do backend.
  3. Deploy do front, que aceita a resposta antiga na janela entre os deploys.
- **0080 da Parte 2:** o aplicador aceita a 0080 e a 0081 em qualquer ordem. A exceção é a Parte 2 entrar na `main` com a 0080 ainda não aplicada na produção.
- **Banco local:** o `migrations:status` mostra a 0080 como "registro sem arquivo" nesta branch. É o esperado.
- **Local durante a implementação:** a branch nova sai da `main`, então o local deixa de mostrar o site novo (`feat/R/site-novo`) enquanto isso.

## Arquivos provavelmente afetados

Backend:

- `backend/drizzle/0081_pagamentos_fatura.sql` (novo)
- `backend/src/db/schema/invoicePayments.ts` (novo), `backend/src/db/schema/expenses.ts`, `backend/src/db/schema/index.ts`
- `backend/src/services/cardInvoiceInput.ts` e `cardInvoiceInput.test.ts` (novos)
- `backend/src/services/cardInvoiceRules.ts` e `cardInvoiceRules.test.ts` (novos)
- `backend/src/services/cardInvoiceService.ts` (novo)
- `backend/src/routes/cardInvoices.ts` (novo) e `backend/src/server.ts`
- `backend/src/routes/expenses.ts`, `backend/src/services/expenseService.ts`
- `backend/src/services/assistantQueries.ts`
- `backend/src/services/painelCalculos.ts`, `painelCalculos.test.ts` e `painelService.ts`

Frontend:

- `src/types/finance.ts`
- `src/services/financeService.ts`, `src/services/cardInvoicesService.ts` (novo), `src/services/queryKeys.ts`
- `src/utils/cardInvoice.ts` e `cardInvoice.test.ts` (novos)
- `src/utils/expenseFilters.ts` e `expenseFilters.test.ts`
- `src/screens/finance/InvoicePaymentModal.tsx` (novo)
- `src/screens/finance/LancamentosTable.tsx`, `src/screens/finance/entryTable.tsx`
- `src/screens/despesas/ExpenseCard.tsx`, `expenseStatus.tsx` e `DeleteInstallmentDialog.tsx`
- `src/screens/finance/expense-dialog/ExpenseDialog.tsx` e `ExpenseRow.tsx`
- `src/screens/finance/painel/JurosDescontos.tsx` e `ComoDinheiroSaiu.tsx`
- `src/services/demo/fakeApiResolver.ts` e `demoFakeDatabase.ts` (só o tipo)
- `.plans/pagamento-fatura-cartao.md` (este plano)

## Estratégia de implementação

1. **Branch e banco local:**
   - criar `feat/R/pagamento-fatura-cartao` a partir da `main` (com `git switch`; a árvore está limpa e os arquivos sem rastreio seguem junto);
   - fazer a conferência só de leitura do fluxo antigo no banco local e, com a confirmação do usuário, a reversão da 0081 antiga.
2. **Banco:** escrever a 0081 nova e o schema do Drizzle. Aplicar no banco local só com a confirmação do usuário.
3. **Regras puras do backend, testes primeiro:** `cardInvoiceInput.ts` e `cardInvoiceRules.ts`, copiando do `76bc8474` só o que serve (`splitInterestWithinInstallments` e os padrões de leitura).
4. **Serviço:** `cardInvoiceService.ts` (listar, pagar, desfazer, categorias e consultas das travas).
5. **Rotas:** `routes/cardInvoices.ts` e a montagem em `server.ts`.
6. **Travas nas rotas existentes:** `GET /expenses` (join), `PUT`, cancelar, excluir, `/pay` e `despesasEmAberto`.
7. **Painel:** `painelCalculos.ts` (regras e testes) e `painelService.ts` (colunas, juros a vencer e `renegotiatedInvoices`).
8. **Front, base:** tipos, serviços, query keys, `utils/cardInvoice.ts` com teste e `expenseFilters.ts` com teste.
9. **Front, telas:**
   - `InvoicePaymentModal`;
   - a barra com os dois botões e a lista (tabela e celular), com bloqueio, "Renegociada" e travas;
   - a edição e a grade de parcelas;
   - o Painel (`JurosDescontos` e `ComoDinheiroSaiu`).
10. **Demo:** as rotas emuladas e o tipo.
11. **Validação:** os comandos abaixo e a lista E2E no banco local.

## Regras de negócio identificadas

1. **Fatura:**
   - são as compras no crédito daquele cartão (`forma_pagamento = 'credito'`, `status = 'ativa'`), em aberto, que vencem no mês, de quem quer que tenha lançado;
   - o mês da fatura é o mês do vencimento;
   - o vencimento da fatura é o dia de vencimento do cartão naquele mês.
2. **Despesa no crédito com cartão não é paga sozinha.**
   - Não se paga pela linha, pelo lote, pelo chip do assistente nem pelo "Pago" da edição; só pela fatura.
   - Despesa no crédito sem cartão (lançamento antigo) segue com "Marcar como pago".
   - Na criação, marcar como pagas as parcelas de compras antigas continua.
3. **Total:**
   - o valor pago precisa ser maior ou igual à soma das compras;
   - as compras ficam pagas, cada uma pelo próprio valor;
   - o que passar da soma vira "Encargos da fatura de <mês> — <cartão>", já paga, na categoria "Encargos de cartão", contada inteira como juros.
4. **Parcial:**
   - o valor pago fica entre zero e a soma, sem incluir os dois;
   - cada compra fica paga pela parte proporcional, em centavos exatos (a soma das partes é igual ao valor pago);
   - o restante (soma − pago) mais os juros informados e os carregados vira "Restante da fatura de <mês> — <cartão>", em aberto, vencendo no dia do cartão no mês seguinte, na categoria "Renegociação de fatura".
5. **Parcelado:**
   - de 2 a 360 parcelas;
   - as compras ficam pagas com R$ 0;
   - (soma + juros) é dividida em N parcelas, com os centavos que sobram na última, mês a mês a partir do mês seguinte, no dia do cartão: "Parcelamento da fatura de <mês> — <cartão>" i/N, na categoria "Renegociação de fatura";
   - os juros são divididos do mesmo jeito, sem passar do valor de cada parcela.
6. **Parcelas de compras de outros meses:** não mudam. Só as do mês da fatura entram nela.
7. **Linhas geradas:**
   - ficam em nome do dono do cartão, na conta do cartão;
   - são pagas pela fatura do mês em que vencem, como no banco;
   - podem mudar de vencimento (e de mês), mas não de valor, forma ou cartão;
   - não podem ser canceladas nem excluídas.
8. **Compra paga ou renegociada pela fatura:** não muda valor, forma, cartão, vencimento nem pagamento, e não pode ser cancelada nem excluída. Na lista, a renegociada aparece em cinza como "Renegociada", com a nota.
9. **Juros:**
   - ficam guardados à parte nas linhas geradas;
   - "Juros pagos" conta a parte paga e "Juros a vencer" soma os das linhas em aberto;
   - os juros ainda não pagos de uma renegociação anterior passam para a seguinte, sem se perder nem contar duas vezes;
   - compra ligada ao pagamento de fatura não gera "desconto".
10. **Desfazer:**
    - funciona por pagamento, na fatura;
    - é recusado se alguma linha gerada foi paga por outro pagamento (por exemplo, o restante pago na fatura seguinte);
    - exclui as linhas geradas, devolve as compras para não pagas e deixa o registro como estornado.
11. **Quem pode pagar ou desfazer:**
    - o dono do cartão;
    - quem tem a permissão de editar lançamentos de outros na conta do cartão (`canEditOthersEntries`);
    - cartão sem conta: só o dono.
12. **Vários pagamentos na mesma fatura:** são aceitos, porque uma compra lançada depois do pagamento fica em aberto e pode ser paga num segundo pagamento.
13. **Categorias automáticas:** "Renegociação de fatura" e "Encargos de cartão" são criadas na primeira vez que forem precisas, no catálogo do dono do cartão, no tipo da conta do cartão.
14. **Painel:** avisa cada fatura renegociada (parcial ou parcelado) cujo mês está no período, com o valor que foi para a frente e quando.

## Regras multi-tenant e segurança

- **Permissão:**
  - vem sempre do token;
  - no cartão: o dono, ou `canEditOthersEntries` na conta do cartão;
  - sem permissão, ou com cartão ou pagamento inexistente: 404, sem revelar que existe.
- **Fatura com lançamentos de outras pessoas:** ela inclui compras lançadas por outras pessoas no cartão do dono, porque a fatura é dele. É o mesmo critério da mudança de vencimento do cartão.
  - As escritas nessas linhas são autorizadas pela permissão no cartão.
  - As consultas filtram sempre pelo cartão autorizado.
- **`pagamentos_fatura`:**
  - é lida sempre pelo cartão ou pelo pagamento já autorizado, e filtrada pelo dono (`usuario_id`);
  - as linhas geradas são lidas e excluídas pelo `origem_pagamento_fatura_id` do pagamento autorizado.
- **O que vem do cliente e o que vem do banco:**
  - o cliente manda só o cartão, o mês, a forma, a data, o valor pago, os juros e o número de parcelas;
  - a lista de compras, a soma, as partes de cada compra, os vencimentos e as categorias saem do banco e das regras do servidor.
- **Concorrência:** `FOR UPDATE` no cartão e nas compras (e nas linhas geradas, ao desfazer), dentro da transação. Dois pagamentos ao mesmo tempo na mesma fatura correm um depois do outro, e o segundo só vê o que ficou em aberto.
- **Erros e logs:** mensagens em português, sem dado de outra conta; nada de `catch {}` silencioso; logs com contexto.
- **Relatórios e PDF:** sem consulta nova.

## Validações necessárias

- **Lista:** `GET /api/card-invoices`
  - `invoice_month`: `AAAA-MM` válido (`parseEffectiveMonth`); senão, 400;
  - `conta_id`: opcional, numérico.
- **Pagar:** corpo do `POST /api/card-invoices/payments`, lido por `readInvoicePaymentInput`:
  - `cardId`: id obrigatório;
  - `invoiceMonth`: `AAAA-MM`;
  - `method`: `total`, `partial` ou `installments`;
  - `paymentDate`: data ISO obrigatória;
  - `amountPaid`: obrigatório no total e no parcial; número maior que zero e até 99.999.999,99, arredondado em centavos; ausente no parcelado;
  - `interestAmount`: no parcial e no parcelado; maior ou igual a zero (vazio = 0); ausente no total;
  - `installmentCount`: obrigatório no parcelado, inteiro de 2 a 360; ausente nas outras formas.
- **No serviço:**
  - fatura sem compras em aberto: 409 "Esta fatura não tem valor em aberto.";
  - total menor que a soma: 400 "O valor pago é menor que a soma das compras: use o pagamento parcial ou confira os lançamentos.";
  - parcial fora do intervalo: 400 "O pagamento parcial precisa ser maior que zero e menor que a soma das compras.";
  - parcelado com menos de R$ 0,01 por parcela: 400;
  - valor final acima do limite: 400.
- **Desfazer:**
  - pagamento inexistente, sem permissão ou já estornado: 404;
  - linha gerada já paga por outro pagamento: 409 "Uma parte desta renegociação já foi paga numa fatura seguinte. Desfaça aquele pagamento antes.".
- **Rotas existentes:**
  - `/pay` em despesa no crédito com cartão: 400 "Despesa no crédito é paga pela fatura do cartão.";
  - `PUT` com campo travado alterado ou mudança no pagamento do crédito com cartão: 400, com o motivo;
  - cancelar ou excluir linha protegida: 400 "Esta despesa faz parte de um pagamento de fatura. Para mudar, desfaça o pagamento da fatura.".
- **Front:**
  - as mesmas regras no modal: o botão fica desligado e a mensagem aparece no campo;
  - o número de parcelas só aceita inteiros;
  - "Confirmar pagamento" fica desligado enquanto envia.

## Testes necessários

### Frontend

- **`src/utils/cardInvoice.test.ts`:**
  - **Total:** igual à soma não gera encargos; acima, gera encargos; abaixo, é recusado.
  - **Parcial:** o restante é soma − pago + juros; é recusado com zero ou com o valor igual à soma.
  - **Parcelado:** os centavos que sobram ficam na última parcela; a taxa ao mês dá cerca de 1,42% no exemplo 1.050 → 3x de 360.
  - **Mês da fatura:** `invoiceMonthParam` e `invoiceMonthLabel`.
  - **Lista:**
    - `isCreditWithCard`, `isRenegotiated` e `renegotiationNote`;
    - `isInvoiceProtected` e `invoiceEditLock`, para cada tipo de linha.
- **`src/utils/expenseFilters.test.ts`:** o crédito com cartão fica fora do lote; o crédito sem cartão e as outras formas continuam no lote.

### Backend

- **`cardInvoiceInput.test.ts`:**
  - corpo válido nas três formas;
  - campo que não pertence à forma escolhida;
  - valores ausentes, negativos ou acima do limite;
  - parcelas fora de 2 a 360;
  - mês e data inválidos.
- **`cardInvoiceRules.test.ts`:**
  - **Exemplos do usuário:**
    - parcial de 600 sobre 1.000 (500, 300, 200) dá 300/180/120 e restante de 430 com juros de 30;
    - parcelado em 3x com juros de 80 dá 3x de 360 e as compras com 0.
  - **Proporção:** exata em centavos (a soma das partes é igual ao pago) e determinística, pela maior sobra e, no empate, pelo id.
  - **Juros carregados,** no parcial e no parcelado, numa fatura que já tem um restante com juros.
  - **Encargos no total.**
  - **Vencimentos no dia do cartão:** dia 31 em mês curto e a virada do ano.
  - **Recusas.**
  - **Juros por parcela** sem passar do valor da parcela.
  - **Descrições** e o limite de 255 caracteres.
  - **Travas da edição,** por tipo de linha.
  - **Regra do desfazer.**
- **`painelCalculos.test.ts`:**
  - linha ligada ao pagamento de fatura não gera desconto, e os juros contam na proporção do que foi pago;
  - os encargos contam inteiros como juros;
  - a regra antiga continua intacta para as linhas sem ligação;
  - `sumUpcomingInterest`.

### E2E

Conferência manual no banco local (`.env.dev`), depois de reverter a 0081 antiga e aplicar a nova:

- **Botões e bloqueio:**
  - "Pagar despesas" e "Pagar fatura" sempre visíveis;
  - na linha no crédito com cartão, o "Pagar" fica desligado e não há caixa de seleção;
  - Pix, débito e dinheiro seguem como hoje.
- **Total:** compras pagas. Pagando acima da soma, aparece "Encargos da fatura" já paga, e os juros entram no Painel.
- **Parcial de 600 sobre 1.000, com 30 de juros:**
  - as compras aparecem como "Renegociada" em cinza, com "R$ 300 de R$ 500";
  - em novembro aparece o "Restante da fatura" de R$ 430;
  - outubro soma 600 e novembro soma 430;
  - o limite do cartão sobe; o Painel avisa e mostra 30 em "Juros a vencer".
- **Parcelado em 3x:**
  - as compras não somam em outubro;
  - aparecem 3 parcelas de nov a jan;
  - a parcela de uma compra parcelada que cai em novembro continua normal.
- **Fatura seguinte:** pagar a fatura de novembro (com o restante) e conferir os juros pagos.
- **Desfazer:**
  - funciona antes de pagar novembro;
  - depois de pagar novembro, é recusado com a mensagem;
  - o histórico mostra o estorno.
- **Travas:**
  - cancelar e excluir compra paga pela fatura e linha gerada: bloqueado na lista, na grade e na API;
  - a edição trava os campos;
  - `/pay` pela API recusa.
- **Assistente:** o chip "Pagar despesa" não oferece despesa no crédito com cartão.
- **Permissões:** o membro com permissão consegue pagar a fatura do cartão do titular; sem a permissão, não vê o cartão.
- **Demo:** pagar total, parcial e parcelado, e desfazer.

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
npm --prefix backend test
npx tsc --noEmit
npm test
npx vite build
```

Banco local, só com a confirmação do usuário:

```bash
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0081 --banco local
```

## Riscos e pontos de atenção

- **Ordem na produção:** a 0081 precisa entrar antes do deploy do backend, porque a lista, o Painel e a edição leem as colunas novas.
- **Reversão no banco local:** mexe em dados de teste do fluxo antigo, se existirem. Sempre conferir antes, só lendo, e só seguir com a confirmação do usuário.
- **Lançamentos de outras pessoas:** a fatura marca como pagas compras lançadas por outras pessoas no cartão do dono. É o mesmo critério da mudança de vencimento, e a permissão é conferida no cartão.
- **Juros em cadeia** (rotativo mês a mês): as regras de proporção e de juros carregados precisam dos testes da lista acima.
- **Limite do cartão:** passa a refletir a dívida renegociada (restante e parcelas em aberto, com os juros). É o esperado.
- **Relatórios:** mostram a compra renegociada pelo valor pago (por exemplo, R$ 300) e o restante ou as parcelas nos meses deles, sem a marca de renegociação (fora do escopo).
- **Merge com a `feat/R/site-novo`:** ela também mexe em `queryKeys.ts` (perto da linha 120) e em `demoFakeDatabase.ts` (da linha 89 em diante). Pôr a chave nova perto de `expenseGroup` e mexer só no tipo `RawExpenseDemo`.
- **Branch abandonada:** a `feat/R/pagamento-cartao` continua no remoto até o `/finalizar`.
- **Local:** fica sem o site novo enquanto esta branch estiver em uso, até a branch de integração ser decidida.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

Fora deste plano, continua sem resposta a criação da branch de integração do local (`local/R/integracao`), para ver o site novo e esta entrega juntos.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- **Botões:** "Pagar despesas" e "Pagar fatura" aparecem sempre, lado a lado.
- **Crédito com cartão:** a despesa não é paga pela linha, pelo lote, pelo assistente nem pela edição. As outras formas e o crédito sem cartão seguem como hoje.
- **Total:** paga as compras. O que passar da soma vira "Encargos da fatura" (categoria "Encargos de cartão"), contado como juros.
- **Parcial:**
  - as compras contam pela proporção do valor pago;
  - o "Restante da fatura" (restante + juros) vence no mês seguinte;
  - as somas batem exatamente com o que saiu do bolso.
- **Parcelado:**
  - as compras contam R$ 0 no mês;
  - as N parcelas da fatura entram a partir do mês seguinte, com a soma exata;
  - as parcelas de compras dos outros meses não mudam.
- **Restante e parcelas:** ficam na categoria "Renegociação de fatura", em nome do dono do cartão, e são pagos pela fatura em que caem.
- **Lista:** a compra renegociada aparece em cinza como "Renegociada", com a nota que abre a fatura.
- **Desfazer:** volta tudo e é recusado quando uma linha gerada já foi paga por outro pagamento.
- **Painel:** sem desconto falso, com juros pagos e a vencer certos (inclusive em cadeia) e com o aviso de renegociação.
- **Travas:** valem na tela e na API.
- **Demo:** funciona.
- **Checks:** os comandos acima passam.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal. O `.plans/pagamento-despesa-cartao.md` e o commit `76bc8474` são só referência do que reaproveitar.
- **Branch nova:** `feat/R/pagamento-fatura-cartao`, a partir da `main`. Não reaproveitar a `feat/R/pagamento-cartao` e não apagá-la (isso fica para o `/finalizar`, com o ok do usuário).
- **Migrations:** não executar nenhuma sem a confirmação explícita do usuário. No banco local: conferência só de leitura, depois a reversão da 0081 antiga, depois a 0081 nova. Na produção, só no `/finalizar`, com `--confirmo`, fora do auto mode e antes do deploy.
- **`.env`:** não alterar. O script avulso de reversão lê o `.env.dev` e recusa qualquer URL que não seja a local; nunca imprimir a URL.
- **Seguir o `/AGENT.md`:**
  - identificadores em inglês: rotas, campos de pedido e resposta, funções, tipos e campos novos, inclusive nos módulos antigos em português;
  - textos ao usuário em português;
  - Drizzle nas queries novas (SQL cru só no `ON CONFLICT` das categorias, com o motivo no código);
  - sem `any` e sem `catch {}` silencioso.
- **Regras puras** em `backend/src/services/` e `src/utils/`, para entrarem nos scripts de teste existentes.
- **Reaproveitar:**
  - no backend: `splitInstallments`, `addMonthsClamped`, `moveDueDateToDay`, `parseEffectiveMonth`, `resolveVisibleCardOwnerIds`, `canEditOthersEntries`, `findPeopleNames`, `RequestInputError`, `sendRequestError` e o padrão de grupo de `createExpense`;
  - do commit `76bc8474`: `splitInterestWithinInstallments`, `monthlyInterestRate`, `installmentsLabel`, `formatPercent` e a linha "Juros a vencer";
  - no front: `Dialog`, `MoneyField`, `IsoDateField`, `dialogFormTokens`, `useConfirm`, `invalidateExpenseQueries` e o `BatchPaymentModal`.
- **Merge com a `feat/R/site-novo`:** seguir as posições indicadas em Riscos.
- **Commits:** `.portal/` e `GLOSSARIO.md` nunca entram.
- **Depois do merge:** levar as regras novas para a memória de regras de negócio.
