# Plano de Implementação: Modal de receita em grade + altura dos modais de lançamento

## Origem

- **Especificação:** `.plans/analise-redesign-modal-receita.md`, mais o pedido de 2026-09-29: "fazer o mesmo com receitas,
  lote em receitas, modal com ~85% da altura e os lançamentos ocupando a área".
- **Data do planejamento:** `2026-09-29`.
- **Classificação:** `fullstack`. Mexe no frontend e no backend, sem mudança no banco: as colunas usadas já existem.
- **Branch:** `feat/R/redesign-modal-receita`, criada a partir do `main`.

## Resumo

- **Modal de receita:** refeito no formato do modal de despesa, com linha de entrada, lote em linhas compactas, popovers,
  resumo sob a linha ativa e gravação uma a uma, com progresso e aviso de registrada. Lança sempre na conta ativa e toda
  receita nasce recebida.
- **Backend:** a receita ganha um formato novo em inglês. "Repetir" é gravado pelo servidor numa transação. A comissão
  também é calculada pelo servidor. Sugestões e duplicata passam a ser consultadas no servidor.
- **Altura:** os dois modais ficam com altura fixa de ~85% da tela.
- **Peças comuns:** o que os dois modais compartilham sai da pasta da despesa para uma pasta comum, sem cópia.

## Escopo

### Dentro do escopo

- **Modal de receita:**
  - nova receita com linha de entrada e lote;
  - edição com uma linha só;
  - campos empilhados abaixo de 1024px.
- **Colunas:**
  - conta pessoal: Descrição* · Categoria · Valor* · Recebido em* · Repetir · 📎 · +
  - conta empresa: acrescenta Cliente depois da Categoria e o botão "⋯", com representante e comissão, produto vendido e
    horas a faturar.
- **Repetir:** "Todo mês até mês/ano", gravado pelo servidor numa transação. Os dias 29 a 31 caem no último dia dos meses
  curtos e as réplicas partem do mês da receita.
- **Comissão:** o servidor calcula pelo percentual cadastrado. A comissão mensal vale na original e em cada réplica; a
  única, só na original.
- **Cliente:** escolhido do cadastro, com "+ cadastrar" dentro do seletor.
- **Faixa "Já previstas neste mês"**, com "Confirmar recebimento".
- **Dicas de primeiro acesso:** horas, replicar e representante.
- **Altura:** ~85% nos dois modais. O topo fica fixo e o lote rola; abaixo de 1024px o corpo inteiro rola.
- **Pasta comum:** `src/screens/finance/entry-dialog/`, usada pela despesa e pela receita.
- **Assistente e modo demo** gravam receita no formato novo.
- **Bugs corrigidos:**
  - réplicas nos dias 29 a 31 e partindo do mês da tela;
  - horas descontadas em cada réplica;
  - réplicas gravadas pela metade;
  - comissão "única" gerada em cada réplica;
  - lote que duplica depois de uma falha;
  - autocomplete que repete a mesma descrição e mistura contas;
  - duplicata que só olhava os meses em cache;
  - Esc que fechava o modal duas vezes;
  - edição que apagava a observação.
- **Testes:**
  - backend: datas mensais e leitura do pedido;
  - frontend: as regras da receita, com `tsx --test`.

### Fora do escopo

- Lançar receita "a receber" pelo modal.
- Recalcular a comissão ao editar uma receita, como hoje.
- Receber e cancelar receita e o faturamento de contratos: mudam só de endereço (`/incomes`).
- O endereço antigo `/api/receitas`, que continua respondendo; o formato antigo recebe erro 400.
- Qualquer ajuste em receitas já gravadas.

## Leitura de contexto

- **Regras:** `/AGENT.md`. **Não existem** `frontend/AGENT.md` nem `backend/AGENT.md`.
- **Especificação:** `.plans/analise-redesign-modal-receita.md` e, como padrão, `.plans/redesign-modal-despesa.md`.
- **Frontend:**
  - `IncomeDialog.tsx`, `IncomeForm.tsx` e a pasta `expense-dialog/`;
  - `financeService.ts`, `incomeSuggestionsService.ts`, `representantesService.ts`, `clientesService.ts`,
    `catalogoService.ts`, `queryKeys.ts` e `useFinanceDashboard.ts`;
  - `incomeClassificationSuggestions.ts` e `categorySuggestions.ts`;
  - as telas `App.tsx`, `demoMain.tsx`, `CalendarView.tsx` e `LancamentosTable.tsx`;
  - `FinancialAssistant.tsx` e `fakeApiResolver.ts`.
