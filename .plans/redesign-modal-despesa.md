# Plano de Implementação: Redesign do modal "Nova despesa" (mockup "Nova Despesa v2")

## Origem

- **Especificação:** `.plans/analise-redesign-modal-despesa.md` (análise com as 11 decisões) e o mockup "Nova Despesa v2
  (standalone)".
- **Data do planejamento:** `2026-09-29`.
- **Classificação:** `fullstack`. Mexe no frontend e no backend, sem mudança no banco: cada parcela já é uma linha com
  valor, pago, data e valor pagos.
- **Branch:** `feat/R/redesign-modal-despesa`, criada a partir do `main`.

## Resumo

- **O modal:** refazer o "Nova despesa" no formato, com as funções e a aparência do mockup, usando as cores e a fonte do
  app. Ele passa a ser uma grade com uma linha de entrada, o lote em linhas compactas e a barra "Lançando em". Tem
  popovers, a grade de parcelas com o valor total dividido e o pagamento de cada parcela, a data real em "Pago em" e um
  resumo sob a linha ativa.
- **O backend:** ganha um formato único, com campos em inglês, para criar e editar despesas, buscar sugestões e checar
  duplicata. A gravação é feita em transação.
- **A limpeza:** sai o código antigo do modal, o lixo levantado na análise e as telas `DespesasScreen` e
  `ReceitasScreen`, que nenhuma tela abre.
- **Os bugs:** corrige os bugs encontrados no fluxo atual.

## Escopo

### Dentro do escopo

- **Modal novo:**
  - nova despesa, com a linha de entrada e o lote;
  - edição com uma linha só;
  - campos empilhados no celular, abaixo de 1024px.
- **Parcelado:**
  - o valor digitado passa a ser o total, dividido em centavos, e cada parcela pode ser ajustada;
  - pagamento por parcela, com data e valor;
  - aviso quando a soma das parcelas difere do total;
  - preço à vista para calcular o juros embutido.
- **"Pago em":** data real do pagamento na despesa única e na mensal.
- **Formato novo no backend:** `POST` e `PUT /expenses`, `GET /expenses/suggestions` e `GET /expenses/duplicate`.
- **Bugs corrigidos:**
  - editar uma parcela estraga o parcelamento;
  - vencimento nos dias 29 a 31 cai no mês seguinte;
  - parcelas pagas no cadastro ficam sem data e sem valor pago;
  - o autocomplete repete a mesma descrição e mistura as contas;
  - o progresso fica parado em "0 de N";
  - uma falha no meio do lote grava duplicatas;
  - o Esc fecha o modal inteiro, o Enter com o autocomplete aberto salva e o Tab não aceita a sugestão.
- **Componentes usados também pela receita:**
  - seletor de categoria e anexos com o visual novo;
  - `FloatingPanel` novo;
  - Esc e largura do `Dialog`.
- **Assistente e modo demo** passam para o formato novo.
- **Limpeza:** os itens da §5 da análise, a `DespesasScreen`, a `ReceitasScreen` e o que ficar sem uso por causa delas
  (`faturarContrato` e as mensagens `despesasTogglesTipo` e `receitasContratosFaturamento`).
- **Testes:**
  - backend: datas e leitura do pedido;
  - frontend: a lógica pura (divisão, datas, validação e montagem do envio), com `tsx --test`.

### Fora do escopo

- O modal de receita, que mantém o seletor de conta e o formato atual. Só os componentes compartilhados mudam.
- A rota `POST /contratos/:id/faturar`, que fica sem chamador no frontend. Fica anotada para uma limpeza do lado de
  contratos.
- As colunas `forma_favorita` e `cartao_favorito_id` das categorias e a rota `PUT /categorias/:id/favorite`.
- O endereço antigo `/api/despesas`, que continua respondendo por causa de apps em cache.
- A troca para inglês das respostas da API, das colunas do banco e do formato do anexo (guardado em JSONB).
- Qualquer ajuste em despesas já gravadas.

## Leitura de contexto