- **Backend:**
  - `routes/incomes.ts`, `db/schema/incomes.ts` e `db/client.ts`;
  - `services/commissionService.ts`, `services/estoque.ts` e `services/incomeClassificationCatalog.ts`;
  - `utils/date.ts`, `drizzle.config.ts` e o `expenseService.ts` (modelo de serviço).

## Impacto por área

### Frontend

**Pasta comum `src/screens/finance/entry-dialog/`.** São peças movidas da despesa, sem cópia:

- **`EntryDialogFrame.tsx`:** a estrutura do modal, com:
  - `Dialog` `xxl` de altura fixa e barra opcional;
  - cabeçalho das colunas, linha de entrada e resumo presos no topo;
  - lote ("No lote · N itens · soma") rolando no espaço restante;
  - rodapé com uma mensagem e um botão;
  - progresso "Salvando... i de n", aviso de registrada e o Enter / Shift+Enter.
- **`batchState.ts`:** o estado do lote, com linha de entrada, lote, erros, mensagem do rodapé, linha ativa, gravação e
  aviso. A despesa estende com o que é só dela (parcelas e sugestão de forma).
- **`saveBatchInOrder.ts`:** gravação uma a uma. Cada item gravado sai do lote e uma falha para a gravação.
- **Demais peças:**
  - `MoneyCell.tsx`, `DateCell.tsx` e `fieldStyles.ts`, este só com a parte genérica: os modelos de grade ficam em cada
    modal;
  - `SummaryLine.tsx`, que é o resumo sob a linha;
  - `AttachmentsPopover.tsx`, com espaço para conteúdo extra, onde a despesa põe a nota fiscal;
  - `useDebouncedValue.ts`, a espera enquanto digita.

**Modal de receita em `src/screens/finance/income-dialog/`:**

- **`IncomeDialog.tsx`:** props `open`, `income?`, `presetDate?` e `onClose`. Sem seletor de conta.
- **`draftState.ts` e `draftRules.ts`:** o rascunho, com valores em centavos e datas em dd/mm/aaaa, e as regras:
  - datas das réplicas e prévia da comissão;
  - estoque e horas;
  - resumo e validação com as mensagens do rodapé;
  - montagem do envio e consulta de duplicata.
- **`IncomeRow.tsx`:** a linha da grade (PF ou PJ).
- **Popovers:** `RepeatPopover.tsx`, `ClientSelect.tsx` (busca no cadastro + "+ cadastrar") e `IncomeDetailsPopover.tsx`
  (o "⋯").
- **`useIncomeSuggestions.ts`:** sugestões e duplicata.
- **`PredictedIncomesStrip.tsx`:** a faixa "Já previstas neste mês".

**Despesa:** `expense-dialog/*` passa a usar a pasta comum. O comportamento não muda.

**Base:**

- **`ui/dialog.tsx`:** nova opção de altura fixa (~85%).
- **`types/finance.ts`:**
  - entram `IncomeCreateInput`, `IncomeUpdateInput`, `IncomeRepeatUntil`, `IncomeProductSale` e `IncomeBillableHours`;
  - sai `IncomeFormValues`.
- **`financeService.ts`:**
  - entram `createIncome` e `updateIncome`;
  - sai `saveIncome`, com o laço de réplicas;
  - listar, receber e excluir receita passam para `/incomes`.
- **`incomeSuggestionsService.ts`:** formato novo e `fetchIncomeDuplicate`.
- **`queryKeys.ts`:** chaves novas e `invalidateIncomeQueries`, que atualiza:
  - todos os meses, o painel e as contas;
  - relatórios e planejamento;
  - contratos (saldo de horas), catálogo (estoque) e sugestões.
- **`useFinanceDashboard.ts`:** sai a mutation `saveIncome`.
- **Utilitários:**
  - `incomeClassificationSuggestions.ts` passa a ler o histórico no formato `{ description, categoryId }`;
  - `getRecentCategoryIds` passa a aceitar qualquer catálogo, e a receita ganha "Recentes".

**Telas:**

- `App.tsx`, `demoMain.tsx`, `CalendarView.tsx` e `LancamentosTable.tsx` passam só `open`, `income`, `presetDate` e
  `onClose`, sem laços de gravação.
- O cancelar da `LancamentosTable` passa a usar `/incomes`.

**Assistente e demo:**

- **Assistente:** `FinancialAssistant.tsx` monta o `IncomeCreateInput`: "Replicar até" vira `repeatUntil`, e a comissão
  deixa de ser enviada. A tela dele não muda.
- **Demo:** `fakeApiResolver.ts` responde em `/incomes` (listar, criar com réplicas, editar e excluir). Sugestões e
  duplicata voltam vazias.

### Backend

- **`utils/date.ts`:** `monthlyDatesUntil(isoDate, month, year)`, que usa o `addMonthsClamped` existente.
- **`services/incomeInput.ts`:** novo, sem banco. Lê e valida o corpo e os parâmetros, com mensagens de erro em
  português.
- **`services/incomeService.ts`:** novo.
  - **Criação:** numa transação `pg`, com Drizzle ligado ao mesmo cliente, grava:
    - a receita original e as réplicas;
    - a comissão, pela regra da decisão 5, com o `createCommissionExpense` existente;
    - a baixa de estoque e o desconto de horas, só na original.
  - **Edição:** feita com Drizzle. Não mexe em conta, observação nem status.
  - **Sugestões e duplicata.**
- **`routes/incomes.ts`:** `POST /` e `PUT /:id` no formato novo, `GET /suggestions` com parâmetros em inglês e
  `GET /duplicate` novo. Mantém as checagens atuais: `canWriteToAccount`, `resolveOwnerForWrite` e
  `isClassificationAllowed`.
- **SQL direto:** comissões e contratos não estão no schema do Drizzle. Declará-los mexeria nas migrations geradas pelo
  drizzle-kit, então essas consultas ficam em SQL parametrizado, como já é hoje.
- **Testes:** `utils/date.test.ts` (acréscimo) e `services/incomeInput.test.ts`.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar
apontando para produção.

### Infra/Deploy

Sem variáveis de ambiente novas. Frontend e backend sobem juntos. Quem estiver com o app antigo em cache recebe erro 400
ao lançar receita até atualizar.

## Formato novo das chamadas

```
POST /api/incomes
{ accountId, description, categoryId|null, amount, receiptDate, client|null, representativeId|null,
  attachments|null,
  repeatUntil: { month, year } | null,                                    // réplicas mensais até esse mês
  productSale: { productId, quantity } | null,                            // só na original
  billableHours: { contractId, hourType: 'presencial'|'remoto', hours } | null }   // só na original

PUT /api/incomes/:id
{ description, categoryId|null, amount, receiptDate, client|null, representativeId|null, attachments|null }

GET /api/incomes/suggestions?description=&account_id=
→ { matches: [{ description, amount, client, categoryId }], lastAmount }

GET /api/incomes/duplicate?description=&amount=&client=&account_id=&exclude_id=
→ { duplicate: { createdAt } | null }
```

## Arquivos provavelmente afetados

- **Removidos:** `src/screens/finance/IncomeForm.tsx`, `src/screens/finance/IncomeDialog.tsx` e o que ficar sem uso.
- **Novos no frontend:**
  - `src/screens/finance/entry-dialog/*`;
  - `src/screens/finance/income-dialog/*`, com `draftRules.test.ts`.
- **Novos no backend:** `backend/src/services/incomeInput.ts` (com testes) e `backend/src/services/incomeService.ts`.
- **Alterados no frontend:**
  - `src/screens/finance/expense-dialog/*` e `src/ui/dialog.tsx`;
  - `src/types/finance.ts`;
  - `src/services/financeService.ts`, `incomeSuggestionsService.ts` e `queryKeys.ts`;
  - `src/hooks/useFinanceDashboard.ts`;
  - `src/utils/incomeClassificationSuggestions.ts` e `categorySuggestions.ts`;
  - `App.tsx`, `demoMain.tsx`, `CalendarView.tsx` e `LancamentosTable.tsx`;
  - `FinancialAssistant.tsx` e `fakeApiResolver.ts`;
  - `package.json`, cujo script `test` inclui `income-dialog`.