- `/AGENT.md` (raiz). **Não existem** `frontend/AGENT.md` nem `backend/AGENT.md`.
- `.plans/analise-redesign-modal-despesa.md`, `.plans/inventario-modal-lancar-despesa.md` e o mockup.
- **Modal atual e telas que o abrem:** `ExpenseDialog.tsx`, `ExpenseForm.tsx`, `App.tsx`, `demoMain.tsx`,
  `CalendarView.tsx`, `LancamentosTable.tsx`, `DespesasScreen.tsx` e `ReceitasScreen.tsx`.
- **Componentes compartilhados:** `CategoryFloatingSelect.tsx`, `AttachmentSection.tsx`, `dialog.tsx`,
  `dialogFormTokens.tsx` e `IncomeForm.tsx`.
- **Serviços, dados e assistente:** `financeService.ts`, `expenseSuggestionsService.ts`, `cardLimitsService.ts`,
  `queryKeys.ts`, `useFinanceDashboard.ts`, `useActiveAccount.ts`, `FinancialAssistant.tsx` e
  `demo/fakeApiResolver.ts`.
- **Backend:** `routes/expenses.ts`, `routes/reports.ts` (modelo de rota), `db/schema/expenses.ts`, `db/client.ts`,
  `utils/date.ts`, `utils/accountFilter.ts`, `services/cardLimitService.ts`, `services/painelCalculos.ts` e
  `backend/package.json`.

## Impacto por área

### Frontend

**Modal novo**, em `src/screens/finance/expense-dialog/`:

- **`ExpenseDialog.tsx`:** o modal usa o `Dialog` no tamanho `xxl` e tem:
  - a barra "Lançando em" (só na nova despesa);
  - o cabeçalho das colunas, a linha de entrada e o lote ("No lote · N despesas · soma R$");
  - o rodapé, com uma mensagem e um botão;
  - o progresso, o aviso de registrada e os atalhos;
  - a gravação, uma despesa por vez.
- **`ExpenseRow.tsx` e `RowSummary.tsx`:** a linha (em grade no desktop, empilhada abaixo de 1024px) e o resumo da linha
  ativa.
- **Popovers:**
  - `PaymentMethodPopover`: forma de pagamento, cartão e "Limite disponível · fecha dia N, vence dia M";
  - `BillingPopover`: não repete, parcelado ou recorrente; nº de parcelas com − e +, pedindo confirmação quando perderia
    ajustes; preço à vista; dia do mês;
  - `InstallmentsPopover`: a grade de parcelas;
  - `AttachmentsPopover`: anexos e, na conta PJ, a nota fiscal.
- **Campos:**
  - `MoneyCell`: usa o `useMoneyInput`, que passa a ser exportado;
  - `DateCell`: dd/mm/aaaa com máscara e complemento.
- **Lógica e dados:**
  - `draftState.ts`: tipos do rascunho, criação e reducer;
  - `draftRules.ts`: vencimento, status, resumo, badges, validação e montagem do envio;
  - `useExpenseSuggestions.ts`: sugestões e duplicata, com espera enquanto digita.
- **Valores:** o modal trabalha em centavos e só converte para reais ao enviar.

**Base e serviços:**

- **`utils/expenseSchedule.ts` (novo):** substitui o `cardDueDate.ts`, com `addMonthsClamped`, `invoiceDueDate`,
  `dateInMonth`, `splitAmountInCents` e `installmentDueDates`. O modal e o assistente usam o mesmo arquivo.
- **`utils/date.ts`:** funções de data dd/mm/aaaa.
- **`types/finance.ts`:** entram `ExpenseCreateInput`, `ExpenseUpdateInput` e `ExpenseInstallmentInput`.
- **`financeService.ts`:** entram `createExpense` e `updateExpense`, e todas as chamadas de despesa passam a usar
  `/expenses`.
- **`expenseSuggestionsService.ts`:** formato novo e `fetchExpenseDuplicate`.
- **`queryKeys.ts`:** chaves novas e a função `invalidateExpenseQueries`, que atualiza depois de salvar todos os meses,
  o painel, os limites de cartão, o planejamento, os relatórios e as sugestões.
- **`useFinanceDashboard.ts`:** sai a mutation `saveExpense`.

**Componentes usados também pela receita:**

- **`ui/FloatingPanel.tsx` (novo):**
  - painel em posição fixa, com lado para cima ou para baixo;
  - fecha ao clicar fora e ao rolar;
  - trata o Esc antes do modal;
  - vira painel inferior no celular.