- **Alterados no backend:** `backend/src/routes/incomes.ts`, `backend/src/utils/date.ts` e o teste de datas.

## Estratégia de implementação

**Fase 0**

1. Criar a branch `feat/R/redesign-modal-receita` a partir do `main`.

**Fase 1 — Remover.** O projeto volta a compilar no fim da fase 2.

2. **Frontend:**
   - apagar `IncomeForm.tsx` e `IncomeDialog.tsx`;
   - tirar `IncomeFormValues`, `saveIncome` e a mutation `saveIncome`;
   - tirar das 4 telas os laços de gravação e as props `month`, `year`, `isSaving`, `error` e `onSave`;
   - no demo, tirar os handlers de `/receitas`.
3. **Backend:** tirar de `routes/incomes.ts` o corpo antigo do `POST` e do `PUT` e a consulta antiga de sugestões.

**Fase 2 — Aplicar**

4. **Backend:**
   - `monthlyDatesUntil` e o teste;
   - `incomeInput.ts` e o teste;
   - `incomeService.ts`;
   - as rotas.
5. **Pasta comum:** mover as peças da despesa para `entry-dialog/` (§Frontend), ajustar a despesa para usá-las e dar ao
   `Dialog` a opção de altura fixa.
6. **Tipos e serviços:** `types/finance.ts`, `financeService.ts`, `incomeSuggestionsService.ts`, `queryKeys.ts` e os
   utilitários de sugestão.
7. **Modal de receita:**
   - `draftState`, `draftRules` e o teste;
   - `useIncomeSuggestions`;
   - popovers, linha, faixa de previstas e o `IncomeDialog`.
8. **Telas:** passam a renderizar os modais novos.
9. **Assistente e modo demo:** passam para o formato novo.
10. **Script `test`:** passa a incluir os testes da receita.

**Fase 3 — Validar**

11. **Comandos:** rodar os da seção de validação.
12. **Roteiros com o backend no `.env.dev`:**
    - roteiro de API da receita;
    - teste de fumaça (jsdom) dos dois modais, cobrindo lançar, lote, réplicas, edição, Esc, Enter e altura.

## Regras de negócio identificadas

**Conta, campos e data**

1. **Conta:** sempre a ativa, sem seletor; a troca é pelo menu do cabeçalho. Os campos de empresa aparecem quando a conta
   ativa é PJ.
2. **Campos obrigatórios:** descrição, valor e "Recebido em". A categoria continua opcional.
3. **Recebimento:** toda receita nasce recebida; "Recebido em" é a data do recebimento. Vem preenchida com a data de hoje,
   e o calendário trava o dia clicado.

**Repetir e réplicas**

4. **Repetir:**
   - opções "Não repete" ou "Todo mês até mês/ano";
   - as réplicas vão do mês seguinte ao da receita até o mês escolhido, inclusive, no mesmo dia;
   - nos meses mais curtos, o dia cai no último dia;
   - no máximo 36 réplicas;
   - o resumo mostra "· N lançamentos";
   - só em receita nova.
5. **O que as réplicas levam:**
   - copiam descrição, valor, categoria, cliente e representante;
   - os anexos ficam só na original, como na despesa;
   - produto (estoque) e horas (contrato) também só na original;
   - original e réplicas entram juntas ou nenhuma entra.

**Comissão e campos de empresa**

6. **Comissão:**
   - o servidor calcula pelo percentual do representante para a categoria;
   - a comissão mensal vale na original e em cada réplica; a única, só na original;
   - sem comissão configurada, o resumo avisa e nenhuma despesa de comissão é criada.
7. **Cliente (PJ):** escolhido do cadastro ou cadastrado dentro do seletor. Não aceita texto solto.
8. **Horas a faturar:**
   - o contrato preenche cliente e representante quando estão vazios;
   - o valor é horas × valor/hora do tipo e o saldo do contrato aparece;
   - o valor preenchido pode ser editado.
9. **Produto vendido:**
   - o valor é quantidade × preço, e pode ser editado;
   - quantidade acima do estoque impede salvar ("Estoque insuficiente: há N").
10. **Categoria fixa:** ao escolher uma, o valor é preenchido se estiver vazio, e o dia do recebimento também, no mês da
    data. Não vale quando o calendário travou a data.

**Sugestões e duplicata**