- **`ui/dialog.tsx`:** ignora o Esc que um popover já tratou; o `xxl` passa a ter 1240px.
- **`ui/CategoryFloatingSelect.tsx`:**
  - passa a usar o `FloatingPanel`;
  - "Recentes" em chips e campo "Pai › Sub";
  - "criar" dentro do popover, com `onCreate` devolvendo o id criado;
  - a altura do campo vem de quem o usa.
- **`IncomeForm.tsx`:** passa o `onCreate` para o seletor.
- **`ui/AttachmentSection.tsx`:** a lista vira linhas (tipo, nome, tamanho, baixar, remover), com o link "+ Anexar
  arquivo" e a dica de tipos. A receita continua abrindo pelo clipe.

**Telas que abrem o modal:**

- `App.tsx`, `demoMain.tsx`, `CalendarView.tsx` e `LancamentosTable.tsx` passam só `open`, `expense`, `presetDate` e
  `onClose`.
- As funções de status da `DespesasScreen` vão para `src/screens/despesas/expenseStatus.tsx`.

**Assistente:** `FinancialAssistant.tsx` monta o `ExpenseCreateInput` usando o `expenseSchedule`. A tela dele e o
resultado não mudam.

**Demo:** `fakeApiResolver.ts` responde ao `POST /expenses` no formato novo, criando uma linha por parcela. Sugestões e
duplicata voltam vazias.

### Backend

- **`routes/expenses.ts`:**
  - `POST /` e `PUT /:id` no formato novo;
  - `GET /suggestions` com parâmetros em inglês;
  - `GET /duplicate` novo;
  - mantém as checagens atuais: `canWriteToAccount` (conta), `resolveOwnerForWrite` (edição), `validateCardId` e
    `validateCardTypeCompatibility` (cartão).
- **`services/expenseInput.ts` (novo, sem banco):** lê e valida o corpo e os parâmetros. Mensagens de erro em português.
- **`services/expenseService.ts` (novo, com Drizzle):**
  - criar em transação: única (1 linha), mensal (12 ocorrências) ou parcelada (uma linha por item da lista);
  - editar;
  - sugestões;
  - duplicata.
- **`utils/date.ts`:** `addMonthsClamped`, que soma meses sem pular o último dia do mês.
- **Testes:** `utils/date.test.ts` e `services/expenseInput.test.ts`.

### Banco de dados

Sem impacto esperado: nenhuma coluna, índice ou migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar
apontando para produção.

### Infra/Deploy

Sem variáveis de ambiente, jobs ou mudanças no Render. Frontend e backend sobem juntos. Quem estiver com o app antigo em
cache recebe erro 400 até atualizar.

## Formato novo das chamadas

O corpo das chamadas usa campos em camelCase; os parâmetros de busca usam snake_case, no mesmo padrão da rota de
relatórios.

```
POST /api/expenses
{ accountId, description, categoryId|null, paymentMethod, cardId|null, purchaseDate,
  billingType: 'single' | 'monthly' | 'installments',
  amount, dueDate, paid, paymentDate|null, amountPaid|null,                      // single e monthly
  installments: [{ amount, dueDate, paid, paymentDate|null, amountPaid|null }],  // 2 a 360
  invoiceNumber|null, invoiceDate|null, attachments|null }

PUT /api/expenses/:id
{ description, categoryId|null, paymentMethod, cardId|null, purchaseDate, dueDate,
  amount, paid, paymentDate|null, amountPaid|null, invoiceNumber|null, invoiceDate|null, attachments|null }

GET /api/expenses/suggestions?description=&account_id=&category_id=
→ { matches: [{ description, amount, categoryId, paymentMethod, cardId }], lastAmount,
    suggestedPaymentMethod, suggestedCardId }

GET /api/expenses/duplicate?description=&amount=&payment_method=&installment_count=&account_id=&exclude_id=
→ { duplicate: { createdAt } | null }
```

O `POST` e o `PUT` devolvem a linha gravada, como hoje.

## Arquivos provavelmente afetados

- **Removidos:**
  - `src/screens/finance/ExpenseForm.tsx`, `src/screens/finance/ExpenseDialog.tsx` e `src/utils/cardDueDate.ts`;
  - `src/screens/despesas/DespesasScreen.tsx` e `src/screens/receitas/ReceitasScreen.tsx`.
- **Novos no frontend:**
  - `src/screens/finance/expense-dialog/*` e `src/screens/despesas/expenseStatus.tsx`;
  - `src/ui/FloatingPanel.tsx` e `src/utils/expenseSchedule.ts`;
  - testes: `src/utils/expenseSchedule.test.ts`, `src/utils/date.test.ts` e
    `src/screens/finance/expense-dialog/draftRules.test.ts`.
- **Novos no backend:**
  - `backend/src/services/expenseInput.ts` e `expenseService.ts`;
  - testes: `backend/src/services/expenseInput.test.ts` e `backend/src/utils/date.test.ts`.
- **Alterados no frontend:**
  - dependências: `package.json` e `package-lock.json` (`tsx` e o script `test`);
  - tipos, serviços e dados: `src/types/finance.ts`, `src/services/financeService.ts`,
    `src/services/expenseSuggestionsService.ts`, `src/services/queryKeys.ts`, `src/hooks/useFinanceDashboard.ts`,
    `src/utils/date.ts`;
  - componentes e receita: `src/ui/dialog.tsx`, `src/ui/dialogFormTokens.tsx`, `src/ui/CategoryFloatingSelect.tsx`,
    `src/ui/AttachmentSection.tsx`, `src/screens/finance/IncomeForm.tsx`, `src/components/firstAccessGuideMessages.ts`;
  - telas: `src/App.tsx`, `src/demoMain.tsx`, `src/screens/finance/calendar/CalendarView.tsx`,
    `src/screens/finance/LancamentosTable.tsx`, `src/screens/despesas/ExpenseCard.tsx`,
    `src/screens/despesas/DeleteInstallmentDialog.tsx`;
  - assistente e demo: `src/components/financial-assistant/FinancialAssistant.tsx`,
    `src/services/demo/fakeApiResolver.ts`.
- **Alterados no backend:** `backend/src/routes/expenses.ts` e `backend/src/utils/date.ts`.

## Estratégia de implementação

**Fase 0**

1. Criar a branch `feat/R/redesign-modal-despesa` a partir do `main`.

**Fase 1 — Remover.** Só remoção e mudança de lugar; o projeto volta a compilar no fim da fase 2.

2. **Apagar arquivos:** `ExpenseForm.tsx`, `ExpenseDialog.tsx`, `cardDueDate.ts` e `ReceitasScreen.tsx`.
3. **Desmontar a `DespesasScreen`:**
   - mover as funções de status (`getStatus`, `STATUS_TEXT_COLOR`, `STATUS_LABEL`, `getFirstName`, `valorExibido`,
     `diferencaValor`, `formatDiferenca`, `getStatusKey`, `getStatusColor` e `StatusBadge`) para `expenseStatus.tsx`;
   - ajustar os imports em `ExpenseCard` e `DeleteInstallmentDialog`;
   - apagar `DespesasScreen.tsx`.
4. **Limpar componentes e mensagens:**
   - `dialogFormTokens.tsx`: tirar `MoneyFieldSmall` e `numericInputStyle`;
   - `dialog.tsx`: tirar o `fixedHeight`;
   - `firstAccessGuideMessages.ts`: tirar `despesasTogglesTipo` e `receitasContratosFaturamento`.
5. **Limpar tipos e serviços:**
   - `types/finance.ts`: tirar `ExpenseFormValues` e `valorFinalTotal`;
   - `financeService.ts`: tirar `saveExpense`, o mapeamento de `valorFinalTotal` e `faturarContrato`;
   - `useFinanceDashboard.ts`: tirar a mutation `saveExpense`.
6. **Telas que abrem o modal:** tirar de `App`, `demoMain`, `CalendarView` e `LancamentosTable` as props `month`,
   `year`, `isSaving`, `error` e `onSave`, e os laços de gravação.
7. **Seletor de categoria:**
   - `CategoryFloatingSelect.tsx`: tirar o posicionamento próprio, os ouvintes de clique fora e de Esc, o botão X e o
     `onCreateNew`;
   - `IncomeForm.tsx`: tirar a caixa externa de criar, o `showClassificacaoForm` e o `novaClassificacaoRef`.