11. **Autocomplete:**
    - começa com 2 letras, depois de 220 ms sem digitar;
    - mostra até 4 descrições diferentes, só da conta ativa;
    - escolher uma preenche a descrição e, se estiverem vazios, o valor, o cliente e a categoria.
12. **Sugestão de categoria:** começa com 3 letras, pelo histórico. Tab aceita.
13. **Duplicata:** é só um aviso. Conta como duplicata quando:
    - a descrição é a mesma (sem diferenciar maiúsculas) e o valor e o cliente também;
    - é da mesma conta, não está cancelada e foi cadastrada nos últimos 7 dias.

    Na edição, a própria receita não conta.

**Lote, salvamento e edição**

14. **Lote:**
    - "+" ou Shift+Enter levam a linha de entrada para o lote, mantendo a data de recebimento;
    - ao salvar, as receitas são gravadas uma a uma, e cada uma que grava sai do lote;
    - se uma falhar, a gravação para e o rodapé mostra "Receita N do lote: …";
    - fechar o modal descarta o lote.
15. **Depois de salvar:** numa receita nova, o modal continua aberto e limpo, com o aviso de registrada; numa edição,
    fecha.
16. **Edição:** uma linha só, sem Repetir, produto e horas. Conta, observação e status não mudam.
17. **Já previstas:** a faixa lista as receitas previstas do mês da data da linha de entrada, com "Confirmar
    recebimento". Só em receita nova.

**Teclado, altura e celular**

18. **Teclado:** Esc fecha primeiro o popover e depois o modal. Enter salva; dentro do autocomplete e dos popovers, age
    só neles.
19. **Altura e celular:**
    - ~85% da tela nos dois modais, com o topo fixo e o lote rolando;
    - abaixo de 1024px o corpo inteiro rola, os campos ficam empilhados e os popovers abrem como painel inferior.

## Regras multi-tenant e segurança

Neste projeto, o isolamento é por usuário e conta (o "tenant" da `AGENT.md` corresponde a isso):

- **Conta enviada pelo app:** o `accountId` é validado por `canWriteToAccount`.
- **Edição:** o dono é resolvido por `resolveOwnerForWrite`; sem permissão, a resposta é 404.
- **Categoria:** validada por `isClassificationAllowed` contra a conta.
- **Representante e comissão:** buscados só do próprio usuário.
- **Produto:** o helper de estoque filtra por usuário.
- **Horas:** o desconto no contrato filtra por usuário.
- **Sugestões e duplicata:** só o próprio usuário, na conta pedida, sem receitas canceladas; na busca, `%` e `_` são
  escapados.
- **Relatórios e PDF:** não são afetados.

## Validações necessárias

**Backend (`incomeInput`):**

- `description` com 1 a 255 caracteres;
- `amount` maior que 0 e de no máximo 99.999.999,99;
- `receiptDate` em ISO válido;
- `client` com até 100 caracteres;
- `categoryId`, `representativeId` e `contractId` como inteiros positivos ou null;
- `repeatUntil` depois do mês da receita, com no máximo 36 réplicas;
- `productSale.quantity` maior que 0;
- `billableHours.hours` maior que 0 e `hourType` válido;
- `attachments` como lista de objetos.

**Modal (`draftRules`):**

- obrigatórios da regra 2;
- datas válidas;
- cliente do cadastro (PJ);
- produto: quantidade entre 0 e o estoque;
- horas: contrato, tipo e quantidade juntos;
- "Repetir até" depois do mês da receita.

## Testes necessários

### Frontend (`tsx --test`)

**`income-dialog/draftRules.test.ts`:**

- datas das réplicas, com dia 31 e virada de ano, e contagem de lançamentos;
- prévia da comissão (mensal e única);
- validação e mensagens do rodapé;
- montagem do envio (criação e edição);
- consulta de duplicata;
- textos do resumo.

Os testes atuais da despesa continuam passando.

### Backend

- **`date.test.ts`:** `monthlyDatesUntil`.
- **`incomeInput.test.ts`:** corpo válido e inválido e parâmetros das sugestões e da duplicata.

### E2E (com o backend no `.env.dev`)