8. **Modo demo:** tirar do `fakeApiResolver.ts` o `POST /despesas` antigo, o handler `/faturar` e as sugestões no formato
   antigo.
9. **Backend:** tirar de `routes/expenses.ts` as funções `createFutureInstallments` e `createRecurringOccurrences`, o
   corpo antigo do `POST` e do `PUT` e a consulta antiga de sugestões.

**Fase 2 — Aplicar**

10. **Datas no backend:** `addMonthsClamped` e o teste `utils/date.test.ts`.
11. **Leitura do pedido:** `services/expenseInput.ts` e o teste `expenseInput.test.ts`.
12. **Serviço:** `services/expenseService.ts`, com transação, sugestões e duplicata.
13. **Rotas:** handlers novos em `routes/expenses.ts`.
14. **Base do frontend:**
    - `tsx` como devDependency, na mesma versão do backend, e o script `test`:
      `tsx --test src/utils/*.test.ts src/screens/finance/expense-dialog/*.test.ts`;
    - `utils/date.ts` e `utils/expenseSchedule.ts`, com os testes deles.
15. **Tipos e serviços:** `types/finance.ts`, `financeService.ts`, `expenseSuggestionsService.ts` e `queryKeys.ts`.
16. **Componentes compartilhados:**
    - `FloatingPanel` novo;
    - `dialog.tsx` com o Esc e o `xxl` em 1240px;
    - `useMoneyInput` exportado;
    - `CategoryFloatingSelect` com o visual novo e o `onCreate` no `IncomeForm`;
    - `AttachmentSection` com a lista em linhas.
17. **Modal:**
    - `draftState`, `draftRules` e o teste de `draftRules`;
    - `useExpenseSuggestions`;
    - campos, popovers, linha, resumo e o `ExpenseDialog`.
18. **Telas:** passam a renderizar o modal novo.
19. **Assistente:** migra para o formato novo.
20. **Modo demo:** handlers novos.

**Fase 3 — Validar**

21. Rodar os comandos da seção de validação e o roteiro manual, com o backend usando o `.env.dev`.

## Regras de negócio identificadas

**Conta, campos e forma de pagamento**

1. **Conta:** sempre a ativa. As categorias, os cartões e a nota fiscal da PJ seguem a conta ativa.
2. **Campos obrigatórios no modal:** descrição, categoria e valor. No crédito, o cartão também é obrigatório quando há
   cartão de crédito cadastrado. A API continua aceitando despesa sem categoria, por causa do assistente.
3. **Forma de pagamento:**
   - ao abrir, é a mais usada na conta, ou PIX se ainda não houver histórico;
   - a barra "Lançando em" vale para as próximas despesas; no lote e na edição, cada linha tem a sua;
   - enquanto o usuário não mexe na forma, ela segue a sugestão pela categoria ou pelo histórico.
4. **Cartão:**
   - ao escolher Débito ou Crédito, o modal já marca o cartão mais usado com essa forma (ou o primeiro compatível), e o
     usuário pode trocar;
   - só aparecem cartões compatíveis com a forma escolhida.

**Vencimento e datas**

5. **Vencimento:**
   - uma data digitada manda sobre qualquer cálculo;
   - no crédito, vale a fatura: a compra feita até o fechamento entra na fatura do mês e, depois do fechamento, na
     seguinte. Quando o dia de vencimento é menor ou igual ao de fechamento, o vencimento cai no mês seguinte;
   - no recorrente, é o dia escolhido, no mês da compra;
   - nos demais casos, é a data da compra;
   - vencimentos nos dias 29 a 31 caem no último dia dos meses mais curtos.

**Parcelado**

6. **Valor:**
   - o valor digitado é o total;
   - cada parcela é o total ÷ n, calculado em centavos, com o resto na última;
   - cada parcela pode ser editada; se a soma ficar diferente do total, aparece um aviso, sem bloquear, e as parcelas
     são gravadas como estão.
7. **Mudanças no número de parcelas e preço à vista:**
   - reduzir o número de parcelas pede confirmação quando isso apagaria ajustes ou pagamentos;
   - com o preço à vista informado, mostra o juros embutido: total − preço à vista, também em %.