1. Receita PF simples, lote com 3 receitas e falha no meio.
2. "Repetir até" a partir do dia 31: réplicas no último dia dos meses curtos, gravadas juntas.
3. PJ com cliente escolhido e cadastrado pelo seletor e representante com comissão mensal, e depois única: despesas de
   comissão conforme a regra.
4. Horas a faturar com réplicas: saldo do contrato descontado uma vez.
5. Produto vendido: estoque baixado uma vez; quantidade acima do estoque bloqueada.
6. Edição: conta, observação e status preservados.
7. Esc por camadas, Enter salva e Shift+Enter leva ao lote.
8. Altura de ~85% e lote rolando, nos dois modais.
9. Despesa: o fluxo de antes continua igual (teste de fumaça).
10. Assistente: receita com "Replicar até". Modo demo: lançar uma receita.
11. Celular: campos empilhados.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

- **O modal de despesa muda por dentro:** acabou de ir para produção e passa a usar a pasta comum. Há risco de
  regressão. Mitigação: testes e teste de fumaça nos dois modais.
- **App antigo em cache:** quem estiver com o app antigo aberto recebe erro 400 ao lançar receita até atualizar a
  página. Nada fica gravado pela metade.
- **Mudanças de comportamento:**
  - sai o seletor de conta da receita;
  - a data inicial passa a ser hoje, não mais o mês aberto na tela;
  - anexos ficam só na original;
  - a comissão única deixa de se repetir;
  - as horas são descontadas uma vez só.
- **SQL direto:** comissões e contratos continuam em SQL parametrizado, porque não estão no schema do Drizzle.
- **Banco de produção:** o roteiro manual só roda com o backend no `.env.dev`.
- **Tamanho:** é uma entrega grande (modal, backend, peças comuns, assistente e demo).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **Grade da receita:**
  - usa as colunas PF e PJ decididas, com lote em linhas, popovers e resumo;
  - no celular, os campos ficam empilhados.
- **Gravação:**
  - a original e as réplicas são gravadas juntas, com as datas ajustadas, partindo do mês da receita;
  - estoque e horas são descontados uma vez;
  - a comissão segue a regra mensal/única;
  - anexos ficam só na original.
- **Lote:** grava uma receita por vez; se uma falhar, só as não gravadas ficam no lote.
- **Edição:** preserva conta, observação e status.
- **Altura:** os dois modais ocupam ~85% da tela, com o lote ocupando e rolando no espaço restante.
- **Despesa:** o modal de despesa se comporta como antes.
- **Assistente e demo:** lançam receita no formato novo.
- **Sem sobras:** nada mais referencia `IncomeForm`, `IncomeFormValues`, `saveIncome`, `replicarAte` no serviço ou
  `/receitas` no frontend.
- **Validação:** os comandos passam e o roteiro manual foi cumprido.

## Observações para a skill implementar

- **Fontes:** este plano e `.plans/analise-redesign-modal-receita.md`.
- **Ordem:** a Fase 1 (remover) inteira antes da Fase 2 (aplicar), sem código antigo ao lado do novo.
- **Seguir a `/AGENT.md`:**
  - Drizzle nas queries novas;
  - SQL parametrizado só para comissões e contratos, com o motivo no código;
  - nomes em inglês e textos em português;
  - nada de `any`.
- **Não fazer:**
  - executar migrations (nenhuma é necessária);
  - mexer no `.env`;
  - fazer commit (fica para o `/finalizar`).

## Decisões aplicadas

- **Decisão 1:** layout da análise. Na conta PJ entram Cliente e o botão "⋯" (representante, produto e horas).
- **Decisão 2:** sem seletor de conta. A receita é lançada sempre na conta ativa, o que muda a decisão anterior do plano
  da despesa.
- **Decisão 3:** a receita nasce recebida, como hoje.
- **Decisão 4:** backend no formato novo, com "Repetir" gravado pelo servidor numa transação.
- **Decisão 5:** a comissão é calculada pelo servidor. A mensal vale na original e nas réplicas; a única, só na original.
- **Decisão 6:** a data inicial é hoje, e o calendário trava o dia clicado.
- **Recomendações da análise:**
  - a faixa de previstas e as dicas de primeiro acesso continuam;
  - o assistente e o demo migram para o formato novo;
  - as peças comuns ficam numa pasta compartilhada;
  - o trabalho vai numa branch nova;
  - os dois modais ficam com o topo fixo e o lote rolando.