8. **Pagamento das parcelas:**
   - o que vale é a marcação na grade, e uma parcela vencida pode ficar em aberto;
   - "marcar vencidas como pagas" marca cada uma paga na data do vencimento;
   - uma parcela marcada como paga sem valor informado recebe o valor da própria parcela;
   - no crédito, só se marca a parcela, e a data do pagamento é a do vencimento.
9. **Situação de cada parcela:**
   - fora do crédito: em dia, X dias de atraso, juros, desconto, vencida, próxima ou a vencer;
   - no crédito: fatura vencida, aberta, futura ou paga.

**Despesa única e recorrente**

10. **Pagamento:** "Pago em" é a data real do pagamento. Fora do crédito, uma despesa com vencimento até hoje nasce paga
    mesmo sem marcar, como já acontece hoje.
11. **Recorrente:** cria 12 ocorrências; no crédito, segue a fatura.

**Resumo, avisos e sugestões**

12. **Status do resumo:** Pago · Agendado · Entra na fatura · Com vencidas · Em andamento.
13. **Duplicata:** é só um aviso e não bloqueia. Conta como duplicata quando:
    - a descrição é a mesma (sem diferenciar maiúsculas) e a forma é a mesma;
    - o valor é o mesmo (no parcelado: mesmo valor da 1ª parcela e mesmo nº de parcelas);
    - é da mesma conta, está ativa e foi cadastrada nos últimos 7 dias.
    Na edição, a própria despesa não conta.
14. **Autocomplete:**
    - começa com 2 letras, depois de 220 ms sem digitar;
    - mostra até 4 descrições diferentes, só da conta ativa;
    - escolher uma preenche a descrição e, se estiverem vazios, o valor e a categoria; a forma e o cartão só são
      trocados se o usuário ainda não mexeu na forma.
15. **Sugestão de categoria:** começa com 3 letras; procura primeiro no histórico e depois por palavras-chave. Tab
    aceita a sugestão.

**Lote, salvamento e edição**

16. **Lote:**
    - "+" ou Shift+Enter levam a linha de entrada para o lote, mantendo a forma, o cartão e a data da compra;
    - ao salvar, as despesas são gravadas uma a uma, e cada uma que grava sai do lote;
    - se uma falhar, a gravação para e o rodapé mostra "Despesa N do lote: …";
    - fechar o modal descarta o lote.
17. **Depois de salvar:** numa nova despesa, o modal continua aberto e limpo, com o aviso de registrada; numa edição, o
    modal fecha.
18. **Edição:**
    - uma linha só, sem lote e sem o botão "+";
    - a cobrança fica só para leitura ("Parcela 3/10", "Mensal"), sem a grade de parcelas;
    - o cartão já vem carregado;
    - o nº e a posição da parcela e a observação não mudam;
    - a regra "vencida fora do crédito nasce paga" não vale para parcela.

**Teclado, calendário e celular**

19. **Teclado:** Esc fecha primeiro o popover e depois o modal. Enter salva, mas dentro do autocomplete e dos popovers
    age só neles.
20. **Calendário:** a data da compra fica travada na linha de entrada.
21. **Celular:** abaixo de 1024px, os campos ficam empilhados e os popovers abrem como painel inferior.

## Regras multi-tenant e segurança

Neste projeto, o isolamento é por usuário e conta (o "tenant" da `AGENT.md` corresponde a isso):

- **Conta enviada pelo app:** o `accountId` é validado por `canWriteToAccount` no `POST` e no `PUT`, sem confiar no que
  chega.
- **Edição:** o dono é resolvido por `resolveOwnerForWrite`; sem permissão, a resposta é 404.
- **Cartão:** `validateCardId` confere se o cartão é de um dono permitido, e a compatibilidade com a forma também é
  checada. Cartão não liberado recebe erro 400.
- **Sugestões e duplicata:** só usam despesas do próprio usuário, na conta (mesmo critério de `accountFilter.ts`) e com
  status ativa.
- **Limites:** de 2 a 360 parcelas; valores maiores que zero e de no máximo 99.999.999,99 (limite da coluna); datas em
  formato ISO válido; na busca, `%` e `_` são escapados.
- **Relatórios e PDF:** não são afetados.

## Validações necessárias

- **`POST` (backend):**
  - `description` com 1 a 255 caracteres;
  - `paymentMethod` entre `pix`, `dinheiro`, `debito` e `credito`;
  - `billingType` válido e datas em formato ISO;
  - na despesa única e na mensal: `amount` maior que 0 e `dueDate` obrigatório;
  - no parcelado: de 2 a 360 itens em `installments`, cada um com `amount` maior que 0 e `dueDate`;
  - `amountPaid` e `paymentDate` só quando `paid`;
  - `invoiceNumber` com até 50 caracteres;
  - `categoryId` e `cardId` como inteiros positivos ou null.
- **`PUT` (backend):** os mesmos campos editáveis, sem `billingType` e sem `installments`.
- **Parâmetros de busca (backend):** `description` com pelo menos 2 caracteres nas sugestões; `amount`,
  `installment_count`, `account_id` e `exclude_id` numéricos.
- **Modal (`draftRules`):**
  - obrigatórios da regra 2;
  - nº de parcelas entre 2 e 360;
  - cada parcela com valor maior que 0;
  - datas válidas: a compra sempre; o vencimento, quando preenchido; o pagamento, quando marcado como pago;
  - dia do mês entre 1 e 31;
  - número da NF com até 50 caracteres.

## Testes necessários

### Frontend (`tsx --test`)

- **`expenseSchedule`:**
  - 100,00 em 3 → 33,33 / 33,33 / 33,34;
  - 31/01 + 1 mês → 28/02 (29/02 em ano bissexto); 31/01 + 2 meses → 31/03;
  - fatura antes e depois do fechamento, e com dia de vencimento menor ou igual ao de fechamento.
- **`date`:** máscara, complemento ("5" → 05/mês/ano; "0510" → 05/10/ano; "051026" → 05/10/2026) e rejeição de data
  inexistente.
- **`draftRules`:**
  - status: Pago, Agendado, Entra na fatura, Com vencidas e Em andamento;
  - textos do resumo e badges (juros embutido, multa e juros, desconto);
  - validação, com as mensagens do rodapé;
  - montagem do envio: única, mensal e parcelada, com ajustes e pagamentos.

### Backend

- **`date.test.ts`:** `addMonthsClamped` nos casos de 29 a 31, na virada de ano e em ano bissexto.
- **`expenseInput.test.ts`:** leitura de corpo válido e inválido (campos obrigatórios, `billingType`, limites de
  parcelas e valores, datas, pagamento sem `paid`) e dos parâmetros das sugestões e da duplicata.

### E2E (roteiro manual, desktop e celular, com o backend no `.env.dev`)

1. **Despesas simples:**
   - única no PIX hoje → "Pago na hora";
   - única com vencimento futuro → "Agendado";
   - "Pago em" com outra data e valor pago maior → badge de juros.
2. **Crédito:**
   - sem cartão → erro;
   - com cartão → "Entra na fatura", com o limite e os dias certos.
3. **Parcelado no crédito:** 3x, editando a 2ª parcela e marcando a 1ª → 3 linhas no banco com os valores da grade.
4. **Parcelado no PIX com parcelas vencidas:**
   - aparece o aviso;
   - "Deixar em aberto" → nada pago;
   - "Marcar como pagas" → pagas no vencimento, com data e valor.
5. **Recorrente dia 31:** vencimentos no último dia dos meses curtos, gravados no mês certo.
6. **Lote com 3 despesas:** forçar erro na 2ª → a 1ª sai do lote, e a 2ª e a 3ª ficam.
7. **Teclado e sugestões:** autocomplete com ↑↓ Enter e Esc, sem repetição; Tab aceita a categoria; "criar categoria"
   dentro do seletor; Esc por camadas; Enter salva.
8. **Edição:** editar a parcela 3/10 → continua 3/10, com o cartão e a observação preservados.
9. **Calendário:** a data da compra vem travada.
10. **Receita:** criar categoria dentro do seletor, anexar e baixar arquivo; o seletor de conta continua lá.
11. **Assistente:** parcelado 3x com 1 já paga → 3 linhas, a 1ª paga com data e valor.
12. **Modo demo:** lançar uma despesa.
13. **Celular:** campos empilhados e popovers como painel inferior.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

- **App antigo em cache:** quem estiver com o app antigo aberto manda o formato antigo até atualizar. O pedido falha com
  erro 400 e nada fica gravado pela metade.
- **Regra nova do parcelado:** o valor passa a ser o total, o que muda o hábito de quem digitava o valor da parcela.
- **A receita muda junto:** o seletor de categoria e os anexos ganham o visual novo, e o "criar categoria" vai para
  dentro do seletor.
- **Assistente:** a gravação muda e precisa dar o mesmo resultado de hoje.
- **"Faturar contrato do mês":** a ação só existia na `ReceitasScreen`, que já não aparece em nenhuma tela. Com a
  remoção, saem o último código de tela dessa ação e a função `faturarContrato`. Se quiser a ação de volta, é outra
  tarefa.
- **Painel:** nos lançamentos novos, parcelas pagas no cadastro passam a ter data e valor pagos, e "pago em dia/atraso"
  e juros ficam corretos. Os antigos não mudam.
- **Mais recargas:** depois de salvar, o app atualiza mais dados (todos os meses, limites, planejamento e relatórios).
- **Banco de produção:** o `.env` local aponta para produção. O roteiro manual só roda com o backend usando o
  `.env.dev`, nunca com o `dev:prod-db`.
- **Projeto quebrado durante a Fase 1:** o projeto só volta a compilar no fim da Fase 2.
- **Tamanho:** é uma entrega grande (modal, backend, assistente, receita e demo).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **Aparência:** no desktop, o modal reproduz o layout e as funções do mockup, com as cores e a fonte do app; no
  celular, os campos ficam empilhados.
- **Gravação:**
  - a despesa única, a mensal e a parcelada gravam exatamente o que a tela mostra: valores, vencimentos e parcelas pagas
    com data e valor;
  - o lote grava uma despesa por vez e, se uma falhar, só as que não foram gravadas ficam no lote.
- **Edição:** mantém a parcela (3/10), o cartão e a observação.
- **Datas:** vencimentos nos dias 29 a 31 ficam corretos em parcelas e recorrência, e o mês gravado é o do vencimento.
- **Autocomplete e sugestões:** o autocomplete não repete descrições, mostra só a conta ativa e funciona pelo teclado; o
  Tab aceita a categoria sugerida; a duplicata é checada no servidor.
- **Teclado:** o Esc fecha o popover antes do modal, e o Enter salva.
- **Receita:** o novo seletor de categoria e os anexos funcionam, e o seletor de conta da receita continua como está.
- **Assistente e demo:** o assistente e o modo demo lançam despesas no formato novo.
- **Sem sobras:** nada mais referencia `ExpenseForm`, `ExpenseFormValues`, `saveExpense`, `cardDueDate`,
  `MoneyFieldSmall`, `numericInputStyle`, `fixedHeight`, `DespesasScreen`, `ReceitasScreen` ou `faturarContrato`.
- **Validação:** os comandos de validação passam e o roteiro manual foi cumprido.

## Observações para a skill implementar

- Usar este plano e `.plans/analise-redesign-modal-despesa.md` como fonte principal.
- Executar a Fase 1 inteira antes da Fase 2, sem manter código antigo ao lado do novo.
- Seguir a `/AGENT.md`:
  - Drizzle nas queries novas;
  - nomes de código em inglês e textos da tela em português;
  - nada de `any`;
  - erros com mensagem clara.
- Não executar migrations: nenhuma é necessária.
- Não mexer no `.env`. Testes manuais só com o backend no `.env.dev`.
- Não fazer commit: isso fica para o `/finalizar`.

## Decisões aplicadas

- **Decisões da análise (1 a 11):** todas seguem a recomendação, menos a 3, e o modal fica sem seletor de conta.
- **Decisão 1:** o modal de receita mantém o seletor de conta dele.
- **Decisão 2:** saem a `DespesasScreen` e a `ReceitasScreen`. As funções de status vão para `expenseStatus.tsx`, e o
  que ficar sem uso sai junto.
- **Decisão 3:** o frontend passa a ter testes da lógica pura com `tsx --test`, no mesmo padrão do backend.
